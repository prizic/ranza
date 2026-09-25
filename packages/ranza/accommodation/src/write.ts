import type { TenantClient } from "@ranza/db";
import type { AccommodationUnitStatus } from "./contracts";

/**
 * Taking a Unit out of service and putting it back, for a caller that owns
 * the transaction.
 *
 * This module owns `accommodation_units`, and no other module writes to it.
 * Maintenance needs to — a request holds its Unit out of order, and the Unit's
 * status must agree with the holds in the same transaction (ADR 0032) — so it
 * goes through these rather than issuing its own SQL, the way Front Office
 * goes through `openFolioWithin`.
 *
 * Nothing here checks a permission. `accommodation_units_update_out_of_order`
 * admits a Staff Member holding `maintenance.take_out_of_order`, and the
 * restrictive `accommodation_units_status_by_permission` keeps them to
 * `out_of_service`: they cannot block a Unit through this door, and a Staff
 * Member who may block cannot take one out of order through the other.
 */

/** The transaction surface these statements need. */
export interface UnitWriteClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** A Unit as the caller holding its lock sees it. */
export interface LockedUnit {
  unitId: string;
  organizationId: string;
  propertyId: string;
  name: string;
  status: AccommodationUnitStatus;
}

/**
 * Locks a Unit's row for the rest of the transaction and says what it is.
 *
 * Whoever changes whether a Unit is in service takes this first, so two
 * people taking one Unit out and returning it through two requests take turns,
 * and the status each writes is decided on what the other committed.
 *
 * `for update` is admitted by the update policies, not the read one, so a
 * caller who may not change the Unit's status gets null — the same answer as a
 * Unit that does not exist, which is the point.
 */
export async function lockUnitWithin(
  tx: UnitWriteClient,
  unitId: string,
): Promise<LockedUnit | null> {
  const rows = await tx.$queryRaw<LockedUnit[]>`
    select unit.id              as "unitId",
           unit.organization_id as "organizationId",
           unit.property_id     as "propertyId",
           unit.name            as "name",
           unit.status          as "status"
      from public.accommodation_units as unit
     where unit.id = ${unitId}::uuid
       for update
  `;
  return rows[0] ?? null;
}

/**
 * Makes a Unit out of service. True when it is afterwards, including when it
 * already was — a second request holding it changes nothing about the Unit.
 * False when it is blocked or out of the caller's reach: a blocked Unit is
 * entered and left through `available` only (MT-S2-08).
 */
export async function takeUnitOutOfServiceWithin(
  tx: UnitWriteClient,
  unitId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    update public.accommodation_units
       set status = 'out_of_service',
           updated_at = now()
     where id = ${unitId}::uuid
       and status in ('available', 'out_of_service')
    returning id
  `;
  return rows.length > 0;
}

/**
 * Puts an out-of-service Unit back in service. The caller decides that nothing
 * holds it any longer; this only writes the status. True when it is in service
 * afterwards, including when it already was — so a status that drifted from
 * its holds never strands a request that can then neither be returned nor
 * cancelled. False when it is blocked or not the caller's to change.
 */
export async function returnUnitToServiceWithin(
  tx: UnitWriteClient,
  unitId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    update public.accommodation_units
       set status = 'available',
           updated_at = now()
     where id = ${unitId}::uuid
       and status in ('out_of_service', 'available')
    returning id
  `;
  return rows.length > 0;
}
