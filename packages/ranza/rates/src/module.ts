import { withOrganizationContext } from "@ranza/db";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
import {
  PRICE_MAX_MINOR,
  PRICED_UNIT_TYPES,
  RATES_CAPABILITY,
  RATES_MANAGE_PERMISSION,
  ROOM_CAPACITY,
  priceKey,
  RatesInputError,
  RatesRefusedError,
  RatesStaleError,
  type PriceChange,
  type PriceList,
  type PriceListEntry,
  type PricedUnitType,
  type PricesInput,
  type PricesSaved,
} from "./contracts";
import type { RatesDeps } from "./ports";

/**
 * A Property's price list (ADR 0038).
 *
 * Nothing here decides who may. The write policies carry all five gates, the
 * grants name the only columns a caller supplies, and a trigger states every
 * price in the Property's currency. A save that is refused arrives as the
 * database's refusal, not as a condition this module remembered to check.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";

/** md5 of the rows as read — see `readPriceList`. */
const VERSION = /^[0-9a-f]{32}$/;

/**
 * Whether a failure carries a particular SQLSTATE — read from Prisma's `meta`
 * and from the message, for the reasons `@ranza/accommodation` gives.
 */
function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

function isPricedUnitType(value: unknown): value is PricedUnitType {
  return (PRICED_UNIT_TYPES as readonly unknown[]).includes(value);
}

/** Only a bed has a room around it, and only a real size names one. */
function isRoomCapacityOf(
  unitType: PricedUnitType,
  roomCapacity: number | null,
): boolean {
  return (
    roomCapacity === null ||
    (unitType === "bed" &&
      Number.isInteger(roomCapacity) &&
      roomCapacity >= ROOM_CAPACITY.min &&
      roomCapacity <= ROOM_CAPACITY.max)
  );
}

function assertPricesInput(input: PricesInput): void {
  if (!VERSION.test(input.version) || !Array.isArray(input.prices)) {
    throw new RatesInputError(null);
  }
  const seen = new Set<string>();
  for (const change of input.prices) {
    if (
      !isPricedUnitType(change.unitType) ||
      !isRoomCapacityOf(change.unitType, change.roomCapacity) ||
      seen.has(priceKey(change.unitType, change.roomCapacity))
    ) {
      throw new RatesInputError(null);
    }
    seen.add(priceKey(change.unitType, change.roomCapacity));
    const amount = change.amountMinor;
    if (
      amount !== null &&
      (!Number.isSafeInteger(amount) || amount < 1 || amount > PRICE_MAX_MINOR)
    ) {
      throw new RatesInputError(change.unitType, change.roomCapacity);
    }
  }
}

interface ListRow {
  propertyId: string;
  organizationId: string;
  currency: string;
  version: string;
  mayManage: boolean;
}

interface EntryRow {
  unitType: PricedUnitType;
  roomCapacity: number | null;
  amountMinor: string | null;
  currency: string | null;
  sellableUnits: number;
}

/**
 * The price list of one Property, through the Configuration screen's gate.
 *
 * The version is an md5 of the Property's currency and every price row as it
 * stands — type, amount, currency and when it was set — so any save by anybody
 * changes it, and a cleared price changes it by disappearing. The currency is
 * in it because the form converts what is typed into minor units of it: a form
 * read in TRY must not save into a Property that now trades in JPY. Null for a Property the viewer
 * cannot reach or where configuration is not available.
 */
async function readPriceList(
  tx: AuditClient,
  propertyId: string,
): Promise<(PriceList & { organizationId: string }) | null> {
  const [list] = await tx.$queryRaw<ListRow[]>`
    select property.id                       as "propertyId",
           property.organization_id          as "organizationId",
           trim(property.currency)           as "currency",
           md5(property.currency || '|' || coalesce((
             select string_agg(
                      rate.unit_type || coalesce('@' || rate.room_capacity, '')
                      || ':'
                      || coalesce(rate.amount_minor::text, '-') || ':'
                      || rate.currency || ':'
                      || to_char(rate.updated_at at time zone 'UTC',
                                 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                      ',' order by rate.unit_type, rate.room_capacity nulls first)
               from public.property_rates as rate
              where rate.property_id = property.id), ''))
                                             as "version",
           app.has_organization_permission(
             property.organization_id, ${RATES_MANAGE_PERMISSION}
           )                                 as "mayManage"
      from public.properties as property
     where property.id = ${propertyId}::uuid
       and app.can_use_capability(
             property.id,
             ${RATES_CAPABILITY.moduleKey},
             ${RATES_CAPABILITY.capabilityKey}
           )
  `;
  if (!list) return null;

  // Every kind of Unit, priced or not, with how many of them could be booked:
  // a room with beds under it is let by the bed (ADR 0025), so it is not one.
  // Then, under beds, one row for each size of room a bed is in at this
  // Property, and for each size already priced whether or not it still is one
  // (ADR 0038 amended).
  //
  // A bed is counted against the general price only while no size price with
  // an amount covers it - the rule app.rate_for_unit applies, so the section
  // warns about the beds that would really be booked unpriced and not about
  // ones a size price already reaches.
  const rows = await tx.$queryRaw<(EntryRow & { position: number })[]>`
    with kinds as (
      select unit_type, position
        from unnest(${[...PRICED_UNIT_TYPES]}::text[])
               with ordinality as kind(unit_type, position)
    ), sizes as (
      select room.capacity as size
        from public.accommodation_units as bed
        join public.accommodation_units as room on room.id = bed.parent_id
       where bed.property_id = ${propertyId}::uuid
         and bed.unit_type = 'bed'
      union
      select rate.room_capacity
        from public.property_rates as rate
       where rate.property_id = ${propertyId}::uuid
         and rate.room_capacity is not null
    )
    select kinds.unit_type                   as "unitType",
           null::int                         as "roomCapacity",
           kinds.position::int               as "position",
           rate.amount_minor::text           as "amountMinor",
           trim(rate.currency)               as "currency",
           (select count(*)
              from public.accommodation_units as unit
             where unit.property_id = ${propertyId}::uuid
               and unit.unit_type = kinds.unit_type
               and not exists (
                 select 1 from public.accommodation_units as child
                  where child.parent_id = unit.id)
               and not exists (
                 select 1
                   from public.accommodation_units as room
                   join public.property_rates as sized
                     on sized.property_id = unit.property_id
                    and sized.unit_type = unit.unit_type
                    and sized.room_capacity = room.capacity
                    and sized.amount_minor is not null
                  where room.id = unit.parent_id
                    and unit.unit_type = 'bed'))::int
                                             as "sellableUnits"
      from kinds
      left join public.property_rates as rate
        on rate.property_id = ${propertyId}::uuid
       and rate.unit_type = kinds.unit_type
       and rate.room_capacity is null
    union all
    select 'bed',
           sizes.size,
           (select position::int from kinds where unit_type = 'bed'),
           rate.amount_minor::text,
           trim(rate.currency),
           (select count(*)
              from public.accommodation_units as unit
              join public.accommodation_units as room on room.id = unit.parent_id
             where unit.property_id = ${propertyId}::uuid
               and unit.unit_type = 'bed'
               and room.capacity = sizes.size)::int
      from sizes
      left join public.property_rates as rate
        on rate.property_id = ${propertyId}::uuid
       and rate.unit_type = 'bed'
       and rate.room_capacity = sizes.size
     order by "position", "roomCapacity" nulls first
  `;

  // A cleared price has a row and no amount; it is unpriced like a kind with
  // no row, and a currency with no amount says nothing.
  const entries: PriceListEntry[] = rows.map((row) => {
    const priced = row.amountMinor !== null;
    return {
      key: priceKey(row.unitType, row.roomCapacity),
      unitType: row.unitType,
      roomCapacity: row.roomCapacity,
      amountMinor: priced ? Number(row.amountMinor) : null,
      currency: priced ? row.currency : null,
      stale: priced && row.currency !== list.currency,
      sellableUnits: row.sellableUnits,
    };
  });

  return {
    propertyId: list.propertyId,
    organizationId: list.organizationId,
    currency: list.currency,
    entries,
    version: list.version,
    mayManage: list.mayManage,
  };
}

/** What a save does to one type, given what is there now. */
type Step =
  | { kind: "set"; change: PriceChange & { amountMinor: number } }
  | { kind: "clear"; change: PriceChange };

function stepsFor(list: PriceList, prices: PriceChange[]): Step[] {
  return prices.flatMap((change): Step[] => {
    const current = list.entries.find(
      (entry) =>
        entry.unitType === change.unitType &&
        entry.roomCapacity === change.roomCapacity,
    );
    // A size nobody had priced has no entry, and clearing it clears nothing.
    if (change.amountMinor === null) {
      return current?.amountMinor == null ? [] : [{ kind: "clear", change }];
    }
    // A stale price is set again even at the same amount: that is how it is
    // restated in the Property's currency (RT-S1-07).
    if (current?.amountMinor === change.amountMinor && !current.stale) {
      return [];
    }
    return [
      { kind: "set", change: { ...change, amountMinor: change.amountMinor } },
    ];
  });
}

/**
 * Clears one price: its row keeps its place with no amount. The size is matched
 * as a value, null included, because a kind's price and a bed's price for one
 * size of room are different rows.
 */
function clearPrice(
  tx: AuditClient,
  propertyId: string,
  change: PriceChange,
): Promise<{ unitType: string }[]> {
  return tx.$queryRaw<{ unitType: string }[]>`
    update public.property_rates
       set amount_minor = null
     where property_id = ${propertyId}::uuid
       and unit_type = ${change.unitType}
       and room_capacity is not distinct from ${change.roomCapacity}::int
    returning unit_type as "unitType"
  `;
}

/**
 * Sets one price, in the row that already holds it or a new one. Two partial
 * unique indexes stand behind it - one general price per kind, one price per
 * size - so the conflict target names the index the row belongs to.
 */
function setPrice(
  tx: AuditClient,
  organizationId: string,
  propertyId: string,
  change: PriceChange & { amountMinor: number },
): Promise<{ unitType: string }[]> {
  return change.roomCapacity === null
    ? tx.$queryRaw<{ unitType: string }[]>`
        insert into public.property_rates
          (organization_id, property_id, unit_type, amount_minor)
        values (${organizationId}::uuid, ${propertyId}::uuid,
                ${change.unitType}, ${change.amountMinor}::bigint)
        on conflict (property_id, unit_type) where room_capacity is null
        do update set amount_minor = excluded.amount_minor
        returning unit_type as "unitType"
      `
    : tx.$queryRaw<{ unitType: string }[]>`
        insert into public.property_rates
          (organization_id, property_id, unit_type, room_capacity, amount_minor)
        values (${organizationId}::uuid, ${propertyId}::uuid,
                ${change.unitType}, ${change.roomCapacity}::int,
                ${change.amountMinor}::bigint)
        on conflict (property_id, unit_type, room_capacity)
          where room_capacity is not null
        do update set amount_minor = excluded.amount_minor
        returning unit_type as "unitType"
      `;
}

/** The contract's shape: the Organization is this module's to know, not the screen's. */
function publicList(list: PriceList & { organizationId: string }): PriceList {
  return {
    propertyId: list.propertyId,
    currency: list.currency,
    entries: list.entries,
    version: list.version,
    mayManage: list.mayManage,
  };
}

export function createRatesModule(deps: RatesDeps) {
  /**
   * What the Rates section shows. Null for a Property the viewer cannot reach
   * or where configuration is not available — the same answer as none.
   */
  async function getPriceList(
    userId: string,
    propertyId: string,
  ): Promise<PriceList | null> {
    const list = await withOrganizationContext(deps.db, { userId }, (tx) =>
      readPriceList(tx, propertyId),
    );
    return list ? publicList(list) : null;
  }

  /**
   * Saves a price list, if it is still what the form was read at.
   *
   * Serialised per Property by advisory lock namespace 4, the price list's
   * own: two saves from one version would otherwise both pass the version
   * check and the second would silently undo the first. Taken through the
   * Property's row, so a Property the caller cannot see locks nothing.
   *
   * One audit record for the whole save, with each type's price before and
   * after, because a save is one decision about the list.
   */
  async function setPrices(
    userId: string,
    propertyId: string,
    input: PricesInput,
  ): Promise<PricesSaved> {
    assertPricesInput(input);

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      await tx.$queryRaw`
        select pg_advisory_xact_lock(4, hashtext(property.id::text))::text
          from public.properties as property
         where property.id = ${propertyId}::uuid
      `;

      const current = await readPriceList(tx, propertyId);
      if (!current || !current.mayManage) throw new RatesRefusedError();
      if (current.version !== input.version) {
        throw new RatesStaleError(publicList(current));
      }

      const steps = stepsFor(current, input.prices);
      if (steps.length === 0) {
        return { status: "unchanged", version: current.version };
      }

      for (const step of steps) {
        try {
          // A cleared price keeps its row with no amount: nothing in this
          // product deletes a row, and the audit record says what it was.
          const written =
            step.kind === "clear"
              ? await clearPrice(tx, propertyId, step.change)
              : await setPrice(
                  tx,
                  current.organizationId,
                  propertyId,
                  step.change,
                );
          // A policy refuses a delete or an update quietly — no row, not an
          // error — and the permission was read a moment ago, so reaching this
          // means the policy and the read disagree. Refused, not ignored.
          if (written.length === 0) throw new RatesRefusedError();
        } catch (error: unknown) {
          if (error instanceof RatesRefusedError) throw error;
          if (raised(error, INSUFFICIENT_PRIVILEGE)) {
            throw new RatesRefusedError();
          }
          if (raised(error, CHECK_VIOLATION)) {
            throw new RatesInputError(
              step.change.unitType,
              step.change.roomCapacity,
            );
          }
          throw error;
        }
      }

      const saved = await readPriceList(tx, propertyId);
      if (!saved) throw new RatesRefusedError();
      // The form converted what was typed into minor units of the currency it
      // was read in, and a currency change takes the Property's lock, not this
      // list's: if one committed while this saved, the trigger has stamped the
      // new currency onto amounts meant in the old one. Refused as stale, which
      // rolls the writes back, so the form is read again in the new currency.
      if (saved.currency !== current.currency) {
        throw new RatesStaleError(publicList(saved));
      }

      await recordWithin(tx, {
        organizationId: current.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "price_list.changed",
        subjectType: "property",
        subjectId: propertyId,
        context: {
          changes: steps.map((step) => {
            const before = current.entries.find(
              (entry) =>
                entry.unitType === step.change.unitType &&
                entry.roomCapacity === step.change.roomCapacity,
            );
            return {
              unitType: step.change.unitType,
              roomCapacity: step.change.roomCapacity,
              from:
                before?.amountMinor == null
                  ? null
                  : {
                      amountMinor: before.amountMinor,
                      currency: before.currency,
                    },
              to:
                step.kind === "clear"
                  ? null
                  : {
                      amountMinor: step.change.amountMinor,
                      currency: saved.currency,
                    },
            };
          }),
        },
      });

      return { status: "saved", version: saved.version };
    });
  }

  return { getPriceList, setPrices };
}

export type RatesModule = ReturnType<typeof createRatesModule>;
