/**
 * Root key that is used when no specific path segments are present.
 * @type {string}
 */
export const ROOT_KEY = "";

/**
 * Symbol that exposes access to the underlying value when a proxy wraps it.
 * @type {symbol}
 */
export const RAW_SYMBOL = Symbol.for("heimdall-react-state.raw");

/**
 * Converts a path segment into a string representation that can be used as an object key.
 * @param {string | number | null | undefined} segment
 * @returns {string}
 */
export const toPathSegment = (segment) => {
  if (segment === undefined || segment === null) return "";
  return typeof segment === "number" ? String(segment) : String(segment);
};

/**
 * Normalises user supplied paths into an array of path segments.
 * Accepts dot separated strings, arrays or empty values.
 *
 * @param {string | Array<string | number> | null | undefined} path
 * @returns {string[]}
 */
export const normalizePath = (path) => {
  if (path === undefined || path === null || path === "") return [];
  if (Array.isArray(path)) return path.map(toPathSegment);
  if (typeof path === "string") return path.split(".").filter(Boolean).map(toPathSegment);
  throw new TypeError("path must be a string, array or undefined");
};

/**
 * Turns an array of path segments into a cache key.
 * @param {string[]} pathArray
 * @returns {string}
 */
export const pathToKey = (pathArray) => (pathArray.length ? pathArray.join(".") : ROOT_KEY);

/**
 * Visits the provided path and each of its ancestors starting from the leaf segment.
 *
 * @param {string[]} pathArray
 * @param {(pathKey: string) => void} visitor
 */
export const traverseAncestors = (pathArray, visitor) => {
  for (let index = pathArray.length; index >= 0; index -= 1) {
    visitor(pathToKey(pathArray.slice(0, index)));
  }
};

/**
 * Reads the value at a given path from a target object.
 *
 * @template T
 * @param {T} target
 * @param {string[]} pathArray
 * @returns {unknown}
 */
export const readAtPath = (target, pathArray) => {
  if (!pathArray.length) return target;
  return pathArray.reduce(
    (current, segment) => (current == null ? current : current[segment]),
    target,
  );
};
