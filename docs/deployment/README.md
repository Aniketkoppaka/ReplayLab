# ReplayLab Production Deployment & Operational Architecture

## 1. System Overview & Deployment Topology

ReplayLab employs a segregated, multi-tier enterprise architecture separating frontend presentation, API orchestration, and persistence boundaries:

```
                                    +-----------------------------+
                                    |       Next.js Web UI        |
                                    |     (Vercel Edge/App)       |
                                    +--------------+--------------+
                                                   | HTTPS (JWT Auth)
                                                   v
+------------------------+          +-----------------------------+
|    Supabase Auth       |<---------|       Express API Node      |
|    (JWT Issuance)      |          | (Container / ECS / CloudRun)|
+------------------------+          +-------+--------------+------+
                                            |              |
                       PostgreSQL (Prisma)  |              | Outbound HTTP / Replay
                                            v              v
                                    +---------------+  +-------------------+
                                    | Supabase PG   |  | Target API Hosts  |
                                    |  (Persistent) |  | (Egress Guarded)  |
                                    +---------------+  +-------------------+
```

### Component Distribution
1. **Frontend (`apps/web`)**:
   - Hosted on Vercel / serverless Next.js edge runtime.
   - Communicates strictly via HTTPS to the Express backend API.
   - Supabase client integration handles user authentication and session token renewal.
2. **Backend Engine (`apps/api`)**:
   - Hosted as a long-running Node.js process (Docker container on AWS ECS, GCP Cloud Run, or Kubernetes).
   - Exposes `/health` (liveness) and `/ready` (readiness) operational probes.
   - Enforces AES-256-GCM encryption at rest for sensitive variables, project-scoped RBAC, anti-SSRF defenses, and bounded concurrency queues.
3. **Database & Data Store (`packages/db`)**:
   - Managed PostgreSQL instance hosted on Supabase.
   - Managed strictly via Prisma migrations (`prisma migrate deploy`).
   - Immutable audit logs, baseline history versions, and run results.

---

## 2. Infrastructure Prerequisites

| Component | Minimum Version | Production Specification |
| :--- | :--- | :--- |
| **Node.js** | `>= 22.0.0` (LTS) | 22.x or 24.x LTS runtime |
| **Corepack / pnpm** | `9.15.5` | Standard monorepo package manager |
| **PostgreSQL** | `>= 15` | Managed Supabase or AWS RDS PostgreSQL with connection pooling |
| **Compute Sizing** | - | API: Minimum 1 vCPU, 2GB RAM per replica with horizontal auto-scaling |

---

## 3. Deployment Artifacts & Build Pipeline

1. **Prisma Generation & Migration**:
   ```bash
   pnpm --filter @replaylab/db run prisma:generate
   pnpm --filter @replaylab/db run prisma:deploy
   ```
2. **Build Monorepo Workspaces**:
   ```bash
   pnpm run build
   ```
3. **Start Production Services**:
   - **Express API**:
     ```bash
     cd apps/api && node dist/server.js
     ```
   - **Next.js Web**:
     ```bash
     cd apps/web && pnpm run start -p 3000
     ```
