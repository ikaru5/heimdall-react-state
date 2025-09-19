import assert from "node:assert/strict";
import test from "node:test";
import Contract from "@ikaru5/heimdall-contract";
import React from "react";
import TestRenderer from "react-test-renderer";

import { createContractStore } from "../src/createContractStore.js";
import { useContract, useContractSelector, useContractValue } from "../src/hooks.js";

const { act } = TestRenderer;

const PROFILE_SCHEMA = {
  profile: {
    dType: "Contract",
    contract: {
      firstName: { dType: "String" },
      lastName: { dType: "String" },
      bio: { dType: "String" },
    },
  },
};

const ADDRESS_SCHEMA = {
  address: {
    dType: "Contract",
    contract: {
      street: { dType: "String" },
      city: { dType: "String" },
      zip: { dType: "String" },
    },
  },
  country: { dType: "String" },
};

function createContractInstance(schema, initial = {}) {
  const contract = new Contract({ schema });
  contract.assign(initial);
  return contract;
}

const createProfileContract = (initial = {}) => createContractInstance(PROFILE_SCHEMA, initial);
const createAddressContract = (initial = {}) => createContractInstance(ADDRESS_SCHEMA, initial);

test("profile form rerenders only impacted components", async () => {
  const contract = createProfileContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
      bio: "Pioneer of computer programming.",
    },
  });
  const store = createContractStore(contract);

  const renderLog = {
    firstName: [],
    lastName: [],
    summary: [],
  };

  const ProfileField = React.memo(function ProfileField({ label, path, logKey }) {
    const value = useContractValue(store, path);
    renderLog[logKey].push(value);
    return React.createElement(
      "label",
      { className: "field" },
      `${label}: `,
      React.createElement("span", { className: "field__value" }, value),
    );
  });

  const ProfileSummary = React.memo(function ProfileSummary() {
    const summary = useContractSelector(
      store,
      (current) => `${current.profile.firstName} ${current.profile.lastName}`,
    );
    renderLog.summary.push(summary);
    return React.createElement("p", { className: "summary" }, summary);
  });

  function ProfileForm() {
    return React.createElement(
      "section",
      { className: "profile" },
      React.createElement(ProfileField, {
        key: "first",
        label: "First name",
        path: "profile.firstName",
        logKey: "firstName",
      }),
      React.createElement(ProfileField, {
        key: "last",
        label: "Last name",
        path: "profile.lastName",
        logKey: "lastName",
      }),
      React.createElement(ProfileSummary, { key: "summary" }),
    );
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(ProfileForm));
  });

  assert.deepEqual(renderLog.firstName, ["Ada"]);
  assert.deepEqual(renderLog.lastName, ["Lovelace"]);
  assert.deepEqual(renderLog.summary, ["Ada Lovelace"]);

  await act(() => {
    store.contract.profile.firstName = "Ada";
  });
  assert.deepEqual(renderLog.firstName, ["Ada"]);
  assert.deepEqual(renderLog.lastName, ["Lovelace"]);
  assert.deepEqual(renderLog.summary, ["Ada Lovelace"]);

  await act(() => {
    store.contract.profile.firstName = "Grace";
  });
  assert.deepEqual(renderLog.firstName, ["Ada", "Grace"]);
  assert.deepEqual(renderLog.lastName, ["Lovelace"]);
  assert.deepEqual(renderLog.summary, ["Ada Lovelace", "Grace Lovelace"]);

  await act(() => {
    store.contract.profile.lastName = "Hopper";
  });
  assert.deepEqual(renderLog.firstName, ["Ada", "Grace"]);
  assert.deepEqual(renderLog.lastName, ["Lovelace", "Hopper"]);
  assert.deepEqual(renderLog.summary, ["Ada Lovelace", "Grace Lovelace", "Grace Hopper"]);

  await act(() => {
    renderer.unmount();
  });
});

test("nested contract subscribers receive only relevant updates", async () => {
  const contract = createAddressContract({
    address: {
      street: "42 Rue de Something",
      city: "Paris",
      zip: "75000",
    },
    country: "FR",
  });
  const store = createContractStore(contract);

  const renderLog = {
    street: [],
    city: [],
    zip: [],
  };

  const AddressLine = React.memo(function AddressLine({ path, logKey }) {
    const value = useContractValue(store, path);
    renderLog[logKey].push(value);
    return React.createElement("span", { className: `address__${logKey}` }, value);
  });

  function AddressCard() {
    return React.createElement(
      "article",
      { className: "address-card" },
      React.createElement(AddressLine, { key: "street", path: "address.street", logKey: "street" }),
      React.createElement(AddressLine, { key: "city", path: "address.city", logKey: "city" }),
      React.createElement(AddressLine, { key: "zip", path: "address.zip", logKey: "zip" }),
    );
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(AddressCard));
  });

  assert.deepEqual(renderLog.street, ["42 Rue de Something"]);
  assert.deepEqual(renderLog.city, ["Paris"]);
  assert.deepEqual(renderLog.zip, ["75000"]);

  await act(() => {
    store.contract.address.city = "Berlin";
  });
  assert.deepEqual(renderLog.street, ["42 Rue de Something"]);
  assert.deepEqual(renderLog.city, ["Paris", "Berlin"]);
  assert.deepEqual(renderLog.zip, ["75000"]);

  await act(() => {
    store.contract.country = "DE";
  });
  assert.deepEqual(renderLog.street, ["42 Rue de Something"]);
  assert.deepEqual(renderLog.city, ["Paris", "Berlin"]);
  assert.deepEqual(renderLog.zip, ["75000"]);

  await act(() => {
    store.contract.address.zip = "10115";
  });
  assert.deepEqual(renderLog.street, ["42 Rue de Something"]);
  assert.deepEqual(renderLog.city, ["Paris", "Berlin"]);
  assert.deepEqual(renderLog.zip, ["75000", "10115"]);

  await act(() => {
    renderer.unmount();
  });
});

test("selectors support custom equality checks to avoid unnecessary renders", async () => {
  const contract = createProfileContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
      bio: "Pioneer of computer programming.",
    },
  });
  const store = createContractStore(contract);

  const selections = [];

  const caseInsensitiveEquality = (prev, next) => prev.toLowerCase() === next.toLowerCase();

  function PreferredName() {
    const selection = useContractSelector(
      store,
      (current) => current.profile.firstName,
      { equalityFn: caseInsensitiveEquality },
    );
    selections.push(selection);
    return React.createElement("strong", null, selection);
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(PreferredName));
  });

  assert.deepEqual(selections, ["Ada"]);

  await act(() => {
    store.contract.profile.lastName = "Byron";
  });
  assert.deepEqual(selections, ["Ada"]);

  await act(() => {
    store.contract.profile.firstName = "ADA";
  });
  assert.deepEqual(selections, ["Ada"]);

  await act(() => {
    store.contract.profile.firstName = "Grace";
  });
  assert.deepEqual(selections, ["Ada", "Grace"]);

  await act(() => {
    renderer.unmount();
  });
});

test("useContract returns a live contract reference", async () => {
  const contract = createProfileContract({
    profile: {
      firstName: "Ada",
      lastName: "Lovelace",
      bio: "Pioneer of computer programming.",
    },
  });
  const store = createContractStore(contract);

  const observed = [];

  function Biography() {
    const current = useContract(store);
    observed.push(current.profile.bio);
    return React.createElement("p", null, current.profile.bio);
  }

  let renderer;
  await act(() => {
    renderer = TestRenderer.create(React.createElement(Biography));
  });

  assert.deepEqual(observed, ["Pioneer of computer programming."]);

  await act(() => {
    store.setValue("profile.bio", "Developed the first computer algorithm.");
  });
  assert.deepEqual(observed, [
    "Pioneer of computer programming.",
    "Developed the first computer algorithm.",
  ]);

  await act(() => {
    store.contract.profile.bio = "Rear Admiral and computer scientist.";
  });
  assert.deepEqual(observed, [
    "Pioneer of computer programming.",
    "Developed the first computer algorithm.",
    "Rear Admiral and computer scientist.",
  ]);

  await act(() => {
    renderer.unmount();
  });
});
