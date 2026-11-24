import { describe, expect, it } from "vitest";
import { validateProductionSecrets } from "./env";

describe("validateProductionSecrets", () => {
  it("fails closed in production and names missing variables without printing values", () => {
    const secret = "must-not-appear-in-the-error";
    expect(() =>
      validateProductionSecrets({ NODE_ENV: "production", PIN_PEPPER: secret, SETUP_CODE: "   " }),
    ).toThrowError(/SETUP_CODE/);

    try {
      validateProductionSecrets({ NODE_ENV: "production", PIN_PEPPER: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("requires both production secrets", () => {
    expect(() => validateProductionSecrets({ NODE_ENV: "production" })).toThrowError(/PIN_PEPPER, SETUP_CODE/);
    expect(() =>
      validateProductionSecrets({ NODE_ENV: "production", PIN_PEPPER: "pepper", SETUP_CODE: "12345678" }),
    ).not.toThrow();
  });

  it("does not impose production requirements on tests or development", () => {
    expect(() => validateProductionSecrets({ NODE_ENV: "test" })).not.toThrow();
    expect(() => validateProductionSecrets({ NODE_ENV: "development" })).not.toThrow();
  });
});
