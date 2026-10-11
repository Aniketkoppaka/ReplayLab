# ADR-0005: Secret Persistence and Authenticated Application-Level Encryption

## Status
Accepted

## Context
ReplayLab allows users to configure target environments with custom headers and environment variables. Some environment variables are marked as secret (`isSecret: true`), such as downstream API keys, bearer tokens, or basic auth credentials.

Storing secrets in plaintext in PostgreSQL exposes credentials to anyone with database read access (DB backups, query loggers, analytics replicas, Supabase Studio viewers).

## Decision
1. **Authenticated Encryption at Application Layer**:
   - The application layer (`apps/api`) encrypts secret values before issuing database writes using industry-standard authenticated encryption: **AES-256-GCM** (Galois/Counter Mode).
   - No home-grown cryptographic primitives are used; standard Node.js `crypto` primitives (`crypto.createCipheriv('aes-256-gcm', key, iv)`) are used.
2. **Dedicated Columns for Authenticated Ciphertext**:
   - In `EnvironmentVariable`:
     - `value`: Stores the ciphertext string (Base64-encoded) when `isSecret: true`, or plaintext string when `isSecret: false`.
     - `secretIv`: Stores the unique 12-byte (96-bit) Initialization Vector / Nonce (Base64-encoded) generated per encryption operation.
     - `secretAuthTag`: Stores the 16-byte (128-bit) GCM authentication tag (Base64-encoded).
3. **Fail-Closed Decryption Guarantee**:
   - If decryption fails (e.g., ciphertext tampered, invalid auth tag, or incorrect encryption key), the replay engine **fails closed** immediately and aborts the request with `INTERNAL_ERROR` or `AUTHENTICATION_REQUIRED`, rather than falling back to emitting damaged or plaintext data.
4. **Key Configuration via Dedicated Environment Variable**:
   - Encryption key is supplied via `APP_ENCRYPTION_KEY` (a 256-bit hexadecimal or Base64 string).
   - Documented in `.env.example` and `.env.test.example`.
   - Never committed to version control.
5. **Zero Secret Leakage in DTOs**:
   - `packages/contracts` enforces that `EnvironmentVariableResponse.value` is `null` whenever `isSecret: true`.

## Consequences
- **Positive**:
  - Compromise of the database or raw database backups does not expose downstream API secrets.
  - AES-256-GCM guarantees both confidentiality and integrity (detects tampering).
- **Negative**:
  - Key rotation procedures must be established in operational runbooks for enterprise deployments.
