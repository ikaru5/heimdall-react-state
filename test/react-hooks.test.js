import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer from "react-test-renderer";

import { createContractStore } from "../src/createContractStore.js";
import { useContract, useContractSelector, useContractValue } from "../src/hooks.js";

const { act } = TestRenderer;

class TestContract {
  constructor(initial = {}) {
    this.schema = {};
    this.assign(initial);
  }

  assign(update = {}) {
    Object.keys(update).forEach((key) => {
      this[key] = update[key];
    });
    return this;
  }

  setValueAtPath(path, value, object = this) {
    if (!Array.isArray(path)) {
      throw new TypeError("path must be an array");
    }
    if (path.length === 0) {
      throw new Error("path must not be empty");
    }
    const [segment, ...rest] = path;
    if (rest.length === 0) {
      object[segment] = value;
      return value;
    }
    if (object[segment] === undefined || object[segment] === null) {
      object[segment] = {};
    }
    return this.setValueAtPath(rest, value, object[segment]);
  }

  isValid() {
    return true;
  }
}

test("useContractValue re-renders only the subscribed component", async () => {
  const contract = new TestContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace"
    }
  });
  const store = createContractStore(contract);

  const renders = {
    first: [],
    last: []
  };

  function FirstName() {
    const value = useContractValue(store, "profile.firstName");
    renders.first.push(value);
    return React.createElement("span", null, value);
  }

  function LastName() {
    const value = useContractValue(store, "profile.lastName");
    renders.last.push(value);
    return React.createElement("span", null, value);
  }

  function App() {
    return React.createElement(React.Fragment, null, React.createElement(FirstName), React.createElement(LastName));
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(App));
  });

  assert.deepEqual(renders.first, ["Ada"]);
  assert.deepEqual(renders.last, ["Lovelace"]);

  await act(() => {
    store.contract.profile.firstName = "Ada";
  });
  assert.deepEqual(renders.first, ["Ada"]);
  assert.deepEqual(renders.last, ["Lovelace"]);

  await act(() => {
    store.contract.profile.firstName = "Grace";
  });
  assert.deepEqual(renders.first, ["Ada", "Grace"]);
  assert.deepEqual(renders.last, ["Lovelace"]);

  await act(() => {
    store.contract.profile.lastName = "Hopper";
  });
  assert.deepEqual(renders.first, ["Ada", "Grace"]);
  assert.deepEqual(renders.last, ["Lovelace", "Hopper"]);

  await act(() => {
    renderer.unmount();
  });
});

test("useContractValue tracks nested contract segments", async () => {
  const nested = new TestContract({
    city: "Paris",
    zip: "75000"
  });
  const contract = new TestContract({
    address: nested,
    country: "FR"
  });
  const store = createContractStore(contract);

  const seenCities = [];

  function City() {
    const city = useContractValue(store, "address.city");
    seenCities.push(city);
    return React.createElement("span", null, city);
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(City));
  });

  assert.deepEqual(seenCities, ["Paris"]);

  await act(() => {
    store.contract.address.city = "Paris";
  });
  assert.deepEqual(seenCities, ["Paris"]);

  await act(() => {
    store.contract.address.city = "Berlin";
  });
  assert.deepEqual(seenCities, ["Paris", "Berlin"]);

  await act(() => {
    store.contract.country = "DE";
  });
  assert.deepEqual(seenCities, ["Paris", "Berlin"]);

  await act(() => {
    renderer.unmount();
  });
});

test("useContractSelector recomputes derived data", async () => {
  const contract = new TestContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace"
    }
  });
  const store = createContractStore(contract);

  const selections = [];

  function FullName() {
    const fullName = useContractSelector(
      store,
      (current) => `${current.profile.firstName} ${current.profile.lastName}`
    );
    selections.push(fullName);
    return React.createElement("span", null, fullName);
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(FullName));
  });

  assert.deepEqual(selections, ["Ada Lovelace"]);

  await act(() => {
    store.contract.profile.firstName = "Grace";
  });
  assert.deepEqual(selections, ["Ada Lovelace", "Grace Lovelace"]);

  await act(() => {
    store.contract.profile.lastName = "Hopper";
  });
  assert.deepEqual(selections, ["Ada Lovelace", "Grace Lovelace", "Grace Hopper"]);

  await act(() => {
    renderer.unmount();
  });
});

test("useContract provides a live contract reference", async () => {
  const contract = new TestContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace"
    }
  });
  const store = createContractStore(contract);

  const observed = [];

  function Consumer() {
    const current = useContract(store);
    observed.push(current.profile.firstName);
    return React.createElement("span", null, current.profile.firstName);
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(Consumer));
  });

  assert.deepEqual(observed, ["Ada"]);

  await act(() => {
    store.setValue("profile.firstName", "Grace");
  });
  assert.deepEqual(observed, ["Ada", "Grace"]);

  await act(() => {
    store.contract.profile.firstName = "Katherine";
  });
  assert.deepEqual(observed, ["Ada", "Grace", "Katherine"]);

  await act(() => {
    renderer.unmount();
  });
});
