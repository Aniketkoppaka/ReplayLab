# Testing & Evidence-Based Completion Rules

1. **Evidence-Based Reporting**:
   - Every completed task report must state the specific command executed and the actual terminal output observed.
   - Suppressing test errors or claiming a passing status without evidence is prohibited.
2. **Deterministic Tests**:
   - Integration tests must not depend on live unmocked third-party APIs. Use local mock servers or the deterministic demo API (`infra/demo-api`).
