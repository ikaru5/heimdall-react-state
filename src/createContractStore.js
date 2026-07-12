import { normalizePath, pathToKey, readAtPath } from "./internal/path.js";
import { ROOT_KEY, traverseAncestors } from "./internal/path.js";

const DEFAULT_SUBSCRIBE_OPTIONS = { exact: false };

/**
 * Creates a reactive store around a Heimdall contract instance.
 *
 * Since 0.3 the store is a thin adapter over the contract's own mutation seam
 * (subscribeMutations, @ikaru5/heimdall-contract >= 0.11): no proxies, no
 * method patching, no object-graph instrumentation. Reactive means "mutated
 * through the explicit API" - store.setValue / contract.setValueAtPath /
 * assign / isValid. Raw property writes and raw array mutations
 * (contract.items.push(...)) are deliberately NOT observable; use setValue
 * with a new array or setValueAtPath addressing the element instead.
 *
 * @param {object} contract A Heimdall contract instance (>= 0.11).
 * @param {{ onUpdate?: (event: import("./types.js").ContractUpdateEvent) => void }} [options]
 * @returns {import("./types.js").ContractStore}
 */
export function createContractStore(contract, options = {}) {
  if ("object" !== typeof contract || contract === null) {
    throw new TypeError("createContractStore expects a contract instance");
  }
  if ("function" !== typeof contract.subscribeMutations) {
    throw new TypeError(
      "createContractStore requires @ikaru5/heimdall-contract >= 0.11 (subscribeMutations)",
    );
  }

  const subscribers = new Map();
  const revisions = new Map();

  /**
   * Advances the revision counter for the provided cache key.
   * @param {string} key
   * @returns {number}
   */
  function bumpRevision(key) {
    const nextRevision = (revisions.get(key) || 0) + 1;
    revisions.set(key, nextRevision);
    return nextRevision;
  }

  /**
   * Notifies subscribers about a change at the provided path: the path itself,
   * its ancestors (their observed subtree changed) and its descendants (their
   * observed value may have been replaced with the parent).
   * @param {string[]} pathArray
   * @param {import("./types.js").EmitPayload} payload
   */
  function emitChange(pathArray, payload) {
    const key = pathToKey(pathArray);
    const baseEvent = { ...payload, path: pathArray, key };
    if ("function" === typeof options.onUpdate) {
      options.onUpdate(baseEvent);
    }

    const visited = new Set();
    traverseAncestors(pathArray, (ancestorKey) => {
      if (visited.has(ancestorKey)) return;
      visited.add(ancestorKey);
      const revision = bumpRevision(ancestorKey);
      const listeners = subscribers.get(ancestorKey);
      if (!listeners) return;
      listeners.forEach((listener) => {
        if (listener.exact && ancestorKey !== key) return;
        listener.callback({ ...baseEvent, observerKey: ancestorKey, revision });
      });
    });

    const descendantPrefix = key === ROOT_KEY ? "" : `${key}.`;
    subscribers.forEach((listeners, subscriberKey) => {
      if (visited.has(subscriberKey)) return;
      if (!subscriberKey.startsWith(descendantPrefix)) return;
      visited.add(subscriberKey);
      const revision = bumpRevision(subscriberKey);
      listeners.forEach((listener) => {
        listener.callback({ ...baseEvent, observerKey: subscriberKey, revision });
      });
    });
  }

  /**
   * Subscribes to updates for a given path.
   * @param {string | string[]} [path]
   * @param {(event: import("./types.js").SubscriptionEvent) => void} callback
   * @param {{ exact?: boolean }} [opts]
   * @returns {() => void}
   */
  function subscribe(path, callback, opts = {}) {
    const { exact } = { ...DEFAULT_SUBSCRIBE_OPTIONS, ...opts };
    const key = pathToKey(normalizePath(path));
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    const entry = { callback, exact };
    const set = subscribers.get(key);
    set.add(entry);
    return () => {
      const currentSet = subscribers.get(key);
      if (!currentSet) return;
      currentSet.delete(entry);
      if (0 === currentSet.size) subscribers.delete(key);
    };
  }

  // THE seam: the contract announces every mutation made through its explicit
  // API (setValueAtPath, assign, isValid -> "errors", bubbled nested changes)
  const unsubscribeFromContract = contract.subscribeMutations(({ path }) => {
    const pathArray = path.length ? path.split(".") : [];
    emitChange(pathArray, { type: "set", value: readAtPath(contract, pathArray) });
  });

  /**
   * Retrieves the raw value at a path (the contract itself without a path).
   * @param {string | string[]} [path]
   * @returns {unknown}
   */
  function getValue(path) {
    const normalized = normalizePath(path);
    if (!normalized.length) return contract;
    return readAtPath(contract, normalized);
  }

  /**
   * Mutates the underlying contract at the specified path - the reactive way
   * to write. The contract's mutation seam notifies all subscribers.
   * @param {string | string[]} path
   * @param {unknown} value
   * @returns {unknown}
   */
  function setValue(path, value) {
    const normalized = normalizePath(path);
    if (!normalized.length) throw new Error("setValue requires a non-empty path");
    contract.setValueAtPath(normalized, value);
    return value;
  }

  /**
   * Returns the revision counter for the provided path.
   * @param {string | string[]} [path]
   * @returns {number}
   */
  function getRevision(path) {
    return revisions.get(pathToKey(normalizePath(path))) || 0;
  }

  return {
    contract,
    subscribe,
    getValue,
    setValue,
    getRevision,
    assign: (...args) => contract.assign(...args),
    isValid: (...args) => contract.isValid(...args),
    getContract: () => contract,
    getOriginalContract: () => contract,
    destroy: () => {
      unsubscribeFromContract();
      subscribers.clear();
    },
  };
}

export const __INTERNALS__ = {
  normalizePath,
  pathToKey,
  readAtPath,
};
