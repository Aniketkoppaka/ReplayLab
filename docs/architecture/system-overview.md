# System Overview

## 1. High-Level Architecture

ReplayLab is composed of two primary application tiers and shared library packages:

```text
┌─────────────────────────────────┐
│     apps/web (Next.js / Vercel) │  Frontend UI, Dashboards, Diff Viewer
└────────────────┬────────────────┘
                 │ HTTPS / REST
                 ▼
┌─────────────────────────────────┐
│     apps/api (Express Node.js)  │  Management API & Replay Dispatch Engine
└──────┬────────────────────┬─────┘
       │                    │
       ▼                    ▼
┌──────────────┐     ┌───────────────────────┐
│ packages/db  │     │  Outbound Replay      │
│  (Supabase/  │     │  Engine (Anti-SSRF,   │
│  PostgreSQL) │     │  DNS Pre-Resolution)  │
└──────────────┘     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ Target Environment /  │
                     │ User APIs             │
                     └───────────────────────┘
```

## 2. Key Components

- **`apps/web`**: Static/Serverless Next.js application providing the user dashboard, fixture editor, test suite orchestrator, and visual diff inspector. Hosted on Vercel.
- **`apps/api`**: Persistent Node.js Express server providing the CRUD REST API, authentication middleware, and execution engine. Hosted on containerized infrastructure (Render, Railway, Fly.io, or AWS ECS).
- **`packages/contracts`**: Pure TypeScript and Zod contract definitions consumed by both `apps/web` and `apps/api`.
- **`packages/db`**: Centralized Prisma ORM models and migration files connecting to Supabase PostgreSQL.
- **`infra/demo-api`**: Containerized mock HTTP API used to verify replay operations deterministically in test environments.
