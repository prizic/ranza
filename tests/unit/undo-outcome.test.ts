/**
 * Which refusal an error is, and what happens to one that is neither.
 *
 * The first two are a class hierarchy read in the right order —
 * `StayHasChargesError` extends `CheckInReversalError`, so asking the general
 * question first answers the specific one wrongly and a front desk is told it
 * cannot withdraw a check-in when the truth is that money exists.
 *
 * The third is the one this function exists for. A `catch` that answers
 * `refused` to everything turns a lost connection, a moved schema and a defect
 * here into a sentence that reads as normal: nobody looks, because nothing
 * looks wrong. Null is what makes the caller decide, and `src/server/
 * front-office.ts` logs before it reports anything.
 */
import { describe, expect, it } from "vitest";
import {
  CheckInReversalError,
  StayHasChargesError,
} from "../../packages/ranza/reservations/src";
import { undoOutcomeFor } from "../../apps/operator-workspace/src/server/undo-outcome";

describe("the refusals this screen knows", () => {
  it("answers charges for the one a front desk can act on", () => {
    expect(undoOutcomeFor(new StayHasChargesError("has charges"))).toBe(
      "charges",
    );
  });

  it("answers refused for every other withdrawal that did not happen", () => {
    expect(undoOutcomeFor(new CheckInReversalError("cannot"))).toBe("refused");
  });
});

describe("an error this module never raised", () => {
  // Each of these is a real shape: a driver error, a rejection with no error in
  // it, and a rejection with nothing at all.
  const strangers = [
    new Error("Connection terminated unexpectedly"),
    new TypeError("cannot read properties of undefined"),
    "the connection pool is exhausted",
    { code: "57P01" },
    null,
    undefined,
  ];

  it("is never mistaken for the refusal about money", () => {
    for (const stranger of strangers) {
      expect(undoOutcomeFor(stranger)).not.toBe("charges");
    }
  });

  it("is not answered at all, so a caller cannot swallow it by accident", () => {
    for (const stranger of strangers) {
      expect(undoOutcomeFor(stranger)).toBeNull();
    }
  });
});
