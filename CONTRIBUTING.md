# Contributing to ReplayLab

Thank you for contributing to ReplayLab. To maintain security, high quality, and architectural consistency across the monorepo, all contributors and coding agents must adhere to the following workflow:

## Workflow & Guidelines

1. **Task Planning**: Follow `.agents/skills/implementation-planning/SKILL.md` before making architectural or wide-ranging changes.
2. **Contract-First**: Define domain models, request/response bodies, and validation schemas in `packages/contracts` before implementing API or frontend code.
3. **Database Changes**: Follow `.agents/skills/database-migrations/SKILL.md`. Never introduce destructive schema changes.
4. **Security Controls**: Follow `.agents/skills/replay-engine-safety/SKILL.md` and `.agents/skills/secure-api-development/SKILL.md`. All external endpoints must be protected against SSRF, parameter injection, and information leakage.
5. **Evidence-Based PRs**: Include actual test outputs, typecheck logs, and reproduction steps in pull request descriptions.
