---
name: database-migrations
description: Use this skill when designing, reviewing, or applying database schema changes, Prisma models, migrations, or seed data in ReplayLab. Enforces non-destructive migrations, backward compatibility, and Supabase integration integrity.
---

# Database Migrations Skill

## Purpose
Governs all database schema alterations and Prisma migration workflows to guarantee zero-downtime, non-destructive data evolution, and reliable staging/production deployments.

## Non-Negotiable Rules

1. **Prisma Sole Ownership**:
   - All schema declarations belong in `packages/db/prisma/schema.prisma`.
   - Never alter database tables via direct SQL in Supabase dashboard without capturing the change in a committed Prisma migration.
2. **Strict Prohibition of Destructive Changes**:
   - Dropping tables, dropping columns with production data, renaming columns without multi-step migrations, or changing column nullability on populated tables is strictly prohibited without explicit user approval and a multi-phase migration plan.
3. **Multi-Phase Expand & Contract Pattern**:
   - Step 1 (Expand): Add new column or table; make it optional or provide safe defaults; update application code to write to both old and new.
   - Step 2 (Backfill): Backfill existing data.
   - Step 3 (Contract): Switch application reads to the new column, then deprecate and remove the old column in a subsequent migration.

## Migration Workflow

### 1. Schema Definition & Review
- Edit `packages/db/prisma/schema.prisma`.
- Verify field types, indexes, and foreign key relations.
- Ensure appropriate indexes on query filters (e.g. `workspaceId`, `suiteId`, `createdAt`).

### 2. Generate Migration File
- Generate migration script: `pnpm --filter @replaylab/db prisma migrate dev --create-only --name <descriptive_name>`.
- Inspect the generated SQL file in `packages/db/prisma/migrations/`.
- Ensure no accidental `DROP COLUMN` or destructive locks are introduced.

### 3. Verify Against Local / Test Database
- Run migration: `pnpm --filter @replaylab/db prisma migrate deploy`.
- Validate client generation: `pnpm --filter @replaylab/db prisma generate`.
- Run database integration tests to verify client queries.
