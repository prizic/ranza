import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  HOUSEKEEPING_CAPABILITY,
  HOUSEKEEPING_STATUSES,
  HousekeepingInputError,
  HousekeepingRefusedError,
  isStayoverCadence,
  MARK_BATCH,
  stayoverValueOf,
  type DefaultReach,
  type HousekeepingBoard,
  type HousekeepingCounts,
  type HousekeepingRoom,
  type HousekeepingStatus,
  type InspectionSettings,
  type InspectionValue,
  type StayoverBoard,
  type StayoverCadence,
  type StayoverMarked,
  type StayoverRoom,
  type StayoverSettings,
  type UnitsMarked,
} from "./contracts";
import type { HousekeepingDeps } from "./ports";

/**
 * The Housekeeping screen: every room at a Property and whether it needs
 * cleaning, and marking one room or many (ADR 0029).
 *
 * Every statement runs inside a request context. The read carries the
 * commercial gates in its own predicate, the way the Rooms read does. The mark
 * carries nothing of the kind: `housekeeping_unit_status`'s write policies are
 * the whole of what bounds it (ADR 0012), and nothing below asks whether the
 * actor may do this.
 */

/** A policy said no, or a column grant did. */
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Whether a failure carries a particular SQLSTATE. Read from the code rather
 * than from a policy name, and from the message as well as Prisma's `meta`,
 * for the reasons `@ranza/accommodation` gives beside its own copy.
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

interface RoomRow {
  unitId: string;
  name: string;
  unitType: string;
  building: string | null;
  floor: number | null;
  bedCount: number;
  status: HousekeepingStatus;
  ready: boolean;
  changedAt: Date | null;
  inHouse: boolean;
  outOfService: boolean;
  mayMark: boolean;
}

/** A cadence as the table stores it, and back; null is "follows the default". */
function cadenceFromRow(row: {
  cadence: string | null;
  everyDays: number | null;
  weekday: number | null;
}): StayoverCadence | null {
  if (row.cadence === "none") return { kind: "none" };
  if (row.cadence === "every_n_days" && row.everyDays !== null) {
    return { kind: "every_n_days", everyDays: row.everyDays };
  }
  if (row.cadence === "weekly" && row.weekday !== null) {
    return { kind: "weekly", weekday: row.weekday };
  }
  return null;
}

interface StayoverRow {
  unitId: string;
  name: string;
  building: string | null;
  floor: number | null;
  bedCount: number;
  occupants: number;
  arrivedOn: string;
  lastCleanedOn: string | null;
  dueOn: string;
  overdueDays: number;
  doneToday: boolean;
  mayMark: boolean;
}

function countsOf(rooms: readonly HousekeepingRoom[]): HousekeepingCounts {
  return {
    rooms: rooms.length,
    dirty: rooms.filter((room) => room.status === "dirty").length,
    clean: rooms.filter((room) => room.status === "clean").length,
    inspected: rooms.filter((room) => room.status === "inspected").length,
  };
}

function wordFor(value: boolean | null): InspectionValue {
  return value === null ? "default" : value ? "on" : "off";
}

function isStatus(value: string): value is HousekeepingStatus {
  return (HOUSEKEEPING_STATUSES as readonly string[]).includes(value);
}

export function createHousekeepingModule(deps: HousekeepingDeps) {
  /**
   * Every status holder at a Property — each room, and each bed with no room
   * above it — with its status and whether it is ready (HK-S1-13).
   *
   * One statement, so the counts and the rows come from one snapshot. The
   * status is `app.housekeeping_states()`'s, asked once for every room rather
   * than once per room: a holder with no row reads as clean, and one a Guest
   * has left since its status last changed reads as dirty before the worker has
   * written so (HK-S1-22). Readiness is `app.status_is_ready()` applied to that
   * state. Both are the definitions `app.unit_housekeeping_state()` and
   * `app.unit_is_ready()` — which the arrivals list and check-in read — are
   * built on, so the board cannot call a room ready, or clean, that check-in
   * then warns about.
   *
   * The commercial gates are in the predicate (HK-S1-15). A Property out of
   * reach, or one without housekeeping, returns no rows rather than a refusal
   * (HK-S1-14).
   */
  async function board(
    userId: string,
    propertyId: string,
  ): Promise<HousekeepingBoard> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<RoomRow[]>`
        select unit.id as "unitId",
               unit.name,
               unit.unit_type as "unitType",
               unit.building,
               unit.floor,
               (select count(*)::int
                  from public.accommodation_units as bed
                 where bed.parent_id = unit.id) as "bedCount",
               state.status,
               app.status_is_ready(unit.property_id, state.status) as ready,
               state.changed_at as "changedAt",
               exists (
                 select 1
                   from public.stays as stay
                   join public.accommodation_units as occupied
                     on occupied.id = stay.accommodation_unit_id
                  where stay.status = 'in_house'
                    and (occupied.id = unit.id or occupied.parent_id = unit.id)
               ) as "inHouse",
               (unit.status in ('blocked', 'out_of_service')
                or (exists (select 1 from public.accommodation_units as bed
                             where bed.parent_id = unit.id)
                    and not exists (
                      select 1 from public.accommodation_units as bed
                       where bed.parent_id = unit.id
                         and bed.status not in ('blocked', 'out_of_service')))
               ) as "outOfService",
               app.has_organization_permission(
                 unit.organization_id, 'housekeeping.update_status'
               ) as "mayMark"
          from public.accommodation_units as unit
          join app.housekeeping_states(
                 array(select holder.id
                         from public.accommodation_units as holder
                        where holder.property_id = ${propertyId}::uuid
                          and holder.parent_id is null)
               ) as state on state.holder_id = unit.id
         where unit.property_id = ${propertyId}::uuid
           and unit.parent_id is null
           and app.can_use_capability(
                 unit.property_id,
                 ${HOUSEKEEPING_CAPABILITY.moduleKey},
                 ${HOUSEKEEPING_CAPABILITY.capabilityKey}
               )
         order by unit.building nulls last, unit.floor nulls last, unit.name
      `,
    );

    const rooms = rows.map((row): HousekeepingRoom => ({
      unitId: row.unitId,
      name: row.name,
      unitType: row.unitType,
      building: row.building,
      floor: row.floor,
      bedCount: row.bedCount,
      status: row.status,
      ready: row.ready,
      changedAt: row.changedAt === null ? null : row.changedAt.toISOString(),
      inHouse: row.inHouse,
      outOfService: row.outOfService,
    }));
    return {
      rooms,
      counts: countsOf(rooms),
      mayMark: rows[0]?.mayMark ?? false,
    };
  }

  /**
   * Marking rooms dirty, clean or inspected — one, many, or back after a
   * mistake (HK-S2-01, HK-S2-02, HK-S2-05).
   *
   * All or nothing. Every named Unit must be one the caller can see, or the
   * whole mark is refused (HK-S2-07): half a selection marked, and silence
   * about the rest, is how a desk ends up believing a floor is ready.
   *
   * A bed is folded into its room, and each room is named once
   * (HK-S2-03). Postgres refuses an ON CONFLICT that reaches one row twice in
   * one statement, and two beds of one room would otherwise be exactly that.
   *
   * Any status may follow any other, including itself, because a correction is
   * one tap with no reason and a double submit must be harmless (HK-S2-06).
   * The previous status is `app.unit_housekeeping_state()`'s, read in the
   * statement's own snapshot, so the audit record says what the mark replaced
   * as the board showed it: clean for a room with no row, dirty for one a Guest
   * has left since it was last marked (HK-S1-22).
   */
  async function markUnits(
    userId: string,
    request: { unitIds: readonly string[]; status: string },
  ): Promise<UnitsMarked> {
    // Bounded on what was sent, then de-duplicated: a request naming two
    // hundred ids is refused as two hundred, whatever they collapse to.
    if (
      request.unitIds.length < MARK_BATCH.min ||
      request.unitIds.length > MARK_BATCH.max
    ) {
      throw new HousekeepingInputError(
        "a mark names between one and sixty rooms",
      );
    }
    const unitIds = [...new Set(request.unitIds)];
    const { status } = request;
    if (!isStatus(status)) {
      throw new HousekeepingInputError("a room is dirty, clean or inspected");
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [visible] = await tx.$queryRaw<{ count: number }[]>`
        select count(*)::int as count
          from public.accommodation_units
         where id = any (${unitIds}::uuid[])
      `;
      if ((visible?.count ?? 0) !== unitIds.length) {
        throw new HousekeepingRefusedError();
      }

      let marked: {
        unitId: string;
        organizationId: string;
        propertyId: string;
        name: string;
        previousStatus: HousekeepingStatus;
      }[];
      try {
        marked = await tx.$queryRaw`
          with target as (
            select distinct coalesce(unit.parent_id, unit.id) as holder,
                   unit.property_id, unit.organization_id
              from public.accommodation_units as unit
             where unit.id = any (${unitIds}::uuid[])
          ),
          previous as (
            select target.holder, state.status
              from target
             cross join app.unit_housekeeping_state(target.holder) as state
          )
          insert into public.housekeeping_unit_status
            (accommodation_unit_id, property_id, organization_id, status)
          select target.holder, target.property_id, target.organization_id,
                 ${status}
            from target
          on conflict (accommodation_unit_id) do update
             set status = excluded.status
          returning accommodation_unit_id as "unitId",
                    organization_id as "organizationId",
                    property_id as "propertyId",
                    (select unit.name
                       from public.accommodation_units as unit
                      where unit.id = accommodation_unit_id) as name,
                    (select previous.status
                       from previous
                      where previous.holder = accommodation_unit_id)
                      as "previousStatus"
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new HousekeepingRefusedError();
        }
        throw error;
      }

      if (marked.length === 0) {
        throw new HousekeepingRefusedError();
      }

      for (const room of marked) {
        await recordWithin(tx, {
          organizationId: room.organizationId,
          locationId: room.propertyId,
          actorId: userId,
          action: "housekeeping.status_changed",
          subjectType: "accommodation_unit",
          subjectId: room.unitId,
          context: {
            name: room.name,
            status,
            previousStatus: room.previousStatus,
          },
        });
      }

      return { marked: marked.length };
    });
  }

  /**
   * What a Property says about inspection, and whether the reader may change
   * it (HK-S3-09). Null for a Property the reader cannot reach or that has no
   * housekeeping: there is nothing there to configure.
   */
  async function inspectionSettings(
    userId: string,
    propertyId: string,
  ): Promise<InspectionSettings | null> {
    const [row] = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          {
            organizationDefault: boolean | null;
            propertyOverride: boolean | null;
            effective: boolean;
            hasPermission: boolean;
            wideReach: boolean;
          }[]
        >`
        select (select setting.inspect_after_cleaning
                  from public.housekeeping_settings as setting
                 where setting.organization_id = property.organization_id
                   and setting.property_id is null) as "organizationDefault",
               (select setting.inspect_after_cleaning
                  from public.housekeeping_settings as setting
                 where setting.property_id = property.id) as "propertyOverride",
               app.housekeeping_inspection_required(property.id) as effective,
               app.has_organization_permission(
                 property.organization_id, 'accommodation.configure'
               ) as "hasPermission",
               app.has_organization_wide_reach(property.organization_id)
                 as "wideReach"
          from public.properties as property
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${HOUSEKEEPING_CAPABILITY.moduleKey},
                 ${HOUSEKEEPING_CAPABILITY.capabilityKey}
               )
      `,
    );
    if (!row) return null;
    const mayConfigureDefault = row.hasPermission && row.wideReach;
    return {
      organizationDefault: row.organizationDefault ?? false,
      propertyOverride: row.propertyOverride,
      effective: row.effective,
      mayConfigure: row.hasPermission,
      mayConfigureDefault,
      defaultReach: mayConfigureDefault
        ? await defaultReach(userId, propertyId)
        : null,
    };
  }

  /**
   * Who a change of the Organization's inspection default would reach: the
   * Properties where housekeeping is on, split by whether each has an answer
   * of its own. Read under the reader's context, so it is only as wide as their
   * reach, which the caller has already established is the whole Organization.
   */
  async function defaultReach(
    userId: string,
    propertyId: string,
  ): Promise<DefaultReach> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<{ name: string; ownAnswer: boolean }[]>`
        select property.name as "name",
               setting.inspect_after_cleaning is not null as "ownAnswer"
          from public.properties as property
          left join public.housekeeping_settings as setting
            on setting.property_id = property.id
         where property.organization_id = (
                 select organization_id from public.properties
                  where id = ${propertyId}::uuid)
           and property.status = 'active'
           and app.can_use_capability(
                 property.id,
                 ${HOUSEKEEPING_CAPABILITY.moduleKey},
                 ${HOUSEKEEPING_CAPABILITY.capabilityKey}
               )
         order by property.name
      `,
    );
    return {
      following: rows.filter((row) => !row.ownAnswer).length,
      keepingOwn: rows.filter((row) => row.ownAnswer).map((row) => row.name),
    };
  }

  /**
   * One Property's own answer: on, off, or null to follow the default again
   * (HK-S3-02, HK-S3-10). Reset clears the value rather than deleting the row,
   * and the audit record keeps what it was (HK-S3-08). The policies decide
   * whether the reader may.
   */
  async function setPropertyInspection(
    userId: string,
    propertyId: string,
    value: boolean | null,
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: { organizationId: string; from: boolean | null }[];
      try {
        changed = await tx.$queryRaw`
          with previous as (
            select setting.inspect_after_cleaning as value
              from public.housekeeping_settings as setting
             where setting.property_id = ${propertyId}::uuid
          )
          insert into public.housekeeping_settings
            (organization_id, property_id, inspect_after_cleaning)
          select property.organization_id, property.id, ${value}::boolean
            from public.properties as property
           where property.id = ${propertyId}::uuid
          on conflict (property_id) where property_id is not null do update
             set inspect_after_cleaning = excluded.inspect_after_cleaning
          returning organization_id as "organizationId",
                    (select value from previous) as "from"
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new HousekeepingRefusedError();
        }
        throw error;
      }
      const [setting] = changed;
      if (!setting) throw new HousekeepingRefusedError();

      await recordWithin(tx, {
        organizationId: setting.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "housekeeping.inspection_set",
        subjectType: "property",
        subjectId: propertyId,
        context: { from: wordFor(setting.from), to: wordFor(value) },
      });
    });
  }

  /**
   * The Organization's default, named through a Property the reader is on:
   * the screen is a Property's, and so is the reach that opens it. Needs reach
   * to every Property the default governs (HK-S3-05).
   */
  async function setOrganizationInspection(
    userId: string,
    propertyId: string,
    value: boolean,
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: { organizationId: string; from: boolean | null }[];
      try {
        changed = await tx.$queryRaw`
          with target as (
            select property.organization_id
              from public.properties as property
             where property.id = ${propertyId}::uuid
          ),
          previous as (
            select setting.inspect_after_cleaning as value
              from public.housekeeping_settings as setting
             where setting.organization_id = (select organization_id from target)
               and setting.property_id is null
          )
          insert into public.housekeeping_settings
            (organization_id, inspect_after_cleaning)
          select organization_id, ${value}::boolean from target
          on conflict (organization_id) where property_id is null do update
             set inspect_after_cleaning = excluded.inspect_after_cleaning
          returning organization_id as "organizationId",
                    (select value from previous) as "from"
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new HousekeepingRefusedError();
        }
        throw error;
      }
      const [setting] = changed;
      if (!setting) throw new HousekeepingRefusedError();

      await recordWithin(tx, {
        organizationId: setting.organizationId,
        actorId: userId,
        action: "housekeeping.inspection_set",
        subjectType: "organization",
        subjectId: setting.organizationId,
        // A default never set was off, which is what every Property read.
        context: { from: wordFor(setting.from ?? false), to: wordFor(value) },
      });
    });
  }

  /**
   * What a Property says about cleaning rooms somebody is staying in, and
   * whether the reader may change it. Null for a Property the reader cannot
   * reach or that has no housekeeping.
   */
  async function stayoverSettings(
    userId: string,
    propertyId: string,
  ): Promise<StayoverSettings | null> {
    const [row] = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          {
            cadence: string | null;
            everyDays: number | null;
            weekday: number | null;
            mayConfigure: boolean;
          }[]
        >`
        select setting.cadence,
               setting.every_days as "everyDays",
               setting.weekday,
               app.has_organization_permission(
                 property.organization_id, 'accommodation.configure'
               ) as "mayConfigure"
          from public.properties as property
          left join public.housekeeping_stayover_settings as setting
            on setting.property_id = property.id
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${HOUSEKEEPING_CAPABILITY.moduleKey},
                 ${HOUSEKEEPING_CAPABILITY.capabilityKey}
               )
      `,
    );
    if (!row) return null;
    return { own: cadenceFromRow(row), mayConfigure: row.mayConfigure };
  }

  /**
   * One Property's own cadence, or null to follow the default again
   * (HK-S4-02, HK-S4-03). Going back clears the value rather than deleting the
   * row, and the audit record keeps what it was. The policies decide whether
   * the reader may (HK-S4-04).
   */
  async function setStayoverCadence(
    userId: string,
    propertyId: string,
    cadence: StayoverCadence | null,
  ): Promise<void> {
    if (cadence !== null && !isStayoverCadence(cadence)) {
      throw new HousekeepingInputError("that is not a cleaning schedule");
    }
    const stored = {
      cadence: cadence?.kind ?? null,
      everyDays: cadence?.kind === "every_n_days" ? cadence.everyDays : null,
      weekday: cadence?.kind === "weekly" ? cadence.weekday : null,
    };

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: {
        organizationId: string;
        fromCadence: string | null;
        fromEveryDays: number | null;
        fromWeekday: number | null;
      }[];
      try {
        changed = await tx.$queryRaw`
          with previous as (
            select setting.cadence, setting.every_days, setting.weekday
              from public.housekeeping_stayover_settings as setting
             where setting.property_id = ${propertyId}::uuid
          )
          insert into public.housekeeping_stayover_settings
            (property_id, organization_id, cadence, every_days, weekday)
          select property.id, property.organization_id,
                 ${stored.cadence}, ${stored.everyDays}::int,
                 ${stored.weekday}::int
            from public.properties as property
           where property.id = ${propertyId}::uuid
          on conflict (property_id) do update
             set cadence = excluded.cadence,
                 every_days = excluded.every_days,
                 weekday = excluded.weekday
          returning organization_id as "organizationId",
                    (select cadence from previous) as "fromCadence",
                    (select every_days from previous) as "fromEveryDays",
                    (select weekday from previous) as "fromWeekday"
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new HousekeepingRefusedError();
        }
        throw error;
      }
      const [setting] = changed;
      if (!setting) throw new HousekeepingRefusedError();

      await recordWithin(tx, {
        organizationId: setting.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "housekeeping.stayover_set",
        subjectType: "property",
        subjectId: propertyId,
        context: {
          from: stayoverValueOf(
            cadenceFromRow({
              cadence: setting.fromCadence,
              everyDays: setting.fromEveryDays,
              weekday: setting.fromWeekday,
            }),
          ),
          to: stayoverValueOf(cadence),
        },
      });
    });
  }

  /**
   * The occupied rooms due a clean today, and those cleaned today (HK-S4-05).
   *
   * `fallback` is what applies when the Property has no cadence of its own. The
   * host chooses it, by operating model or otherwise, and this module is told
   * the answer: nothing here reads the model (ADR 0057). The schedule is passed
   * down to `app.housekeeping_stayover_rooms()`, which decides which rooms are
   * due and reads no model either.
   *
   * Read, never stored: a Property that changes its schedule sees the whole list
   * re-drawn by its next read, and no job exists that could stall (ADR 0063).
   * A Property without housekeeping, or out of reach, returns an empty board.
   */
  async function stayoverBoard(
    userId: string,
    propertyId: string,
    fallback: StayoverCadence,
  ): Promise<StayoverBoard> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [own] = await tx.$queryRaw<
        {
          cadence: string | null;
          everyDays: number | null;
          weekday: number | null;
          today: string;
        }[]
      >`
        select setting.cadence,
               setting.every_days as "everyDays",
               setting.weekday,
               app.property_today(property.id)::text as today
          from public.properties as property
          left join public.housekeeping_stayover_settings as setting
            on setting.property_id = property.id
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${HOUSEKEEPING_CAPABILITY.moduleKey},
                 ${HOUSEKEEPING_CAPABILITY.capabilityKey}
               )
      `;
      if (!own) {
        return {
          cadence: fallback,
          today: "",
          rooms: [],
          counts: { due: 0, done: 0 },
          mayMark: false,
        };
      }
      const cadence = cadenceFromRow(own) ?? fallback;
      if (cadence.kind === "none") {
        return {
          cadence,
          today: own.today,
          rooms: [],
          counts: { due: 0, done: 0 },
          mayMark: false,
        };
      }

      const everyDays =
        cadence.kind === "every_n_days" ? cadence.everyDays : null;
      const weekday = cadence.kind === "weekly" ? cadence.weekday : null;
      const rows = await tx.$queryRaw<StayoverRow[]>`
        select unit.id as "unitId",
               unit.name,
               unit.building,
               unit.floor,
               (select count(*)::int
                  from public.accommodation_units as bed
                 where bed.parent_id = unit.id) as "bedCount",
               room.occupants,
               room.arrived_on::text as "arrivedOn",
               room.last_cleaned_on::text as "lastCleanedOn",
               room.due_on::text as "dueOn",
               greatest(app.property_today(unit.property_id) - room.due_on, 0)
                 as "overdueDays",
               (room.cleaning_id is not null) as "doneToday",
               app.has_organization_permission(
                 unit.organization_id, 'housekeeping.update_status'
               ) as "mayMark"
          from app.housekeeping_stayover_rooms(
                 ${propertyId}::uuid, ${cadence.kind}, ${everyDays}::int,
                 ${weekday}::int
               ) as room
          join public.accommodation_units as unit on unit.id = room.holder_id
         order by (room.cleaning_id is not null),
                  room.due_on,
                  unit.building nulls last,
                  unit.floor nulls last,
                  unit.name
      `;

      const rooms = rows.map((row): StayoverRoom => ({
        unitId: row.unitId,
        name: row.name,
        building: row.building,
        floor: row.floor,
        bedCount: row.bedCount,
        occupants: row.occupants,
        arrivedOn: row.arrivedOn,
        lastCleanedOn: row.lastCleanedOn,
        dueOn: row.dueOn,
        overdueDays: row.overdueDays,
        doneToday: row.doneToday,
      }));
      return {
        cadence,
        today: own.today,
        rooms,
        counts: {
          due: rooms.filter((room) => !room.doneToday).length,
          done: rooms.filter((room) => room.doneToday).length,
        },
        mayMark: rows[0]?.mayMark ?? false,
      };
    });
  }

  /**
   * Record that a room somebody is staying in was cleaned today (HK-S4-08).
   *
   * One press, and a second is harmless: a room already cleaned today records
   * nothing and says so (HK-S4-10). The write policy bounds who and which
   * Unit; the date and the actor are stamped by the database, so this cannot
   * say when. Visibility is asked first, as a mark does (HK-S2-07), because a
   * row that is not there looks exactly like a press that changed nothing.
   */
  async function markStayoverCleaned(
    userId: string,
    unitId: string,
  ): Promise<StayoverMarked> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [visible] = await tx.$queryRaw<{ count: number }[]>`
        select count(*)::int as count
          from public.accommodation_units
         where id = ${unitId}::uuid
      `;
      if ((visible?.count ?? 0) !== 1) throw new HousekeepingRefusedError();

      let recorded: {
        organizationId: string;
        propertyId: string;
        name: string;
      }[];
      try {
        recorded = await tx.$queryRaw`
          insert into public.housekeeping_stayover_cleanings
            (accommodation_unit_id, property_id, organization_id)
          select unit.id, unit.property_id, unit.organization_id
            from public.accommodation_units as unit
           where unit.id = ${unitId}::uuid
          on conflict (accommodation_unit_id, cleaned_on)
            where undone_at is null do nothing
          returning organization_id as "organizationId",
                    property_id as "propertyId",
                    (select unit.name
                       from public.accommodation_units as unit
                      where unit.id = accommodation_unit_id) as name
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new HousekeepingRefusedError();
        }
        throw error;
      }

      const [cleaning] = recorded;
      if (!cleaning) return { recorded: false };

      await recordWithin(tx, {
        organizationId: cleaning.organizationId,
        locationId: cleaning.propertyId,
        actorId: userId,
        action: "housekeeping.stayover_cleaned",
        subjectType: "accommodation_unit",
        subjectId: unitId,
        context: { name: cleaning.name },
      });
      return { recorded: true };
    });
  }

  /**
   * Take back today's press (HK-S4-13). The row is stamped and stays; only a
   * press made today can be taken back (HK-S4-14). A press that is not there to
   * undo, or one the reader may not undo, is one refusal, as a mark's is.
   */
  async function undoStayoverCleaned(
    userId: string,
    unitId: string,
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let undone: {
        organizationId: string;
        propertyId: string;
        name: string;
      }[];
      try {
        undone = await tx.$queryRaw`
          update public.housekeeping_stayover_cleanings as cleaning
             set undone_at = now()
           where cleaning.accommodation_unit_id = ${unitId}::uuid
             and cleaning.undone_at is null
             and cleaning.cleaned_on = app.property_today(cleaning.property_id)
          returning cleaning.organization_id as "organizationId",
                    cleaning.property_id as "propertyId",
                    (select unit.name
                       from public.accommodation_units as unit
                      where unit.id = cleaning.accommodation_unit_id) as name
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new HousekeepingRefusedError();
        }
        throw error;
      }

      const [cleaning] = undone;
      if (!cleaning) throw new HousekeepingRefusedError();

      await recordWithin(tx, {
        organizationId: cleaning.organizationId,
        locationId: cleaning.propertyId,
        actorId: userId,
        action: "housekeeping.stayover_undone",
        subjectType: "accommodation_unit",
        subjectId: unitId,
        context: { name: cleaning.name },
      });
    });
  }

  return {
    board,
    markUnits,
    inspectionSettings,
    setPropertyInspection,
    setOrganizationInspection,
    stayoverSettings,
    setStayoverCadence,
    stayoverBoard,
    markStayoverCleaned,
    undoStayoverCleaned,
  };
}

export type HousekeepingModule = ReturnType<typeof createHousekeepingModule>;
