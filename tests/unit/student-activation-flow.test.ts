// @vitest-environment node
import { describe, expect, it } from "vitest";
import { issueActivationCode } from "../../apps/product-web/src/server/student-credential-crypto";
import * as activation from "../../apps/product-web/src/server/student-activation-flow";

describe("one-time Student activation", () => {
  it("allows only one concurrent consumer and binds before setting a PIN", async () => {
    expect(activation).toHaveProperty("activateStudent");
    const issued = await issueActivationCode();
    let used = false;
    const events: string[] = [];
    const port = {
      attempt: async () => true,
      lookup: async () => ({
        student_id: "student",
        activation_hash: issued.hash,
      }),
      failure: async () => {},
      claim: async () => {
        if (used) return null;
        used = true;
        return {
          student_id: "student",
          auth_user_id: "auth",
          auth_identifier: "private@students.ranza.invalid",
          claim: "claim",
        };
      },
      ensureIdentity: async () => {
        events.push("identity");
      },
      bind: async () => {
        events.push("bind");
        return true;
      },
      setPassword: async () => {
        events.push("pin");
      },
      signIn: async () => {
        events.push("session");
      },
      abandon: async () => {},
    };
    const input = {
      accessId: "ID",
      code: issued.code,
      pin: "123456",
      network: "shared",
    };
    const results = await Promise.all([
      activation.activateStudent(port, input, "p".repeat(64)),
      activation.activateStudent(port, input, "p".repeat(64)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(events).toEqual(["identity", "bind", "pin", "session"]);
  });
  it("returns the same failure for unknown, invalid, expired and rate-limited attempts", async () => {
    const issued = await issueActivationCode();
    let failures = 0;
    const port = {
      attempt: async () => true,
      lookup: async () => null,
      failure: async () => {
        failures++;
      },
      claim: async () => null,
      ensureIdentity: async () => {
        throw new Error("must not create identity");
      },
      bind: async () => false,
      setPassword: async () => {},
      signIn: async () => {},
      abandon: async () => {},
    };
    const input = {
      accessId: "unknown",
      code: issued.code,
      pin: "123456",
      network: "shared",
    };
    expect(await activation.activateStudent(port, input, "p".repeat(64))).toBe(
      false,
    );
    expect(
      await activation.activateStudent(
        {
          ...port,
          lookup: async () => ({
            student_id: "a",
            activation_hash: issued.hash,
          }),
        },
        { ...input, code: "invalid" },
        "p".repeat(64),
      ),
    ).toBe(false);
    expect(
      await activation.activateStudent(
        { ...port, attempt: async () => false },
        input,
        "p".repeat(64),
      ),
    ).toBe(false);
    expect(failures).toBe(2);
  });
  it("never sets a PIN if the final binding was rejected", async () => {
    const issued = await issueActivationCode();
    let passwordWrites = 0;
    let abandoned = false;
    const port = {
      attempt: async () => true,
      lookup: async () => ({ student_id: "a", activation_hash: issued.hash }),
      failure: async () => {},
      claim: async () => ({
        student_id: "a",
        auth_user_id: "auth",
        auth_identifier: "private",
        claim: "claim",
      }),
      ensureIdentity: async () => {},
      bind: async () => false,
      setPassword: async () => {
        passwordWrites++;
      },
      signIn: async () => {},
      abandon: async () => {
        abandoned = true;
      },
    };
    expect(
      await activation.activateStudent(
        port,
        { accessId: "a", code: issued.code, pin: "123456", network: "shared" },
        "p".repeat(64),
      ),
    ).toBe(false);
    expect(passwordWrites).toBe(0);
    expect(abandoned).toBe(true);
  });
});
