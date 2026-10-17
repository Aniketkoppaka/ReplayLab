# ReplayLab Rollback Playbook & Disaster Recovery

## 1. Rollback Strategy & Preconditions

When a deployment introduces critical regressions, severe latency degradation, or unhandled exceptions, initiate a rollback following this procedure:

### Invariants for Safe Rollbacks
1. **Backward-Compatible Database Migrations**:
   - ReplayLab follows an *expand-and-contract* migration policy.
   - Database migrations in `packages/db/prisma/migrations` MUST NEVER drop columns or rename existing tables in the same release as code changes.
   - A rollback of the API service or Web UI to the previous container version must function correctly against the latest applied database schema.
2. **Immutable Baseline History**:
   - Replay baselines and audit logs are append-only. Rolling back the API version preserves all previously captured history and run outcomes.

---

## 2. Step-by-Step Rollback Playbook

```
[Detection: Alert / Probe Failure]
                |
                v
  [Step 1: Freeze Inbound CI/CD]
                |
                v
  [Step 2: Roll Back Web UI (Vercel Instant Rollback)]
                |
                v
  [Step 3: Roll Back API Container (Previous Image Tag)]
                |
                v
  [Step 4: Verify Health & Readiness Probes (/ready)]
                |
                v
  [Step 5: Post-Incident Review & Root Cause Analysis]
```

### Step 1: Freeze CI/CD Deployments
Halt automated deployment pipelines to prevent conflicting builds:
```bash
git tag rollback-in-progress-$(date +%s)
```

### Step 2: Roll Back Frontend (`apps/web`)
- In Vercel Dashboard: Navigate to **Deployments** -> select the previous stable deployment -> click **Instant Rollback**.
- CLI alternative:
  ```bash
  vercel rollback [DEPLOYMENT_ID]
  ```

### Step 3: Roll Back Backend Engine (`apps/api`)
- In AWS ECS / GCP Cloud Run / Kubernetes:
  Update the service definition to reference the previous container tag (e.g., `replaylab-api:v0.1.0-commit-5cf24e2`).
  ```bash
  kubectl rollout undo deployment/replaylab-api
  ```
- The orchestrator gracefully terminates current pods (`SIGTERM`) while spinning up previous stable replicas.

### Step 4: Verification Gate
Verify service readiness and database connectivity on the restored deployment:
```bash
curl -f https://api.replaylab.dev/health
curl -f https://api.replaylab.dev/ready
```

### Step 5: Disaster Recovery & Database Restoration
In the catastrophic event of database corruption or unintended data alteration:
1. ReplayLab's primary database is hosted on Supabase PostgreSQL with automated Point-in-Time Recovery (PITR).
2. Restore to the desired timestamp prior to the incident using the Supabase Management Console.
3. Validate database integrity using the automated live acceptance suite:
   ```bash
   pnpm --filter @replaylab/api test src/services/postgres-live.test.ts
   ```
