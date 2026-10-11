# ReplayLab

ReplayLab is an enterprise-grade full-stack API debugging, regression-testing, and fixture playback platform. It enables development and QA teams to capture sanitized HTTP request fixtures, replay them across target environments, execute differential response analysis against baselines, and maintain regression test suites.

## Repository Architecture

This repository is organized as a TypeScript monorepo using `pnpm` workspaces:

- `apps/web`: Next.js frontend (React 19, Tailwind CSS, shadcn/ui) designed for deployment to Vercel.
- `apps/api`: Express backend and persistent Replay Engine designed for containerized Node.js hosting.
- `packages/contracts`: Shared TypeScript domain models, DTOs, and Zod validation schemas.
- `packages/db`: Centralized Prisma schema, migrations, and database client exports for Supabase (PostgreSQL).
- `packages/config`: Shared tooling configurations.
- `infra/database`: Local database operational configs and seed data.
- `infra/demo-api`: Deterministic mock API for integration and replay safety testing.
- `docs/`: Product specs, architecture decision records (ADRs), threat model, and test plans.
- `.agents/`: Project-specific Antigravity agent skills and scoped rules.

## Prerequisites

- **Node.js**: `24.x` (LTS; see `.nvmrc`) or `22.x`
- **Package Manager**: `pnpm@9.15.5` (managed via Corepack)
- **Docker**: For local database and demo API services

## Quick Start (Development Setup)

```bash
# Enable pnpm via Corepack
corepack enable pnpm

# Install workspace dependencies (reproducible via pnpm-lock.yaml)
corepack pnpm install --frozen-lockfile

# Run quality gates across all workspaces
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Security & Guidelines

See [SECURITY.md](file:///c:/Users/anike/Downloads/ReplayLab/SECURITY.md) and [CONTRIBUTING.md](file:///c:/Users/anike/Downloads/ReplayLab/CONTRIBUTING.md) for vulnerability disclosure policies, contribution guidelines, and SSRF security requirements.
