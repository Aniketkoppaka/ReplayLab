# ReplayLab Local Database Infrastructure

This directory contains the local database operational configuration for development and integration testing.

## Local PostgreSQL Service (Docker Compose)

A lightweight PostgreSQL 16 container is configured in [docker-compose.yml](file:///c:/Users/anike/Downloads/ReplayLab/infra/database/docker-compose.yml).

### Starting the Database
```bash
docker compose -f infra/database/docker-compose.yml up -d
```

### Stopping the Database
```bash
docker compose -f infra/database/docker-compose.yml down
```

### Connection Details
- **Host**: `localhost`
- **Port**: `5432`
- **Database**: `replaylab`
- **User**: `postgres`
- **Password**: `postgrespassword`
- **Connection URL**:
  `postgresql://postgres:postgrespassword@localhost:5432/replaylab?schema=public`

## Supabase Compatibility

When deploying or testing against Supabase PostgreSQL:
- Supabase Cloud provides a direct connection URL (used for migrations via `DIRECT_URL`) and a transaction pooler URL (used by application clients via `DATABASE_URL`).
- All models defined in `packages/db/prisma/schema.prisma` are strictly standard PostgreSQL and run identically on local PostgreSQL 16 and Supabase PostgreSQL.
- No Supabase-proprietary extensions are required for core ReplayLab entities.
