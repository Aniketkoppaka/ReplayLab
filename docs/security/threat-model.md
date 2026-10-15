# Threat Model & Security Architecture

## 1. System Asset Classification
- **User Fixtures & Requests**: May contain proprietary API shapes, URL structures, and headers.
- **Environment Configurations**: Base URLs, custom headers, environment names.
- **Database (Supabase PostgreSQL)**: User identities, workspaces, fixtures, baseline snapshots, test run logs.
- **Outbound HTTP Replay Dispatcher**: Network egress pathway that executes requests on behalf of users.

## 2. Threat Analysis (STRIDE)

| Threat Category | Potential Attack Vector | Mitigation in ReplayLab |
| :--- | :--- | :--- |
| **Spoofing** | Forged session tokens or tenant impersonation | JWT/Session verification middleware; strict tenant ID isolation in DB queries. |
| **Tampering** | Altering fixtures or baselines in transit | HTTPS-only communication; HMAC/checksum validation on stored snapshots. |
| **Repudiation** | Denying test suite execution or baseline updates | Audit logs recording user ID, timestamp, and action for all mutations. |
| **Information Disclosure** | Secrets in saved fixtures; leaking internal network topology via SSRF | Automatic redaction of sensitive headers (`Authorization`, `Cookie`); generic error codes for network failures. |
| **Denial of Service** | Infinite redirects; memory exhaustion via multi-gigabyte responses | Max 3 redirect hops; 10MB request/response body caps; 15s execution timeout. |
| **Elevation of Privilege** | Server-Side Request Forgery (SSRF) targeting cloud metadata or internal microservices | Mandatory DNS pre-resolution; strict blocking of private/loopback/cloud metadata IP ranges before opening sockets. |

## 3. Server-Side Request Forgery (SSRF) Deep Dive

Because ReplayLab executes arbitrary user-supplied HTTP URLs, it is inherently an SSRF target. The following defense-in-depth measures are mandated:

1. **Protocol Restriction**: Only `http:` and `https:`.
2. **DNS Pre-resolution & Address Verification**:
   - Hostnames are resolved to IP addresses via Node.js `dns.promises.lookup`.
   - The resolved IP is evaluated against all CIDR ranges in RFC 1918, RFC 3927 (link-local), RFC 5737, and IPv6 equivalents (`::1`, `fc00::/7`).
   - Cloud metadata (`169.254.169.254`, `metadata.google.internal`) is explicitly rejected.
3. **No DNS Rebinding**:
   - Outbound sockets connect directly to the pre-validated IP address, setting the `Host` header to the original hostname.
4. **Manual Redirect Inspection**:
   - HTTP clients must not follow redirects automatically. Each `3xx` redirect location must be extracted, checked, resolved, and verified before continuing.

## 4. Multi-Tenant Authorization & Non-Disclosure Policy

ReplayLab strictly prevents cross-tenant resource enumeration and unauthorized access:

1. **Existence Non-Disclosure (404 Policy)**:
   - When an authenticated user requests a resource (project, environment, fixture, baseline, suite, or member) that either does not exist or belongs to another project where they lack membership, the API consistently returns `HTTP 404 NOT_FOUND` with error code `NOT_FOUND`.
   - Returning `403 FORBIDDEN` for foreign resources would allow attackers to enumerate project IDs, resource UUIDs, or membership relationships. `403 FORBIDDEN` is strictly reserved for authenticated members of a project who lack sufficient role privileges (e.g. `VIEWER` attempting a write or replay action).
2. **Nested Resource Boundary Enforcement**:
   - Every nested resource operation (`/projects/:projectId/fixtures/:fixtureId`, `/projects/:projectId/environments/:envId`, `/projects/:projectId/suites/:suiteId`, `/projects/:projectId/members/:memberId`) validates that the target entity's `projectId` foreign key strictly matches the path `:projectId`.
   - Replay execution validates that both the fixture and target environment belong to the authorized project.
3. **Atomic Last-Owner Invariant**:
   - A project cannot be left without an active `OWNER`.
   - Both removal (`DELETE /members/:id`) and role updates/demotions (`POST /members` with role other than `OWNER`) are transactionally evaluated to ensure at least one `OWNER` remains. Attempts to remove or demote the last owner fail with `403 FORBIDDEN (LAST_OWNER_PROTECTION)`.

