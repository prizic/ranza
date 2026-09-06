// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  signInStudent,
  type StudentSignInPort,
} from "../../apps/product-web/src/server/student-signin-flow";

function fixture() {
  const audit: unknown[] = [];
  const identity = {
    student_id: "student",
    auth_user_id: "auth",
    auth_identifier: "private@students.ranza.invalid",
  };
  const port: StudentSignInPort = {
    attempt: async () => true,
    lookup: async () => identity,
    authenticate: async (_email, password) =>
      password.startsWith("pin-v1.") ? "auth" : null,
    accept: async () => true,
    failure: async () => {},
    signOut: async () => {},
    audit: async (event) => {
      audit.push(event);
    },
  };
  return { port, audit };
}
const input = { accessId: " ID ", pin: "123456", network: "127.0.0.1" };
describe("Student return sign-in", () => {
  it("establishes only the expected identity using a derived credential", async () => {
    const { port } = fixture();
    expect(
      await signInStudent(port, input, "p".repeat(64), "correlation"),
    ).toBe(true);
    expect(
      await signInStudent(
        { ...port, authenticate: async () => "other-user" },
        input,
        "p".repeat(64),
        "correlation",
      ),
    ).toBe(false);
  });
  it("returns one generic result for absent, wrong, locked and revoked credentials", async () => {
    const { port } = fixture();
    for (const override of [
      { lookup: async () => null },
      { authenticate: async () => null },
      { attempt: async () => false },
      { accept: async () => false },
    ])
      expect(
        await signInStudent(
          { ...port, ...override },
          input,
          "p".repeat(64),
          "correlation",
        ),
      ).toBe(false);
  });
  it("redacts upstream secrets from correlated telemetry and cleans up a rejected session", async () => {
    const { port, audit } = fixture();
    let signedOut = false;
    expect(
      await signInStudent(
        {
          ...port,
          accept: async () => {
            throw new Error("123456 secret-token");
          },
          signOut: async () => {
            signedOut = true;
          },
        },
        input,
        "p".repeat(64),
        "correlation",
      ),
    ).toBe(false);
    expect(signedOut).toBe(true);
    expect(audit).toEqual([
      {
        correlationId: "correlation",
        action: "student.sign_in",
        result: "denied",
      },
    ]);
  });
});
