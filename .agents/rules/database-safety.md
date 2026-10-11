# Database & Migration Safety Rules

1. **Prisma Sole Source of Truth**:
   - Schema alterations must originate from `packages/db/prisma/schema.prisma` and committed migrations.
2. **No Destructive Operations**:
   - `DROP TABLE`, `DROP COLUMN`, or irreversible column truncations/type changes are prohibited without explicit prior approval and a phased migration plan.
3. **No Direct Production Manual Edits**:
   - Never run raw manual DDL in production environments.
