import { describe, expect, it } from "vitest";
import * as domain from "../../packages/domain/src/index";

describe("Student roster input", () => {
  it("normalizes allowed roster fields without accepting identity fields", () => {
    expect(domain).toHaveProperty("parseStudentDraft");
    expect(
      domain.parseStudentDraft({
        displayName: "  Ayşe Kaya ",
        preferredLocale: "tr",
        externalReference: " A-42 ",
        authUserId: "forged",
      }),
    ).toEqual({
      displayName: "Ayşe Kaya",
      preferredLocale: "tr",
      externalReference: "A-42",
    });
  });
});
