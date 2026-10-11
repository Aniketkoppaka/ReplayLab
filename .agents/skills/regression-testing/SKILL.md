---
name: regression-testing
description: Use this skill when implementing, testing, or executing regression test suites, differential response comparisons, baseline fixtures, and response masking rules in ReplayLab.
---

# Regression Testing Skill

## Purpose
Governs the methodology for deterministic API regression testing, differential analysis (diffing), baseline captures, and mask rule evaluations.

## Differential Analysis Workflow

### 1. Baseline Capture & Normalization
- A baseline fixture contains:
  - HTTP method, URL path, sanitized query parameters, and headers.
  - Expected HTTP status code.
  - Expected response headers (filtered for deterministic headers).
  - Expected response payload (JSON or binary hash).
- All timestamps, request IDs, and non-deterministic headers (`Date`, `Set-Cookie`, `ETag`, `Server`) must be ignored or masked.

### 2. Response Masking Rules
- Support flexible masking paths (JSONPath or dot-notation, e.g., `data.createdAt`, `meta.requestId`):
  - **Ignore**: Completely omit the field from comparison.
  - **Type-Check**: Assert the field is present and matches expected type (e.g., ISO date string, UUID) without asserting literal value equality.
  - **Regex**: Assert field matches a predefined format regex.

### 3. Comparison Engine Assertions
1. **Status Code**: Exact match required unless expected variations are configured.
2. **Deterministic Headers**: Headers in the comparison contract must match.
3. **Payload Semantic Diff**:
   - Parse JSON and run recursive structural diffs.
   - Report exact diff path, expected value, and actual value.
   - Differentiate between added fields, missing fields, and mutated values.

### 4. Verification Check
- Test the comparison engine with:
  - Identical responses (assert 100% match).
  - Dynamic timestamp variation under mask (assert pass).
  - Schema mutation / type change (assert failure with descriptive diff).
  - HTTP status regression (assert failure).
