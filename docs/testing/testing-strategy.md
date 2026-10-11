# Testing Strategy & Verification Records

## 1. Testing Pyramid

ReplayLab adopts a pragmatic, multi-tier testing strategy:

```text
       ▲
      / \        End-to-End Tests (Playwright)
     /   \       - User fixture creation, replay trigger, diff inspection
    /─────\
   /       \     Integration Tests (Supertest & Docker Demo API)
  /         \    - Replay Engine SSRF defense, redirect loops, timeouts
 /───────────\
/             \  Unit Tests (Vitest)
/               \ - Contract Zod validation, JSON diff algorithm, mask evaluation
─────────────────
```

## 2. Test Tools & Frameworks
- **Unit & Integration Testing**: `Vitest` (fast, native ESM and TypeScript support).
- **API Testing**: `Supertest` for testing Express endpoints.
- **End-to-End Testing**: `Playwright` for testing Next.js UI flows in real Chromium instances.
- **Mock Target API**: Deterministic mock API in `infra/demo-api` for replay testing.

## 3. Mandatory Evidence & Verification Practices
- Every pull request, task completion, or release milestone must provide verified command output.
- Test suites must be deterministic and run in CI on every push and pull request.
- Suppressing test errors or faking test assertions is strictly prohibited.
