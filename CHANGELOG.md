# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-03

### Changed

- **BREAKING**: `@ikaru5/heimdall-contract` moved from a bundled dependency (`^0.6.0`) to a
  peer dependency at `^0.10.0` - install it alongside this package, as the README always
  suggested. The store itself is agnostic to the redesigned errors shape of 0.10, but
  consumers reading error paths migrate from `errors.email.messages` to
  `errors.fields.email.issues` (or better: use the new `useContractErrors` hook).
- Packaging: dropped the misleading `require` export condition (the package is ESM), added
  the `files` allowlist, `repository`, `author` and `engines` fields.
- CI tests against a Node 20/22/24 matrix and additionally runs lint, format and type checks.

### Added

- `useContractErrors(store, path?, options?)`: reads the error node at a field path
  (`"address.street"`, `["items", 0, "city"]`) and updates when errors appear _and_
  disappear. Returns the `ErrorNode` with its issues carrying the failed validation names,
  or `undefined` when the field is clean. Requires `@ikaru5/heimdall-contract` 0.10+.
- TypeScript declarations generated from the JSDoc (`npm run build:types`, wired into
  `prepublishOnly` and CI) - no `@types` package needed.

### Fixed

- Validation runs now notify subscribers: `isValid()` resets `errors` and `isValidState`
  through plain property writes that no proxy trap can observe, so subscribers learned about
  appearing errors but never about disappearing ones - a corrected field kept its error
  message on screen until an unrelated re-render. `isValidState` subscribers were never
  notified at all. The store now patches `isValid` alongside `setValueAtPath`.
- Subscribers at descendant paths are notified when an ancestor value is replaced
  (`store.contract.address = {...}` now updates a subscriber on `"address.street"`).
  The `exact` flag keeps guarding against noise from descendants, not from ancestors.

## [0.1.0] - 2025-09-19

### Added

- Initial release: `createContractStore` wraps a Heimdall contract into an observable store
  with fine-grained, path-based subscriptions (proxy instrumentation of nested contracts,
  plain objects and arrays, revision counters per path).
- React hooks `useContractValue`, `useContractSelector` and `useContract`, all based on
  `useSyncExternalStore`.
