import { act } from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, renderHook } from "@testing-library/react";
import Contract from "@ikaru5/heimdall-contract";

import { createContractStore } from "../../src/createContractStore.js";
import { useContractErrors } from "../../src/hooks.js";
import { silenceConsoleError } from "../helpers/silenceConsoleError.js";

class SignupContract extends Contract {
  defineSchema() {
    return {
      email: { dType: "String", presence: true, isEmail: true },
      addresses: {
        dType: "Array",
        arrayOf: { city: { dType: "String", presence: true } },
      },
    };
  }
}

function ErrorsProbe({ store, path, options, onRender }) {
  const errors = useContractErrors(store, path, options);
  onRender(errors);
  return null;
}

describe("useContractErrors", () => {
  it("throws when store is invalid", () => {
    silenceConsoleError(() => {
      expect(() => {
        renderHook(() => useContractErrors({}, "email"));
      }).toThrow(TypeError);

      // passes the generic store checks but lacks getOriginalContract
      const almostStore = { subscribe: () => () => {}, getRevision: () => 0 };
      expect(() => {
        renderHook(() => useContractErrors(almostStore, "email"));
      }).toThrow(TypeError);
    });
  });

  it("throws when the contract does not provide errorsAt", () => {
    const legacyContract = {
      assign() {},
      setValueAtPath() {},
      isValid: () => true,
      errors: {},
      schema: {},
    };
    const store = createContractStore(legacyContract);

    silenceConsoleError(() => {
      expect(() => {
        renderHook(() => useContractErrors(store, "email"));
      }).toThrow("requires @ikaru5/heimdall-contract >= 0.10");
    });
  });

  it("shows field issues after validation and clears them after correction", async () => {
    const store = createContractStore(new SignupContract());
    const onRender = jest.fn();

    render(<ErrorsProbe store={store} path="email" onRender={onRender} />);
    expect(onRender).toHaveBeenLastCalledWith(undefined);

    await act(async () => {
      store.isValid();
    });
    const errorNode = onRender.mock.lastCall[0];
    expect(errorNode.issues.map((issue) => issue.validation)).toStrictEqual([
      "presence",
      "isEmail",
    ]);

    // the regression scenario: correcting the field removes the message from the screen
    await act(async () => {
      store.setValue("email", "ada@example.com");
      store.isValid();
    });
    expect(onRender).toHaveBeenLastCalledWith(undefined);
  });

  it("resolves array element paths and the whole tree", async () => {
    const store = createContractStore(new SignupContract());
    store.assign({ email: "ada@example.com", addresses: [{ city: "" }, { city: "Berlin" }] });

    const onElementRender = jest.fn();
    const onRootRender = jest.fn();
    render(
      <ErrorsProbe store={store} path={["addresses", 0, "city"]} onRender={onElementRender} />,
    );
    render(<ErrorsProbe store={store} onRender={onRootRender} />);

    await act(async () => {
      store.isValid();
    });

    expect(onElementRender.mock.lastCall[0].issues[0].validation).toBe("presence");
    expect(onRootRender.mock.lastCall[0].fields.addresses.elements[0]).toBeDefined();
  });

  it("supports a custom equality function", async () => {
    const store = createContractStore(new SignupContract());
    const onRender = jest.fn();
    const equalityFn = jest.fn(() => true); // report everything as equal - never re-render

    render(<ErrorsProbe store={store} path="email" options={{ equalityFn }} onRender={onRender} />);
    const rendersBefore = onRender.mock.calls.length;

    await act(async () => {
      store.isValid();
    });

    expect(equalityFn).toHaveBeenCalled();
    expect(onRender.mock.calls.length).toBe(rendersBefore);
  });
});
