import { act } from "react";
import { describe, expect, it } from "@jest/globals";
import { render, renderHook } from "@testing-library/react";

import { createContractStore } from "../../src/createContractStore.js";
import { useContract } from "../../src/hooks.js";
import { ProfileContract } from "../helpers/contracts.js";
import { silenceConsoleError } from "../helpers/silenceConsoleError.js";

function ContractProbe({ store, onRender }) {
  const contract = useContract(store);
  onRender(contract);
  return null;
}

describe("useContract", () => {
  it("throws when the store is invalid", () => {
    silenceConsoleError(() => {
      expect(() => {
        renderHook(() => useContract({}));
      }).toThrow(TypeError);
    });
  });

  it("returns the proxied contract and re-renders on revisions", async () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);
    const renders = [];

    const { unmount } = render(
      <ContractProbe store={store} onRender={(value) => renders.push(value)} />,
    );

    expect(renders).toHaveLength(1);
    const firstRenderContract = renders[0];
    expect(firstRenderContract).toBe(store.getContract());

    await act(async () => {
      store.contract.profile.firstName = "Grace";
    });
    expect(renders).toHaveLength(2);
    expect(renders[1]).toBe(firstRenderContract);

    await act(async () => {
      store.contract.profile.bio = "Rear Admiral";
    });
    expect(renders).toHaveLength(3);
    expect(renders[2]).toBe(firstRenderContract);

    unmount();
  });
});
