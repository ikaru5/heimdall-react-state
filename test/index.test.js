import { describe, expect, it } from "@jest/globals";

import * as entryPoint from "../src/index.js";
import { createContractStore } from "../src/createContractStore.js";
import { useContract, useContractSelector, useContractValue } from "../src/hooks.js";

describe("package entry point", () => {
  it("re-exports the public API", () => {
    expect(entryPoint.createContractStore).toBe(createContractStore);
    expect(entryPoint.useContract).toBe(useContract);
    expect(entryPoint.useContractSelector).toBe(useContractSelector);
    expect(entryPoint.useContractValue).toBe(useContractValue);
  });
});
