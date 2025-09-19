import assert from "node:assert/strict";
import test from "node:test";
import Contract from "@ikaru5/heimdall-contract";
import React from "react";
import TestRenderer from "react-test-renderer";

import { createContractStore } from "../src/createContractStore.js";
import { useContract, useContractSelector, useContractValue } from "../src/hooks.js";

const { act } = TestRenderer;

function createContractInstance(schema, initial = {}) {
  const contract = new Contract({ schema });
  contract.assign(initial);
  return contract;
}

const PROFILE_SCHEMA = {
  profile: {
    dType: "Contract",
    contract: {
      firstName: { dType: "String" },
      lastName: { dType: "String" },
    },
  },
};

const ADDRESS_SCHEMA = {
  address: {
    dType: "Contract",
    contract: {
      city: { dType: "String" },
      zip: { dType: "String" },
    },
  },
  country: { dType: "String" },
};

const createProfileContract = (initial = {}) =>
  createContractInstance(PROFILE_SCHEMA, initial);

const createAddressContract = (initial = {}) =>
  createContractInstance(ADDRESS_SCHEMA, initial);

test("useContractValue re-renders only the subscribed component", async () => {
  const contract = createProfileContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
    },
  });
  const store = createContractStore(contract);

  const renders = {
    first: [],
    last: [],
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
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(FirstName),
      React.createElement(LastName),
    );
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
  const contract = createAddressContract({
    address: {
      city: "Paris",
      zip: "75000",
    },
    country: "FR",
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
  const contract = createProfileContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
    },
  });
  const store = createContractStore(contract);

  const selections = [];

  function FullName() {
    const fullName = useContractSelector(
      store,
      (current) => `${current.profile.firstName} ${current.profile.lastName}`,
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
  const contract = createProfileContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
    },
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
