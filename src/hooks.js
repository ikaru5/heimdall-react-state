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
