import Contract from "@ikaru5/heimdall-contract";

export const PROFILE_SCHEMA = {
  profile: {
    dType: "Contract",
    contract: {
      firstName: { dType: "String" },
      lastName: { dType: "String" },
      bio: { dType: "String" },
    },
  },
};

export const ADDRESS_SCHEMA = {
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

export const PROJECT_SCHEMA = {
  project: {
    dType: "Contract",
    contract: {
      tasks: { dType: "Array", arrayOf: "Generic" },
      metadata: { dType: "Generic" },
    },
  },
};

export function createContractInstance(schema, initial = {}) {
  const contract = new Contract({ schema });
  contract.assign(initial);
  return contract;
}

export const createProfileContract = (initial = {}) =>
  createContractInstance(PROFILE_SCHEMA, initial);

export const createAddressContract = (initial = {}) =>
  createContractInstance(ADDRESS_SCHEMA, initial);

export const createProjectContract = (initial = {}) =>
  createContractInstance(PROJECT_SCHEMA, initial);
