# Architecture overview – Heimdall React State

This document describes the current state of the library and supersedes earlier implementation proposals.

## 1. High level

- **Purpose:** Bridge `heimdall-contract` and React components. Provides an observable store that enables fine-grained re-renders.
- **Design principle (since 0.3):** The contract is never instrumented. `heimdall-contract`
  0.11 exposes a mutation seam (`subscribeMutations`) that announces every write made
  through its explicit API - the store is a thin adapter that fans those announcements out
  to path-based React subscriptions. Raw property writes and raw array mutations are
  deliberately not observable (a documented non-goal of the contract).
- **Core elements:**
  - `createContractStore` (subscription fan-out over the contract's mutation seam)
  - React hooks (`useContractValue`, `useContractSelector`, `useContractErrors`, `useContract`)
  - Path utilities (`src/internal/path.js`) for normalisation, key generation, and ancestor traversal

## 2. Mutation data flow

1. **Mutation** – performed through the explicit contract API: `setValueAtPath` (also via
   `store.setValue`), `assign`, `isValid()`. Mutations on nested contract instances bubble
   to the parent with the correct path prefix (resolved at notification time, so array
   reordering cannot produce stale paths).
2. **Seam** – the contract calls the store's `subscribeMutations` callback with
   `{ path: "a.b.c" }`.
3. **Emit** – `emitChange` builds the path key, increments revisions and notifies three
   groups: the path itself, its ancestors (their observed subtree changed; skipped for
   `exact` subscribers), and its descendants (their observed value may have been replaced
   with the parent).
4. **Hooks** – `useSyncExternalStore` reads tick-cell snapshots (see below); an optional
   `equalityFn` can suppress the re-render before the tick advances.

## 3. Store structure (`createContractStore.js`)

- Requires `contract.subscribeMutations` (throws otherwise) and manages `subscribers` and
  `revisions` maps - nothing else. No proxies, no caches, no method patching.
- `subscribe(path, callback, { exact })` registers listeners per path key. Ancestors are notified automatically unless `exact` is set.
- `getRevision(pathKey?)` returns monotonic counters as memoisation helpers.
- `contract` / `getContract()` / `getOriginalContract()` all expose the raw instance
  (the latter two kept as 0.2-compatible aliases).
- `setValue(path, value)` delegates to `contract.setValueAtPath` - the seam does the
  notifying, so there is no double-emit.
- `destroy()` unsubscribes from the seam and clears all subscribers.

## 4. React hooks (`src/hooks.js`)

- **Shared fundamentals**
  - Validate stores via `assertValidStore` (must expose `subscribe` and `getRevision`).
  - Resolve the contract via `contractOf` (`getOriginalContract` → `getContract` → `.contract`).
  - **Tick cells:** every hook keeps `{ tick, renderedTick, snapshot, lastValue }`. A
    notification advances `tick` (unless the optional `equalityFn` suppresses it);
    `getSnapshot` rebuilds the `{ value }` box exactly once per tick. The box identity
    changes per notification - so in-place mutations through the explicit API can never be
    swallowed by React's `Object.is` snapshot comparison - and stays stable between
    notifications, satisfying React's "getSnapshot must be cached" contract even for
    selectors that return fresh objects.
- **`useContractValue`** – subscribes to a normalised path; no default `equalityFn`.
- **`useContractSelector`** – runs the selector against the raw contract inside the
  subscription callback and `getSnapshot`. Selectors must not call `isValid()` (a
  validation run notifies and would loop the render).
- **`useContractErrors`** – subscribes to the `"errors"` path (every validation run
  announces itself there) and reads via `contract.errorsAt(path)`.
- **`useContract`** – revision-selector subscription at the root; returns the raw contract.

## 5. Path helpers (`src/internal/path.js`)

- `normalizePath` accepts strings (`"a.b"`), arrays, or empty values and produces normalised segment arrays.
- `pathToKey` converts segment arrays into keys (`"a.b"`); the root key is `""`.
- `traverseAncestors` iterates from the leaf to the root key.
- `readAtPath` safely extracts values along the path.

## 6. Extension points

- **`options.onUpdate`**: callback in `createContractStore` for logging/devtools.
- **Equality functions:** hooks accept an `equalityFn` to control complex comparisons.
- **New observable mutations** belong into `heimdall-contract`'s explicit API (they reach
  the store through the seam automatically) - never into store-side instrumentation.

## 7. Tests and quality assurance

- `npm test` (Jest, JS-DOM) covers store and hook behaviour.
- `npm run lint` enforces ESLint rules including the React Hooks plugin.
- `npm run format` keeps formatting aligned with Prettier.

## 8. Known limitations

- Raw writes (`contract.name = x`) and raw array mutations (`items.push(...)`) are
  invisible by design - route them through `setValue`/`setValueAtPath`/`assign`.
- Array reordering requires manual revalidation because indices are treated as stable
  subscription keys (mutations bubbling from nested contracts are reorder-safe, the
  subscriptions themselves are not remapped).
- Every `isValid()` run notifies the `"errors"` path, also when nothing changed - the
  contract does not diff its error tree.

> Keep this document up to date whenever internal flows or tests change.
