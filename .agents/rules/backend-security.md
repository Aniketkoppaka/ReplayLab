# Backend & API Security Rules

1. **Mandatory Input Validation**:
   - Every Express route handler receiving request payloads, query parameters, or route parameters must validate them with Zod schemas from `@replaylab/contracts`.
2. **Defensive Error Handling**:
   - Never leak internal error details, SQL queries, or stack traces in API response bodies.
   - Return structured error responses conforming to standard error schemas.
3. **Authentication & Tenant Isolation**:
   - All multi-tenant queries must explicitly filter by tenant/organization ID to eliminate Insecure Direct Object References (IDOR).
