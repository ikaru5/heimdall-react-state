import React from "react";
import { act } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, renderHook } from "@testing-library/react";

import { createContractStore } from "../../src/createContractStore.js";
import { useContractSelector } from "../../src/hooks.js";
import { createProfileContract } from "../helpers/contracts.js";

function SelectorProbe({ store, selector, options, onRender }) {
  const value = useContractSelector(store, selector, options);
  onRender(value);
  return null;
}

describe("useContractSelector", () => {
  it("throws when provided store is invalid", () => {
    expect(() => {
      renderHook(() => useContractSelector({}, () => 1));
    }).toThrow(TypeError);
  });

  it("requires selector to be a function", () => {
    const contract = createProfileContract({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    expect(() => {
      renderHook(() => useContractSelector(store, /** @type {any} */ ("not-a-function")));
    }).toThrow(TypeError);
  });

  it("subscribes to derived values and applies custom equality checks", async () => {
    const contract = createProfileContract({
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
