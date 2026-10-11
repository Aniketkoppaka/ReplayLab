# ReplayLab

ReplayLab is an enterprise-grade full-stack API debugging, regression-testing, and fixture playback platform. It enables development and QA teams to capture sanitized HTTP request fixtures, replay them across target environments, execute differential response analysis against baselines, and maintain regression test suites.

## Repository Architecture

This repository is organized as a TypeScript monorepo using `pnpm` workspaces:

- `apps/web`: Next.js frontend (React, Tailwind CSS, shadcn/ui) designed for deployment to Vercel.
- `apps/api`: Express backend and persistent Replay Engine designed for containerized Node.js hosting.
- `packages/contracts`: Shared TypeScript domain models, DTOs, and Zod validation schemas.
- `packages/db`: Centralized Prisma schema, migrations, and database client exports for Supabase (PostgreSQL).
- `packages/config`: Shared tooling configurations (TypeScript, ESLint).
- `infra/database`: Local database operational configs and seed data.
- `infra/demo-api`: Deterministic mock API for integration and replay safety testing.
- `docs/`: Product specs, architecture decision records (ADRs), threat model, and test plans.
- `.agents/`: Project-specific Antigravity agent skills and scoped rules.

## Prerequisites

- **Node.js**: `>= 20.0.0` (LTS recommended)
- **Package Manager**: `pnpm` (managed via Corepack, pinned to `9.15.5`)
- **Docker**: For local database and demo API services

## Quick Start (Workspace Scaffolding)

```bash
# Enable pnpm via Corepack
corepack enable pnpm

# Install workspace dependencies (when initialized)
corepack pnpm install

# Run workspace checks
corepack pnpm typecheck
corepack pnpm test
```

## Security & Guidelines

See [SECURITY.md](file:///c:/Users/anike/Downloads/ReplayLab/SECURITY.md) and [CONTRIBUTING.md](file:///c:/Users/anike/Downloads/ReplayLab/CONTRIBUTING.md) for vulnerability disclosure policies, contribution guidelines, and SSRF security requirements.
