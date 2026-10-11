# ADR-0001: Monorepo Architecture

## Status
Accepted

## Context
ReplayLab consists of a Next.js frontend, an Express backend, shared contracts/schemas, and database access logic. We needed a repository strategy that:
1. Allows end-to-end type safety and code sharing (Zod contracts, DTO types).
2. Prevents phantom dependencies and dependency duplication.
3. Supports independent build and deployment lifecycles for the frontend (Vercel) and backend (persistent container).
4. Keeps operational overhead minimal during early phases.

## Decision
We adopt a **pnpm workspaces monorepo** managed through **Corepack** (pinned to `pnpm@9.15.5`):
- `apps/web/`: Frontend Next.js app.
- `apps/api/`: Express API and Replay Engine.
- `packages/contracts/`: Shared domain contracts and Zod schemas.
- `packages/db/`: Centralized Prisma client and migrations.
- `packages/config/`: Shared tooling configs (tsconfig, eslint).

We intentionally defer introducing heavy monorepo orchestration tools like Turborepo or Nx until build cache acceleration or complex dependency graphs justify them.

## Consequences
- **Positive**: Single repository for full-stack changes; atomic cross-boundary commits; zero duplicate schemas; isolated package dependencies.
- **Negative**: Monorepo tooling setup requires explicit workspace protocol references (`workspace:*`) and shared tsconfig paths.
