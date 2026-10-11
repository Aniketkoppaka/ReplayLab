---
name: release-verification
description: Use this skill when preparing releases, verifying milestone completion, testing CI/CD builds, or conducting production deployment readiness checks in ReplayLab.
---

# Release Verification Skill

## Purpose
Establishes an automated, repeatable verification checklist to validate that a release candidate or milestone passes all quality, security, and build checks before release.

## Verification Checklist

### 1. Workspace Integrity & Freshness
- Clean workspace build test:
  ```bash
  pnpm clean
  pnpm install --frozen-lockfile
  ```

### 2. Static Analysis & Linting
- Lint all packages:
  ```bash
  pnpm lint
  ```
- Strict typecheck across all apps and packages:
  ```bash
  pnpm typecheck
  ```

### 3. Automated Test Suites
- Unit and integration tests (Vitest / Supertest):
  ```bash
  pnpm test
  ```
- End-to-end regression tests (Playwright):
  ```bash
  pnpm test:e2e
  ```

### 4. Build Validation
- Build all packages and applications:
  ```bash
  pnpm build
  ```
- Verify that `apps/web/.next` builds successfully with no production build warnings or missing assets.
- Verify that `apps/api/dist` builds clean executable JavaScript.

### 5. Security & Audit Check
- Check for dependency vulnerabilities:
  ```bash
  pnpm audit --audit-level=high
  ```
- Ensure no secret files, `.env` files, or test credentials leaked into build artifacts.

### 6. Evidence Logging
- Record and report exact terminal outputs, git commit SHA, test pass count, and build timestamps in `docs/testing/verification-records.md`.
