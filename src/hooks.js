import { useCallback, useMemo } from "react";
import { useSyncExternalStore } from "react";

import { normalizePath, pathToKey, readAtPath } from "./internal/path.js";

const STORE_ERROR = "requires a store created by createContractStore";

const getContractProxy = (store) => {
  if (store && "function" === typeof store.getContract) {
    return store.getContract();
  }
  return store ? store.contract : undefined;
};

const assertValidStore = (store, hookName) => {
  if (!store || "function" !== typeof store.subscribe || "function" !== typeof store.getRevision) {
    throw new TypeError(`${hookName} ${STORE_ERROR}`);
  }
};

/**
 * Subscribes to the result of a selector that receives the proxied contract instance.
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

  const equalityFn = options.equalityFn ?? Object.is;

  const subscribe = useCallback(
    (onStoreChange) => {
      let previousValue = selector(getContractProxy(store));
      let previousRevision = store.getRevision();
      return store.subscribe(undefined, () => {
        const nextValue = selector(getContractProxy(store));
        const nextRevision = store.getRevision();
        const valuesEqual = equalityFn(previousValue, nextValue);
        if (nextRevision !== previousRevision || !valuesEqual) {
          previousRevision = nextRevision;
          previousValue = nextValue;
          if (!valuesEqual) {
            onStoreChange();
          }
        }
      });
    },
    [store, selector, equalityFn],
  );

  const getSnapshot = useCallback(() => selector(getContractProxy(store)), [store, selector]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * Reads a value from the contract at the provided path and subscribes to updates.
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

  const equalityFn = options.equalityFn ?? Object.is;
  const exact = Boolean(options.exact);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);
  const pathKey = useMemo(() => pathToKey(normalizedPath), [normalizedPath]);
  const getSnapshot = useCallback(
    () => readAtPath(getContractProxy(store), normalizedPath),
    [store, normalizedPath],
  );

  const subscribe = useCallback(
    (onStoreChange) => {
      let previousValue = readAtPath(getContractProxy(store), normalizedPath);
      let previousRevision = store.getRevision(pathKey);
      return store.subscribe(
        normalizedPath,
        () => {
          const nextValue = readAtPath(getContractProxy(store), normalizedPath);
          const nextRevision = store.getRevision(pathKey);
          const valuesEqual = equalityFn(previousValue, nextValue);
          if (nextRevision !== previousRevision || !valuesEqual) {
            previousRevision = nextRevision;
            previousValue = nextValue;
            if (!valuesEqual) {
              onStoreChange();
            }
          }
        },
        { exact },
      );
    },
    [store, normalizedPath, equalityFn, exact, pathKey],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * Reads the validation errors at a field path and subscribes to their updates.
 *
 * The path addresses the field like in the schema ("address.street", ["items", 0, "city"]),
 * the translation into the errors tree (fields/elements) is handled by the contract's
 * errorsAt helper. Without a path the whole errors tree of the contract is returned.
 * Returns undefined when there are no errors at the path.
 *
 * Requires @ikaru5/heimdall-contract >= 0.10.
 *
 * @param {import("./types.js").ContractStore} store
 * @param {string | Array<string | number>} [path]
 * @param {{ equalityFn?: (previous: unknown, next: unknown) => boolean }} [options]
 * @returns {import("@ikaru5/heimdall-contract/types").ErrorNode | undefined}
 */
export const useContractErrors = (store, path, options = {}) => {
  assertValidStore(store, "useContractErrors");
  if ("function" !== typeof store.getOriginalContract) {
    throw new TypeError(`useContractErrors ${STORE_ERROR}`);
  }

  const equalityFn = options.equalityFn ?? Object.is;
  const normalizedPath = useMemo(() => normalizePath(path), [path]);

  const getSnapshot = useCallback(() => {
    const contract = store.getOriginalContract();
    if ("function" !== typeof contract.errorsAt) {
      throw new TypeError("useContractErrors requires @ikaru5/heimdall-contract >= 0.10");
    }
    return normalizedPath.length ? contract.errorsAt(normalizedPath) : contract.errors;
  }, [store, normalizedPath]);

  const subscribe = useCallback(
    (onStoreChange) => {
      let previousValue = getSnapshot();
      // every change inside the errors tree bubbles up to the "errors" key
      return store.subscribe(["errors"], () => {
        const nextValue = getSnapshot();
        if (!equalityFn(previousValue, nextValue)) {
          previousValue = nextValue;
          onStoreChange();
        }
      });
    },
    [store, getSnapshot, equalityFn],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * Returns the proxied contract and re-renders whenever it changes.
 * @param {import("./types.js").ContractStore} store
 * @returns {any}
 */
export const useContract = (store) => {
  assertValidStore(store, "useContract");
  const revision = useContractSelector(store, () => store.getRevision());
  return useMemo(() => {
    void revision;
    return getContractProxy(store);
  }, [store, revision]);
};

export const __HOOK_INTERNALS__ = { getContractProxy };
