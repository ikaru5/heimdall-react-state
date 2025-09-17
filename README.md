# Heimdall React State

`@ikaru5/heimdall-react-state` adds a lightweight observable layer and idiomatic React hooks on top of [`heimdall-contract`](https://github.com/ikaru5/heimdall-contract). It keeps contracts framework-agnostic while allowing React components to subscribe to contract values with fine-grained updates.

## Installation

```bash
npm install @ikaru5/heimdall-contract @ikaru5/heimdall-react-state
```

The package exposes ESM modules and lists `react` (18+) as a peer dependency.

## Quick start

```js
import Contract from "@ikaru5/heimdall-contract";
import { createContractStore, useContractValue } from "@ikaru5/heimdall-react-state";

class SignupContract extends Contract {
  defineSchema() {
    return {
      name: { dType: "String", presence: true },
      email: { dType: "String", presence: true, isEmail: true }
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
      <input
        value={value}
        onChange={(event) => store.setValue("name", event.target.value)}
      />
    </label>
  );
}
```

`useContractValue` triggers a re-render only when the selected path changes. Nested objects and arrays are tracked path-by-path; updates on `address.street` do not invalidate siblings.

## API

### `createContractStore(contract, options?)`

Wraps an existing contract instance and returns an observable store:

| property | description |
| --- | --- |
| `contract` | Proxy around the original contract. Direct assignments (e.g. `store.contract.name = "Ada"`) trigger listeners. |
| `subscribe(path, listener, options?)` | Low-level subscription helper used by the hooks. `path` can be omitted for global subscriptions. |
| `getValue(path)` | Returns the current value at `path` (string or array form). |
| `setValue(path, value)` | Writes through the contract using its `setValueAtPath` helper and broadcasts the change. |
| `getRevision(path?)` | Returns a monotonic revision number for the path, useful for advanced memoization. |
| `assign`, `isValid` | Bound shorthands for the matching contract methods. |
| `getContract()` / `getOriginalContract()` | Accessors for the proxied or raw instance. |

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
        canSubmit: isComplete && contractProxy.isValid()
      };
    }, []),
    { equalityFn: compareSummary }
  );

  return (
    <button type="submit" disabled={!summary.canSubmit}>
      {summary.isComplete ? "Submit" : "Complete required fields"}
    </button>
  );
}
```

`useContractSelector` recalculates only when the selector result changes. In the example above, the custom `equalityFn` prevents re-renders when the derived flags stay the same, even if other contract fields update.

#### `useContract(store)`

Convenience helper that returns the proxied contract and forces a re-render on every revision. Useful for debugging or simple prototypes; prefer `useContractValue`/`useContractSelector` for production usage.

## Working with validations

All validation helpers on the contract remain untouched. Because the plugin reuses the native `assign`, `setValueAtPath` and `isValid` methods, validation semantics stay identical to the base library.

Manual validation flows stay straightforward:

```js
const submit = () => {
  if (store.isValid()) {
    // send data
  }
};
```

## CLI / DSL outlook

The observable layer is intentionally decoupled from any CLI or schema DSL. A future CLI can consume the same `createContractStore` API to generate typed hooks or form scaffolding without modifying the runtime core.
