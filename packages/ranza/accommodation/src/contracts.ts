/**
 * The public vocabulary of Accommodation: what kind of space a Unit is.
 *
 * This union exists to stay in step with the check constraint in
 * `prisma/migrations/20260916000400_accommodation_units`, which this module
 * owns. The database is the authority; widening it here without widening the
 * constraint produces a runtime insert failure, which is the correct way round
 * — the reverse would let invalid rows through unnoticed.
 *
 * Operational unit status and the Entitlement key are columns in that migration
 * and have no reader in TypeScript yet. They arrive here when something reads
 * them, not before.
 */

/**
 * Which kinds a Property uses is configuration, not a different product: a
 * dormitory is a Property whose Units are beds (ADR 0004).
 */
export type AccommodationUnitType = "room" | "bed" | "apartment" | "suite";
