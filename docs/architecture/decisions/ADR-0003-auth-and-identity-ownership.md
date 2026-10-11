# ADR-0003: Authentication, Identity, and User Ownership

## Status
Accepted

## Context
ReplayLab is an enterprise-grade API debugging, regression-testing, and replay platform.
We must establish the relationship between authentication, identity, and application domain models (projects, environments, fixtures, replays, and audit logs).
Specifically, we must determine whether the database owns identity directly or links to an external authentication provider such as Supabase Auth (or any OAuth/OIDC provider).

If an application maintains duplicate user credential tables alongside an external auth provider, it risks:
1. Synchronization drift between auth provider accounts and local database users.
2. Insecure duplicate password hashing or session credential storage in the application database.
3. Violations of zero-trust architecture.

## Decision
1. **External Auth Owns Authentication & Credentials**:
   - Supabase Auth (or standard JWT/OIDC authentication) is the primary source of truth for user authentication, password storage, OAuth tokens, and session issuance.
   - The ReplayLab application database (`packages/db`) **never stores passwords, salt, refresh tokens, or auth credentials**.
2. **Application Database Owns User Profile & Tenant Associations**:
   - The `User` model in `packages/db` represents the application-level user profile and identity reference (`id`, `email`, `name`, `avatarUrl`, `createdAt`, `updatedAt`).
   - The primary key `User.id` corresponds to the unique subject identifier (`sub` or Supabase `auth.users.id` UUID) issued by the authentication provider.
   - All tenant associations (`ProjectMember`, `AuditLog`, `ReplayRun` triggers) reference this `User` model with strict foreign-key integrity.
3. **Tenant & Project Isolation**:
   - All resources (Environments, Fixtures, Suites, Runs) are strictly scoped to a `Project`.
   - Access control is governed by `ProjectMember` (`OWNER`, `EDITOR`, `VIEWER`), verified server-side on every request.

## Consequences
- **Positive**:
  - Zero password or credential storage risks in ReplayLab database.
  - Seamless compatibility with both Supabase Cloud and local PostgreSQL (e.g. Docker Compose with mock JWT tokens).
  - Clean referential integrity for project membership and audit trails.
- **Negative**:
  - User creation must be synchronized upon first authenticated login or through auth webhook / registration hooks.
