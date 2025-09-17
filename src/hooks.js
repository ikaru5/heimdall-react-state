import { useCallback, useMemo } from "react";
import { useSyncExternalStore } from "react";
import { __INTERNALS__ } from "./createContractStore.js";

const identity = (value) => value;

export const useContractSelector = (store, selector, options = {}) => {
  if (!store || "function" !== typeof store.subscribe) {
    throw new TypeError("useContractSelector requires a store created by createContractStore");
  }
  if ("function" !== typeof selector) throw new TypeError("selector must be a function");

  const equalityFn = options.equalityFn || Object.is;

  const subscribe = useCallback((onStoreChange) => {
    let previousValue = selector(store.contract);
    let previousRevision = store.getRevision();
    return store.subscribe(undefined, () => {
      const nextValue = selector(store.contract);
      const nextRevision = store.getRevision();
      if (nextRevision !== previousRevision || !equalityFn(previousValue, nextValue)) {
        previousRevision = nextRevision;
        previousValue = nextValue;
        onStoreChange();
      }
    });
  }, [store, selector, equalityFn]);

  const getSnapshot = useCallback(() => selector(store.contract), [store, selector]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useContractValue = (store, path, options = {}) => {
  if (!store || "function" !== typeof store.subscribe) {
    throw new TypeError("useContractValue requires a store created by createContractStore");
  }

  const equalityFn = options.equalityFn || Object.is;
  const exact = options.exact || false;

  const normalizedPath = useMemo(() => __INTERNALS__.normalizePath(path), [path]);
  const pathKey = useMemo(() => __INTERNALS__.pathToKey(normalizedPath), [normalizedPath]);
  const getSnapshot = useCallback(
    () => __INTERNALS__.readAtPath(store.contract, normalizedPath),
    [store, normalizedPath]
  );

  const subscribe = useCallback(
    (onStoreChange) => {
      let previousValue = __INTERNALS__.readAtPath(store.contract, normalizedPath);
      let previousRevision = store.getRevision(pathKey);
      return store.subscribe(normalizedPath, () => {
        const nextValue = __INTERNALS__.readAtPath(store.contract, normalizedPath);
        const nextRevision = store.getRevision(pathKey);
        if (nextRevision !== previousRevision || !equalityFn(previousValue, nextValue)) {
          previousRevision = nextRevision;
          previousValue = nextValue;
          onStoreChange();
        }
      }, { exact });
    },
    [store, normalizedPath, equalityFn, exact, pathKey]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useContract = (store) => useContractSelector(store, identity, { equalityFn: () => false });
