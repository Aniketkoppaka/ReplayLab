---
name: implementation-planning
description: Use this skill when planning new milestones, features, or architectural refactors in ReplayLab. Enforces task decomposition, explicit acceptance criteria, risk assessment, and verification steps before coding.
---

# Implementation Planning Skill

## Purpose
Establishes a rigorous, systematic process for decomposing user stories, product requirements, and technical chores into verifiable, minimal, atomic implementation tasks.

## Procedure

### 1. Requirements & Scope Analysis
- Identify the explicit user goal and all system boundaries touched by the change (`apps/web`, `apps/api`, `packages/contracts`, `packages/db`).
- Check if the task modifies existing contracts or requires database schema updates.
- Verify whether the task introduces outbound network access or security boundaries.

### 2. Task Decomposition Checklist
- Break changes into units that can be tested independently.
- Ensure each subtask has:
  1. **Files to touch**: Explicit list of files created or modified.
  2. **Acceptance Criteria**: Concrete, observable assertions.
  3. **Verification Command**: Specific CLI command (test, lint, typecheck, curl) to validate work.
  4. **Rollback/Failure Path**: What happens if the step fails.

### 3. Risk & Dependency Assessment
- Does this require changes in `packages/contracts` first? (Update contracts before touching consumers).
- Does this require a Prisma migration? (Plan migration and backwards compatibility before changing queries).
- Will this change affect client-server boundaries (e.g. CORS, response shape, status codes)?

### 4. Output Contract
Produce an implementation plan document containing:
- Context and Goal
- Proposed Architecture / Data Flow
- Step-by-Step Execution Plan
- Verification & Test Matrix
- Unresolved Questions / Assumptions
