# @replaylab/contracts

Shared domain contracts, DTO types, and Zod validation schemas shared between `@replaylab/web` and `@replaylab/api`.

## Modules

- `common`: Reusable primitives (`ResourceId`, `IsoTimestamp`, `PaginationInput`, `PaginationMeta`).
- `errors`: Standardized API error responses and validation details (`ApiErrorResponse`).
- `user`: Public user representations (`UserResponse`).
- `project`: Project CRUD and membership management (`CreateProjectInput`, `ProjectResponse`, `ProjectRole`).
- `environment`: Target execution environments with masked secrets (`CreateEnvironmentInput`, `EnvironmentResponse`).
- `fixture`: Reusable HTTP requests and expected baselines (`CreateFixtureInput`, `FixtureResponse`, `UpdateBaselineInput`).
- `suite`: Regression test suites, assertions (`SuiteAssertion`), and mask rules (`DifferentialMaskRule`).
- `replay`: Replay execution triggers and outcome results (`TriggerReplayInput`, `ReplayResultResponse`, `ReplayOutcomeStatus`).

## Usage Example

```typescript
import {
  CreateFixtureInputSchema,
  type CreateFixtureInput,
  ReplayOutcomeStatusSchema,
} from '@replaylab/contracts';

// Runtime input validation
const input: CreateFixtureInput = CreateFixtureInputSchema.parse(req.body);

// Type assertion
console.log(input.request.method);
```

## Development & Verification

```bash
# Lint contracts
corepack pnpm --filter @replaylab/contracts lint

# Typecheck contracts
corepack pnpm --filter @replaylab/contracts typecheck

# Run unit tests
corepack pnpm --filter @replaylab/contracts test

# Compile TypeScript
corepack pnpm --filter @replaylab/contracts build
```
