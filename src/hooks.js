import { useCallback, useMemo, useSyncExternalStore } from "react";

import { normalizePath, pathToKey, readAtPath } from "./internal/path.js";

const STORE_ERROR = "requires a store created by createContractStore";
const UNSET = Symbol("unset");

const assertValidStore = (store, hookName) => {
  if (!store || "function" !== typeof store.subscribe || "function" !== typeof store.getRevision) {
    throw new TypeError(`${hookName} ${STORE_ERROR}`);
  }
};

/**
 * Resolves the contract instance behind a store, tolerating duck-typed stores
 * that only expose one of the accessors.
 * @param {import("./types.js").ContractStore | undefined} store
 * @returns {unknown}
 */
const contractOf = (store) => {
  if (!store) return undefined;
  if ("function" === typeof store.getOriginalContract) return store.getOriginalContract();
  if ("function" === typeof store.getContract) return store.getContract();
  return store.contract;
};

/**
 * Shared snapshot mechanics: a notification advances the cell's tick, and
 * getSnapshot builds a fresh { value } box exactly once per tick. The box
 * identity changes with every relevant notification (so in-place mutations
 * through the explicit API still re-render - Object.is can never swallow
 * them) and stays stable between notifications (so React's "getSnapshot
 * should be cached" contract holds even for values rebuilt on every read).
 */
const createCell = () => ({ tick: 0, renderedTick: -1, snapshot: undefined, lastValue: UNSET });

const readCell = (cell, readCurrent) => {
  if (cell.renderedTick !== cell.tick) {
    cell.lastValue = readCurrent();
    cell.snapshot = { value: cell.lastValue };
    cell.renderedTick = cell.tick;
  }
  return cell.snapshot;
};

const advanceCell = (cell, readCurrent, equalityFn, onStoreChange) => {
  const nextValue = readCurrent();
  if (equalityFn && cell.lastValue !== UNSET && equalityFn(cell.lastValue, nextValue)) return;
  cell.lastValue = nextValue;
  cell.tick += 1;
  onStoreChange();
};

/**
 * Subscribes to the result of a selector that receives the contract instance.
 *
 * The selector may return fresh objects - snapshots are cached per
 * notification, not per call. By default every store change re-renders;
 * provide an equalityFn (e.g. Object.is for primitive selections) to suppress
 * re-renders for results you consider equal. Memoize the selector, otherwise
 * the hook resubscribes on every render.
 *
 * @template T
 * @param {import("./types.js").ContractStore} store
 * @param {(contract: any) => T} selector
 * @param {{ equalityFn?: (previous: T, next: T) => boolean }} [options]
 * @returns {T}
 */
export const useContractSelector = (store, selector, options = {}) => {
  assertValidStore(store, "useContractSelector");
  if ("function" !== typeof selector) throw new TypeError("selector must be a function");

  const equalityFn = options.equalityFn;

  const cell = useMemo(createCell, [store, selector, equalityFn]);
  const readCurrent = useCallback(() => selector(contractOf(store)), [store, selector]);

  const subscribe = useCallback(
    (onStoreChange) =>
      store.subscribe(undefined, () => advanceCell(cell, readCurrent, equalityFn, onStoreChange)),
    [store, readCurrent, equalityFn, cell],
  );

  const getSnapshot = useCallback(() => readCell(cell, readCurrent), [cell, readCurrent]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).value;
};

/**
 * Reads the value at a path and subscribes to its updates.
 *
 * Every notification on the path re-renders - including in-place mutations
 * made through the explicit contract API (setValue addressing an element of
 * an existing array, assign truncation, ...). Provide an equalityFn only if
 * you want to suppress re-renders for values you consider equal.
 *
 * @template T
 * @param {import("./types.js").ContractStore} store
 * @param {string | string[]} path
 * @param {{
 *   exact?: boolean;
 *   equalityFn?: (previous: T, next: T) => boolean;
 * }} [options]
 * @returns {T}
 */
export const useContractValue = (store, path, options = {}) => {
  assertValidStore(store, "useContractValue");

  const equalityFn = options.equalityFn;
  const exact = Boolean(options.exact);

  // key first: inline array paths get a stable identity via their string form
  const pathKey = pathToKey(normalizePath(path));
  const normalizedPath = useMemo(() => normalizePath(path), [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cell = useMemo(createCell, [store, pathKey, equalityFn, exact]);

  const readCurrent = useCallback(
    () => readAtPath(contractOf(store), normalizedPath),
    [store, normalizedPath],
  );

  const subscribe = useCallback(
    (onStoreChange) =>
      store.subscribe(
        normalizedPath,
        () => advanceCell(cell, readCurrent, equalityFn, onStoreChange),
        { exact },
      ),
    [store, normalizedPath, equalityFn, exact, cell, readCurrent],
  );

  const getSnapshot = useCallback(() => readCell(cell, readCurrent), [cell, readCurrent]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).value;
};

/**
 * Reads the validation errors at a field path and subscribes to their updates.
 *
 * The path addresses the field like in the schema ("address.street", ["items", 0, "city"]),
 * the translation into the errors tree (fields/elements) is handled by the contract's
 * errorsAt helper. Without a path the whole errors tree of the contract is returned.
 * Returns undefined when there are no errors at the path. Every validation run
 * announces itself on the "errors" path, so the hook re-renders per isValid call.
 *
 * @param {import("./types.js").ContractStore} store
 * @param {string | Array<string | number>} [path]
 * @param {{ equalityFn?: (previous: unknown, next: unknown) => boolean }} [options]
 * @returns {unknown}
 */
export const useContractErrors = (store, path, options = {}) => {
  assertValidStore(store, "useContractErrors");

  const equalityFn = options.equalityFn;
  const pathKey = pathToKey(normalizePath(path));
  const normalizedPath = useMemo(() => normalizePath(path), [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const cell = useMemo(createCell, [store, pathKey, equalityFn]);

  const readCurrent = useCallback(() => {
    const contract = contractOf(store);
    if (!contract || "function" !== typeof contract.errorsAt) {
      throw new TypeError("useContractErrors requires @ikaru5/heimdall-contract >= 0.11");
    }
    return normalizedPath.length ? contract.errorsAt(normalizedPath) : contract.errors;
  }, [store, normalizedPath]);

  const subscribe = useCallback(
    (onStoreChange) =>
      store.subscribe(["errors"], () => advanceCell(cell, readCurrent, equalityFn, onStoreChange)),
    [store, readCurrent, equalityFn, cell],
  );

  const getSnapshot = useCallback(() => readCell(cell, readCurrent), [cell, readCurrent]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).value;
};

/**
 * Re-renders on every contract change and returns the raw contract instance.
 * @param {import("./types.js").ContractStore} store
 * @returns {any}
 */
export const useContract = (store) => {
  assertValidStore(store, "useContract");
  const selector = useCallback(() => store.getRevision(), [store]);
  useContractSelector(store, selector);
  return contractOf(store);
};

export const __HOOK_INTERNALS__ = { contractOf };
