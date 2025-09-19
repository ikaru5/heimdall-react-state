import Contract from "@ikaru5/heimdall-contract";

export class ProfileContract extends Contract {
  defineSchema() {
    return {
      profile: {
        dType: "Contract",
        contract: {
          firstName: { dType: "String" },
          lastName: { dType: "String" },
          bio: { dType: "String" },
        },
      },
    };
  }
}

export class AddressContract extends Contract {
  defineSchema() {
    return {
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
  }
}

export class ProjectContract extends Contract {
  defineSchema() {
    return {
      project: {
        dType: "Contract",
        contract: {
          tasks: { dType: "Array", arrayOf: "Generic" },
          metadata: { dType: "Generic" },
        },
      },
    };
  }
}
