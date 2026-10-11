---
name: secure-api-development
description: Use this skill when developing or modifying backend endpoints, Express route handlers, middleware, request validation, or error handling in ReplayLab. Enforces defensive API design, Zod validation, auth, and secret protection.
---

# Secure API Development Skill

## Purpose
Guarantees that every API endpoint in `apps/api` is defensively engineered against injection, broken access control, information leakage, and invalid input.

## Checklist & Constraints

### 1. Input Validation & Contracts
- **Rule**: Never trust raw HTTP request bodies, params, or query strings (`req.body`, `req.params`, `req.query`).
- **Standard**: Every route handler must validate input using a Zod schema defined in `packages/contracts`.
- Reject unrecognized or excessive fields using `.strict()` where appropriate to prevent parameter pollution.

### 2. Authentication & Authorization
- Verify session or JWT token validity via middleware prior to hitting business logic.
- Ensure all queries are scoped to the authenticated user's organization / tenant ID to prevent Insecure Direct Object References (IDOR).

### 3. Error Handling & Information Leakage
- Catch all async errors via centralized error handling middleware.
- Never return stack traces, internal database error messages, or internal hostnames in production HTTP responses.
- Use sanitized error codes and standard RFC-7807 problem details or structured error envelopes.

### 4. Secret & Credential Redaction
- Never log raw authorization tokens, session cookies, or plaintext credentials.
- Ensure all logging middleware automatically scrubs sensitive keys (`authorization`, `cookie`, `set-cookie`, `password`, `token`).

### 5. CORS, Headers & Rate Limiting
- Apply `helmet` for secure HTTP headers.
- Restrict CORS origins strictly to authorized client domains (e.g. configured `FRONTEND_URL`), disallowing wildcard `*` with credentials.
- Apply IP/User-based rate limiting to all public and fixture execution endpoints.
