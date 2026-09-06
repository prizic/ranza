import { describe, expect, it } from "vitest";

import { verifySchedulerRequest } from "../../apps/product-web/src/server/scheduler-auth";

const secret = "a-secure-scheduler-secret-with-32-characters";

describe("scheduled route authentication", () => {
  it("accepts only the configured bearer secret", () => {
    expect(
      verifySchedulerRequest(
        new Headers({ authorization: `Bearer ${secret}` }),
        secret,
      ),
    ).toBe(true);
    expect(
      verifySchedulerRequest(
        new Headers({ authorization: "Bearer incorrect" }),
        secret,
      ),
    ).toBe(false);
    expect(verifySchedulerRequest(new Headers(), secret)).toBe(false);
  });

  it("fails closed for an unsafe server configuration", () => {
    expect(
      verifySchedulerRequest(
        new Headers({ authorization: "Bearer short" }),
        "short",
      ),
    ).toBe(false);
  });
});
