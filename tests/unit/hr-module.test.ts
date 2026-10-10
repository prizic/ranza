/**
 * The parts of the HR module that need no database (RANZ-42).
 *
 * What the module does with one is in tests/integration/hr.test.ts; this holds
 * the arithmetic and the input rules, which are pure and which a regression in
 * would not announce itself by failing a query.
 */
import { describe, expect, it } from "vitest";
import {
  calculatePlaceholderDeductions,
  HR_CAPABILITY,
  HrInputError,
  maskIban,
  normalizeIban,
  PLACEHOLDER_SOCIAL_SECURITY_CEILING_MINOR,
} from "../../packages/ranza/hr/src";
import {
  validCurrency,
  validPeriod,
  wholeMinorUnits,
} from "../../packages/ranza/hr/src/input";
import { refusal } from "../../packages/ranza/hr/src/refusals";
import { HrRefusedError } from "../../packages/ranza/hr/src";

describe("the HR capability", () => {
  it("is the one blueprint 5.11 names", () => {
    expect(HR_CAPABILITY).toEqual({
      moduleKey: "human_resources",
      capabilityKey: "staff_administration",
    });
  });
});

describe("placeholder deductions", () => {
  it("placeholder_deductions_add_up_to_the_minor_unit: a gross of 35,000 is split exactly", () => {
    expect(calculatePlaceholderDeductions(3_500_000)).toEqual({
      socialSecurityMinor: 525_000,
      incomeTaxMinor: 446_250,
      stampDutyMinor: 26_565,
      netMinor: 2_502_185,
    });
  });

  it("placeholder_deductions_add_up_to_the_minor_unit: for every gross, the parts add up and nothing is fractional", () => {
    // Amounts that float arithmetic rounds the wrong way: the old
    // Math.round(x * 0.15 * 100) / 100 was not exact for these.
    const awkward = [1, 7, 33, 199, 1005, 1_234_567, 9_999_999_999, 10_001];
    for (const gross of [
      ...awkward,
      ...Array.from({ length: 500 }, (_, i) => i * 4_321 + 3),
    ]) {
      const parts = calculatePlaceholderDeductions(gross);
      for (const value of Object.values(parts)) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(
        parts.netMinor +
          parts.socialSecurityMinor +
          parts.incomeTaxMinor +
          parts.stampDutyMinor,
      ).toBe(gross);
    }
  });

  it("rounds half up once, in integers", () => {
    // 15% of 10 is 1.5, which rounds up to 2; of 1005 is 150.75, which rounds
    // to 151; of 3 is 0.45, which rounds to 0.
    expect(calculatePlaceholderDeductions(10).socialSecurityMinor).toBe(2);
    expect(calculatePlaceholderDeductions(1005).socialSecurityMinor).toBe(151);
    expect(calculatePlaceholderDeductions(3).socialSecurityMinor).toBe(0);
  });

  it("stops charging social security at the ceiling", () => {
    const atCeiling = calculatePlaceholderDeductions(
      Number(PLACEHOLDER_SOCIAL_SECURITY_CEILING_MINOR),
    );
    const above = calculatePlaceholderDeductions(
      Number(PLACEHOLDER_SOCIAL_SECURITY_CEILING_MINOR) + 5_000_000,
    );
    expect(above.socialSecurityMinor).toBe(atCeiling.socialSecurityMinor);
    expect(atCeiling.socialSecurityMinor).toBe(2_250_000);
  });

  it("handles no pay", () => {
    expect(calculatePlaceholderDeductions(0)).toEqual({
      socialSecurityMinor: 0,
      incomeTaxMinor: 0,
      stampDutyMinor: 0,
      netMinor: 0,
    });
  });

  it("refuses an amount that is not whole minor units", () => {
    expect(() => calculatePlaceholderDeductions(10.5)).toThrow(RangeError);
    expect(() => calculatePlaceholderDeductions(-1)).toThrow(RangeError);
    expect(() => calculatePlaceholderDeductions(Number.NaN)).toThrow(
      RangeError,
    );
  });
});

describe("an IBAN", () => {
  it("is stored without spaces, in capitals", () => {
    expect(normalizeIban(" tr33 0006 1005 1978 6457 8413 26 ")).toBe(
      "TR330006100519786457841326",
    );
  });

  it("is nothing when blank, because cash has none", () => {
    expect(normalizeIban(undefined)).toBeNull();
    expect(normalizeIban("   ")).toBeNull();
  });

  it("is refused when it is not the shape of one", () => {
    expect(() => normalizeIban("not an iban")).toThrow(HrInputError);
    expect(() => normalizeIban("TR33")).toThrow(HrInputError);
  });

  it("iban_is_masked_on_the_server: is shown as the country and the last four", () => {
    expect(maskIban("TR330006100519786457841326")).toBe("TR•• •••• •••• 1326");
    expect(maskIban(null)).toBeNull();
    expect(maskIban("TR33")).toBe("••••");
    expect(maskIban("TR330006100519786457841326")).not.toContain("0006");
  });
});

describe("input", () => {
  it("a_currency_that_is_not_one_is_refused: accepts ISO 4217 codes and nothing else", () => {
    for (const code of ["TRY", "EUR", "USD", "JPY", "KWD"]) {
      expect(validCurrency(code)).toBe(code);
    }
    for (const code of ["try", "TR", "TRYY", "XYZ", "", "T R"]) {
      expect(() => validCurrency(code)).toThrow(HrInputError);
    }
  });

  it("an_amount_that_is_not_whole_minor_units_is_refused", () => {
    expect(wholeMinorUnits(0, "grossPay")).toBe(0);
    expect(wholeMinorUnits(3_500_000, "grossPay")).toBe(3_500_000);
    for (const value of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 60,
    ]) {
      expect(() => wholeMinorUnits(value, "grossPay")).toThrow(HrInputError);
    }
  });

  it("reads a payroll period and its last day", () => {
    expect(validPeriod("2026-02").lastDay.toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(validPeriod("2028-02").lastDay.toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
    expect(validPeriod("2026-12").lastDay.toISOString()).toBe(
      "2026-12-31T00:00:00.000Z",
    );
    for (const bad of [
      "2026-13",
      "2026-00",
      "2026-1",
      "26-10",
      "2026-10-01",
      "",
    ]) {
      expect(() => validPeriod(bad)).toThrow(HrInputError);
    }
  });
});

describe("what the database says becomes a reason", () => {
  const driverError = (code: string, message: string) =>
    Object.assign(new Error(message), {
      meta: { driverAdapterError: { cause: { code } } },
    });

  it("reads the exclusion constraint as overlapping leave", () => {
    const refused = refusal(
      driverError("23P01", "hr_leave_no_overlapping_approved"),
    );
    expect(refused).toBeInstanceOf(HrRefusedError);
    expect((refused as HrRefusedError).reason).toBe("leave_overlap");
  });

  it("reads the currency trigger as a run in two currencies", () => {
    const refused = refusal(
      driverError(
        "23514",
        "a payroll run is in one currency, and this employee is paid in another",
      ),
    );
    expect((refused as HrRefusedError).reason).toBe("payroll_mixed_currency");
  });

  it("reads a policy, a grant, a key and a locked row alike, as not permitted", () => {
    for (const code of ["42501", "23503", "23505", "55000", "P2025"]) {
      const refused = refusal(driverError(code, "x"));
      expect((refused as HrRefusedError).reason).toBe("not_permitted");
    }
  });

  it("gives back what it does not recognise, for the host to report", () => {
    const outage = new Error("connection reset");
    expect(refusal(outage)).toBe(outage);
  });
});
