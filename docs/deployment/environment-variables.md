# ReplayLab Environment Variables Matrix

## 1. Classification & Security Rules

All configuration parameters in ReplayLab fall into three strict classifications:
1. **Public / Frontend Safe (`NEXT_PUBLIC_*`)**: Exposed in client-side JavaScript bundles. Must NEVER contain database passwords, API secrets, or master encryption keys.
2. **Server Operational Configuration**: Server-side runtime parameters (ports, timeouts, pool sizing, CORS origins).
3. **Class-A Cryptographic Secrets**: Keys and connection strings that protect data confidentiality and integrity. Must be injected via AWS Secrets Manager, GCP Secret Manager, or encrypted CI/CD repository secrets.

---

## 2. Backend (`apps/api`) Variables

| Variable Name | Classification | Required | Type / Format | Description & Example |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Class-A Secret** | **YES** | `postgresql://...` | Connection URI to PostgreSQL database with schema parameter. E.g. `postgresql://user:pass@ep-prd.supabase.co:5432/postgres?schema=public` |
| `APP_ENCRYPTION_KEY` | **Class-A Secret** | **YES** | 64-char Hex | 256-bit AES-GCM encryption key used to encrypt masked environment variables and sensitive fixture data. |
| `SUPABASE_JWT_SECRET` | **Class-A Secret** | **YES** | String (min 32 chars)| Shared HMAC secret used to verify Supabase Auth tokens presented in the `Authorization: Bearer <token>` header. |
| `PORT` | Server Operational | Optional (Default `3001`) | Integer | Listening TCP port for the Express application server. |
| `CORS_ORIGIN` | Server Operational | Optional (Default `*`) | URL or comma-separated URLs | Allowed CORS origin(s). In production, set to `https://app.replaylab.dev` or the production frontend domain. |
| `NODE_ENV` | Server Operational | Recommended | `production` / `development` / `test` | Runtime environment identifier. |

---

## 3. Frontend (`apps/web`) Variables

| Variable Name | Classification | Required | Type / Format | Description & Example |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Public | **YES** | URL | Publicly accessible base URL for the ReplayLab API. E.g. `https://api.replaylab.dev/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | **YES** (Production) | HTTPS URL | Supabase project endpoint. E.g. `https://xyzproject.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | **YES** (Production) | JWT / Anon Key | Supabase client anon public key for browser authentication. |
| `NEXT_PUBLIC_ENABLE_DEV_AUTH` | Public | Optional (Default `false`) | Boolean (`"true"` / `"false"`) | Enables developer bearer token injection modal. Must be set to `"false"` in production. |
| `PORT` | Server Operational | Optional (Default `3000`) | Integer | Port for Next.js production server. |

---

## 4. Verification & Validation Rules

- At API server startup (`apps/api/src/server.ts`), the application validates `APP_ENCRYPTION_KEY`, `SUPABASE_JWT_SECRET`, and database connectivity via `/ready`.
- The frontend validates `getPublicEnv()` at runtime to ensure required URLs are present and correctly formatted.
- `.env` files are strictly excluded from source control via `.gitignore`.
