# ReplayLab Domain Model Specification

## 1. Overview & Purpose
This document specifies the core domain entities, public Data Transfer Objects (DTOs), relationships, and validation constraints implemented in `@replaylab/contracts`.

The domain model is designed **contract-first**: it defines runtime-validated schemas using Zod as the single source of truth for the Next.js frontend (`apps/web`), the Express management API (`apps/api`), and future database layers (`packages/db`).

---

## 2. Domain Entities & Public DTOs

### 2.1 User
- **Entity Responsibility**: Represents an authenticated identity.
- **DTO**: `UserResponse` (`id`, `email`, `name`, `avatarUrl`, `createdAt`, `updatedAt`).
- **Security Boundary**: Public user DTOs **strictly exclude** password hashes, session tokens, refresh tokens, or auth provider secrets.
- **Validation**: Requires RFC-5322 compliant email format, trimmed names up to 100 characters, valid ISO-8601 timestamps.

### 2.2 Project & Membership
- **Entity Responsibility**: Multi-tenant workspace container that owns all environments, fixtures, and regression suites.
- **DTOs**:
  - `CreateProjectInput`: `name` (1-100 chars), `description` (optional, max 500 chars).
  - `UpdateProjectInput`: `name` (optional), `description` (optional).
  - `ProjectResponse`: `id`, `name`, `description`, `role`, timestamps.
  - `ProjectMemberResponse`: `id`, `projectId`, `userId`, `role` (`OWNER`, `EDITOR`, `VIEWER`), `user`.
  - `AssignProjectMemberInput`: `email`, `role`.
- **Authorization Invariant**: Project roles are enforced server-side. Clients cannot self-assign permissions or bypass tenant boundaries through DTO manipulation.

### 2.3 Environment
- **Entity Responsibility**: Defines target runtime execution environments (e.g. Localhost, PR Preview, Staging, Production).
- **DTOs**:
  - `CreateEnvironmentInput`: `name`, `baseUrl` (valid URL <= 2048 chars), `headers`, `variables`.
  - `UpdateEnvironmentInput`: `name`, `baseUrl`, `headers`, `variables`.
  - `EnvironmentResponse`: `id`, `projectId`, `name`, `baseUrl`, `headers`, `variables`.
  - `EnvironmentSummary`: Lightweight projection for UI selectors (`id`, `name`, `baseUrl`).
- **Secret Handling**:
  - Variable inputs distinguish plaintext vs. secret via `isSecret: boolean`.
  - In `EnvironmentResponse`, secret values are **write-only / masked** (represented as `value: null`) to prevent credential leakage in API responses.

### 2.4 Fixture
- **Entity Responsibility**: Encapsulates a reusable HTTP request and its expected baseline response snapshot.
- **DTOs**:
  - `FixtureRequestDefinition`: `method` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), `path` (relative path or absolute URL), `queryParams`, `headers`, `bodyType` (`NONE`, `JSON`, `TEXT`), `body` (structured JSON or string).
  - `BaselineResponseDefinition`: `statusCode` (100-599), `headers`, `bodyType`, `body`.
  - `CreateFixtureInput`: `projectId`, `name`, `description`, `request`, `baseline`, `tags`.
  - `UpdateFixtureInput`: `name`, `description`, `request`, `tags`.
  - `UpdateBaselineInput`: `baseline` (separate explicit mutation; updates to fixtures do not accidentally overwrite baselines).
  - `FixtureResponse`: Full fixture details including timestamps.

### 2.5 Regression Suite & Assertions
- **Entity Responsibility**: Orchestrates ordered collections of fixtures with deterministic assertions and differential comparison mask rules.
- **DTOs**:
  - `SuiteAssertion`: Discriminated union by `type`:
    - `STATUS_CODE`: `expected: number` (100-599).
    - `JSON_PATH_VALUE`: `path: string`, `expected: unknown`.
    - `JSON_PATH_EXISTS`: `path: string`.
    - `RESPONSE_TIME_MAX`: `maxDurationMs: number` (1-60000).
  - `DifferentialMaskRule`: `path`, `action` (`IGNORE`, `TYPE_MATCH`).
  - `SuiteItem`: `fixtureId`, `order`, `assertions`, `maskRules`.
  - `CreateSuiteInput`, `UpdateSuiteInput`, `SuiteResponse`.

### 2.6 Replay Execution & Results
- **Entity Responsibility**: Encapsulates on-demand and batch replay runs and differential analysis outcomes.
- **Outcome Statuses**:
  - `SUCCESS`: HTTP call succeeded, assertions passed, diff matches baseline.
  - `HTTP_ERROR`: Target returned 4xx/5xx HTTP status.
  - `TRANSPORT_ERROR`: TCP/DNS/Socket connection failed (no HTTP response received).
  - `TIMEOUT`: Execution exceeded configured timeout limit.
  - `SSRF_BLOCKED`: Destination resolved to private/loopback/cloud-metadata IP and was blocked.
  - `ASSERTION_FAILURE`: HTTP call succeeded but assertions or baseline diff failed.
- **DTOs**:
  - `TriggerReplayInput`, `ReplayResultResponse`: `httpStatusCode` is nullable (distinguishes transport failure from HTTP response).
  - `TriggerSuiteExecutionInput`, `SuiteExecutionSummaryResponse`, `ExecutionHistoryItem`.

---

## 3. Resource Relationships

```text
User ────(1:N)────> ProjectMember <────(N:1)──── Project
                                                    │
             ┌──────────────────────────────────────┼───────────────────────┐
             │ (1:N)                                │ (1:N)                 │ (1:N)
             ▼                                      ▼                       ▼
        Environment                              Fixture                  Suite
             │                                      │                       │
             │                                      │ (references)          │ (ordered items)
             │                                      └───────────┬───────────┘
             │                                                  │
             └──────────────────────┬───────────────────────────┘
                                    │
                                    ▼
                               ReplayRun
```

---

## 4. Security Invariants Enforced Outside Contracts

While `@replaylab/contracts` provides strict syntactic and structural validation, critical security invariants require external layer enforcement:

1. **Authorization & Tenant Isolation**: Must be enforced by Express middleware and Prisma queries (filtering by `projectId` and user membership).
2. **SSRF Egress Defense**: Schema-level URL validation (`z.string().url()`) checks URL syntax only. Outbound anti-SSRF IP filtering, DNS pre-resolution, and private subnet blocking must be executed at the socket level by the Replay Engine.
3. **Secret Encryption**: Storing secret environment variables requires application-level encryption at rest before database persistence.
4. **Rate Limiting & DoS Protection**: Request body sizing is capped in contracts, but raw payload streaming and rate limits must be gated at the Express gateway level.

---

## 5. Deliberate Limitations of V1 Contracts

- **cURL Import**: Not parsed in contracts; raw cURL command translation to `FixtureRequestDefinition` will occur in a dedicated parser utility in `apps/api`.
- **Binary Payloads**: Multi-part form data and arbitrary binary streams are deferred; V1 supports structured JSON and UTF-8 text bodies.
- **Secret Management**: Basic masked key-value store; enterprise Vault / AWS KMS integrations are deferred.
