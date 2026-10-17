# Staging Deployment & Release Verification Procedure

This runbook defines the exact deployment procedure, environment variable configuration, smoke test validation, and operational acceptance checks for deploying ReplayLab to a Staging environment.

---

## 1. Staging Architecture Overview

The staging topology mirrors the production deployment architecture (ADR-0002):
- **Web Frontend (`apps/web`)**: Hosted on Vercel / containerized Next.js Node.js runtime.
- **Backend API (`apps/api`)**: Node.js container on AWS ECS, GCP Cloud Run, or Docker container runner.
- **Database & Auth**: PostgreSQL 16 hosted on Supabase (or staging PostgreSQL cluster) with Supabase Auth.
- **Controlled Demo Target (`infra/demo-api`)**: Isolated public or container mock target used for staging fixture replay and regression suite execution without triggering anti-SSRF protections on private IP addresses.

---

## 2. Staging Environment Configuration

### Backend (`apps/api`) Staging Variables
Configure the following secrets in the staging container service (e.g. AWS Parameter Store / GCP Secret Manager / Docker Compose environment):

```bash
# PostgreSQL Connection (Supabase staging project or isolated staging PostgreSQL)
DATABASE_URL="postgresql://postgres:[STAGING_DB_PASSWORD]@db.[STAGING_PROJECT].supabase.co:5432/postgres?schema=public"

# AES-256 Master Encryption Key (64-character hexadecimal string)
# Generated via: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
APP_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Supabase Auth JWT Secret (Matches staging Supabase Project Settings > API > JWT Secret)
SUPABASE_JWT_SECRET="staging-supabase-jwt-secret-min-32-chars-length"

# Operational Configuration
PORT=3001
NODE_ENV="production"
CORS_ORIGIN="https://staging.replaylab.dev"
```

### Frontend (`apps/web`) Staging Variables
Configure the following build/runtime variables in Vercel or Next.js container environment:

```bash
# Staging API Base URL (must be public HTTPS or accessible from browser)
NEXT_PUBLIC_API_URL="https://api-staging.replaylab.dev/api/v1"

# Supabase Staging Project Credentials
NEXT_PUBLIC_SUPABASE_URL="https://[STAGING_PROJECT].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# CRITICAL SECURITY SETTING: Dev auth must remain disabled on staging and production
NEXT_PUBLIC_ENABLE_DEV_AUTH="false"

PORT=3000
NODE_ENV="production"
```

---

## 3. Database Migration Deployment Step

Before routing traffic to the updated API containers, apply all Prisma migrations to the staging PostgreSQL database:

```bash
# Execute from CI runner or staging bastion host with DATABASE_URL configured:
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

**Verification Gate**:
Verify migration status using:
```bash
npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```
Expected output: `Database schema is up to date!`

---

## 4. Staging Deployment Verification Matrix (10 Acceptance Checks)

| # | Staging Behavior | Verification Method | Expected Result | Pass/Fail Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Application Shell Loading | `curl -I https://staging.replaylab.dev` | HTTP `200 OK`, HTML document rendered with security headers. | Loads UI shell without client-side console errors. |
| **2** | Staging Authentication | Sign in via Supabase Auth email/magic link | Session created; JWT token issued with valid signature; authenticated user displayed. | Token validated by API; unauthenticated access denied (`401 Unauthorized`). |
| **3** | Project Isolation | User A creates Project A; User B creates Project B | User A cannot list, view, edit, or execute fixtures belonging to Project B. | Strict `404 Not Found` or `403 Forbidden` non-disclosure boundary enforced. |
| **4** | Secret Masking | Create environment with sensitive header `X-Api-Key` | Plaintext encrypted in PostgreSQL using AES-256-GCM. Frontend receives `••••••••` masked view. | No plaintext secret returned by API or logged in stdout/stderr. |
| **5** | Fixture & Baseline | Create fixture with baseline JSON | Fixture persists; baseline is immutably stored and version-tagged. | Fixture details load accurately; baseline diffing is available. |
| **6** | Replay to Target | Trigger replay against controlled public demo target | HTTP request dispatched; status code, headers, and latency captured. | Replay succeeds; diff viewer highlights differences against baseline. |
| **7** | Regression Suite Run | Create suite with 3 fixtures and run | Sequential replay executed; suite run record persists with pass/fail metrics. | All child runs linked to suite run; terminal status `completed`. |
| **8** | Anti-SSRF Defense | Replay target configured to `http://169.254.169.254` or `http://127.0.0.1` | Admission controller and `TargetValidator` reject dispatch. | Socket connection blocked with `400 Bad Request` (`Blocked private/loopback IP`). |
| **9** | Health & Readiness | `GET /health` and `GET /ready` | `/health` returns `200` (`"status": "healthy"`); `/ready` returns `200` (`"status": "ready"`). | If DB disconnects, `/ready` returns `503 Service Unavailable` (`"status": "degraded"`). |
| **10** | Log Redaction | Inspect container stdout/stderr logs during replays | `Authorization`, `Cookie`, and encrypted secrets do not appear in cleartext. | Strict redaction masks sensitive credentials in all log streams. |

---

## 5. Automated Staging Smoke Script

A lightweight verification script can be run against staging endpoints:

```bash
# Run against deployed staging instance
API_URL=https://api-staging.replaylab.dev npm run test:staging-smoke
```

Check:
1. `GET ${API_URL}/health` -> status 200, checks: healthy
2. `GET ${API_URL}/ready` -> status 200, checks: database=ok, encryption=ok
3. `POST ${API_URL}/api/v1/projects` with invalid/missing token -> status 401
