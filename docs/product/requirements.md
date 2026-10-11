# ReplayLab Product Requirements

## 1. Problem Statement
Developers and QA teams lack an intuitive, safe platform to capture real HTTP API requests, sanitize sensitive headers/tokens, replay them reliably across multiple environments (local dev, PR preview, staging, prod), and perform deterministic regression comparisons against established response baselines.

## 2. Core Functional Requirements

### FR-1: Request Capture & Fixture Management
- Users can import HTTP requests from cURL, OpenAPI specifications, or manual input.
- Automatic sanitization of sensitive authorization headers and cookie tokens.
- Fixtures are organized into test suites and tagged by service/domain.

### FR-2: Safe Replay Engine
- Users can configure target environments with base URLs and environment-specific headers.
- Replay engine dispatches HTTP requests safely with strict SSRF defense, timeouts, and redirect controls.
- Asynchronous batch execution for test suites.

### FR-3: Differential Comparison Engine
- Compares replayed responses against saved baseline snapshots.
- Status code equality verification.
- Deterministic header comparison.
- Structural JSON diffing with configurable mask rules (ignoring timestamps, UUIDs, or dynamic tokens).

### FR-4: Regression Suite Execution & Reporting
- Group fixtures into regression suites.
- Execute suites on-demand or via CI triggers.
- Detailed visual reports showing passing runs, regressions, and semantic diffs.

## 3. Non-Functional Requirements
- **Security**: Strict zero-trust outbound networking (anti-SSRF), tenant data isolation, zero unredacted secrets in storage.
- **Performance**: Capable of executing multi-request suites concurrently within rate-limited constraints.
- **Reliability**: Deterministic diffing that avoids false positives through configurable field masks.
