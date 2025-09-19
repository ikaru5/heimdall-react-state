import { act } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, renderHook } from "@testing-library/react";

import { createContractStore } from "../../src/createContractStore.js";
import { useContractSelector } from "../../src/hooks.js";
import { ProfileContract } from "../helpers/contracts.js";
import { silenceConsoleError } from "../helpers/silenceConsoleError.js";

function SelectorProbe({ store, selector, options, onRender }) {
  const value = useContractSelector(store, selector, options);
  onRender(value);
  return null;
}

describe("useContractSelector", () => {
  it("throws when provided store is invalid", () => {
    silenceConsoleError(() => {
      expect(() => {
        renderHook(() => useContractSelector({}, () => 1));
      }).toThrow(TypeError);
    });
  });

  it("requires selector to be a function", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    silenceConsoleError(() => {
      expect(() => {
        renderHook(() => useContractSelector(store, /** @type {any} */ ("not-a-function")));
      }).toThrow(TypeError);
    });
  });

  it("subscribes to derived values and applies custom equality checks", async () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);
    const onRender = jest.fn();
    const equalityFn = jest.fn((previous, next) => previous.toLowerCase() === next.toLowerCase());

    const { unmount } = render(
      <SelectorProbe
        store={store}
        selector={(current) => current.profile.firstName}
        options={{ equalityFn }}
        onRender={onRender}
      />,
    );

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenLastCalledWith("Ada");

    await act(async () => {
      store.contract.profile.lastName = "Hopper";
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    await act(async () => {
      store.contract.profile.firstName = "ADA";
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    await act(async () => {
      store.contract.profile.firstName = "Grace";
    });
    expect(onRender).toHaveBeenCalledTimes(2);
    expect(onRender).toHaveBeenLastCalledWith("Grace");

    expect(equalityFn).toHaveBeenCalled();

    unmount();
  });
});
