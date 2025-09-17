const ROOT_KEY = "";

const isPlainObject = (value) => Object.prototype.toString.call(value) === "[object Object]";

const toPathSegment = (segment) => {
  if (segment === undefined || segment === null) return "";
  return typeof segment === "number" ? String(segment) : String(segment);
};

const normalizePath = (path) => {
  if (path === undefined || path === null || path === "") return [];
  if (Array.isArray(path)) return path.map(toPathSegment);
  if ("string" === typeof path) return path.split(".").filter(Boolean).map(toPathSegment);
  throw new TypeError("path must be a string, array or undefined");
};

const pathToKey = (pathArray) => (pathArray.length ? pathArray.join(".") : ROOT_KEY);

const traverseAncestors = (pathArray, visitor) => {
  for (let index = pathArray.length; index >= 0; index -= 1) {
    visitor(pathToKey(pathArray.slice(0, index)));
  }
};

const readAtPath = (target, pathArray) => {
  if (!pathArray.length) return target;
  return pathArray.reduce((current, segment) => (current == null ? current : current[segment]), target);
};

const DEFAULT_SUBSCRIBE_OPTIONS = { exact: false };

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

  const bumpRevision = (key) => {
    const nextRevision = (revisions.get(key) || 0) + 1;
    revisions.set(key, nextRevision);
    return nextRevision;
  };

  const emitChange = (pathArray, payload) => {
    const key = pathToKey(pathArray);
    const baseEvent = { ...payload, path: pathArray, key };
    if ("function" === typeof options.onUpdate) options.onUpdate(baseEvent);

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
  };

  const ensureSubscriptionSet = (key) => {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    return subscribers.get(key);
  };

  const subscribe = (path, callback, opts = {}) => {
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
  };

  const instrumentContract = (instance, basePath) => {
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
  };

  const captureNestedStructures = (value, path) => {
    if (Array.isArray(value)) {
      wrapArray(value, path);
      value.forEach((entry, index) => {
        const nestedPath = path.concat(toPathSegment(index));
        if (isContractLike(entry)) instrumentContract(entry, nestedPath);
        else if (isPlainObject(entry)) wrapPlainObject(entry, nestedPath);
      });
      return;
    }

    if (isContractLike(value)) {
      instrumentContract(value, path);
      if (value && value.schema && "object" === typeof value.schema) {
        Object.keys(value.schema).forEach((key) => {
          const nestedValue = value[key];
          const nestedPath = path.concat(toPathSegment(key));
          captureNestedStructures(nestedValue, nestedPath);
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
  };

  const isContractLike = (candidate) => {
    if (!candidate || "object" !== typeof candidate) return false;
    return "function" === typeof candidate.assign && "function" === typeof candidate.setValueAtPath;
  };

  const wrapContract = (instance, basePath) => {
    if (!instance || "object" !== typeof instance) return instance;
    if (contractProxyCache.has(instance)) return contractProxyCache.get(instance);

    instrumentContract(instance, basePath);

    const proxy = new Proxy(instance, {
      get(target, property, receiver) {
        if (typeof property === "symbol" && property !== Symbol.for("heimdall-react-state.raw")) {
          return Reflect.get(target, property, receiver);
        }
        if (property === Symbol.for("heimdall-react-state.raw")) return target;
        const value = Reflect.get(target, property, receiver);
        if ("function" === typeof value) return value.bind(target);
        const propertyPath = basePath.concat(toPathSegment(property));
        if (Array.isArray(value)) return wrapArray(value, propertyPath);
        if (isContractLike(value)) return wrapContract(value, propertyPath);
        if (isPlainObject(value)) return wrapPlainObject(value, propertyPath);
        return value;
      },
      set(target, property, value, receiver) {
        if (typeof property === "symbol") return Reflect.set(target, property, value, receiver);
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
        if (typeof property === "symbol") return Reflect.deleteProperty(target, property);
        if (!Object.prototype.hasOwnProperty.call(target, property)) return true;
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = target[property];
        const didDelete = Reflect.deleteProperty(target, property);
        if (didDelete) emitChange(propertyPath, { type: "delete", previousValue });
        return didDelete;
      }
    });

    contractProxyCache.set(instance, proxy);
    return proxy;
  };

  const wrapPlainObject = (target, basePath) => {
    if (!target || "object" !== typeof target) return target;
    if (objectProxyCache.has(target)) return objectProxyCache.get(target);

    const proxy = new Proxy(target, {
      get(obj, property, receiver) {
        if (typeof property === "symbol") return Reflect.get(obj, property, receiver);
        const value = Reflect.get(obj, property, receiver);
        const propertyPath = basePath.concat(toPathSegment(property));
        if (Array.isArray(value)) return wrapArray(value, propertyPath);
        if (isContractLike(value)) return wrapContract(value, propertyPath);
        if (isPlainObject(value)) return wrapPlainObject(value, propertyPath);
        return value;
      },
      set(obj, property, value, receiver) {
        if (typeof property === "symbol") return Reflect.set(obj, property, value, receiver);
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
        if (typeof property === "symbol") return Reflect.deleteProperty(obj, property);
        if (!Object.prototype.hasOwnProperty.call(obj, property)) return true;
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = obj[property];
        const didDelete = Reflect.deleteProperty(obj, property);
        if (didDelete) emitChange(propertyPath, { type: "delete", previousValue });
        return didDelete;
      }
    });

    objectProxyCache.set(target, proxy);
    return proxy;
  };

  const wrapArray = (target, basePath) => {
    if (!Array.isArray(target)) return target;

    target.forEach((entry, index) => {
      const nestedPath = basePath.concat(toPathSegment(index));
      if (isContractLike(entry)) instrumentContract(entry, nestedPath);
      else if (isPlainObject(entry)) wrapPlainObject(entry, nestedPath);
    });

    if (arrayProxyCache.has(target)) return arrayProxyCache.get(target);

    const proxy = new Proxy(target, {
      get(arr, property, receiver) {
        if (typeof property === "symbol") return Reflect.get(arr, property, receiver);
        const value = Reflect.get(arr, property, receiver);
        if ("function" === typeof value) {
          return (...args) => {
            const result = value.apply(arr, args);
            captureNestedStructures(arr, basePath);
            emitChange(basePath, { type: "mutate", value: proxy });
            return result;
          };
        }
        const propertyPath = basePath.concat(toPathSegment(property));
        if (Array.isArray(value)) return wrapArray(value, propertyPath);
        if (isContractLike(value)) return wrapContract(value, propertyPath);
        if (isPlainObject(value)) return wrapPlainObject(value, propertyPath);
        return value;
      },
      set(arr, property, value, receiver) {
        if (typeof property === "symbol") return Reflect.set(arr, property, value, receiver);
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
        if (typeof property === "symbol") return Reflect.deleteProperty(arr, property);
        if (!Object.prototype.hasOwnProperty.call(arr, property)) return true;
        const propertyPath = basePath.concat(toPathSegment(property));
        const previousValue = arr[property];
        const didDelete = Reflect.deleteProperty(arr, property);
        if (didDelete) emitChange(propertyPath, { type: "delete", previousValue });
        return didDelete;
      }
    });

    arrayProxyCache.set(target, proxy);
    return proxy;
  };

  captureNestedStructures(contract, []);
  const proxiedContract = wrapContract(contract, []);

  const getValue = (path) => {
    const normalized = normalizePath(path);
    if (!normalized.length) return proxiedContract;
    return readAtPath(proxiedContract, normalized);
  };

  const setValue = (path, value) => {
    const normalized = normalizePath(path);
    if (!normalized.length) throw new Error("setValue requires a non-empty path");
    contract.setValueAtPath(normalized, value);
    return value;
  };

  const getRevision = (path) => {
    const normalized = normalizePath(path);
    return revisions.get(pathToKey(normalized)) || 0;
  };

  return {
    contract: proxiedContract,
    subscribe,
    getValue,
    setValue,
    getRevision,
    assign: (...args) => contract.assign(...args),
    isValid: (...args) => contract.isValid(...args),
    getContract: () => proxiedContract,
    getOriginalContract: () => contract
  };
}

export const __INTERNALS__ = {
  normalizePath,
  pathToKey,
  readAtPath
};
