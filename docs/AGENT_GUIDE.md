# Agent guide – Heimdall React State

> ⚠️ **Maintenance requirement:** Update this agent documentation automatically whenever you gain relevant knowledge or make changes that affect existing information. Any change to the code, build process, or key dependencies must be recorded here immediately.

## Purpose and context

- **Package name:** `@ikaru5/heimdall-react-state` – React bindings around `heimdall-contract`.
- **Role of the agents:** Maintain, assure the quality of, and extend the library and its documentation.
- **Core values:** Stability, fine-grained React component updates, rigorous test coverage.

## Project structure (current)

```
src/
  createContractStore.js   # Core observable store layer around contracts
  hooks.js                 # React hook implementations (useContractValue, ...)
  index.js                 # Public API / re-exports
  internal/                # Helpers (path utilities, proxy wrappers, revisions)
  types.js                 # JSDoc type definitions for contributors

docs/
  AGENT_GUIDE.md           # This file
  architecture-overview.md # Architecture and design overview
README.md                  # User documentation with quick start and API reference
eslint.config.js           # Flat ESLint configuration (ESLint 9, replaces .eslintrc)
```

> **Whenever new central files or folders appear,** list them here with a short description.

## Non-negotiable principles

1. **Trust `heimdall-contract`:** Never mutate its internal state outside the public API (`assign`, `setValueAtPath`, etc.).
2. **Path-driven reactivity:** Every mutation must notify the relevant path and its ancestors via `emitChange`. New features must preserve this notification chain.
3. **Stable proxies:** Object and array proxies are cached. When working on `wrap*` helpers, ensure identities remain per instance.
4. **Concurrent-mode safe hooks:** All hooks rely on `useSyncExternalStore`. Extensions have to keep this pattern.
5. **Absolute coverage:** Jest coverage must remain at 100% across statements, branches, lines, and functions. `istanbul ignore` directives are allowed only for defensive guards that cannot be triggered via public APIs (document the rationale inline). The pure type module `src/types.js` is excluded from coverage because it has no runtime behaviour to test.

## Change workflow

1. **Analysis & design**
   - Review `docs/architecture-overview.md` and the tests under `test/` first.
   - Check whether existing patterns can be reused.
2. **Implementation**
   - Stick to the existing utilities inside the `internal/` directory.
   - Add JSDoc types in `types.js` when needed to keep the API consistent.
3. **Tests & quality assurance**
   - Run `npm test` (coverage is based on Jest 30 with `coverageProvider: "v8"`) and ensure all metrics report 100%.
   - Run `npm run lint` (ESLint 9 flat config in `eslint.config.js`) and `npm run format` to verify style and formatting.
   - Extend integration tests under `test/` when modifying hooks.
4. **Documentation updates**
   - README for user-facing information, this agent doc for process knowledge, `architecture-overview.md` for technical decisions.
   - Document every observed change or new dependency **immediately**.

## Common pitfalls & checks

- **Missing instrumentation:** New mutation paths (e.g. additional contract methods) must trigger `emitChange`.
- **Array operations:** Use the existing `MUTATING_ARRAY_METHODS` list when additional methods need handling.
- **Memory leaks:** Always use WeakMap/WeakSet for new caches so contracts can be released.
- **Subscriptions:** When extending `subscribe` options, update the `unsubscribe` logic accordingly.

## When to update this file

- New directories, significant files, or build steps.
- Changes to test or lint workflows.
- Insights into recurring bugs or workarounds.
- Deprecations or breaking changes in `heimdall-contract` **or critical tooling dependencies** (e.g. updated ESLint/Jest versions, new overrides in `package.json`).

## Points of contact / further resources

- `docs/architecture-overview.md` for the current architecture.
- Tests in the `test/` folder as a living specification.
- README for API examples that must stay in sync with the code.

> 💡 **Remember:** Any agent action carried out without updating this documentation is considered incomplete. Keep it synchronised—ideally automated via the workflow.

## Git Commit Message Style Guide

### Format

All commit messages must follow: `[TYPE] brief description in lowercase`

### Types

- **`[FEATURE]`** - New functionality, enhancements, or additions
- **`[BUGFIX]`** - Bug fixes, error corrections, or issue resolutions
- **`[TASK]`** - Maintenance work, documentation updates, configuration changes, or housekeeping

### Rules

- Use lowercase after the prefix
- Use imperative mood (e.g., "add", "fix", "update")
- Keep messages concise but descriptive
- One logical change per commit
