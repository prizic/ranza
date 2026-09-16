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
 * Resident is not a member of one and must not learn its shape (ADR 0008), and
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
}
