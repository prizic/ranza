// @vitest-environment node
import { expect, it } from "vitest";

import * as activation from "../../apps/product-web/src/server/student-activation-flow";
import { verifyActivationCode } from "../../apps/product-web/src/server/student-credential-crypto";

it("generates the one-time code inside the server issuance boundary", async () => {
  const issue = (
    activation as typeof activation & {
      issueStudentCredential?: (
        port: {
          install: (input: {
            actorId: string;
            codeHash: string;
            operation: "issue" | "recover";
            studentId: string;
          }) => Promise<{ access_id: string } | null>;
        },
        input: {
          actorId: string;
          operation: "issue" | "recover";
          studentId: string;
        },
      ) => Promise<{ accessId: string; code: string } | null>;
    }
  ).issueStudentCredential;
  expect(issue).toBeTypeOf("function");
  if (!issue) return;

  let installedHash = "";
  const result = await issue(
    {
      install: async (input) => {
        expect(input).toMatchObject({
          actorId: "actor-1",
          operation: "recover",
          studentId: "student-1",
        });
        installedHash = input.codeHash;
        return { access_id: "access-1" };
      },
    },
    { actorId: "actor-1", operation: "recover", studentId: "student-1" },
  );

  expect(result?.accessId).toBe("access-1");
  expect(result?.code).toMatch(/^(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  await expect(
    verifyActivationCode(result?.code ?? "", installedHash),
  ).resolves.toBe(true);
});
