# Heimdall React State

[![Tests](https://github.com/ikaru5/heimdall-react-state/actions/workflows/test.yml/badge.svg)](https://github.com/ikaru5/heimdall-react-state/actions/workflows/test.yml)
![Coverage Badge](./coverage-badge.svg)

`@ikaru5/heimdall-react-state` adds a lightweight observable layer and idiomatic React hooks on top of [`heimdall-contract`](https://github.com/ikaru5/heimdall-contract). It keeps contracts framework-agnostic while allowing React components to subscribe to contract values with fine-grained updates.

## Features

- 🔁 **Fine-grained reactivity:** Components re-render only when the observed path changes.
- 🧩 **Seamless contract integration:** All existing contract methods (`assign`, `setValueAtPath`, `isValid`, …) stay available.
- 🚨 **Validation aware:** Validation runs notify subscribers, `useContractErrors` renders field errors that appear _and_ disappear.
- ⚛️ **Concurrent-mode safe:** Hooks are based on `useSyncExternalStore`.
- 🧪 **Fully covered:** 100% test coverage, enforced in CI.

## Installation

```bash
npm install @ikaru5/heimdall-contract @ikaru5/heimdall-react-state
```

The package exposes ESM modules and lists `react` (18+) and `@ikaru5/heimdall-contract` (0.10+) as peer dependencies.

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

## API

### `createContractStore(contract, options?)`

Wraps an existing contract instance and returns an observable store:

- `contract`: Proxy around the original contract. Direct assignments (for example `store.contract.name = "Ada"`) trigger listeners.
- `subscribe(path, listener, options?)`: Low-level subscription helper used by the hooks. `path` can be omitted for global subscriptions.
- `getValue(path)`: Returns the current value at `path` (string or array form).
- `setValue(path, value)`: Writes through the contract using its `setValueAtPath` helper and broadcasts the change.
- `getRevision(path?)`: Returns a monotonic revision number for the path, useful for advanced memoization.
- `assign`, `isValid`: Bound shorthands for the matching contract methods.
- `getContract()` / `getOriginalContract()`: Accessors for the proxied or raw instance.

The wrapper instruments nested contracts, plain objects and arrays. For arrays the revision counter is increased whenever indices or length change, so React listeners pick up updates even if the underlying reference stays the same.

> **Note**
> Array indices are treated as stable identifiers. If you reorder array entries, listeners subscribed to a specific index (e.g. `addresses.0`) continue to track that index. Revalidating or reassigning after reordering is recommended when working with dynamic lists.

### React hooks

All hooks use `useSyncExternalStore` to stay concurrent-mode compliant.

#### `useContractValue(store, path, options?)`

Reads the value at `path` and subscribes to its updates.

- `path`: dot-notation string (`"address.street"`) or array (`["address", "street"]`).
- `options.exact` (default `false`): when `true`, only emits if the exact path changes (descendants are ignored).
- `options.equalityFn` (default `Object.is`): custom comparison before triggering a re-render.

#### `useContractSelector(store, selector, options?)`

Runs a custom selector against the proxied contract. The selector should be referentially stable (e.g. wrapped in `useCallback`). Supply a custom `equalityFn` if the selector returns non-primitive values and you rely on referential equality.

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
    useCallback((contractProxy) => {
      const name = contractProxy.name?.trim();
      const email = contractProxy.email?.trim();
      const isComplete = Boolean(name && email);

      return {
        isComplete,
        canSubmit: isComplete && contractProxy.isValid(),
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

Reads the [error node](https://github.com/ikaru5/heimdall-contract/blob/master/doc/errors.md) at a field path and subscribes to validation runs. Requires `@ikaru5/heimdall-contract` 0.10+.

- `path`: the field path like in the schema (`"address.street"`, `["items", 0, "city"]`) - the translation into the errors tree is handled by the contract's `errorsAt`. Omit it for the whole errors tree.
- Returns the `ErrorNode` (`{issues, fields, elements}`) or `undefined` when the path has no errors.
- `options.equalityFn` (default `Object.is`): custom comparison before triggering a re-render.

#### `useContract(store)`

Convenience helper that returns the proxied contract and forces a re-render on every revision. Useful for debugging or simple prototypes; prefer `useContractValue`/`useContractSelector` for production usage.

> **Note**
> Path strings use `.` as separator, so field names containing dots need the array form (or better: avoid dots in field names).

## Working with validations

All validation helpers on the contract remain untouched. Because the plugin reuses the native `assign`, `setValueAtPath` and `isValid` methods, validation semantics stay identical to the base library. Validation runs notify subscribers: appearing errors, clearing errors and `isValidState` changes all trigger updates.

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
