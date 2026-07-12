# Heimdall React State

[![Tests](https://github.com/ikaru5/heimdall-react-state/actions/workflows/test.yml/badge.svg)](https://github.com/ikaru5/heimdall-react-state/actions/workflows/test.yml)
![Coverage Badge](./coverage-badge.svg)

`@ikaru5/heimdall-react-state` adds a lightweight observable layer and idiomatic React hooks on top of [`heimdall-contract`](https://github.com/ikaru5/heimdall-contract). It keeps contracts framework-agnostic while allowing React components to subscribe to contract values with fine-grained updates.

## Features

- 🔁 **Fine-grained reactivity:** Components re-render only when the observed path changes.
- 🧩 **Zero instrumentation:** The contract stays a plain, untouched instance - the store
  subscribes to the contract's own mutation seam (`subscribeMutations`) instead of wrapping
  the object graph in proxies. Everything written through the explicit contract API
  (`setValue`, `setValueAtPath`, `assign`, `isValid`) is reactive.
- 🚨 **Validation aware:** Every validation run notifies subscribers, `useContractErrors` renders field errors that appear _and_ disappear.
- ⚛️ **Concurrent-mode safe:** Hooks are based on `useSyncExternalStore` with per-notification snapshot caching.
- 🧪 **Fully covered:** 100% test coverage, enforced in CI.

## Installation

```bash
npm install @ikaru5/heimdall-contract @ikaru5/heimdall-react-state
```

The package exposes ESM modules and lists `react` (18+) and `@ikaru5/heimdall-contract` (0.11+) as peer dependencies.

## Quick start

```js
import Contract from "@ikaru5/heimdall-contract";
import { createContractStore, useContractValue } from "@ikaru5/heimdall-react-state";

class SignupContract extends Contract {
  defineSchema() {
    return {
      name: { dType: "String", presence: true },
      email: { dType: "String", presence: true, isEmail: true },
    };
  }
}

const contract = new SignupContract();
const store = createContractStore(contract);

function NameField() {
  const value = useContractValue(store, "name");

  return (
    <label>
      Name
      <input value={value} onChange={(event) => store.setValue("name", event.target.value)} />
    </label>
  );
}
```

`useContractValue` triggers a re-render only when the selected path changes. Nested objects and arrays are tracked path-by-path; updates on `address.street` do not invalidate siblings.

## The reactivity contract

The contract instance is never instrumented - reactivity comes from the contract's own
mutation seam, which announces everything written through the **explicit API**:

- ✅ `store.setValue(path, value)` / `contract.setValueAtPath(path, value)` - including
  in-place writes into an existing array (`store.setValue("items.2", entry)`).
- ✅ `assign(payload)` - every written leaf notifies, shrinking arrays included.
- ✅ `isValid()` - every run announces itself on the `"errors"` path.
- ✅ Mutations made directly on a **nested contract instance** bubble up with the correct
  path prefix, even after the parent array was reordered.
- ❌ Raw property writes (`contract.name = "Ada"`) and raw array mutations
  (`contract.items.push(...)`, `.splice(...)`, `.reverse()`) stay invisible - deliberately.
  Route them through the explicit API instead: `store.setValue("items", [...items, entry])`
  or `store.setValue(`items.${items.length}`, entry)`.

## API

### `createContractStore(contract, options?)`

Wraps an existing contract instance (`@ikaru5/heimdall-contract` 0.11+) and returns an
observable store:

- `contract`: The raw, untouched contract instance. Direct assignments do **not** trigger listeners - use `setValue`.
- `subscribe(path, listener, options?)`: Low-level subscription helper used by the hooks. `path` can be omitted for global subscriptions.
- `getValue(path)`: Returns the current raw value at `path` (string or array form).
- `setValue(path, value)`: Writes through the contract's `setValueAtPath` - the reactive way to write.
- `getRevision(path?)`: Returns a monotonic revision number for the path, useful for advanced memoization.
- `assign`, `isValid`: Bound shorthands for the matching contract methods.
- `getContract()` / `getOriginalContract()`: Both return the raw instance (kept as aliases for 0.2 compatibility).
- `destroy()`: Unsubscribes from the contract's mutation seam and clears all subscribers. Call it when replacing a store.

> **Note**
> Array indices are treated as stable identifiers. If you reorder array entries, listeners subscribed to a specific index (e.g. `addresses.0`) continue to track that index. Revalidating or reassigning after reordering is recommended when working with dynamic lists.

### React hooks

All hooks use `useSyncExternalStore` to stay concurrent-mode compliant.

#### `useContractValue(store, path, options?)`

Reads the value at `path` and subscribes to its updates.

- `path`: dot-notation string (`"address.street"`) or array (`["address", "street"]`).
- `options.exact` (default `false`): when `true`, only emits if the exact path changes (descendants are ignored).
- `options.equalityFn` (default: none): custom comparison to suppress re-renders. Without
  it every notification on the path re-renders - which is what you want for arrays and
  objects mutated in place through the explicit API. `Object.is` is a sensible opt-in for
  primitive values.

#### `useContractSelector(store, selector, options?)`

Runs a custom selector against the raw contract instance. The selector should be referentially stable (e.g. wrapped in `useCallback`), otherwise the hook resubscribes on every render. Selectors may return fresh objects on every call - snapshots are cached per notification, not per call.

Continuing the quick-start example, the selector variant can derive computed state:

```jsx
import { useCallback } from "react";
import { createContractStore, useContractSelector } from "@ikaru5/heimdall-react-state";

const contract = new SignupContract();
const store = createContractStore(contract);

const compareSummary = (prev, next) =>
  prev.isComplete === next.isComplete && prev.canSubmit === next.canSubmit;

function SubmitButton() {
  const summary = useContractSelector(
    store,
    useCallback((contract) => {
      const name = contract.name?.trim();
      const email = contract.email?.trim();
      const isComplete = Boolean(name && email);

      return {
        isComplete,
        // read the state of the last validation run - never CALL isValid() inside a
        // selector: a validation run notifies subscribers and would loop the render
        canSubmit: isComplete && contract.isValidState !== false,
      };
    }, []),
    { equalityFn: compareSummary },
  );

  return (
    <button type="submit" disabled={!summary.canSubmit}>
      {summary.isComplete ? "Submit" : "Complete required fields"}
    </button>
  );
}
```

`useContractSelector` recalculates only when the selector result changes. In the example above, the custom `equalityFn` prevents re-renders when the derived flags stay the same, even if other contract fields update.

#### `useContractErrors(store, path?, options?)`

Reads the [error node](https://github.com/ikaru5/heimdall-contract/blob/master/doc/errors.md) at a field path and subscribes to validation runs.

- `path`: the field path like in the schema (`"address.street"`, `["items", 0, "city"]`) - the translation into the errors tree is handled by the contract's `errorsAt`. Omit it for the whole errors tree.
- Returns the `ErrorNode` (`{issues, fields, elements}`) or `undefined` when the path has no errors.
- `options.equalityFn` (default: none): custom comparison to suppress re-renders; by default every validation run re-renders.

#### `useContract(store)`

Convenience helper that returns the raw contract and forces a re-render on every store change. Useful for generic form renderers and prototypes; prefer `useContractValue`/`useContractSelector` for fine-grained updates.

> **Note**
> Path strings use `.` as separator, so field names containing dots need the array form (or better: avoid dots in field names).

## Working with validations

All validation helpers on the contract remain untouched - the store never patches them. Every `isValid()` run announces itself on the `"errors"` path, so subscribers learn about appearing _and_ clearing errors. To react to the valid/invalid flag, subscribe to `"errors"` and read `contract.isValidState`.

Manual validation flows stay straightforward:

```js
const submit = () => {
  if (store.isValid()) {
    // send data
  }
};
```

### Displaying validation errors

`useContractErrors` renders the errors of a single field and updates when they appear or disappear. Each issue carries the name of the failed validation, so the UI can react per validation instead of parsing message strings:

```jsx
function EmailField({ store }) {
  const value = useContractValue(store, "email");
  const errors = useContractErrors(store, "email");

  return (
    <label>
      E-Mail
      <input
        value={value}
        aria-invalid={Boolean(errors)}
        onChange={(event) => store.setValue("email", event.target.value)}
        onBlur={() => store.isValid()}
      />
      {errors?.issues?.map((issue) => (
        <span key={issue.validation} className={`error error-${issue.validation}`}>
          {issue.message}
        </span>
      ))}
    </label>
  );
}
```

## Additional documentation

- [Changelog](CHANGELOG.md) – All notable changes per release.
- [Architecture overview](docs/architecture-overview.md) – Details on instrumentation and reactivity flows.
- [Agent guide](docs/AGENT_GUIDE.md) – Maintenance guidance and internal processes.

## Development

```bash
npm install
npm test
npm run lint
npm run format
npm run build:types
```

All changes should be covered by tests and lints. Keep the documentation in sync!

TypeScript declarations are generated from the JSDoc (`npm run build:types`, wired into `prepublishOnly` and CI) - the package ships them, no `@types` package needed.
