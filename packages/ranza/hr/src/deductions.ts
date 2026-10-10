/**
 * The deductions on a payslip: a placeholder, and the only place that says so.
 *
 * PENDING THE OWNER AND AN ACCOUNTANT (HR-S1-28). Nothing below has been
 * approved. The 15% rates, the ceiling and the stamp rate were written into the
 * first version of this module as "statutory", and no document in this
 * repository, the blueprint included, says they are. They are kept so that a
 * payroll run has numbers to show and a payslip has a shape, and they are
 * marked as placeholders on the screen and in the edge-case table so that
 * nobody pays anyone from them.
 *
 * Do not extend this with more rules. A real rule is a decision, it belongs in
 * the edge-case table as a `proposed` row first, and replacing this function is
 * the whole of the change it should cost. Everything is integer minor units
 * (ADR 0015): a rate is a numerator over a denominator and a result is rounded
 * half up once, here, so a payslip's parts add up exactly.
 */

interface Rate {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** 15% of the gross, up to the ceiling below. */
export const PLACEHOLDER_SOCIAL_SECURITY_RATE: Rate = {
  numerator: 15n,
  denominator: 100n,
};

/**
 * 150,000.00 in a currency with two minor units, which is the only kind this
 * was ever thought about for. It says nothing about any other currency.
 */
export const PLACEHOLDER_SOCIAL_SECURITY_CEILING_MINOR = 15_000_000n;

/** 15% of the gross less the social security deduction. */
export const PLACEHOLDER_INCOME_TAX_RATE: Rate = {
  numerator: 15n,
  denominator: 100n,
};

/** 0.759% of the gross. */
export const PLACEHOLDER_STAMP_DUTY_RATE: Rate = {
  numerator: 759n,
  denominator: 100_000n,
};

export interface PlaceholderDeductions {
  readonly socialSecurityMinor: number;
  readonly incomeTaxMinor: number;
  readonly stampDutyMinor: number;
  readonly netMinor: number;
}

/** `amount × rate`, rounded half up, in whole minor units. */
function portion(amount: bigint, rate: Rate): bigint {
  return (amount * rate.numerator + rate.denominator / 2n) / rate.denominator;
}

/**
 * What is taken from one gross amount, and what is left. The gross must be a
 * non-negative whole number of minor units; the caller validates it.
 */
export function calculatePlaceholderDeductions(
  grossMinor: number,
): PlaceholderDeductions {
  if (!Number.isSafeInteger(grossMinor) || grossMinor < 0) {
    throw new RangeError("gross pay must be a non-negative whole number");
  }
  const gross = BigInt(grossMinor);
  const subjectToSocialSecurity =
    gross < PLACEHOLDER_SOCIAL_SECURITY_CEILING_MINOR
      ? gross
      : PLACEHOLDER_SOCIAL_SECURITY_CEILING_MINOR;
  const socialSecurity = portion(
    subjectToSocialSecurity,
    PLACEHOLDER_SOCIAL_SECURITY_RATE,
  );
  const incomeTax = portion(
    gross - socialSecurity,
    PLACEHOLDER_INCOME_TAX_RATE,
  );
  const stampDuty = portion(gross, PLACEHOLDER_STAMP_DUTY_RATE);
  const net = gross - socialSecurity - incomeTax - stampDuty;

  return {
    socialSecurityMinor: Number(socialSecurity),
    incomeTaxMinor: Number(incomeTax),
    stampDutyMinor: Number(stampDuty),
    netMinor: Number(net),
  };
}
