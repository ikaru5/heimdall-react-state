import { describe, expect, it } from "@jest/globals";

import {
  normalizePath,
  pathToKey,
  readAtPath,
  toPathSegment,
  traverseAncestors,
} from "../../src/internal/path.js";

describe("internal/path utilities", () => {
  it("normalizes different path inputs", () => {
    expect(normalizePath(undefined)).toEqual([]);
    expect(normalizePath(null)).toEqual([]);
    expect(normalizePath("")).toEqual([]);
    expect(normalizePath("profile.firstName")).toEqual(["profile", "firstName"]);
    expect(normalizePath(["profile", 0, "name"])).toEqual(["profile", "0", "name"]);
  });

  it("throws for unsupported path types", () => {
    expect(() => normalizePath(123)).toThrow(TypeError);
  });

  it("converts segments into cache keys", () => {
    expect(pathToKey([])).toBe("");
    expect(pathToKey(["profile", "firstName"])).toBe("profile.firstName");
  });

  it("converts arbitrary values to path segments", () => {
    expect(toPathSegment("firstName")).toBe("firstName");
    expect(toPathSegment(2)).toBe("2");
    expect(toPathSegment(null)).toBe("");
    expect(toPathSegment(undefined)).toBe("");
  });

  it("reads values at nested paths", () => {
    const target = { profile: { firstName: "Ada" } };
    expect(readAtPath(target, [])).toBe(target);
    expect(readAtPath(target, ["profile", "firstName"])).toBe("Ada");
    expect(readAtPath(target, ["profile", "missing"])).toBeUndefined();
    target.nullish = null;
    expect(readAtPath(target, ["nullish", "value"])).toBeNull();
  });

  it("visits each ancestor when traversing", () => {
    const visited = [];
    traverseAncestors(["profile", "firstName"], (key) => visited.push(key));
    expect(visited).toEqual(["profile.firstName", "profile", ""]);
  });
});
