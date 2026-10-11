# General Engineering & TypeScript Standards

1. **Strict TypeScript**:
   - `strict: true` must be enabled across all packages.
   - Prohibit `any`. Use `unknown` and type guards where dynamic values are encountered.
   - Enforce `noUncheckedIndexedAccess` handling.
2. **Package Boundaries**:
   - Do not import code directly from relative cross-package paths (e.g., `../../packages/contracts/src`).
   - Import strictly via workspace package specifiers (`@replaylab/contracts`, `@replaylab/db`).
3. **No Dead Code or Console Spills**:
   - Avoid leaving debug `console.log` statements in committed code. Use structured loggers with log levels.
