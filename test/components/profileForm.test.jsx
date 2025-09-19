import React from "react";
import { act } from "react";
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";

import { createContractStore } from "../../src/createContractStore.js";
import { useContract, useContractSelector, useContractValue } from "../../src/hooks.js";
import { createProfileContract } from "../helpers/contracts.js";

function ProfileField({ store, label, path, testId }) {
  const value = useContractValue(store, path);
  return (
    <label data-testid={`${testId}-label`}>
      {label}: <span data-testid={testId}>{value}</span>
    </label>
  );
}

function ProfileSummary({ store }) {
  const summary = useContractSelector(
    store,
    (current) => `${current.profile.firstName} ${current.profile.lastName}`,
  );
  return (
    <p aria-label="Profile summary" data-testid="profile-summary">
      {summary}
    </p>
  );
}

function BiographyEditor({ store }) {
  const contract = useContract(store);
  return (
    <textarea
      aria-label="Biography"
      value={contract.profile.bio}
      onChange={(event) => {
        contract.profile.bio = event.target.value;
      }}
    />
  );
}

function ProfileForm({ store }) {
  return (
    <section>
      <ProfileField store={store} label="First name" path="profile.firstName" testId="first-name" />
      <ProfileField store={store} label="Last name" path="profile.lastName" testId="last-name" />
      <BiographyEditor store={store} />
      <ProfileSummary store={store} />
    </section>
  );
}

describe("ProfileForm component", () => {
  it("renders contract values and responds to store updates", async () => {
    const contract = createProfileContract({
      profile: {
        firstName: "Ada",
        lastName: "Lovelace",
        bio: "Pioneer of computer programming.",
      },
    });
    const store = createContractStore(contract);

    render(<ProfileForm store={store} />);

    expect(screen.getByTestId("first-name")).toHaveTextContent("Ada");
    expect(screen.getByTestId("last-name")).toHaveTextContent("Lovelace");
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("Ada Lovelace");

    await act(async () => {
      store.contract.profile.firstName = "Grace";
    });
    expect(screen.getByTestId("first-name")).toHaveTextContent("Grace");
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("Grace Lovelace");

    await act(async () => {
      store.contract.profile.lastName = "Hopper";
    });
    expect(screen.getByTestId("last-name")).toHaveTextContent("Hopper");
    expect(screen.getByTestId("profile-summary")).toHaveTextContent("Grace Hopper");
  });

  it("updates the contract when editing fields", () => {
    const contract = createProfileContract({
      profile: {
        firstName: "Ada",
        lastName: "Lovelace",
        bio: "Pioneer of computer programming.",
      },
    });
    const store = createContractStore(contract);

    render(<ProfileForm store={store} />);

    const bioField = screen.getByLabelText("Biography");
    fireEvent.change(bioField, { target: { value: "Developed the first computer algorithm." } });

    expect(bioField).toHaveValue("Developed the first computer algorithm.");
    expect(store.getValue("profile.bio")).toBe("Developed the first computer algorithm.");
  });
});
