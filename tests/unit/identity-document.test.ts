/**
 * The identity document's rule, in the two places that restate it (PA-S2-*).
 *
 * `@ranza/guests` is the rule the module applies before the database does, and
 * the workspace's `lib/identity-document.ts` is the same rule for a client
 * component, which may not import a module (ADR 0007). A restated rule drifts,
 * so this asserts them against each other over numbers either side of every
 * boundary, and against the numbers the database itself accepts and refuses
 * (tests/database/guest_identity_document.test.sql).
 */
import { describe, expect, it } from "vitest";
import {
  GUEST_DOCUMENT_TYPES,
  GUEST_PARTICULARS,
  isTcKimlik,
  normalizeDocumentNumber,
} from "../../packages/ranza/guests/src";
import {
  COUNTRY_CODES,
  countryName,
  countryOptions,
  isCountryCode,
} from "../../apps/operator-workspace/src/lib/countries";
import {
  DOCUMENT_NUMBER,
  DOCUMENT_TYPES,
  documentNumberProblem,
  maskedDocumentNumber,
  normalizeDocumentNumber as clientNormalize,
} from "../../apps/operator-workspace/src/lib/identity-document";

const TC_VALID = ["10000000146", "11111111110"];
const TC_INVALID = [
  "10000000147",
  "10000000156",
  "00000000000",
  "1000000014",
  "100000001460",
  "1000000014A",
  "",
];

describe("the T.C. kimlik checksum", () => {
  it("accepts numbers whose two check digits follow from the first nine", () => {
    for (const number of TC_VALID) {
      expect(isTcKimlik(number), number).toBe(true);
      expect(documentNumberProblem("tc_kimlik", number), number).toBeNull();
    }
  });

  it("refuses a wrong digit, a leading zero, the wrong length and a letter, in both places", () => {
    for (const number of TC_INVALID.filter((n) => n !== "")) {
      expect(isTcKimlik(number), number).toBe(false);
      expect(documentNumberProblem("tc_kimlik", number), number).toBe(
        "tcKimlik",
      );
    }
  });

  it("agrees with itself on every change of the last two digits of a valid number", () => {
    const base = "100000001";
    for (let tenth = 0; tenth < 10; tenth++) {
      for (let eleventh = 0; eleventh < 10; eleventh++) {
        const number = `${base}${tenth}${eleventh}`;
        expect(documentNumberProblem("tc_kimlik", number) === null).toBe(
          isTcKimlik(number),
        );
      }
    }
    const valid = Array.from(
      { length: 100 },
      (_, n) => `${base}${Math.floor(n / 10)}${n % 10}`,
    ).filter(isTcKimlik);
    expect(valid).toEqual(["10000000146"]);
  });
});

describe("a document number that is not a T.C. kimlik", () => {
  it("is six to twenty letters and digits, the same either side of each bound", () => {
    expect(DOCUMENT_NUMBER.min).toBe(GUEST_PARTICULARS.documentNumber.min);
    expect(DOCUMENT_NUMBER.max).toBe(GUEST_PARTICULARS.documentNumber.max);
    const { min, max } = DOCUMENT_NUMBER;
    for (const [number, ok] of [
      ["A".repeat(min - 1), false],
      ["A".repeat(min), true],
      ["A".repeat(max), true],
      ["A".repeat(max + 1), false],
      ["AB-1234", true],
      ["ab 1234 56", true],
      ["AB#12345", false],
    ] as const) {
      expect(documentNumberProblem("passport", number) === null, number).toBe(
        ok,
      );
    }
  });

  it("is normalized the same way, spaces and hyphens out and upper case", () => {
    for (const typed of ["ab 12-34 56", " u1234567 ", "100 000 001 46"]) {
      expect(clientNormalize(typed)).toBe(normalizeDocumentNumber(typed));
    }
    expect(normalizeDocumentNumber("ab 12-34 56")).toBe("AB123456");
  });

  it("is nothing typed when empty, and wants a kind when it is not", () => {
    expect(documentNumberProblem("", "")).toBeNull();
    expect(documentNumberProblem("passport", "  ")).toBeNull();
    expect(documentNumberProblem("", "U1234567")).toBe("type");
  });

  it("names the same four kinds as the module", () => {
    expect([...DOCUMENT_TYPES]).toEqual([...GUEST_DOCUMENT_TYPES]);
  });

  it("shows the last four and hides the rest", () => {
    expect(maskedDocumentNumber("0146")).toBe("•••• 0146");
  });
});

describe("the countries", () => {
  it("are 249 ISO codes and Kosovo, each unique and named in all three languages", () => {
    expect(COUNTRY_CODES).toHaveLength(250);
    expect(new Set(COUNTRY_CODES).size).toBe(250);
    for (const locale of ["tr", "en", "ar"]) {
      for (const code of COUNTRY_CODES) {
        expect(countryName(code, locale), `${locale} ${code}`).not.toBe(code);
      }
    }
  });

  it("recognise a code and nothing else", () => {
    expect(isCountryCode("TR")).toBe(true);
    expect(isCountryCode("XK")).toBe(true);
    expect(isCountryCode("tr")).toBe(false);
    expect(isCountryCode("ZZ")).toBe(false);
    expect(isCountryCode("TUR")).toBe(false);
  });

  it("are listed in the reader's alphabet and found by the English name and the code", () => {
    const options = countryOptions("tr");
    const turkey = options.find((option) => option.value === "TR");
    expect(turkey?.label).toBe(countryName("TR", "tr"));
    expect(turkey?.keywords).toContain("TR");
    expect(turkey?.keywords).toEqual(
      expect.arrayContaining(["TR", "Turkey", "Turkiye"]),
    );
    expect(
      countryOptions("tr").find((option) => option.value === "CN")?.keywords,
    ).toContain("Cin");
    const labels = options.map((option) => option.label);
    expect(labels).toEqual(
      [...labels].sort((a, b) => a.localeCompare(b, "tr")),
    );
  });
});
