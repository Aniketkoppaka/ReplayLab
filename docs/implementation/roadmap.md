# ReplayLab Implementation Roadmap

## Phase 0: Scaffolding and Environment Preparation
- [x] **Phase 0.1**: Repository reconnaissance and architectural assessment.
- [x] **Phase 0.2**: Monorepo scaffolding, Git initialization, Antigravity skills, and CI workflow.

## Phase 1: Core Domain Contracts & Database Scaffolding
- [ ] Initialize `packages/contracts` with Zod schemas for Fixtures, Environments, ReplayRuns, and ComparisonResults.
- [ ] Initialize `packages/db` with Prisma schema for workspaces, environments, fixtures, runs, and baselines.
- [ ] Set up local Supabase / PostgreSQL development container in `infra/database`.

## Phase 2: Replay Engine & SSRF Protection (apps/api)
- [ ] Implement secure HTTP dispatcher in `apps/api/src/replay-engine`.
- [ ] Implement DNS pre-resolution and IP blocklist checking.
- [ ] Implement hop-by-hop redirect validation and strict timeouts.
- [ ] Implement deterministic mock target in `infra/demo-api`.
- [ ] Write integration test suite proving rejection of `127.0.0.1`, `169.254.169.254`, and private networks.

## Phase 3: Differential Comparison Engine
- [ ] Implement semantic JSON diffing algorithm.
- [ ] Implement field mask rules (ignore, type-check, regex).
- [ ] Implement baseline snapshot storage and retrieval.

## Phase 4: Express Management API
- [ ] Fixture CRUD endpoints with contract validation.
- [ ] Environment management endpoints.
- [ ] Replay execution and suite trigger endpoints.
- [ ] Multi-tenant authorization and error handling middleware.

## Phase 5: Next.js Frontend (apps/web)
- [ ] Initialize Next.js App Router with Tailwind CSS and shadcn/ui.
- [ ] Environment and Fixture management views.
- [ ] Interactive Replay trigger and live execution status.
- [ ] Visual side-by-side diff viewer for response comparisons.

## Phase 6: CI Automation & Production Verification
- [ ] Playwright E2E test suite covering full user journey.
- [ ] Automated regression testing pipeline.
- [ ] Deployment runbooks for Vercel (web) and containerized backend (api).
