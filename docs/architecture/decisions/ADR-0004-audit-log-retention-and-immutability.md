# ADR-0004: Audit Log Retention and Immutability Policy

## Status
Accepted

## Context
ReplayLab captures operational activity, including:
- Fixture creation and updates
- Explicit baseline snapshot revisions
- Environment variable creation and secret rotations
- Regression suite modifications and test execution runs

In `schema.prisma`, models originally specified `onDelete: Cascade` from `Project` to `AuditLog`.
If deleting a project cascades to the destruction of all associated `AuditLog` records, several compliance and security vulnerabilities arise:
1. **Malicious or Accidental Repudiation**: A compromised user or malicious actor who tampers with baseline snapshots or rotates environment credentials could delete the project to wipe all audit evidence of their unauthorized activities.
2. **Regulatory & Compliance Failure**: SOC 2, ISO 27001, and enterprise security frameworks require immutable audit trails that outlive deleted workspace entities.
3. **Traceability**: System administrators and security engineers must be able to audit who created, modified, or initiated actions even after a project or user is deprovisioned.

## Decision
1. **Decouple Audit Logs from Project Cascading Deletion**:
   - `AuditLog.projectId` is made **nullable** (`String?`) with `onDelete: SetNull`.
   - When a `Project` is deleted, all historical audit records remain intact, preserving the `action`, `targetType`, `targetId`, `metadata` (sanitized event summary), `createdAt`, and `userId`.
   - `AuditLog.userId` remains nullable with `onDelete: SetNull`.
2. **Audit Log Immutability**:
   - Audit records are strictly append-only. No `UPDATE` queries or endpoints are permitted on the `audit_logs` table.
   - Audit records are indexed by `projectId` and `createdAt`, as well as `[targetType, targetId]`.
3. **Zero Plaintext Secrets in Audit Metadata**:
   - The JSON `metadata` column must strictly store high-level event summaries (e.g., `{"key": "API_KEY", "isSecret": true, "rotated": true}`).
   - Audit metadata must **never** contain raw authorization tokens, passwords, cookies, or decrypted secret values.

## Consequences
- **Positive**:
  - Audit trails survive tenant deletion, guaranteeing non-repudiation and enterprise compliance.
  - Retains forensic evidence of past configuration mutations.
- **Negative**:
  - Requires periodic archival or data retention lifecycle management (e.g., retaining records for 90 days or 1 year per compliance policy).
