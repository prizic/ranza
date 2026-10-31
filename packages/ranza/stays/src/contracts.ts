import type { AccommodationUnitType } from "@ranza/accommodation";
import type { CapabilityRef } from "@ranza/core";

/**
 * The public vocabulary of Stays.
 *
 * A Stay connects a Guest or Resident to an Accommodation Unit for a period
 * (blueprint 2 and 5.3). Short-term and long-term are the same record told
 * apart by `stayType`, not two models — which is what keeps a dormitory a
 * Property configuration rather than a second product (ADR 0004).
 */

/** Entitlement key for Reservations and Front Office (blueprint 5.3). */
export const FRONT_OFFICE_MODULE = "front_office";

/**
 * Showing someone their own Stay in the Portal (blueprint 4.3, first bullet).
 *
 * It is a gated capability rather than the Portal's floor: blueprint 4.3 says
 * available capabilities depend on the Organization's Entitlements and Property
 * configuration, so a Property that has not enabled this simply has no Portal
 * content. That is an empty state, never an error, and it is deliberately
 * indistinguishable from having no Stay.
 */
export const PORTAL_STAY_CAPABILITY: CapabilityRef = {
  moduleKey: FRONT_OFFICE_MODULE,
  capabilityKey: "portal_stay_overview",
};

/** Short-term is a Guest, long-term is a Resident. Both are Stays. */
export type StayType = "guest" | "resident";

export type StayStatus = "reserved" | "in_house" | "departed" | "cancelled";

/**
 * A Stay as its own Guest or Resident sees it.
 *
 * Flat, and only what the Portal shows. There is no Organization here because a
 * Resident is not a member of one and must not learn its shape (ADR 0009), and
 * no Unit operational status because housekeeping state is Staff information.
 */
export interface OwnStay {
  stayId: string;
  stayType: StayType;
  status: StayStatus;
  /** Calendar date as `YYYY-MM-DD`; no instant, so no timezone to get wrong. */
  startsOn: string;
  /** Null means open-ended, which is normal for long-term residence. */
  endsOn: string | null;
  propertyId: string;
  propertyName: string;
  timezone: string;
  unitId: string;
  unitName: string;
  unitType: AccommodationUnitType;
  unitCapacity: number;
  /**
   * The room around the bed, when the Unit they hold is a bed (ADR 0025); null
   * when it is let whole, so the Unit named above is the room itself.
   */
  roomName: string | null;
  /** Where the room is, from the room (a bed has none); null when not recorded. */
  building: string | null;
  floor: number | null;
  /**
   * What their Folio stands at, or null when there is nothing to say: no Folio
   * yet, billing not held, or finance off at the Property. Null is not a zero
   * balance (ADR 0015, GP-S4-06).
   */
  balance: OwnBalance | null;
  /**
   * The next instalment of their payment plan (ADR 0059), or null when there
   * is nothing to say: no plan, nothing left to pay, billing not held, or
   * finance off at the Property (GP-S4-11 to GP-S4-17).
   */
  nextInstalment: OwnInstalment | null;
}

export interface OwnBalance {
  /** ISO 4217, the Folio's own currency. */
  currency: string;
  /** Signed minor units as a decimal string, positive meaning owed (ADR 0015). */
  amountMinor: string;
  folioStatus: "open" | "closed";
}

/**
 * The oldest instalment of a Stay's plan that is not paid in full, with where
 * it stands as `app.payment_plan_standing()` says: the one definition of
 * overdue, never worked out again here.
 */
export interface OwnInstalment {
  /** ISO 4217, the plan's own currency. */
  currency: string;
  /** Its place in the plan by due date, from 1, out of `of`. */
  number: number;
  of: number;
  /** Calendar date as `YYYY-MM-DD`, the Property's own. */
  dueOn: string;
  /** What is still owed on it, in minor units as a decimal string. */
  outstandingMinor: string;
  state: "overdue" | "due" | "upcoming";
  /** How many instalments are overdue in all, this one included. */
  overdueCount: number;
  /** What is overdue in all, in minor units as a decimal string. */
  overdueMinor: string;
}

/**
 * Where a Guest's invitation to the Portal stands, as the desk reads it
 * (GP-S2-11). `expired` is read from the clock, not stored.
 */
export type PortalInvitationStanding =
  "none" | "waiting" | "expired" | "withdrawn" | "connected";

/**
 * What the booking sheet needs to draw the invitation.
 *
 * `availability` is why the section may not offer a link: `portal_off` is said
 * to a Staff Member who holds the permission, and `not_permitted` draws nothing
 * at all, because a role that cannot invite has no use for the explanation.
 */
export interface PortalInvitationOverview {
  guestId: string;
  availability: "available" | "portal_off" | "not_permitted";
  standing: PortalInvitationStanding;
  /** ISO instant; set for `waiting` and `expired`. */
  expiresAt: string | null;
  /** ISO instant; set for `connected`. */
  connectedAt: string | null;
}

/** A link just made. The token exists here and nowhere else (GP-S2-03). */
export interface IssuedPortalInvitation {
  /** What goes in the link and the QR code. Shown once, never stored. */
  token: string;
  /** ISO instant. */
  expiresAt: string;
  /** True when an earlier live link was withdrawn to make this one. */
  replacedEarlier: boolean;
}

/** What the page behind a link may know about it (GP-S3-11). */
export interface PortalLink {
  state: "pending" | "expired" | "revoked" | "accepted";
  organizationName: string;
  guestName: string;
  /** The address the desk typed; a suggestion, never a requirement. */
  guestEmail: string | null;
}

/** Why a link did not work, or that it did (GP-S3-03 to GP-S3-07). */
export type PortalAcceptanceOutcome =
  "accepted" | "unknown" | "revoked" | "used" | "expired" | "another_guest";

export interface PortalAcceptance {
  outcome: PortalAcceptanceOutcome;
  /** How many of the Guest's Stays now belong to this account. */
  linkedStays: number;
}

/** Why the desk could not make or withdraw a link. */
export type PortalInvitationRefusal = "not_allowed" | "already_connected";

export class PortalInvitationRefusedError extends Error {
  constructor(readonly reason: PortalInvitationRefusal) {
    super(
      reason === "already_connected"
        ? "that Guest already has a Portal login"
        : "that Guest cannot be invited",
    );
    this.name = "PortalInvitationRefusedError";
  }
}
