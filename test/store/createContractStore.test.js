import { describe, expect, it, jest } from "@jest/globals";
import Contract from "@ikaru5/heimdall-contract";

import { createContractStore } from "../../src/createContractStore.js";
import { RAW_SYMBOL } from "../../src/internal/path.js";
import { AddressContract, ProfileContract, ProjectContract } from "../helpers/contracts.js";

describe("createContractStore", () => {
  it("throws when provided value is not a contract", () => {
    expect(() => createContractStore(null)).toThrow(TypeError);
  });

  it("exposes proxied and original contracts", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const store = createContractStore(contract);

    expect(store.contract).not.toBe(contract);
    expect(store.getContract()).toBe(store.contract);
    expect(store.getOriginalContract()).toBe(contract);
    expect(store.getValue()).toBe(store.contract);
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

    store.contract.profile.firstName = "Grace";
    store.contract.profile.lastName = "Hopper";

    expect(firstNameListener).toHaveBeenCalledTimes(1);
    expect(profileListener).toHaveBeenCalledTimes(2);
    expect(exactProfileListener).not.toHaveBeenCalled();

    unsubscribeFirst();
    unsubscribeProfile();
    unsubscribeExactProfile();

    store.contract.profile.bio = "Rear Admiral";

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

    store.contract.profile.firstName = "Grace";
    expect(store.getRevision("profile.firstName")).toBe(1);
    expect(store.getRevision("profile")).toBe(1);

    store.contract.profile.lastName = "Hopper";
    expect(store.getRevision()).toBe(2);
  });

  it("forwards updates to the optional onUpdate hook", () => {
    const contract = new ProfileContract();
    contract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const onUpdate = jest.fn();
    const store = createContractStore(contract, { onUpdate });

    store.contract.profile.bio = "Rear Admiral";

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

  it("reacts to array mutations and reassignments", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const taskListener = jest.fn();
    const metadataListener = jest.fn();

    store.subscribe("project.tasks", taskListener);
    store.subscribe("project.metadata.theme", metadataListener);

    store.contract.project.tasks.push("refactor");
    expect(taskListener).toHaveBeenCalledTimes(1);
    expect(store.getValue("project.tasks")).toEqual(["initial", "refactor"]);

    store.contract.project.tasks = ["deploy"];
    expect(taskListener).toHaveBeenCalledTimes(2);
    expect(store.getValue("project.tasks")).toEqual(["deploy"]);

    store.contract.project.metadata.theme = "dark";
    expect(metadataListener).toHaveBeenCalledTimes(1);
    expect(store.getValue("project.metadata.theme")).toBe("dark");

    delete store.contract.project.metadata.theme;
    expect(metadataListener).toHaveBeenCalledTimes(2);
  });

  it("instruments nested contracts when assigning them dynamically", () => {
    const dynamicSchema = {
      company: {
        dType: "Contract",
        contract: {
          name: { dType: "String" },
          address: { dType: "Generic" },
        },
      },
    };
    class CompanyContract extends Contract {
      defineSchema() {
        return dynamicSchema;
      }
    }
    const contract = new CompanyContract();
    contract.assign({
      company: { name: "ACME", address: { street: "Main" } },
    });
    const store = createContractStore(contract);

    const addressListener = jest.fn();
    store.subscribe("company.address.street", addressListener);

    store.contract.company.address.city = "Metropolis";
    expect(addressListener).not.toHaveBeenCalled();

    store.contract.company.address.street = "Elm";
    expect(addressListener).toHaveBeenCalledTimes(1);

    const branchContract = new AddressContract();
    branchContract.assign({
      address: { street: "Side", city: "Gotham", zip: "10001" },
      country: "US",
    });
    const branchAddress = branchContract.address;

    store.contract.company.address = branchAddress;
    expect(addressListener).toHaveBeenCalledTimes(1);

    store.contract.company.address.street = "Park";
    expect(addressListener).toHaveBeenCalledTimes(2);
  });

  it("captures nested arrays inside generics", () => {
    const schema = {
      catalog: {
        dType: "Generic",
      },
    };
    class CatalogContract extends Contract {
      defineSchema() {
        return schema;
      }
    }
    const contract = new CatalogContract();
    contract.assign({
      catalog: { books: ["Refactoring"] },
    });
    const store = createContractStore(contract);

    const listener = jest.fn();
    store.subscribe("catalog.books", listener);

    store.contract.catalog.books.unshift("Domain-Driven Design");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getValue("catalog.books")).toEqual(["Domain-Driven Design", "Refactoring"]);

    store.contract.catalog.books[1] = "Patterns of Enterprise Application Architecture";
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("exposes raw values through symbols and reuses proxies", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const projectProxy = store.contract.project;
    expect(projectProxy[RAW_SYMBOL]).toBe(contract.project);
    expect(store.contract.project).toBe(projectProxy);

    const metadataProxy = projectProxy.metadata;
    expect(metadataProxy[RAW_SYMBOL]).toBe(contract.project.metadata);
    expect(projectProxy.metadata).toBe(metadataProxy);

    const tasksProxy = projectProxy.tasks;
    expect(tasksProxy[RAW_SYMBOL]).toBe(contract.project.tasks);
    expect(projectProxy.tasks).toBe(tasksProxy);
  });

  it("propagates deletions for contract and array fields", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial", "todo"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const taskEvents = [];
    store.subscribe("project.tasks.1", (event) => taskEvents.push(event.type));

    store.contract.project.tasks[1] = "updated";
    expect(taskEvents).toEqual(["set"]);

    store.contract.project.tasks.push("extra");
    const deleteEvents = [];
    store.subscribe("project.tasks.2", (event) => deleteEvents.push(event.type));
    delete store.contract.project.tasks[2];
    expect(deleteEvents).toEqual(["delete"]);

    const contractEvents = [];
    store.subscribe("project.metadata.owner", (event) => contractEvents.push(event.type));
    delete store.contract.project.metadata.owner;
    expect(contractEvents).toEqual(["delete"]);

    const profileContract = new ProfileContract();
    profileContract.assign({
      profile: { firstName: "Ada", lastName: "Lovelace", bio: "Pioneer" },
    });
    const profileStore = createContractStore(profileContract);
    const bioEvents = [];
    profileStore.subscribe("profile.bio", (event) => bioEvents.push(event.type));
    delete profileStore.contract.profile.bio;
    expect(bioEvents).toEqual(["delete"]);
  });

  it("handles symbol keyed operations and method binding", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const assign = store.contract.assign;
    expect(typeof assign).toBe("function");
    assign({ project: { metadata: { owner: "Grace" } } });
    expect(store.getValue("project.metadata.owner")).toBe("Grace");

    const symbolKey = Symbol("custom");
    store.contract[symbolKey] = "root";
    expect(store.contract[symbolKey]).toBe("root");
    delete store.contract[symbolKey];
    expect(store.contract[symbolKey]).toBeUndefined();

    const metadata = store.contract.project.metadata;
    metadata[symbolKey] = "meta";
    expect(metadata[symbolKey]).toBe("meta");
    delete metadata[symbolKey];
    expect(metadata[symbolKey]).toBeUndefined();

    const tasks = store.contract.project.tasks;
    tasks[symbolKey] = "tag";
    expect(tasks[symbolKey]).toBe("tag");
    delete tasks[symbolKey];
    expect(tasks[symbolKey]).toBeUndefined();

    const listener = jest.fn();
    const unsubscribe = store.subscribe("project.metadata.owner", listener);
    unsubscribe();
    unsubscribe();
    store.contract.project.metadata.owner = "Ada";
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores deletions for missing properties across proxies", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    expect(delete store.contract.project.archived).toBe(true);

    const metadata = store.contract.project.metadata;
    expect(delete metadata.archived).toBe(true);

    const tasks = store.contract.project.tasks;
    expect(delete tasks[3]).toBe(true);
  });

  it("binds non mutating array methods and reuses cached proxies", () => {
    const contract = new ProjectContract();
    contract.assign({
      project: { tasks: ["initial", "todo"], metadata: { owner: "Ada" } },
    });
    const store = createContractStore(contract);

    const tasks = store.contract.project.tasks;
    const slice = tasks.slice;
    expect(slice()).toEqual(["initial", "todo"]);

    const map = store.contract.project.tasks.map;
    expect(map((entry) => entry)).toEqual(["initial", "todo"]);
    expect(store.contract.project.tasks).toBe(tasks);
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
    contract.assign({
      project: {},
    });
    const store = createContractStore(contract);

    const rootListener = jest.fn();
    const emptyKeyListener = jest.fn();

    store.subscribe(undefined, rootListener);
    store.subscribe("", emptyKeyListener);

    store.contract[""] = { placeholder: true };

    expect(rootListener).toHaveBeenCalledTimes(1);
    expect(emptyKeyListener).toHaveBeenCalledTimes(1);
  });

  it("skips instrumentation when setValueAtPath is not a function", () => {
    const contract = { assign: jest.fn(), isValid: jest.fn(), setValueAtPath: null };
    const store = createContractStore(contract);

    expect(store.contract.setValueAtPath).toBeNull();

    store.contract.placeholder = "value";
    expect(contract.placeholder).toBe("value");
  });

  it("does not emit updates when patched setValueAtPath targets a foreign object", () => {
    const assignValue = (target, segments, value) => {
      if (!segments.length) {
        return value;
      }
      const [head, ...rest] = segments;
      if (rest.length === 0) {
        target[head] = value;
        return value;
      }
      if (!target[head] || typeof target[head] !== "object") {
        target[head] = {};
      }
      return assignValue(target[head], rest, value);
    };

    const buildContract = () => {
      const base = {};
      base.assign = jest.fn();
      base.isValid = jest.fn();
      base.setValueAtPath = jest.fn((segments, value, target = base) =>
        assignValue(target, segments, value),
      );
      return base;
    };

    const contract = buildContract();
    const store = createContractStore(contract);
    const listener = jest.fn();
    store.subscribe("field", listener);

    const foreignTarget = {};
    contract.setValueAtPath(["field"], "external", foreignTarget);

    expect(foreignTarget.field).toBe("external");
    expect(contract.field).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    contract.setValueAtPath(["field"], "internal");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getValue("field")).toBe("internal");
  });
});
