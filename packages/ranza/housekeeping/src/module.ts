import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  HOUSEKEEPING_CAPABILITY,
  HOUSEKEEPING_STATUSES,
  HousekeepingInputError,
  HousekeepingRefusedError,
  MARK_BATCH,
  type HousekeepingBoard,
  type HousekeepingCounts,
  type HousekeepingRoom,
  type HousekeepingStatus,
  type InspectionSettings,
  type InspectionValue,
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

function countsOf(rooms: readonly HousekeepingRoom[]): HousekeepingCounts {
  return {
    rooms: rooms.length,
    dirty: rooms.filter((room) => room.status === "dirty").length,
    clean: rooms.filter((room) => room.status === "clean").length,
    inspected: rooms.filter((room) => room.status === "inspected").length,
    ready: rooms.filter((room) => room.ready).length,
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
   * One statement, so the counts and the rows come from one snapshot. A holder
   * with no row reads as clean. Readiness is `app.unit_is_ready()`, the one
   * definition the arrivals list and check-in read too, so the board cannot
   * call a room ready that check-in then warns about.
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
               coalesce(state.status, 'clean') as status,
               app.unit_is_ready(unit.id) as ready,
               state.status_changed_at as "changedAt",
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
          left join public.housekeeping_unit_status as state
            on state.accommodation_unit_id = unit.id
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
   * The previous status comes from the statement's own snapshot, so the audit
   * record says what the mark actually replaced.
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
        name: string;
        previousStatus: HousekeepingStatus | null;
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
            select state.accommodation_unit_id as holder, state.status
              from public.housekeeping_unit_status as state
             where state.accommodation_unit_id in (select holder from target)
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
          actorId: userId,
          action: "housekeeping.status_changed",
          subjectType: "accommodation_unit",
          subjectId: room.unitId,
          context: {
            name: room.name,
            status,
            // A room with no row was clean: that is what the board showed.
            previousStatus: room.previousStatus ?? "clean",
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
    return {
      organizationDefault: row.organizationDefault ?? false,
      propertyOverride: row.propertyOverride,
      effective: row.effective,
      mayConfigure: row.hasPermission,
      mayConfigureDefault: row.hasPermission && row.wideReach,
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

  return {
    board,
    markUnits,
    inspectionSettings,
    setPropertyInspection,
    setOrganizationInspection,
  };
}

export type HousekeepingModule = ReturnType<typeof createHousekeepingModule>;
