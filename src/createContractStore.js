import {
  RAW_SYMBOL,
  normalizePath,
  pathToKey,
  readAtPath,
  toPathSegment,
  traverseAncestors,
} from "./internal/path.js";

const isPlainObject = (value) => Object.prototype.toString.call(value) === "[object Object]";

const DEFAULT_SUBSCRIBE_OPTIONS = { exact: false };
const MUTATING_ARRAY_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

/**
 * Creates a reactive store around a Heimdall contract instance.
 *
 * The returned store exposes helpers that mirror the original contract methods while also
 * enabling React components to subscribe to fine grained updates.
 *
 * @param {object} contract A Heimdall contract instance.
 * @param {{ onUpdate?: (event: import("./types.js").ContractUpdateEvent) => void }} [options]
 * @returns {import("./types.js").ContractStore}
 */
export function createContractStore(contract, options = {}) {
  if ("object" !== typeof contract || contract === null) {
    throw new TypeError("createContractStore expects a contract instance");
  }

  const subscribers = new Map();
  const revisions = new Map();
  const instrumentedContracts = new WeakSet();
  const contractProxyCache = new WeakMap();
  const objectProxyCache = new WeakMap();
  const arrayProxyCache = new WeakMap();
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
   * Notifies subscribers about a change at the provided path.
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
  }

  /**
   * Ensures that a subscription bucket exists for the provided key.
   * @param {string} key
   * @returns {Set<{callback: Function, exact: boolean}>}
   */
  function ensureSubscriptionSet(key) {
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    return subscribers.get(key);
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
    const normalized = normalizePath(path);
    const key = pathToKey(normalized);
    const entry = { callback, exact };
    const set = ensureSubscriptionSet(key);
    set.add(entry);
    return () => {
      const currentSet = subscribers.get(key);
      if (!currentSet) return;
      currentSet.delete(entry);
      if (0 === currentSet.size) subscribers.delete(key);
    };
  }

  /**
   * Wraps a Heimdall contract instance to intercept mutation methods.
   * @param {any} instance
   * @param {string[]} basePath
   */
  function instrumentContract(instance, basePath) {
    if (!instance || "function" !== typeof instance.setValueAtPath) return;
    if (instrumentedContracts.has(instance)) return;
    instrumentedContracts.add(instance);

    const originalSetValueAtPath = instance.setValueAtPath.bind(instance);
    instance.setValueAtPath = function patchedSetValueAtPath(depth, value, object = this) {
      const normalizedDepth = depth.map(toPathSegment);
      const shouldNotify = object === this;
      const previousValue = shouldNotify ? readAtPath(this, normalizedDepth) : undefined;
      const result = originalSetValueAtPath(depth, value, object);
      if (shouldNotify) {
        const nextValue = readAtPath(this, normalizedDepth);
        if (!Object.is(previousValue, nextValue)) {
          const fullPath = basePath.concat(normalizedDepth);
          captureNestedStructures(nextValue, fullPath);
          emitChange(fullPath, { type: "set", value: nextValue, previousValue });
        }
      }
      return result;
    };
  }

  /**
   * Recursively wraps nested objects, arrays and contract instances so they
   * participate in change tracking.
   * @param {unknown} value
   * @param {string[]} path
   */
  function captureNestedStructures(value, path) {
    if (Array.isArray(value)) {
      wrapArray(value, path);
      value.forEach((entry, index) => {
        const nestedPath = path.concat(toPathSegment(index));
        captureNestedStructures(entry, nestedPath);
      });
      return;
    }

    if (isContractLike(value)) {
      instrumentContract(value, path);
      if (value && value.schema && "object" === typeof value.schema) {
        Object.keys(value.schema).forEach((key) => {
          const nestedPath = path.concat(toPathSegment(key));
          captureNestedStructures(value[key], nestedPath);
        });
      }
      return;
    }

    if (isPlainObject(value)) {
      wrapPlainObject(value, path);
      Object.keys(value).forEach((key) => {
        const nestedPath = path.concat(toPathSegment(key));
        captureNestedStructures(value[key], nestedPath);
      });
    }
  }

  /**
   * Determines whether a candidate looks like a Heimdall contract instance.
   * @param {unknown} candidate
   * @returns {boolean}
   */
  function isContractLike(candidate) {
    if (!candidate || "object" !== typeof candidate) return false;
    return "function" === typeof candidate.assign && "function" === typeof candidate.setValueAtPath;
  }

  /**
   * Makes sure that nested structures are wrapped with the appropriate proxy.
   * @param {unknown} value
   * @param {string[]} basePath
   * @returns {unknown}
   */
  function ensureInstrumented(value, basePath) {
    if (Array.isArray(value)) return wrapArray(value, basePath);
    if (isContractLike(value)) return wrapContract(value, basePath);
    if (isPlainObject(value)) return wrapPlainObject(value, basePath);
    return value;
  }

  /**
   * Creates a proxy around a contract instance.
   * @param {any} instance
   * @param {string[]} basePath
   * @returns {any}
   */
  function wrapContract(instance, basePath) {
    if (!instance || "object" !== typeof instance) return instance;
    if (contractProxyCache.has(instance)) return contractProxyCache.get(instance);

    instrumentContract(instance, basePath);

    const proxy = new Proxy(instance, {
      get(target, property, receiver) {
        if (typeof property === "symbol") {
          if (property === RAW_SYMBOL) return target;
          return Reflect.get(target, property, receiver);
        }
        const value = Reflect.get(target, property, receiver);
        if ("function" === typeof value) return value.bind(target);
        const propertyPath = basePath.concat(toPathSegment(property));
        return ensureInstrumented(value, propertyPath);
      },
      set(target, property, value, receiver) {
        if (typeof property === "symbol") {
          return Reflect.set(target, property, value, receiver);
        }
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = Reflect.get(target, property, receiver);
        const didSet = Reflect.set(target, property, value, receiver);
        if (didSet && !Object.is(previousValue, value)) {
          captureNestedStructures(value, propertyPath);
          emitChange(propertyPath, { type: "set", value, previousValue });
        }
        return didSet;
      },
      deleteProperty(target, property) {
        if (typeof property === "symbol") {
          return Reflect.deleteProperty(target, property);
        }
        if (!Object.prototype.hasOwnProperty.call(target, property)) return true;
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = target[property];
        const didDelete = Reflect.deleteProperty(target, property);
        if (didDelete) emitChange(propertyPath, { type: "delete", previousValue });
        return didDelete;
      },
    });

    contractProxyCache.set(instance, proxy);
    return proxy;
  }

  /**
   * Creates a proxy around a plain object so assignments trigger notifications.
   * @param {Record<string, unknown>} target
   * @param {string[]} basePath
   * @returns {Record<string, unknown>}
   */
  function wrapPlainObject(target, basePath) {
    if (!target || "object" !== typeof target) return target;
    if (objectProxyCache.has(target)) return objectProxyCache.get(target);

    const proxy = new Proxy(target, {
      get(obj, property, receiver) {
        if (typeof property === "symbol") {
          if (property === RAW_SYMBOL) return obj;
          return Reflect.get(obj, property, receiver);
        }
        const value = Reflect.get(obj, property, receiver);
        const propertyPath = basePath.concat(toPathSegment(property));
        return ensureInstrumented(value, propertyPath);
      },
      set(obj, property, value, receiver) {
        if (typeof property === "symbol") {
          return Reflect.set(obj, property, value, receiver);
        }
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = Reflect.get(obj, property, receiver);
        const didSet = Reflect.set(obj, property, value, receiver);
        if (didSet && !Object.is(previousValue, value)) {
          captureNestedStructures(value, propertyPath);
          emitChange(propertyPath, { type: "set", value, previousValue });
        }
        return didSet;
      },
      deleteProperty(obj, property) {
        if (typeof property === "symbol") {
          return Reflect.deleteProperty(obj, property);
        }
        if (!Object.prototype.hasOwnProperty.call(obj, property)) return true;
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = obj[property];
        const didDelete = Reflect.deleteProperty(obj, property);
        if (didDelete) emitChange(propertyPath, { type: "delete", previousValue });
        return didDelete;
      },
    });

    objectProxyCache.set(target, proxy);
    return proxy;
  }

  /**
   * Creates a proxy around an array so updates to its items trigger notifications.
   * @param {unknown[]} target
   * @param {string[]} basePath
   * @returns {unknown[]}
   */
  function wrapArray(target, basePath) {
    if (!Array.isArray(target)) return target;

    target.forEach((entry, index) => {
      const nestedPath = basePath.concat(toPathSegment(index));
      captureNestedStructures(entry, nestedPath);
    });

    if (arrayProxyCache.has(target)) return arrayProxyCache.get(target);

    const proxy = new Proxy(target, {
      get(arr, property, receiver) {
        if (typeof property === "symbol") {
          if (property === RAW_SYMBOL) return arr;
          return Reflect.get(arr, property, receiver);
        }
        const value = Reflect.get(arr, property, receiver);
        if ("function" === typeof value) {
          if (!MUTATING_ARRAY_METHODS.has(property)) {
            return value.bind(arr);
          }
          return (...args) => {
            const result = value.apply(arr, args);
            captureNestedStructures(arr, basePath);
            emitChange(basePath, { type: "mutate", value: proxy });
            return result;
          };
        }
        const propertyPath = basePath.concat(toPathSegment(property));
        return ensureInstrumented(value, propertyPath);
      },
      set(arr, property, value, receiver) {
        if (typeof property === "symbol") {
          return Reflect.set(arr, property, value, receiver);
        }
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = Reflect.get(arr, property, receiver);
        const didSet = Reflect.set(arr, property, value, receiver);
        if (didSet && !Object.is(previousValue, value)) {
          captureNestedStructures(value, propertyPath);
          emitChange(propertyPath, { type: "set", value, previousValue });
        }
        return didSet;
      },
      deleteProperty(arr, property) {
        if (typeof property === "symbol") {
          return Reflect.deleteProperty(arr, property);
        }
        if (!Object.prototype.hasOwnProperty.call(arr, property)) return true;
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = arr[property];
        const didDelete = Reflect.deleteProperty(arr, property);
        if (didDelete) emitChange(propertyPath, { type: "delete", previousValue });
        return didDelete;
      },
    });

    arrayProxyCache.set(target, proxy);
    return proxy;
  }

  captureNestedStructures(contract, []);
  const proxiedContract = wrapContract(contract, []);

  /**
   * Retrieves a value from the proxied contract.
   * @param {string | string[]} [path]
   * @returns {unknown}
   */
  function getValue(path) {
    const normalized = normalizePath(path);
    if (!normalized.length) return proxiedContract;
    return readAtPath(proxiedContract, normalized);
  }

  /**
   * Mutates the underlying contract at the specified path.
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
    const normalized = normalizePath(path);
    return revisions.get(pathToKey(normalized)) || 0;
  }

  return {
    contract: proxiedContract,
    subscribe,
    getValue,
    setValue,
    getRevision,
    assign: (...args) => contract.assign(...args),
    isValid: (...args) => contract.isValid(...args),
    getContract: () => proxiedContract,
    getOriginalContract: () => contract,
  };
}

export const __INTERNALS__ = {
  normalizePath,
  pathToKey,
  readAtPath,
};
