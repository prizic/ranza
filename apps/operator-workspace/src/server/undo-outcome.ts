import { CheckInReversalError, StayHasChargesError } from "@ranza/reservations";

/**
 * What withdrawing a check-in can come back as.
 *
 * `charges` is the one refusal a front desk can act on, and it is separate for
 * that reason alone: everything else a withdrawal can fail on — out of reach,
 * already departed, already withdrawn, never happened, no session — is
 * `refused`, because telling them apart would confirm that a Stay the viewer
 * cannot see is there (ADR 0022).
 *
 * The two reason outcomes are about the field rather than the Stay. Saying
 * "that cannot be withdrawn" to somebody who typed two characters would send
 * them looking for a problem with the Guest.
 */
export type ReverseCheckInOutcome =
  "idle" | "done" | "charges" | "reasonTooShort" | "reasonTooLong" | "refused";

/**
 * Which refusal an error is — and `null` when it is not a refusal at all.
 *
 * A pure function, and null rather than `refused` for the failure that matters:
 * a `catch` that turns everything into the same answer turns a lost connection,
 * a schema mismatch and a bug in this module into "that check-in cannot be
 * withdrawn", which is a sentence that reads as normal. Nobody looks, because
 * nothing looks wrong. Null makes the caller decide what to do with an error
 * this module never raised, and the caller logs it.
 *
 * It lives in `src/server/` rather than beside the dialog, which is where it
 * was first written: `@ranza/reservations` is a Ranza domain module, and ADR
 * 0007's rule is that nothing outside the funnel reaches one. Enforced, not
 * advisory — `pnpm lint:boundaries` named this file. The rule protects a second
 * thing here as well: that entry point also exports the module factory, so a
 * value import reachable from a component would put Prisma in the browser
 * bundle.
 */
export function undoOutcomeFor(error: unknown): "charges" | "refused" | null {
  // Order matters: StayHasChargesError extends CheckInReversalError, so the
  // specific one has to be asked first or it is answered as the general one.
  if (error instanceof StayHasChargesError) return "charges";
  if (error instanceof CheckInReversalError) return "refused";
  return null;
}
