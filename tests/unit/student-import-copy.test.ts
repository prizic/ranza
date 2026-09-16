import { describe, expect, it } from "vitest";

import {
  importErrorLabel,
  importStatusLabel,
  studentImportCopy,
} from "../../apps/product-web/src/lib/student-import-copy";

describe("Student roster import copy", () => {
  it.each(["tr", "en", "ar"] as const)(
    "localizes every visible import state in %s",
    (locale) => {
      const copy = studentImportCopy[locale];
      expect(copy.fileLabel).toBeTruthy();
      expect(copy.selectRow).toBeTruthy();
      expect(copy.reference.toLowerCase()).not.toContain("access id");
      for (const status of [
        "cancelled",
        "committed",
        "failed",
        "importing",
        "staged",
      ] as const) {
        expect(importStatusLabel(locale, status)).not.toBe(status);
      }
      for (const code of [
        "DUPLICATE_EXTERNAL_REFERENCE",
        "EXISTING_EXTERNAL_REFERENCE",
        "INVALID_COLUMN_COUNT",
        "INVALID_DISPLAY_NAME",
        "INVALID_EXTERNAL_REFERENCE",
        "INVALID_LOCALE",
        "INVALID_ROW_NUMBER",
        "MISSING_DISPLAY_NAME",
        "MISSING_EXTERNAL_REFERENCE",
      ]) {
        expect(importErrorLabel(locale, code)).not.toBe(code);
      }
    },
  );

  it("does not expose an unknown internal code verbatim", () => {
    expect(importErrorLabel("en", "DATABASE_INTERNAL_DETAIL")).toBe(
      "This row could not be validated.",
    );
  });
});
