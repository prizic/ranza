import { withOrganizationContext } from "@ranza/db";
import { PORTAL_STAY_CAPABILITY, type OwnStay } from "./contracts";
import type { StaysDeps } from "./ports";

/**
 * Stays: the record connecting a Guest or Resident to an Accommodation Unit.
 *
 * This module owns no authorization logic. Blueprint 3.5 is decided by
 * `app.resident_can_use_capability()` and row-level security, in the database,
 * where an application defect cannot skip it. The job here is to ask the
 * question inside a request context (ADR 0007).
 */
export function createStaysModule(deps: StaysDeps) {
  /**
   * The Stays this user is the Guest or Resident of, as the Portal shows them.
   *
   * Two independent things have to hold for a row to come back, and either
   * alone is enough to deny:
   *
   *   - `stays_read_own` lets the reader see their own Stay, and the Property
   *     and Unit joined below are reachable only through their own current
   *     Stay. Remove those policies and the joins return nothing.
   *   - `app.resident_can_use_capability()` re-checks Subscription,
   *     Entitlement, Property capability, and that the Stay is in that
   *     Property. Remove it and the policies still hold the line.
   *
   * A Staff Member calling this gets an empty array: a membership is not a
   * Stay, and the Portal grants no staff capability (blueprint 4.3).
   *
   * Empty is the correct answer to "you have nothing current here" — for a
   * departed Resident, for an Organization that lost the Entitlement, and for a
   * Property that never enabled the capability. Those are different situations
   * with deliberately identical answers.
   */
  async function listOwnStays(userId: string): Promise<OwnStay[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<OwnStay[]>`
        select
          stay.id                                as "stayId",
          stay.stay_type                         as "stayType",
          stay.status                            as "status",
          to_char(stay.starts_on, 'YYYY-MM-DD')  as "startsOn",
          to_char(stay.ends_on, 'YYYY-MM-DD')    as "endsOn",
          property.id                            as "propertyId",
          property.name                          as "propertyName",
          property.timezone                      as "timezone",
          unit.id                                as "unitId",
          unit.name                              as "unitName",
          unit.unit_type                         as "unitType",
          unit.capacity                          as "unitCapacity"
        from public.stays as stay
        join public.properties as property
          on property.id = stay.property_id
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        where stay.status in ('reserved', 'in_house')
          and app.resident_can_use_capability(
            stay.property_id,
            ${PORTAL_STAY_CAPABILITY.moduleKey},
            ${PORTAL_STAY_CAPABILITY.capabilityKey}
          )
        order by stay.starts_on desc, stay.id
      `,
    );
  }

  return { listOwnStays };
}

export type StaysModule = ReturnType<typeof createStaysModule>;
