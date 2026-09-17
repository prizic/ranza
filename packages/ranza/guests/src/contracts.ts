/**
 * The public vocabulary of Guests.
 *
 * A Guest is a person associated with a stay (blueprint 2). Not a Ranza user:
 * somebody is booked in long before they have signed in, and most never do —
 * `stays.user_id` is the separate, nullable fact that gives one a Portal
 * (ADR 0009).
 *
 * A Guest belongs to an Organization rather than to a Property, which is the
 * decision [ADR 0024](../../../../docs/adr/0024-a-guest-belongs-to-an-organization-and-a-reservation-holds-its-nights.md)
 * records. Everything a Guest 360 is for — a history across two Stays,
 * duplicate review, a document, a guardian (blueprint 18.7) — is an
 * Organization-wide question, and a Property-scoped Guest could not answer any
 * of it without a merge later.
 *
 * Preferences, documents, consent state, guardians and emergency contacts are
 * all blueprint 18.7 and are deliberately absent. This module holds the facts
 * the one workflow that creates a Guest collects, and nothing it has not been
 * asked for (blueprint section 13).
 */

/**
 * What the database will accept, published because a form has to stop somebody
 * typing past it and has to say which way they missed.
 *
 * These are the check constraints' own bounds. Restating them in a form is how
 * a field and the rule it describes drift apart, so the copy, the `maxLength`
 * and the server action all read this.
 */
export const GUEST_DETAILS = {
  name: { min: 1, max: 120 },
  /** RFC 5321's limit on an address, which is the only claim made about it. */
  email: { max: 254 },
  phone: { max: 40 },
} as const;

/**
 * Who a Reservation is for.
 *
 * `email` and `phone` are optional because a front desk taking a booking over
 * the counter often has neither, and refusing the booking for it would be the
 * system inventing a requirement the business does not have.
 */
export interface GuestDetails {
  organizationId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Details the database would refuse, refused here first.
 *
 * Named by field rather than generic, unlike every refusal in
 * `@ranza/reservations`: those hide whether a row exists, and this hides
 * nothing — it is a length the person typing can see and fix.
 */
export class GuestDetailsError extends Error {
  constructor(
    message: string,
    readonly field: "fullName" | "email" | "phone",
  ) {
    super(message);
    this.name = "GuestDetailsError";
  }
}
