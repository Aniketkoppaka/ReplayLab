# ReplayLab Operational Runbook & Production Playbook

## 1. Health Probes & Load Balancer Integration

ReplayLab provides distinct endpoints for liveness and readiness to integrate with Kubernetes, AWS ALB, GCP Load Balancer, or Docker healthchecks:

### Liveness Probe (`GET /health`)
- **Purpose**: Verify that the Node.js process event loop is responsive and handling HTTP requests.
- **Path**: `GET /health`
- **Expected Response**: HTTP `200 OK`
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-17T10:00:00.000Z",
    "uptime": 1245.5,
    "version": "0.1.0"
  }
  ```
- **Action on Failure**: Container restart / pod termination.

### Readiness Probe (`GET /ready`)
- **Purpose**: Verify that all critical downstream dependencies (PostgreSQL database connection, encryption configuration) are operational before routing client traffic.
- **Path**: `GET /ready`
- **Expected Response**: HTTP `200 OK`
  ```json
  {
    "status": "ready",
    "checks": {
      "database": "ok",
      "encryption": "ok"
    },
    "timestamp": "2026-10-17T10:00:00.000Z"
  }
  ```
- **Error Response (Degraded)**: HTTP `503 Service Unavailable`
  ```json
  {
    "status": "degraded",
    "checks": {
      "database": "failed: connection timeout",
      "encryption": "ok"
    },
    "timestamp": "2026-10-17T10:00:00.000Z"
  }
  ```
- **Action on Failure**: Remove replica from load balancer target group; do not route inbound replay traffic until ready.

---

## 2. Zero-Downtime Rolling Deployments

ReplayLab API instances support graceful rolling updates:

1. **Traffic Draining**:
   - Orchestrator (e.g. Kubernetes, AWS ECS) stops routing new requests to the terminating instance.
   - The orchestrator sends a `SIGTERM` signal to the Node.js process.
2. **Socket Draining & Task Completion**:
   - The server stops accepting new connections on port 3001.
   - Ongoing HTTP replay runs and regression suite dispatches are allowed up to 10 seconds to finish.
   - Existing open sockets are closed once idle.
3. **Database Connection Teardown**:
   - `prisma.$disconnect()` is invoked cleanly, closing pool connections.
   - Process exits with code `0`.
4. **Readiness Gate on New Instance**:
   - New instances must pass `GET /ready` before traffic is directed to them.

---

## 3. High Availability & Resource Scaling

- **Replication**: Maintain a minimum of two (2) API replicas across distinct availability zones.
- **CPU & Memory Thresholds**:
  - Scale out when average CPU utilization exceeds 70% or active replay queue depth exceeds 25 runs.
  - Scale in when CPU utilization drops below 30% for 15 minutes.
- **Database Connection Pooling**:
  - Use Supabase transaction connection pooling (Supavisor / PgBouncer) for high-concurrency environments.
  - Configure Prisma connection pool limits: `DATABASE_URL="...&connection_limit=10"`.
