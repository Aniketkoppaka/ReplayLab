# Security Policy

## Reporting Security Issues

If you discover a vulnerability or security flaw in ReplayLab, please do not file a public GitHub issue. Send a confidential report to security@replaylab.dev.

## Core Security Mandates

### 1. Server-Side Request Forgery (SSRF) Defense
ReplayLab's core replay service issues outbound HTTP calls based on user-provided fixtures. It is critical that internal services, private networks, and cloud metadata services are never accessed through this vector:
- All target hostnames are resolved through DNS and checked against private/loopback/cloud metadata IP ranges before opening a TCP connection.
- Redirects are intercepted at each hop and re-validated.
- Outbound requests and inbound responses are bound to strict execution timeouts and 10MB payload size limits.

### 2. Secret Redaction
- Never store raw credentials, bearer tokens, or session cookies in fixture records or system logs.
- Sensitive values must be redacted using secure substitution patterns.

### 3. Database Security
- All queries must be parameterized via Prisma.
- Multi-tenant isolation is enforced on every query.
