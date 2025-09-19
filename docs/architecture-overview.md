# Architecture overview – Heimdall React State

This document describes the current state of the library and supersedes earlier implementation proposals.

## 1. High level

- **Purpose:** Bridge `heimdall-contract` and React components. Provides an observable store that enables fine-grained re-renders.
- **Core elements:**
  - `createContractStore` (instrumentation and observable layer)
  - React hooks (`useContractValue`, `useContractSelector`, `useContract`)
  - Path utilities (`src/internal/path.js`) for normalisation, key generation, and ancestor traversal

## 2. Mutation data flow

1. **Mutation** – performed through the contract API (`setValueAtPath`, `assign`, direct proxy access).
2. **Instrumentation** – `createContractStore` patches `setValueAtPath`, wraps objects/arrays/child contracts with proxies, and watches array mutators.
3. **Emit** – `emitChange` builds the path key, increments revisions for all ancestors (`traverseAncestors`), and notifies listeners.
4. **Hooks** – `useSyncExternalStore` reads snapshots and checks revisions plus `equalityFn` to prevent unnecessary re-renders.

## 3. Store structure (`createContractStore.js`)

- Manages `subscribers`, `revisions`, and proxy caches (WeakMap/WeakSet).
- `subscribe(path, callback, { exact })` registers listeners per path key. Ancestors are notified automatically unless `exact` is set.
- `getRevision(pathKey?)` returns monotonic counters as memoisation helpers.
- `getContract()` exposes the proxy version, `getOriginalContract()` returns the untouched contract.
- Instruments child structures recursively, including values added later (`captureNestedStructures`).

## 4. React hooks (`src/hooks.js`)

- **Shared fundamentals**
  - Validate stores via `assertValidStore` (must expose `subscribe` and `getRevision`).
  - Access the proxied contract through `getContractProxy`.
- **`useContractValue`**
  - Normalises paths (`normalizePath`), builds keys (`pathToKey`).
  - Subscribes to path changes; checks revision and optional `equalityFn`.
- **`useContractSelector`**
  - Runs a custom selector and caches intermediate results.
  - Combines root-store revision tracking with `equalityFn`.
- **`useContract`**
  - Uses `useContractSelector` to track global revisions and returns the memoised proxy.

## 5. Path helpers (`src/internal/path.js`)

- `normalizePath` accepts strings (`"a.b"`), arrays, or empty values and produces normalised segment arrays.
- `pathToKey` converts segment arrays into keys (`"a.b"`); the root key is `""`.
- `traverseAncestors` iterates from the leaf to the root key.
- `readAtPath` safely extracts values along the path.
- `RAW_SYMBOL` marks raw values when proxies need to expose direct access.

## 6. Extension points

- **`options.onUpdate`**: callback in `createContractStore` for logging/devtools.
- **Equality functions:** hooks accept an `equalityFn` to control complex comparisons.
- **Proxy strategy:** new structure types must be wired through `ensureInstrumented`.

## 7. Tests and quality assurance

- `npm test` (Jest, JS-DOM) covers store and hook behaviour.
- `npm run lint` enforces ESLint rules including the React Hooks plugin.
- `npm run format` keeps formatting aligned with Prettier.

## 8. Known limitations

- Array reordering requires manual revalidation because indices are treated as stable keys.
- Direct mutations outside the contract API (e.g. foreign methods) are only detected when they go through instrumented proxies.

> Keep this document up to date whenever internal flows or tests change.
