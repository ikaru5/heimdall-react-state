import { describe, expect, it, jest } from "@jest/globals";
import Contract from "@ikaru5/heimdall-contract";

import { createContractStore } from "../../src/createContractStore.js";
import { ProfileContract, ProjectContract } from "../helpers/contracts.js";

describe("createContractStore", () => {
  it("throws when provided value is not a contract", () => {
    expect(() => createContractStore(null)).toThrow(TypeError);
  });

  it("throws when the contract lacks the mutation seam", () => {
    const legacyContract = { assign() {}, isValid: () => true, setValueAtPath() {} };
    expect(() => createContractStore(legacyContract)).toThrow(
      "requires @ikaru5/heimdall-contract >= 0.11",
    );
  });

  it("exposes the raw contract", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    expect(store.contract).toBe(contract);
    expect(store.getContract()).toBe(contract);
    expect(store.getOriginalContract()).toBe(contract);
    expect(store.getValue()).toBe(contract);
    expect(store.getValue("profile.lastName")).toBe("Lovelace");
  });

  it("delegates mutations through setValue", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    expect(() => store.setValue("", "value")).toThrow("setValue requires a non-empty path");

    store.setValue("profile.firstName", "Grace");
    expect(store.getValue("profile.firstName")).toBe("Grace");
    expect(contract.profile.firstName).toBe("Grace");
  });

  it("notifies subscribers and respects exact flag", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    const firstNameListener = jest.fn();
    const profileListener = jest.fn();
    const exactProfileListener = jest.fn();

    const unsubscribeFirst = store.subscribe("profile.firstName", firstNameListener);
    const unsubscribeProfile = store.subscribe("profile", profileListener);
    const unsubscribeExactProfile = store.subscribe("profile", exactProfileListener, {
      exact: true,
    });

    store.setValue("profile.firstName", "Grace");
    store.setValue("profile.lastName", "Hopper");

    expect(firstNameListener).toHaveBeenCalledTimes(1);
    expect(profileListener).toHaveBeenCalledTimes(2);
    expect(exactProfileListener).not.toHaveBeenCalled();

    unsubscribeFirst();
    unsubscribeFirst();
    unsubscribeProfile();
    unsubscribeExactProfile();

    store.setValue("profile.bio", "Rear Admiral");

    expect(firstNameListener).toHaveBeenCalledTimes(1);
    expect(profileListener).toHaveBeenCalledTimes(2);
    expect(exactProfileListener).not.toHaveBeenCalled();
  });

  it("tracks revisions per path", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    expect(store.getRevision()).toBe(0);
    expect(store.getRevision("profile.firstName")).toBe(0);

    store.setValue("profile.firstName", "Grace");
    expect(store.getRevision("profile.firstName")).toBe(1);
    expect(store.getRevision("profile")).toBe(1);

    store.setValue("profile.lastName", "Hopper");
    expect(store.getRevision()).toBe(2);
  });

  it("forwards updates to the optional onUpdate hook", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const onUpdate = jest.fn();
    const store = createContractStore(contract, { onUpdate });

    store.setValue("profile.bio", "Rear Admiral");

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "profile.bio",
        path: ["profile", "bio"],
        type: "set",
        value: "Rear Admiral",
      }),
    );
  });

  it("stays silent for raw writes but notifies explicit in-place mutations", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const taskListener = jest.fn();
    store.subscribe("project.tasks", taskListener);

    // deliberately NOT observable: raw property writes and raw array mutations
    contract.project.metadata.owner = "Grace";
    contract.project.tasks.push("raw push");
    expect(taskListener).not.toHaveBeenCalled();

    // the explicit API notifies even when it mutates the same array instance
    const tasksBefore = store.getValue("project.tasks");
    store.setValue("project.tasks.1", "explicit");
    expect(store.getValue("project.tasks")).toBe(tasksBefore);
    expect(taskListener).toHaveBeenCalledTimes(1);
    expect(store.getValue("project.tasks")).toEqual(["initial", "explicit"]);

    // replacing the whole array notifies as well
    store.setValue("project.tasks", ["deploy"]);
    expect(taskListener).toHaveBeenCalledTimes(2);
    expect(store.getValue("project.tasks")).toEqual(["deploy"]);
  });

  it("bubbles mutations made directly on nested contract instances", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    const firstNameListener = jest.fn();
    store.subscribe("profile.firstName", firstNameListener);

    contract.profile.setValueAtPath(["firstName"], "Grace");

    expect(firstNameListener).toHaveBeenCalledTimes(1);
    expect(store.getValue("profile.firstName")).toBe("Grace");
  });

  it("notifies subscribers when assign writes values", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["one", "two", "three"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const taskListener = jest.fn();
    store.subscribe("project.tasks", taskListener);

    // shrinking arrays notifies through the truncation seam in assign
    store.assign({ project: { tasks: ["only"] } });

    expect(taskListener).toHaveBeenCalled();
    expect(store.getValue("project.tasks")).toEqual(["only"]);
  });

  it("stays silent when setValueAtPath targets a foreign object", () => {
    const contract = new ProjectContract();
    contract.assign({ project: { tasks: [], metadata: {} } });
    const store = createContractStore(contract);

    const rootListener = jest.fn();
    store.subscribe(undefined, rootListener);

    const foreignTarget = {};
    contract.setValueAtPath(["field"], "external", foreignTarget);

    expect(foreignTarget.field).toBe("external");
    expect(rootListener).not.toHaveBeenCalled();
  });

  it("works with duck-typed contracts that provide the mutation seam", () => {
    const callbacks = new Set();
    const duck = {
      assign: jest.fn(),
      isValid: jest.fn(),
      subscribeMutations(callback) {
        callbacks.add(callback);
        return () => callbacks.delete(callback);
      },
      setValueAtPath(depth, value) {
        this[depth[0]] = value;
        callbacks.forEach((callback) => callback({ path: depth.join(".") }));
      },
    };
    const store = createContractStore(duck);

    const listener = jest.fn();
    store.subscribe("field", listener);

    store.setValue("field", "internal");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getValue("field")).toBe("internal");
  });

  it("detaches from the contract on destroy", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    const listener = jest.fn();
    store.subscribe("profile.firstName", listener);

    store.destroy();
    contract.setValueAtPath(["profile", "firstName"], "Grace");

    expect(listener).not.toHaveBeenCalled();
    expect(contract.profile.firstName).toBe("Grace");
  });

  it("delegates helper methods to the underlying contract", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const assignSpy = jest.spyOn(contract, "assign");
    const isValidSpy = jest.spyOn(contract, "isValid").mockReturnValueOnce(true);

    const payload = { project: { metadata: { owner: "Grace" } } };
    store.assign(payload);
    expect(assignSpy).toHaveBeenCalledWith(payload);

    expect(store.isValid("project")).toBe(true);
    expect(isValidSpy).toHaveBeenCalledWith("project");

    assignSpy.mockRestore();
    isValidSpy.mockRestore();
  });

  it("deduplicates notifications when path segments collapse to the root", () => {
    const contract = new ProjectContract();
    contract.assign({ project: {} });
    const store = createContractStore(contract);

    const rootListener = jest.fn();
    const emptyKeyListener = jest.fn();

    store.subscribe(undefined, rootListener);
    store.subscribe("", emptyKeyListener);

    contract.setValueAtPath([""], { placeholder: true });

    expect(rootListener).toHaveBeenCalledTimes(1);
    expect(emptyKeyListener).toHaveBeenCalledTimes(1);

    // an empty leading segment makes "" and the root collapse to the same key
    contract.setValueAtPath(["", "nested"], true);

    expect(rootListener).toHaveBeenCalledTimes(2);
    expect(emptyKeyListener).toHaveBeenCalledTimes(2);
  });
});

describe("validation notifications", () => {
  class ValidatedContract extends Contract {
    defineSchema() {
      return {
        email: { dType: "String", presence: true, isEmail: true },
        nested: {
          dType: "Contract",
          contract: { name: { dType: "String", presence: true } },
        },
      };
    }
  }

  it("announces every validation run on the errors path", () => {
    const store = createContractStore(new ValidatedContract());
    const errorsListener = jest.fn();
    store.subscribe("errors", errorsListener);

    expect(store.isValid()).toBe(false);
    expect(errorsListener).toHaveBeenCalledTimes(1);
    expect(store.getOriginalContract().errors.fields.email.issues).toHaveLength(2);

    // plain field writes do not touch the errors subscription
    store.setValue("email", "ada@example.com");
    store.setValue("nested.name", "Ada");
    expect(errorsListener).toHaveBeenCalledTimes(1);

    // every run announces itself - also the one that clears the errors
    expect(store.isValid()).toBe(true);
    expect(errorsListener).toHaveBeenCalledTimes(2);
    expect(store.getOriginalContract().errors).toStrictEqual({});
  });

  it("notifies nested error paths when a parent validation runs", () => {
    const store = createContractStore(new ValidatedContract());
    const nestedErrorsListener = jest.fn();
    store.subscribe("nested.errors", nestedErrorsListener);

    store.isValid();

    expect(nestedErrorsListener).toHaveBeenCalledTimes(1);
    expect(store.getValue("nested.errors").fields.name.issues[0].validation).toBe("presence");
  });

  it("notifies deep error subscribers when a field clears while another stays invalid", () => {
    const store = createContractStore(new ValidatedContract());
    store.isValid(); // email and nested.name invalid

    const emailErrorsListener = jest.fn();
    store.subscribe("errors.fields.email", emailErrorsListener);

    store.setValue("email", "ada@example.com");
    store.isValid(); // email clears, nested.name stays invalid

    expect(emailErrorsListener).toHaveBeenCalled();
    expect(store.getValue("errors.fields.email")).toBeUndefined();
  });
});

describe("descendant notifications", () => {
  it("notifies child subscribers when an ancestor value is replaced", () => {
    const contract = new ProfileContract();
    contract.assign({ profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" } });
    const store = createContractStore(contract);

    const firstNameListener = jest.fn();
    const exactFirstNameListener = jest.fn();
    const siblingListener = jest.fn();
    const profileListener = jest.fn();
    store.subscribe("profile.firstName", firstNameListener);
    store.subscribe("profile.firstName", exactFirstNameListener, { exact: true });
    store.subscribe("unrelated.path", siblingListener);
    store.subscribe("profile", profileListener);

    store.setValue("profile", { firstName: "Grace", lastName: "Hopper", bio: "Rear Admiral" });

    // the exact flag only guards against descendant noise - an ancestor replacement changes the value
    expect(firstNameListener).toHaveBeenCalledTimes(1);
    expect(exactFirstNameListener).toHaveBeenCalledTimes(1);
    expect(profileListener).toHaveBeenCalledTimes(1);
    expect(siblingListener).not.toHaveBeenCalled();
    expect(store.getValue("profile.firstName")).toBe("Grace");
  });
});
