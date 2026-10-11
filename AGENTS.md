# ReplayLab — Project Agent Instructions (`AGENTS.md`)

## 1. Product Overview and Architecture

ReplayLab is an enterprise-grade full-stack API debugging, regression-testing, and fixture playback platform.
It allows developers and QA teams to capture sanitized HTTP request fixtures, replay them against configurable target environments (local, staging, preview, production), execute deterministic differential comparisons against response baselines, and orchestrate regression test suites.

### Workspace Boundaries
- `apps/web/`: Next.js frontend (React 19+, Tailwind CSS, shadcn/ui). Deployed independently to Vercel.
- `apps/api/`: Express backend and persistent Replay Engine. Hosted on an independent Node.js container environment.
- `packages/contracts/`: Shared domain contracts, DTO types, and Zod validation schemas. Shared between web and api.
- `packages/db/`: Prisma schema, migrations, and typed database client wrapper. Single source of truth for PostgreSQL persistence (Supabase).
- `packages/config/`: Shared tooling configs (ESLint, TSConfig).
- `infra/database/`: Local database operational configs and seed scripts.
- `infra/demo-api/`: Deterministic mock target API for testing replay behaviors and differential matches.
- `docs/`: System documentation, PRDs, ADRs, threat models, and verification logs.
- `.agents/`: Project-specific agent skills and scoped rules.

---

## 2. Technology Stack & Language Conventions

- **Language**: Strict TypeScript throughout. Never use `any` unless explicitly guarded and typed.
- **Frontend**: Next.js App Router, React, Tailwind CSS, shadcn/ui.
- **Backend**: Node.js, Express, TypeScript.
- **Data & ORM**: PostgreSQL via Supabase, managed strictly by Prisma.
- **Validation**: Zod for all external inputs (HTTP request bodies, query params, environment variables).
- **Package Manager**: `pnpm` workspaces via Corepack (`pnpm@9.15.5`).

---

## 3. Security-First Engineering Principles

1. **Replay Engine Safety & Anti-SSRF**:
   - The replay engine will invoke external and internal URLs on behalf of users.
   - It is strictly prohibited to make unchecked outbound network calls.
   - All target URLs must undergo strict scheme validation (`http:`, `https:` only), hostname parsing, DNS pre-resolution, and private/loopback/cloud-metadata IP blocking before any socket connection is opened.
   - Enforce strict timeouts (connection, read, total execution) and payload size limits on requests and responses.
2. **Secret Redaction**:
   - Sensitive headers (`Authorization`, `Cookie`, `X-Api-Key`, etc.) and sensitive payload keys (passwords, tokens) must be redacted before saving fixtures or writing logs.
3. **No Secrets in Source Control**:
   - Never commit `.env` files, API keys, database connection strings, or service credentials.
   - Validate environment variables at boot via Zod schemas.

---

## 4. Engineering Discipline & Verification Requirements

1. **Evidence-Based Completion**:
   - Never claim a test passed, a build succeeded, or a feature works without running the verification command and inspecting the actual output.
   - Never fabricate test results or suppress error codes.
2. **Inspect Before Modifying**:
   - Always read and analyze existing code and neighboring modules before modifying or creating files.
3. **Task Decomposition & Explicit Acceptance Criteria**:
   - Decompose complex milestones into small, incremental, testable commits.
   - Every pull request or task milestone must have explicit acceptance criteria.
4. **Execution Reporting**:
   - After completing any task, report:
     - Exact modified or created files.
     - Executed commands and actual terminal outputs.
     - Confirmed test/typecheck results.
     - Any deferred items, limitations, or unresolved questions.

---

## 5. Database & Migration Rules

1. All database changes must be executed through reviewed Prisma migrations in `packages/db/`.
2. Destructive schema changes (dropping tables, dropping non-empty columns, incompatible type alterations) are strictly prohibited without an explicit migration plan and prior approval.
3. Always verify migration safety against a clean database instance.

---

## 6. Progressive Agent Skills

Antigravity skills for this project are located in `.agents/skills/`:
- `implementation-planning`: Milestone decomposition and execution contracts.
- `secure-api-development`: API defensive design, Zod validation, auth, and error handling.
- `replay-engine-safety`: SSRF defense, egress filtering, timeouts, and payload limits.
- `regression-testing`: Differential response analysis and mask rules.
- `code-review`: Pre-merge validation, defensive checks, and code hygiene.
- `database-migrations`: Safe Prisma migrations and Supabase conventions.
- `release-verification`: End-to-end verification, typechecks, and deployment readiness.
