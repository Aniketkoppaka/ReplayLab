# Replay Engine Network Safety Rules

1. **SSRF Defense**:
   - Outbound requests dispatched by the replay engine must pre-resolve hostnames via DNS and reject private, loopback, link-local, multicast, and cloud metadata IP addresses (`169.254.169.254`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, `::1`, `fc00::/7`).
2. **Redirect Interception**:
   - Automated unverified redirect following is strictly prohibited. Every redirect hop must be intercepted and re-validated.
3. **Execution Limits**:
   - Socket connection timeout: 3s max. Total execution timeout: 15s max.
   - Request and response body size limit: 10MB max.
4. **Header Sanitization**:
   - Sensitive headers (`Authorization`, `Cookie`, `X-Api-Key`) must be redacted before saving fixtures or storing test run traces.
