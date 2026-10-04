import { withOrganizationContext } from "@ranza/db";
import { getComposition } from "./composition";

/** More reached Properties than this refuses the read; it never truncates. */
const PROPERTY_CEILING = 200;

export interface PortfolioProperty {
  propertyId: string;
  propertyName: string;
  currency: string;
  businessDate: string;
  /** False when the Property's analytics capability is off: every figure is null. */
  entitled: boolean;

  // Null means "not available to this viewer", never zero.
  sellableUnits: number | null;
  occupiedUnits: number | null;
  arrivalsToCome: number | null;
  departuresToCome: number | null;
  openMaintenanceRequests: number | null;
  openFolioBalanceMinor: number | null;
}

export interface Portfolio {
  organizationId: string;
  asOf: string;
  properties: PortfolioProperty[];
  /** Summed counts, never a percentage: a ratio of ratios would be wrong. */
  occupancy: { occupiedUnits: number; sellableUnits: number };
  /** One entry per currency, each summed only within itself. */
  balancesByCurrency: { currency: string; balanceMinor: number }[];
}

export class PortfolioTooLargeError extends Error {
  constructor(readonly propertyCount: number) {
    super(
      `${propertyCount} Properties are reached; the portfolio shows at most ${PROPERTY_CEILING}`,
    );
    this.name = "PortfolioTooLargeError";
  }
}

// One row per reached Property, or a single row of nulls when there are none:
// the statement always answers, so `asOf` is never missing.
interface PortfolioRow {
  asOf: Date;
  total: number | null;
  propertyId: string | null;
  propertyName: string | null;
  currency: string | null;
  businessDate: string | null;
  entitled: boolean | null;
  sellableUnits: number | null;
  occupiedUnits: number | null;
  arrivalsToCome: number | null;
  departuresToCome: number | null;
  openMaintenanceRequests: number | null;
  openFolioBalanceMinor: string | null;
}

/**
 * Reads the figures of every Property the viewer reaches in one Organization.
 *
 * One statement, so every row shares one snapshot and the number of statements
 * does not grow with the number of Properties (PF-S1-23, PF-S1-29). The
 * Organization is named because `app.accessible_property_ids()` spans every
 * Organization the viewer belongs to and the application has no active one.
 *
 * Each figure is asked its own capability pair and is null where the pair
 * fails; money also needs `finance.manage_folio`. A Property whose analytics
 * capability is off still appears, withheld, so an Owner sees it was left out
 * rather than concluding it is missing. Each row is evaluated on its own
 * business date (ADR 0021), never the wall clock.
 *
 * What counts follows the single-Property reads: sellable and occupied units
 * as `listUnits`, arrivals as `listArrivals` less those already in, departures
 * as `listDepartures`, open requests as maintenance's `todayView`, and a
 * balance as the Folio module's sum of lines (ADR 0015).
 */
async function readPortfolio(
  userId: string,
  organizationId: string,
): Promise<Portfolio> {
  const db = getComposition().db;

  const rows = await withOrganizationContext(
    db,
    { userId },
    (tx) =>
      tx.$queryRaw<PortfolioRow[]>`
      with stamp as (
        select statement_timestamp() as as_of
      ),
      -- Reach, the Subscription and the ceiling. accessible_property_ids() is
      -- not redundant with the row policy on properties: a Resident's own-Stay
      -- policy admits the row of a Property they do not staff. A Subscription
      -- that is not trialing, active or past due (ADR 0040) leaves nothing,
      -- rather than rows withheld one by one. The window counts before the
      -- limit applies, so a refusal can say how many were reached.
      reached as (
        select property.id,
               property.organization_id,
               property.name,
               trim(property.currency)::text as currency,
               app.property_today(property.id) as today,
               count(*) over () as total
        from public.properties as property
        where property.organization_id = ${organizationId}::uuid
          and property.id in (select app.accessible_property_ids())
          and exists (
            select 1 from public.subscriptions as subscription
            where subscription.organization_id = property.organization_id
              and subscription.status in ('trialing', 'active', 'past_due')
          )
        order by property.name, property.id
        limit ${PROPERTY_CEILING + 1}
      ),
      gated as (
        select reached.*,
               analytics.entitled,
               analytics.entitled
                 and app.can_use_capability(reached.id, 'front_office', 'front_desk')
                 as front_desk,
               analytics.entitled
                 and app.can_use_capability(reached.id, 'maintenance', 'maintenance')
                 as maintenance,
               analytics.entitled
                 and app.can_use_capability(reached.id, 'billing_folios', 'finance')
                 and app.has_organization_permission(
                       reached.organization_id, 'finance.manage_folio')
                 as billing
        from reached
        cross join lateral (
          select app.can_use_capability(reached.id, 'analytics', 'analytics')
                 as entitled
        ) as analytics
      ),
      -- Leaf units (ADR 0025). A unit out of order, or in a room out of order
      -- (ADR 0032), is not sellable unless a Guest is in it: an in-house unit
      -- is always counted, so occupied never exceeds sellable.
      leaf_units as (
        select unit.property_id,
               exists (
                 select 1 from public.stays as stay
                 where stay.accommodation_unit_id = unit.id
                   and stay.status = 'in_house'
               ) as occupied,
               (unit.status = 'out_of_service'
                 or coalesce(room.status = 'out_of_service', false)) as out_of_order
        from public.accommodation_units as unit
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        where unit.property_id in (select id from reached)
          and not exists (
            select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
          )
      ),
      unit_counts as (
        select property_id,
               count(*) filter (where occupied) as occupied,
               count(*) filter (where occupied or not out_of_order) as sellable
        from leaf_units
        group by property_id
      ),
      -- The Reservations listArrivals returns for today that are not yet in.
      -- A checked-in Reservation is the only one with an in-house Stay, so the
      -- Stay clause of that read has nothing left to decide here.
      arrival_counts as (
        select reached.id as property_id, count(*) as arrivals
        from reached
        join public.reservations as reservation
          on reservation.property_id = reached.id
        where reservation.status in ('requested', 'confirmed')
          and (
            reservation.starts_on = reached.today
            or (
              reservation.starts_on < reached.today
              and (reservation.ends_on is null
                   or reservation.ends_on > reached.today)
            )
          )
        group by reached.id
      ),
      departure_counts as (
        select reached.id as property_id, count(*) as departures
        from reached
        join public.stays as stay
          on stay.property_id = reached.id
        where stay.status = 'in_house'
          and stay.ends_on is not null
          and stay.ends_on <= reached.today
        group by reached.id
      ),
      maintenance_counts as (
        select request.property_id, count(*) as open_requests
        from public.maintenance_requests as request
        where request.property_id in (select id from reached)
          and request.status in ('new', 'in_progress', 'waiting_for_parts')
        group by request.property_id
      ),
      open_folios as (
        select folio.property_id,
               greatest(sum(line.amount_minor), 0) as owed
        from public.folios as folio
        join public.folio_lines as line
          on line.folio_id = folio.id
        where folio.property_id in (select id from reached)
          and folio.status = 'open'
        group by folio.id, folio.property_id
      ),
      owed as (
        select property_id, sum(owed) as owed
        from open_folios
        group by property_id
      )
      select stamp.as_of                            as "asOf",
             gated.total::int                       as "total",
             gated.id::text                         as "propertyId",
             gated.name                             as "propertyName",
             gated.currency                         as "currency",
             to_char(gated.today, 'YYYY-MM-DD')     as "businessDate",
             gated.entitled                         as "entitled",
             case when gated.front_desk
                  then coalesce(unit_counts.sellable, 0)::int end
                                                    as "sellableUnits",
             case when gated.front_desk
                  then coalesce(unit_counts.occupied, 0)::int end
                                                    as "occupiedUnits",
             case when gated.front_desk
                  then coalesce(arrival_counts.arrivals, 0)::int end
                                                    as "arrivalsToCome",
             case when gated.front_desk
                  then coalesce(departure_counts.departures, 0)::int end
                                                    as "departuresToCome",
             case when gated.maintenance
                  then coalesce(maintenance_counts.open_requests, 0)::int end
                                                    as "openMaintenanceRequests",
             case when gated.billing
                  then coalesce(owed.owed, 0)::text end
                                                    as "openFolioBalanceMinor"
      from stamp
      left join gated on true
      left join unit_counts on unit_counts.property_id = gated.id
      left join arrival_counts on arrival_counts.property_id = gated.id
      left join departure_counts on departure_counts.property_id = gated.id
      left join maintenance_counts on maintenance_counts.property_id = gated.id
      left join owed on owed.property_id = gated.id
      order by gated.name, gated.id
    `,
  );

  const [first] = rows;
  if (!first) {
    throw new Error("the portfolio statement answered with no row");
  }
  const reachedCount = first.total ?? 0;
  if (reachedCount > PROPERTY_CEILING) {
    throw new PortfolioTooLargeError(reachedCount);
  }

  const properties = rows.filter(isReached).map(propertyOf);

  return {
    organizationId,
    asOf: first.asOf.toISOString(),
    properties,
    occupancy: occupancyOf(properties),
    balancesByCurrency: balancesOf(properties),
  };
}

type ReachedRow = PortfolioRow & {
  propertyId: string;
  propertyName: string;
  currency: string;
  businessDate: string;
  entitled: boolean;
};

function isReached(row: PortfolioRow): row is ReachedRow {
  return row.propertyId !== null;
}

function propertyOf(row: ReachedRow): PortfolioProperty {
  return {
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    currency: row.currency,
    businessDate: row.businessDate,
    entitled: row.entitled,
    sellableUnits: row.sellableUnits,
    occupiedUnits: row.occupiedUnits,
    arrivalsToCome: row.arrivalsToCome,
    departuresToCome: row.departuresToCome,
    openMaintenanceRequests: row.openMaintenanceRequests,
    openFolioBalanceMinor:
      row.openFolioBalanceMinor === null
        ? null
        : Number(row.openFolioBalanceMinor),
  };
}

function occupancyOf(properties: readonly PortfolioProperty[]) {
  const total = { occupiedUnits: 0, sellableUnits: 0 };
  for (const entry of properties) {
    if (entry.occupiedUnits === null || entry.sellableUnits === null) continue;
    total.occupiedUnits += entry.occupiedUnits;
    total.sellableUnits += entry.sellableUnits;
  }
  return total;
}

function balancesOf(properties: readonly PortfolioProperty[]) {
  const byCurrency = new Map<string, number>();
  for (const entry of properties) {
    if (entry.openFolioBalanceMinor === null) continue;
    byCurrency.set(
      entry.currency,
      (byCurrency.get(entry.currency) ?? 0) + entry.openFolioBalanceMinor,
    );
  }
  return [...byCurrency]
    .map(([currency, balanceMinor]) => ({ currency, balanceMinor }))
    .sort((a, b) => (a.currency < b.currency ? -1 : 1));
}

/**
 * The portfolio for one Organization, recording what became of the request.
 *
 * Counts and an outcome only: no figure and no Property name ever reach the
 * log (PF-S1-34). The workspace has no semantic-event sink yet, so this is a
 * structured console line, as its other reads do. A throw is recorded and
 * rethrown, never swallowed.
 */
export async function getPortfolio(
  userId: string,
  organizationId: string,
): Promise<Portfolio> {
  try {
    const portfolio = await readPortfolio(userId, organizationId);
    const propertyCount = portfolio.properties.length;
    console.info("portfolio.viewed", {
      userId,
      organizationId,
      propertyCount,
      outcome: propertyCount === 0 ? "empty" : "ok",
    });
    return portfolio;
  } catch (error) {
    if (error instanceof PortfolioTooLargeError) {
      console.info("portfolio.viewed", {
        userId,
        organizationId,
        propertyCount: error.propertyCount,
        outcome: "refused",
      });
    } else {
      console.error("portfolio.viewed", {
        userId,
        organizationId,
        propertyCount: 0,
        outcome: "failed",
      });
    }
    throw error;
  }
}
