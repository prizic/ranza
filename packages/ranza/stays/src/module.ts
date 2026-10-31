import { withOrganizationContext } from "@ranza/db";
import { PORTAL_STAY_CAPABILITY, type OwnStay } from "./contracts";
import { createPortalInvitations } from "./portal-invitation";
import type { StaysDeps } from "./ports";

/** A row as the read returns it, before the balance and instalment columns become one value each. */
type OwnStayRow = Omit<OwnStay, "balance" | "nextInstalment"> & {
  balanceCurrency: string | null;
  balanceMinor: string | null;
  folioStatus: "open" | "closed" | null;
  instalmentCurrency: string | null;
  instalmentNumber: number | null;
  instalmentsTotal: number | null;
  instalmentDueOn: string | null;
  instalmentOutstandingMinor: string | null;
  instalmentState: "overdue" | "due" | "upcoming" | null;
  instalmentsOverdue: number | null;
  instalmentsOverdueMinor: string | null;
};

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
   * The room around a bed is read through `accommodation_units_read_own_stay_room`,
   * the balance through `app.resident_folio_balances()` and the next instalment
   * through `app.resident_next_instalments()`, each the Resident's own path and
   * none a widening of a Staff one (ADR 0009, GP-S4-*). Any can be absent
   * without the Stay being absent: a Stay with no Folio has no balance, which
   * is not a zero one, and a Stay with no plan has no instalment.
   *
   * Empty is the correct answer to "you have nothing current here" — for a
   * departed Resident, for an Organization that lost the Entitlement, and for a
   * Property that never enabled the capability. Those are different situations
   * with deliberately identical answers.
   */
  async function listOwnStays(userId: string): Promise<OwnStay[]> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<OwnStayRow[]>`
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
          unit.capacity                          as "unitCapacity",
          room.name                              as "roomName",
          coalesce(room.building, unit.building) as "building",
          coalesce(room.floor, unit.floor)       as "floor",
          balance.currency                       as "balanceCurrency",
          balance.balance_minor                  as "balanceMinor",
          balance.folio_status                   as "folioStatus",
          instalment.currency                    as "instalmentCurrency",
          instalment.instalment_number           as "instalmentNumber",
          instalment.instalments_total           as "instalmentsTotal",
          instalment.due_on                      as "instalmentDueOn",
          instalment.outstanding_minor           as "instalmentOutstandingMinor",
          instalment.state                       as "instalmentState",
          instalment.overdue_count               as "instalmentsOverdue",
          instalment.overdue_minor               as "instalmentsOverdueMinor"
        from public.stays as stay
        join public.properties as property
          on property.id = stay.property_id
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        left join app.resident_folio_balances() as balance
          on balance.stay_id = stay.id
        left join app.resident_next_instalments() as instalment
          on instalment.stay_id = stay.id
        where stay.status in ('reserved', 'in_house')
          and app.resident_can_use_capability(
            stay.property_id,
            ${PORTAL_STAY_CAPABILITY.moduleKey},
            ${PORTAL_STAY_CAPABILITY.capabilityKey}
          )
        order by stay.starts_on desc, stay.id
      `,
    );
    return rows.map(
      ({
        balanceCurrency,
        balanceMinor,
        folioStatus,
        instalmentCurrency,
        instalmentNumber,
        instalmentsTotal,
        instalmentDueOn,
        instalmentOutstandingMinor,
        instalmentState,
        instalmentsOverdue,
        instalmentsOverdueMinor,
        ...stay
      }) => ({
        ...stay,
        balance:
          balanceCurrency === null ||
          balanceMinor === null ||
          folioStatus === null
            ? null
            : {
                currency: balanceCurrency,
                amountMinor: balanceMinor,
                folioStatus,
              },
        nextInstalment:
          instalmentCurrency === null ||
          instalmentNumber === null ||
          instalmentsTotal === null ||
          instalmentDueOn === null ||
          instalmentOutstandingMinor === null ||
          instalmentState === null ||
          instalmentsOverdue === null ||
          instalmentsOverdueMinor === null
            ? null
            : {
                currency: instalmentCurrency,
                number: instalmentNumber,
                of: instalmentsTotal,
                dueOn: instalmentDueOn,
                outstandingMinor: instalmentOutstandingMinor,
                state: instalmentState,
                overdueCount: instalmentsOverdue,
                overdueMinor: instalmentsOverdueMinor,
              },
      }),
    );
  }

  return { listOwnStays, ...createPortalInvitations(deps) };
}

export type StaysModule = ReturnType<typeof createStaysModule>;
