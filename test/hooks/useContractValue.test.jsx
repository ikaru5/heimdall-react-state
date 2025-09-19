import { act } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, renderHook } from "@testing-library/react";

import { createContractStore } from "../../src/createContractStore.js";
import { useContractValue } from "../../src/hooks.js";
import { ProfileContract } from "../helpers/contracts.js";
import { silenceConsoleError } from "../helpers/silenceConsoleError.js";

function ValueProbe({ store, path, options, onRender }) {
  const value = useContractValue(store, path, options);
  onRender(value);
  return null;
}

describe("useContractValue", () => {
  it("throws when store is invalid", () => {
    silenceConsoleError(() => {
      expect(() => {
        renderHook(() => useContractValue({}, "profile.firstName"));
      }).toThrow(TypeError);
    });
  });

  it("returns values at the provided path and applies equality checks", async () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);
    const onRender = jest.fn();
    const equalityFn = jest.fn((previous, next) => previous.toLowerCase() === next.toLowerCase());

    const { unmount } = render(
      <ValueProbe
        store={store}
        path={["profile", "firstName"]}
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

  it("respects the exact option for parent subscriptions", async () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);
    const exactRender = jest.fn();
    const looseRender = jest.fn();
    const exactEquality = jest.fn(() => false);
    const looseEquality = jest.fn(() => false);

    const { unmount } = render(
      <>
        <ValueProbe
          store={store}
          path="profile"
          options={{ exact: true, equalityFn: exactEquality }}
          onRender={exactRender}
        />
        <ValueProbe
          store={store}
          path="profile"
          options={{ equalityFn: looseEquality }}
          onRender={looseRender}
        />
      </>,
    );

    expect(exactRender).toHaveBeenCalledTimes(1);
    expect(looseRender).toHaveBeenCalledTimes(1);

    await act(async () => {
      store.contract.profile.bio = "Rear Admiral";
    });

    expect(exactRender).toHaveBeenCalledTimes(1);
    expect(looseRender).toHaveBeenCalledTimes(1);
    expect(exactEquality).not.toHaveBeenCalled();
    expect(looseEquality).toHaveBeenCalled();

    unmount();
  });

  it("falls back to store.contract when getContract is unavailable", () => {
    const listeners = new Set();
    const store = {
      contract: { profile: { firstName: "Ada" } },
      subscribe: jest.fn((_, listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      getRevision: jest.fn(() => 0),
    };

    const { result } = renderHook(() => useContractValue(store, "profile.firstName"));

    expect(result.current).toBe("Ada");

    act(() => {
      store.contract.profile.firstName = "Grace";
      listeners.forEach((listener) => listener());
    });

    expect(result.current).toBe("Grace");
  });
});
