# ReplayLab Implementation Roadmap

## Phase 0: Scaffolding and Environment Preparation
- [x] **Phase 0.1**: Repository reconnaissance and architectural assessment.
- [x] **Phase 0.2**: Monorepo scaffolding, Git initialization, Antigravity skills, and CI workflow.

## Phase 1: Core Domain Contracts & Database Scaffolding
- [x] Initialize `packages/contracts` with Zod schemas for Fixtures, Environments, ReplayRuns, and ComparisonResults.
- [x] Initialize `packages/db` with Prisma schema for workspaces, environments, fixtures, runs, and baselines.
- [x] Set up local Supabase / PostgreSQL development container in `infra/database`.

## Phase 2: Replay Engine & SSRF Protection (apps/api)
- [x] Implement secure HTTP dispatcher in `apps/api/src/replay-engine`.
- [x] Implement DNS pre-resolution and IP blocklist checking.
- [x] Implement hop-by-hop redirect validation and strict timeouts.
- [x] Implement deterministic mock target in `infra/demo-api`.
- [x] Write integration test suite proving rejection of `127.0.0.1`, `169.254.169.254`, and private networks.

## Phase 3: Differential Comparison Engine & Authenticated Foundation
- [x] Implement semantic JSON diffing algorithm.
- [x] Implement field mask rules (ignore, type-check, regex).
- [x] Implement baseline snapshot storage and retrieval.
- [x] Multi-tenant PostgreSQL persistence with Prisma and Supabase.
- [x] Concurrency-safe last-owner protection with advisory locks.

## Phase 4: Express Management API & Replay Orchestration Integration
- [x] Fixture CRUD endpoints with contract validation.
- [x] Environment management endpoints with AES-256-GCM secret encryption.
- [x] Replay execution and suite trigger endpoints with durable ReplayRun and SuiteRun history.
- [x] Multi-tenant authorization, audit logging, and error handling middleware.

## Phase 5: Next.js Frontend (apps/web)
- [x] Initialize Next.js App Router with Tailwind CSS and shadcn/ui foundation (Phase 5.1).
- [x] Environment and Fixture management views with secret masking and baseline snapshots (Phase 5.2).
- [ ] Interactive Replay trigger and live execution status (Phase 5.3).
- [ ] Visual side-by-side diff viewer for response comparisons (Phase 5.4).

## Phase 6: CI Automation & Production Verification
- [ ] Playwright E2E test suite covering full user journey.
- [ ] Automated regression testing pipeline.
- [ ] Deployment runbooks for Vercel (web) and containerized backend (api).
