/**
 * The public vocabulary of Accommodation: what an Accommodation Unit is and
 * what states it may hold.
 *
 * These unions exist to stay in step with the check constraints in
 * `prisma/migrations/20260916000300_accommodation_units`, which this module
 * owns. The database is the authority; widening a union here without widening
 * the constraint produces a runtime insert failure, which is the correct way
 * round — the reverse would let invalid rows through unnoticed.
 */

/** Entitlement key for Property and Accommodation Management (blueprint 5.2). */
export const ACCOMMODATION_MODULE = "accommodation";

/**
 * What kind of space a Unit is. Which kinds a Property uses is configuration,
 * not a different product: a dormitory is a Property whose Units are beds
 * (ADR 0004).
 */
export type AccommodationUnitType = "room" | "bed" | "apartment" | "suite";

/**
 * Operational state of the Unit itself, not of anyone staying in it. A Stay
 * has its own status and the two move independently — blueprint 5.4 keeps
 * room-status transitions out of the Stay record deliberately.
 */
export type AccommodationUnitStatus =
  "available" | "occupied" | "out_of_service";
