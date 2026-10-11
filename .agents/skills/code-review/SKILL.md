---
name: code-review
description: Use this skill when reviewing code changes, pull requests, or feature implementations before committing or merging in ReplayLab. Enforces code quality, test coverage, type safety, security, and architectural boundaries.
---

# Code Review Skill

## Purpose
Provides a structured checklist for validating all code changes against ReplayLab engineering standards before staging or committing.

## Review Checklist

### 1. Architectural Boundaries
- [ ] Are dependencies moving in the right direction?
- [ ] Are shared types and Zod schemas in `packages/contracts` rather than duplicated between `apps/web` and `apps/api`?
- [ ] Does `packages/db` remain the sole owner of Prisma models and database access?
- [ ] Does `apps/web` remain free of direct backend dependencies or server secrets?

### 2. Type Safety & TypeScript Strictness
- [ ] Are there any instances of `any`? If so, replace with `unknown` or specific generics.
- [ ] Are all optional and nullable values handled defensively (`noUncheckedIndexedAccess`)?
- [ ] Are all API inputs and environment variables validated via Zod schemas?

### 3. Security & Defensiveness
- [ ] Are user inputs validated and sanitized?
- [ ] Are any raw database queries executed? (Must use Prisma parameterized methods).
- [ ] Are outbound network calls protected against SSRF and subject to timeouts?
- [ ] Are there any exposed secrets or logged sensitive tokens?

### 4. Testing & Verification Evidence
- [ ] Are new features accompanied by unit or integration tests?
- [ ] Did all tests, type checks, and linters run and pass? (Report actual terminal outputs).
- [ ] Are there negative/edge-case tests for failure scenarios?

### 5. Documentation Parity
- [ ] Are API changes reflected in contracts and documentation?
- [ ] Are ADRs added or updated if significant architectural decisions were made?
