# ReplayLab

[![CI](https://github.com/Aniketkoppaka/ReplayLab/actions/workflows/ci.yml/badge.svg)](https://github.com/Aniketkoppaka/ReplayLab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B%20%7C%2024%2B-green?logo=node.js)](https://nodejs.org/)

**ReplayLab** is an enterprise-grade full-stack API debugging, regression-testing, and fixture playback platform. It enables engineers and QA teams to capture sanitized HTTP request fixtures, replay them against configurable target environments (local, staging, preview, mock), execute deterministic differential comparisons against response baselines, and orchestrate regression test suites.

---

## Live Demo & Environments

- **Staging / Demo Frontend**: [https://replay-lab-gilt.vercel.app](https://replay-lab-gilt.vercel.app)
- **Staging API**: [https://replaylab-api-staging.onrender.com](https://replaylab-api-staging.onrender.com)
  - Liveness probe: [`GET /health`](https://replaylab-api-staging.onrender.com/health)
  - Readiness probe: [`GET /ready`](https://replaylab-api-staging.onrender.com/ready)
- **Auth & Database Tier**: Supabase PostgreSQL (`cxcgxttvsyfqszfhcjao.supabase.co`)

---

## Key Features

1. **Deterministic Fixture Replay**: Capture HTTP requests (method, path, headers, query params, body) and dispatch them reliably against any target environment with pinned socket connections.
2. **Differential Comparison Engine**: Compare live replayed responses (status codes, headers, response JSON) against baseline snapshots with fine-grained JSONPath masking rules to eliminate non-deterministic timestamps and UUID flakes.
3. **SSRF Defensive Protection**: Comprehensive defense-in-depth preventing Server-Side Request Forgery:
   - Target URL scheme enforcement (`http:`, `https:` only).
   - Async DNS pre-resolution with comprehensive IP blocklist (RFC 1918 private subnets, loopback `127.0.0.0/8`, CGNAT, AWS/GCP cloud metadata `169.254.169.254`, IPv6 equivalents).
   - **Pinned IP Agent Sockets**: Custom Node.js HTTP/HTTPS agents connect directly to the pre-validated IP while passing original hostname for SNI, eliminating DNS rebinding TOCTOU vulnerabilities.
   - Hop-by-hop redirect revalidation, 15s execution timeouts, and 10MB response limits.
4. **At-Rest Secret Encryption**: Sensitive environment variables are encrypted at rest using AES-256-GCM with unique 12-byte initialization vectors (IVs) and authentication tags before storing in PostgreSQL.
5. **Strict Multi-Tenant Isolation & 404 Non-Disclosure**: Tenant-scoped resource hierarchy (Project -> Environment / Fixture / Suite -> Run) with non-disclosing 404 responses for unauthorized cross-tenant requests.
6. **Immutable Baseline History & Audit Logging**: Append-only baseline histories and structured audit logs tracking member additions, deletions, and executions.

---

## Architecture

```
                       +----------------------------------+
                       |   Next.js 15 App (React 19)      |
                       |   https://replay-lab-gilt.vercel |
                       +-----------------+----------------+
                                         |
                       Bearer JWT        | (Direct API calls via apiClient)
                                         v
+-----------------------+     +-------------------------------+
|     Supabase Auth     |<----+   Express Backend & Engine    |
|   JWKS / RS256/ES256  |     |   https://replaylab-api-...   |
+-----------------------+     +---------------+---------------+
                                              |
                     Prisma ORM Client        | Safe Dispatcher (Pinned IP Agent)
                                              v
+-----------------------+     +-------------------------------+
|  Supabase PostgreSQL  |     | Target Environment / Mock API |
| (AES-256-GCM Secrets) |     |  (SSRF Protected Outbound)    |
+-----------------------+     +-------------------------------+
```

### Workspace Structure (`pnpm` Monorepo)

- `apps/web`: Next.js 15 App Router frontend (React 19, Tailwind CSS, Lucide icons).
- `apps/api`: Express 4 backend and persistent Replay Engine.
- `packages/contracts`: Shared TypeScript domain models, DTOs, and Zod validation schemas.
- `packages/db`: Centralized Prisma schema, migrations, and typed Prisma Client wrapper.
- `packages/config`: Shared tooling configurations (ESLint, TSConfig).
- `infra/database`: Local database operational compose files and seed scripts.
- `infra/demo-api`: Deterministic mock API for replay testing.
- `e2e/`: Synthetic and staging-authenticated Playwright test suites.

---

## Technology Stack

- **Frontend**: Next.js 15.5, React 19, Tailwind CSS 4, Lucide React
- **Backend**: Node.js 22/24, Express 4.21, Zod 3.24
- **Security & Crypto**: `jose` (JWT/JWKS verification), `node:crypto` (AES-256-GCM)
- **Database & ORM**: PostgreSQL via Supabase, managed strictly by Prisma 6.3
- **Testing**: Vitest 3.2 (Unit & Integration), Playwright 1.64 (End-to-End)
- **Package Manager**: `pnpm@9.15.5` via Corepack

---

## Local Development Quick Start

### Prerequisites
- Node.js `22.x` or `24.x` (see `.nvmrc`)
- Corepack enabled (`corepack enable pnpm`)
- Docker (optional, for local PostgreSQL instance)

### 1. Clone & Install
```bash
git clone https://github.com/Aniketkoppaka/ReplayLab.git
cd ReplayLab
corepack pnpm install --frozen-lockfile
```

### 2. Environment Configuration
Copy the template to your local environment:
```bash
cp .env.example .env
```
*(All variables in `.env.example` contain non-sensitive local development defaults and placeholders).*

### 3. Generate Prisma Client & Run Quality Gates
```bash
# Generate Prisma Client
corepack pnpm --filter @replaylab/db run prisma:generate

# Build shared packages
corepack pnpm --filter @replaylab/contracts --filter @replaylab/db run build

# Run typecheck & linter
corepack pnpm typecheck
corepack pnpm lint

# Run all unit/integration tests
corepack pnpm test
```

### 4. Start Local Development Servers
```bash
# Start backend API (port 3001)
corepack pnpm --filter @replaylab/api dev

# Start frontend web app (port 3000)
corepack pnpm --filter @replaylab/web dev
```

---

## Testing Strategy & Verification

ReplayLab enforces continuous, evidence-based quality verification across multiple testing tiers:

```bash
# 1. Typecheck: Strict zero-warning verification across all workspace projects
pnpm typecheck

# 2. Lint: ESLint across all 5 workspace projects with 0 warnings allowed
pnpm lint

# 3. Unit & Integration: 207 tests covering crypto, SSRF IP filtering, comparison engine, etc.
pnpm test

# 4. Local Mock E2E: 7 browser journeys against standalone Next.js server & dev auth
pnpm test:e2e

# 5. Staging-Authenticated E2E: 7 live tests against deployed Vercel & Render instances
# Requires dedicated test account in terminal environment:
# PLAYWRIGHT_STAGING_USER_EMAIL=... PLAYWRIGHT_STAGING_USER_PASSWORD=...
pnpm test:e2e:staging

# 6. Production Build: Full tsc compilation + Next.js optimized production bundle
pnpm build
```

> **Note on PostgreSQL Integration Tests**: Two test suites (`postgres-live.test.ts` and `postgres-live-lifecycle.test.ts`, totaling 22 tests) test raw PostgreSQL transaction isolation and lifecycle triggers. In local runs without a live PostgreSQL instance, they are cleanly skipped. In GitHub Actions CI, a PostgreSQL 16 container is automatically provisioned and all 22 tests execute and pass.

---

## Security Design & Defense-in-Depth

| Defensive Layer | Implementation Mechanism | Location |
| :--- | :--- | :--- |
| **SSRF Defense** | Async DNS resolution, blocked IP CIDR tables (RFC 1918, 127/8, 169.254/16), pinned socket connections | [`apps/api/src/replay-engine/safe-dispatcher.ts`](file:///c:/Users/anike/Downloads/ReplayLab/apps/api/src/replay-engine/safe-dispatcher.ts) |
| **Authentication** | Bearer JWT validation via Supabase JWKS (RS256/ES256) or symmetric secret (HS256). Fail-closed token verifier. | [`apps/api/src/auth/token-verifier.ts`](file:///c:/Users/anike/Downloads/ReplayLab/apps/api/src/auth/token-verifier.ts) |
| **Authorization** | Project membership RBAC (OWNER, ADMIN, MEMBER, VIEWER). Cross-tenant requests return 404 without leaking resource existence. | [`apps/api/src/auth/permission-matrix.ts`](file:///c:/Users/anike/Downloads/ReplayLab/apps/api/src/auth/permission-matrix.ts) |
| **Secret Encryption** | 256-bit AES-GCM encryption with 12-byte unique IV per secret and authentication tags. | [`apps/api/src/crypto.ts`](file:///c:/Users/anike/Downloads/ReplayLab/apps/api/src/crypto.ts) |
| **Dev Auth Isolation**| In production (`NODE_ENV === 'production'`), client-side dev authentication is strictly disabled and hidden. | [`apps/web/src/lib/env.ts`](file:///c:/Users/anike/Downloads/ReplayLab/apps/web/src/lib/env.ts) |
| **Supply Chain** | `pnpm.overrides` pins `postcss` to `^8.5.31`, eliminating known prototype pollution and path traversal CVEs. | [`package.json`](file:///c:/Users/anike/Downloads/ReplayLab/package.json) |

---

## Demo Walkthrough & Capture Checklist

For showcasing ReplayLab in a portfolio presentation or demo video, follow this verified flow:

- [ ] **1. Authentication**:
  - Visit [https://replay-lab-gilt.vercel.app/login](https://replay-lab-gilt.vercel.app/login)
  - Sign in with verified Supabase credentials. Notice that in production, Developer Token mode is disabled.
- [ ] **2. Project & Environment Management**:
  - Navigate to **Projects** -> Create or select an active project.
  - Navigate to **Environments** -> Create target environment (e.g. `Staging API` pointing to `https://replaylab-api-staging.onrender.com/api/v1`).
- [ ] **3. Fixture Creation**:
  - Create a fixture with `GET /status/200`, `bodyType: NONE`.
  - Set baseline expectation to HTTP `200`.
- [ ] **4. Interactive Fixture Playback (Positive Replay)**:
  - Open the **Interactive Fixture Replay** modal.
  - Trigger replay against the target environment.
  - Observe execution badge **`SUCCESS`**, exact status **`HTTP 200`**, and 100% differential baseline match.
- [ ] **5. Negative Assertion / Differential Mismatch**:
  - Edit baseline expectation to expect HTTP `400`.
  - Re-trigger playback against the same endpoint.
  - Observe execution badge **`ASSERTION_FAILURE`**, indicating deterministic mismatch detection.
- [ ] **6. Regression Suite & History**:
  - Add the fixture to a Regression Test Suite and inspect execution runs in the **Runs** history view.

---

## Known Limitations

1. **Portfolio Demo Scope**: This project is built, hardened, and deployed as a portfolio showcase and demonstration platform. It is not configured for commercial multi-tenant SaaS operations or public end-user signups.
2. **Shared Staging Database**: The demo environment runs against a single Supabase staging instance with automated daily backups. Production customer isolation and Point-in-Time Recovery (PITR) SLA management have not been provisioned.
3. **Internal Prisma CLI Sub-Dependency**: `pnpm audit --prod` reports 1 advisory in `deepmerge-ts@7.1.5` via `@prisma/config` (bundled within `prisma@6.19.3` CLI tooling). This does not affect runtime application artifacts or server request handlers.
4. **Local Database Test Prerequisite**: Raw PostgreSQL integration tests (`postgres-live.test.ts`) require a local PostgreSQL container and are skipped in local environments without Docker. They are fully verified in CI.
