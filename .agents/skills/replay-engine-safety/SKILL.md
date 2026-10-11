---
name: replay-engine-safety
description: Use this skill when implementing, testing, or modifying the Replay Engine, outbound HTTP dispatchers, socket handling, target environment validation, or fixture playback. Enforces SSRF protection, IP blocklists, DNS rebinding defenses, redirects, timeouts, and payload limits.
---

# Replay Engine Safety Skill

## Purpose
The ReplayLab Replay Engine dispatches user-configured HTTP requests to external or specified target servers. Because users supply URLs, headers, and bodies, this is an inherent high-risk vector for Server-Side Request Forgery (SSRF), Denial of Service (DoS), and internal network compromise. This skill mandates non-negotiable security controls.

## Mandatory Security Controls

### 1. Destination Authorization & Scheme Validation
- Allowed protocols: Only `http:` and `https:`. Disallow `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`.
- Target environment verification: Replay targets must belong to user-configured environment base URLs or explicitly validated domains.

### 2. Strict SSRF Defense & IP Address Blocklists
- Before establishing any TCP connection, resolve the domain name to its target IP address (DNS resolution).
- Validate the resolved IP address against strict private, loopback, multicast, and link-local ranges:
  - **IPv4 Disallowed Ranges**:
    - `0.0.0.0/8` (Current network)
    - `10.0.0.0/8` (Private network RFC 1918)
    - `127.0.0.0/8` (Loopback)
    - `169.254.0.0/16` (Link-local / Cloud metadata service e.g. AWS/GCP `169.254.169.254`)
    - `172.16.0.0/12` (Private network RFC 1918)
    - `192.168.0.0/16` (Private network RFC 1918)
    - `224.0.0.0/4` (Multicast)
    - `240.0.0.0/4` (Reserved)
  - **IPv6 Disallowed Ranges**:
    - `::1/128` (Loopback)
    - `fc00::/7` (Unique Local Address)
    - `fe80::/10` (Link-local)
    - `::ffff:0:0/96` (IPv4-mapped IPv6 addresses matching disallowed IPv4 ranges)
  - **Alternative IP Representations**:
    - Guard against hex (`0x7f000001`), octal (`017700000001`), integer (`2130706433`), and mixed dot formats. Use standard IP parser (`net.isIP`) on strictly parsed numeric representations.

### 3. DNS Rebinding Defense
- Do NOT perform a separate DNS lookup check and then pass the hostname to a standard HTTP client (which would re-resolve the domain, allowing DNS rebinding attacks).
- Connect directly to the pre-validated IP address while preserving the original `Host` header and SNI for TLS.

### 4. Redirect Revalidation at Every Hop
- Never allow automated uninspected HTTP redirects (`followRedirects: true`).
- Intercept any `3xx` redirect response manually.
- Extract the `Location` header, re-validate the target URL, re-resolve DNS, and verify the new destination IP before initiating the next hop.
- Set a strict maximum redirect depth (e.g. max 3 hops).

### 5. Strict Timeouts
- **Socket Connect Timeout**: 3,000 ms.
- **TLS Handshake Timeout**: 3,000 ms.
- **First-byte Response / Read Timeout**: 10,000 ms.
- **Total Request Execution Timeout**: 15,000 ms maximum.

### 6. Request & Response Size Limits
- Maximum outbound request body size: 10 MB.
- Maximum inbound response body buffer: 10 MB (stream truncation with a warning if exceeded, preventing memory exhaustion).

### 7. Secret Redaction & Secure Logging
- Strip or redact authorization headers before logging or persisting replay traces.
- Errors must report high-level status (e.g., `SSRF_BLOCKED_DESTINATION`, `SOCKET_TIMEOUT`) without leaking internal network topologies.
