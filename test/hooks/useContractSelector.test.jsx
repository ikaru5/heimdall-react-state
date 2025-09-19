import { act } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, renderHook } from "@testing-library/react";

import { createContractStore } from "../../src/createContractStore.js";
import { __HOOK_INTERNALS__, useContractSelector } from "../../src/hooks.js";
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

  it("falls back to the contract property when getContract is missing", () => {
    const listeners = new Set();
    const store = {
      contract: { status: "initial" },
      subscribe: jest.fn((_, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      getRevision: jest.fn(() => 0),
    };
    const selector = jest.fn((contract) => contract.status);

    const { result } = renderHook(() => useContractSelector(store, selector));

    expect(result.current).toBe("initial");

    act(() => {
      store.contract.status = "next";
      listeners.forEach((listener) => listener());
    });

    expect(result.current).toBe("next");
    expect(selector).toHaveBeenCalledWith(store.contract);
  });

  it("returns undefined when no store instance is provided", () => {
    const { getContractProxy } = __HOOK_INTERNALS__;
    expect(getContractProxy(undefined)).toBeUndefined();
  });
});
