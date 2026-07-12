# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-12

The store is now a thin adapter over the contract's own mutation seam
(`subscribeMutations`, new in `@ikaru5/heimdall-contract` 0.11) instead of wrapping the
contract's object graph in proxies. Reactive now means: mutated through the explicit
contract API. This removes an entire class of correctness bugs - in-place array mutations
that never re-rendered (`Object.is` saw the same reference), proxy caches serving stale
paths after `reverse()`, and uncached `getSnapshot` results fighting React's caching
contract.

### Changed

- **BREAKING**: peer dependency raised to `@ikaru5/heimdall-contract >= 0.11` - the store
  throws without `subscribeMutations`.
- **BREAKING**: `store.contract` / `getContract()` / `getValue()` return the **raw**
  contract and raw values - there are no proxies anymore. Raw property writes
  (`store.contract.name = "Ada"`) and raw array mutations (`items.push(...)`) no longer
  notify subscribers. Write through `store.setValue`, `contract.setValueAtPath` or
  `assign` - those notify, **including in-place array mutations through the explicit API**
  (which 0.2 silently swallowed because the reference stayed identical).
- **BREAKING**: `useContractValue` and `useContractErrors` no longer default `equalityFn`
  to `Object.is` - every notification on the observed path re-renders. Pass an
  `equalityFn` explicitly to suppress re-renders. `useContractSelector` also defaults to
  re-rendering per store change; opt into `Object.is` for primitive selections.
- **BREAKING**: `isValidState` subscriptions no longer fire. Every `isValid()` run
  announces itself on the `"errors"` path instead (also when the run leaves the errors
  unchanged) - subscribe there, or read `contract.isValidState` from an `"errors"`
  subscription.
- Hook snapshots are cached per notification (tick cells): selectors may return fresh
  objects without violating React's `getSnapshot` caching contract, and same-reference
  values can never suppress a legitimate re-render again.

### Added

- `store.destroy()`: detaches the store from the contract's mutation seam and clears all
  subscribers. Call it when replacing a store to avoid leaking the subscription.

### Removed

- All proxy machinery (`RAW_SYMBOL`, proxy caches, array-method patching,
  `setValueAtPath`/`isValid` monkey-patching). The contract instance is left completely
  untouched.

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
