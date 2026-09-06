import { describe, expect, it } from "vitest";

import {
  StudentCsvParseError,
  createStudentImportKey,
  parseStudentCsv,
  studentCsvTemplate,
} from "../../packages/domain/src/index";

describe("Student CSV import", () => {
  it("documents a UTF-8 template and normalizes quoted multilingual rows", async () => {
    expect(studentCsvTemplate).toBe(
      "external_reference,display_name,preferred_locale\r\n" +
        'STU-001,"Ayşe Kaya",tr\r\n',
    );

    const preview = parseStudentCsv(
      '\ufeffexternal_reference,display_name,preferred_locale\r\nSTU-1," Kaya, Ayşe ",TR\r\nSTU-2,"\u0644\u064a\u0646\u0627\n\u0639\u0644\u064a",ar\r\n',
    );

    expect(preview).toEqual({
      errorCount: 0,
      rows: [
        {
          draft: {
            displayName: "Kaya, Ayşe",
            externalReference: "STU-1",
            preferredLocale: "tr",
          },
          errors: [],
          rowNumber: 2,
          values: {
            displayName: "Kaya, Ayşe",
            externalReference: "STU-1",
            preferredLocale: "tr",
          },
        },
        {
          draft: {
            displayName: "\u0644\u064a\u0646\u0627\n\u0639\u0644\u064a",
            externalReference: "STU-2",
            preferredLocale: "ar",
          },
          errors: [],
          rowNumber: 3,
          values: {
            displayName: "\u0644\u064a\u0646\u0627\n\u0639\u0644\u064a",
            externalReference: "STU-2",
            preferredLocale: "ar",
          },
        },
      ],
      validCount: 2,
    });

    await expect(
      createStudentImportKey("operator-1", "branch-1", studentCsvTemplate),
    ).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(
      createStudentImportKey("operator-1", "branch-1", studentCsvTemplate),
    ).resolves.toBe(
      await createStudentImportKey(
        "operator-1",
        "branch-1",
        studentCsvTemplate,
      ),
    );
  });

  it("reports row-specific field, column, and in-file duplicate errors", () => {
    const preview = parseStudentCsv(
      "external_reference,display_name,preferred_locale\n" +
        "S-1,A,tr\n" +
        "S-1,Valid Name,en\n" +
        ",Another Name,xx\n" +
        "S-4,Too,Many,Columns\n",
    );

    expect(preview.validCount).toBe(0);
    expect(preview.errorCount).toBe(6);
    expect(
      preview.rows.map((row) => row.errors.map((error) => error.code)),
    ).toEqual([
      ["INVALID_DISPLAY_NAME", "DUPLICATE_EXTERNAL_REFERENCE"],
      ["DUPLICATE_EXTERNAL_REFERENCE"],
      ["MISSING_EXTERNAL_REFERENCE", "INVALID_LOCALE"],
      ["INVALID_COLUMN_COUNT"],
    ]);
  });

  it("rejects malformed, wrongly headed, replacement-character, and oversized files", () => {
    expect(() => parseStudentCsv("name,locale\nAyşe,tr\n")).toThrow(/headers/i);
    expect(() =>
      parseStudentCsv(
        'external_reference,display_name,preferred_locale\nS-1,"Ayşe,tr\n',
      ),
    ).toThrow(/quoted field/i);
    expect(() =>
      parseStudentCsv(
        "external_reference,display_name,preferred_locale\nS-1,A�şe,tr\n",
      ),
    ).toThrow(/UTF-8/i);
    expect(() =>
      parseStudentCsv(
        "external_reference,display_name,preferred_locale\nS-1,Ayşe,tr\nS-2,Ece,tr\n",
        { maxRows: 1 },
      ),
    ).toThrow(StudentCsvParseError);
  });
});
