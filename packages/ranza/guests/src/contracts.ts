import type { Gender } from "@ranza/core";

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
 * A student's particulars — date of birth, studies, guardian and emergency
 * contact — are held apart, in `guest_particulars`, because fewer people may
 * read them (GP-S1-*). Preferences, documents and consent state are blueprint
 * 18.7 and deliberately absent: this module holds the facts a booking collects,
 * and nothing it has not been asked for (blueprint section 13).
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
  /**
   * RFC 5321's limit on an address at the top. At the bottom, the shortest
   * thing `guests_email_is_normalized` accepts, which is also the shortest
   * address that can hold an `@` with something either side of it.
   */
  email: { min: 3, max: 254 },
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
  /**
   * Asked only when a gendered room needs it (RB-S5-16), and null otherwise.
   * Recorded where none was; a recorded one is never overwritten by a booking.
   */
  gender: Gender | null;
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

/**
 * The check constraints' bounds on a Guest's particulars, published for the
 * same reason as `GUEST_DETAILS`: a form stops somebody typing past them.
 */
export const GUEST_PARTICULARS = {
  text: { min: 2, max: 120 },
  phone: { max: 40 },
  studyYear: { min: 1, max: 8 },
  earliestDateOfBirth: "1900-01-01",
} as const;

/**
 * What a dormitory knows about a student beyond their name: when they were
 * born, where and in which year they study, their guardian (veli) and who to
 * call in an emergency (GP-S1-*). Every field may be absent — a hotel Guest has
 * none of them, and ADR 0057 forbids the operating model making one required.
 *
 * Read only by holders of `guests.read_particulars`, which the database
 * decides; a caller without it reads none, which is not the same as none
 * recorded and is not told apart.
 */
export interface GuestParticulars {
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  institution: string | null;
  studyYear: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
}

export type GuestParticularsField = keyof GuestParticulars;

/** Particulars the database would refuse, refused here first, by field. */
export class GuestParticularsError extends Error {
  constructor(
    message: string,
    readonly field: GuestParticularsField,
  ) {
    super(message);
    this.name = "GuestParticularsError";
  }
}
