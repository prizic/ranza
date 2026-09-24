import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  BEDS_PER_ROOM,
  BLOCK_REASON,
  BUILDING_NAME,
  FLOOR,
  ROOM_NUMBER,
  ROOMS_CAPABILITY,
  UNIT_BATCH,
  UNIT_CAPACITY,
  UnitConfigurationError,
  UnitNameTakenError,
  UnitOccupiedError,
  UnitRefusedError,
  type AccommodationUnitStatus,
  type AccommodationUnitType,
  type NewUnits,
  type UnitCounts,
  type UnitEntry,
  type UnitMap,
  type UnitsAdded,
  type UnitState,
} from "./contracts";
import type { AccommodationDeps } from "./ports";

/**
 * The Rooms screen: every Unit at a Property and what each is doing tonight,
 * adding rooms in one go, and blocking a bed with a reason.
 *
 * Every statement runs inside a request context, and the read carries the
 * commercial gates in its own predicate the way the booking form's Unit list
 * does. The writes carry nothing of the kind: `accommodation_units_insert_configure`
 * and `accommodation_units_update_configure` are the whole of what bounds
 * them (ADR 0012), and nothing below asks whether the actor may do this.
 */

/** Postgres raises this when a unique index rejects a row. */
const UNIQUE_VIOLATION = "23505";

/** A policy said no, or a column grant did. */
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Raised by `app.unit_can_be_blocked()`. Deliberately not 42501: a policy
 * refusal is also 42501, and "somebody is in it" is a different answer from
 * "you cannot".
 */
const NOT_PERMITTED_BY_STATE = "55000";

/**
 * Whether a failure carries a particular SQLSTATE.
 *
 * Read from the code rather than from a constraint or trigger name, so renaming
 * either cannot silently turn a specific failure into a generic one.
 *
 * Prisma reports a raw-query failure as P2010 and carries the real code inside
 * `meta`, so that nested path is the first place to look. The message is checked
 * too, because the shape of `meta` is Prisma's private arrangement and has
 * already changed once — and the cost of being wrong is asymmetric. Missing the
 * code reports a specific, actionable refusal as an unexplained error; there is
 * no false positive, because nothing else in these transactions raises either
 * code.
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

/** One row per Unit, leaf or not, as the read returns it. */
interface UnitRow {
  unitId: string;
  parentId: string | null;
  name: string;
  unitType: AccommodationUnitType;
  capacity: number;
  building: string | null;
  floor: number | null;
  status: AccommodationUnitStatus;
  statusReason: string | null;
  /** The status of the room above a bed; null for anything with no parent. */
  roomStatus: AccommodationUnitStatus | null;
  hasChildren: boolean;
  /** Set when a Stay is in house on this Unit. */
  stayId: string | null;
  guestName: string | null;
  endsOn: string | null;
  /** The earliest confirmed Reservation still to come. */
  arrivesOn: string | null;
  today: string;
}

/** Tonight, for a leaf, in the order of precedence the contract states. */
function stateOf(row: UnitRow): UnitState {
  if (row.stayId !== null) {
    return {
      kind: "in_house",
      guestName: row.guestName ?? "",
      endsOn: row.endsOn,
    };
  }
  if (row.status === "blocked") {
    // The check constraint makes a blocked Unit without a reason
    // unrepresentable; the fallback is for the type, not for a row.
    return { kind: "blocked", reason: row.statusReason ?? "" };
  }
  // A room out of order covers its beds, whatever each bed's own status
  // (ADR 0032, MT-S2-06).
  if (row.status === "out_of_service" || row.roomStatus === "out_of_service") {
    return { kind: "out_of_service" };
  }
  if (row.arrivesOn !== null)
    return { kind: "reserved", arrivesOn: row.arrivesOn };
  return { kind: "free" };
}

function entryOf(row: UnitRow, beds: readonly UnitEntry[]): UnitEntry {
  return {
    unitId: row.unitId,
    name: row.name,
    unitType: row.unitType,
    capacity: row.capacity,
    building: row.building,
    floor: row.floor,
    status: row.status,
    state: row.hasChildren ? null : stateOf(row),
    beds,
  };
}

/** The letters beds are named by: A for the first, Z for the twenty-sixth. */
function bedLetters(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    String.fromCharCode("A".charCodeAt(0) + index),
  );
}

/**
 * Room numbers counted on from the first, keeping its width: `001` and three
 * give `001`, `002`, `003`, because a Property that zero-pads its rooms means
 * to.
 */
function roomNumbers(first: string, count: number): string[] {
  const start = Number(first);
  return Array.from({ length: count }, (_, index) =>
    String(start + index).padStart(first.length, "0"),
  );
}

export function createAccommodationModule(deps: AccommodationDeps) {
  /**
   * Every Unit at a Property, rooms with their beds, and what each sellable
   * one is doing tonight (RB-S1-01).
   *
   * One statement, so the map and the counts above it come from one snapshot
   * and cannot disagree about a check-in that landed between two queries.
   * Occupancy is read from Stays and Reservations, not from the status column
   * — nothing writes `occupied` to it (RB-S1-04) — and "tonight" is the
   * Property's own day (RB-S1-07). The tree is built here: a bed's row names
   * its room, and grouping a few hundred rows is cheaper than a recursive
   * query that would also have to be told the tree is two deep.
   *
   * The commercial gates are in the predicate (RB-S1-03). A Property the
   * caller cannot reach, or one whose Organization lost the Entitlement,
   * returns no rows rather than a refusal, exactly as the booking form's Unit
   * list does.
   */
  async function listUnits(
    userId: string,
    propertyId: string,
  ): Promise<UnitMap> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<UnitRow[]>`
        select
          unit.id            as "unitId",
          unit.parent_id     as "parentId",
          unit.name          as "name",
          unit.unit_type     as "unitType",
          unit.capacity      as "capacity",
          unit.building      as "building",
          unit.floor         as "floor",
          unit.status        as "status",
          unit.status_reason as "statusReason",
          room.status        as "roomStatus",
          exists (
            select 1 from public.accommodation_units as child
            where child.parent_id = unit.id
          )                                        as "hasChildren",
          occupant.stay_id                         as "stayId",
          occupant.guest_name                      as "guestName",
          to_char(occupant.ends_on, 'YYYY-MM-DD')  as "endsOn",
          to_char(upcoming.starts_on, 'YYYY-MM-DD') as "arrivesOn",
          to_char(today.day, 'YYYY-MM-DD')         as "today"
        from public.accommodation_units as unit
        left join public.accommodation_units as room
          on room.id = unit.parent_id
        cross join (
          select app.property_today(${propertyId}::uuid) as day
        ) as today
        left join lateral (
          select stay.id as stay_id, stay.ends_on, guest.full_name as guest_name
          from public.stays as stay
          left join public.reservations as reservation
            on reservation.id = stay.reservation_id
          left join public.guests as guest
            on guest.id = reservation.guest_id
          where stay.accommodation_unit_id = unit.id
            and stay.status = 'in_house'
          order by stay.starts_on desc
          limit 1
        ) as occupant on true
        left join lateral (
          select reservation.starts_on
          from public.reservations as reservation
          where reservation.accommodation_unit_id = unit.id
            and reservation.status = 'confirmed'
            and (reservation.ends_on is null or reservation.ends_on > today.day)
          order by reservation.starts_on
          limit 1
        ) as upcoming on true
        where unit.property_id = ${propertyId}::uuid
          and app.can_use_capability(
            unit.property_id,
            ${ROOMS_CAPABILITY.moduleKey},
            ${ROOMS_CAPABILITY.capabilityKey}
          )
        order by unit.building nulls first, unit.floor nulls first, unit.name
      `,
    );

    const bedsByRoom = new Map<string, UnitRow[]>();
    for (const row of rows) {
      if (row.parentId === null) continue;
      const beds = bedsByRoom.get(row.parentId) ?? [];
      beds.push(row);
      bedsByRoom.set(row.parentId, beds);
    }

    const units = rows
      .filter((row) => row.parentId === null)
      .map((row) =>
        entryOf(
          row,
          (bedsByRoom.get(row.unitId) ?? []).map((bed) => entryOf(bed, [])),
        ),
      );

    const counts: UnitCounts = {
      rooms: units.length,
      sellable: 0,
      inHouse: 0,
      reserved: 0,
      free: 0,
      blocked: 0,
      outOfService: 0,
    };
    for (const row of rows) {
      if (row.hasChildren) continue;
      counts.sellable += 1;
      const state = stateOf(row);
      if (state.kind === "in_house") counts.inHouse += 1;
      else if (state.kind === "blocked") counts.blocked += 1;
      else if (state.kind === "out_of_service") counts.outOfService += 1;
      else {
        counts.free += 1;
        if (state.kind === "reserved") counts.reserved += 1;
      }
    }

    // No rows is either a Property with no Units or one the caller cannot
    // reach, and the two are deliberately the same answer. The day is still
    // needed for the empty state's heading, and there is no row to read it
    // from, so it is the server's — which is the one case a Property's own day
    // is not on offer.
    const today = rows[0]?.today ?? new Date().toISOString().slice(0, 10);
    return { today, units, counts };
  }

  /**
   * Rooms in one go, each with its beds when let by the bed (RB-S2-01,
   * RB-S2-02).
   *
   * Shape first, and before the transaction: a count, a capacity or a number
   * the person typed is theirs to correct, and the sentence naming it belongs
   * to this module rather than to a constraint violation to decode.
   *
   * The Organization is read from the Property row, never taken from the
   * caller (ADR 0012), and the Property is the thing the caller is allowed to
   * name. The insert policy refuses the rest independently; the unique index
   * refuses a name already taken, whichever of two people asked first
   * (RB-S2-11).
   */
  async function addUnits(
    userId: string,
    input: NewUnits,
  ): Promise<UnitsAdded> {
    const building = input.building?.trim() || null;
    if (building !== null && building.length > BUILDING_NAME.max) {
      throw new UnitConfigurationError(
        "a building name is at most sixty characters",
      );
    }
    if (
      input.floor !== null &&
      (!Number.isInteger(input.floor) ||
        input.floor < FLOOR.min ||
        input.floor > FLOOR.max)
    ) {
      throw new UnitConfigurationError("that is not a floor");
    }
    if (
      !new RegExp(`^\\d{${ROOM_NUMBER.min},${ROOM_NUMBER.max}}$`).test(
        input.firstNumber,
      )
    ) {
      throw new UnitConfigurationError("a room number is one to eight digits");
    }
    if (
      !Number.isInteger(input.count) ||
      input.count < UNIT_BATCH.min ||
      input.count > UNIT_BATCH.max
    ) {
      throw new UnitConfigurationError("one to sixty rooms in one go");
    }
    if (
      !Number.isInteger(input.capacity) ||
      input.capacity < UNIT_CAPACITY.min ||
      input.capacity > UNIT_CAPACITY.max
    ) {
      throw new UnitConfigurationError("a Unit sleeps one to sixty-four");
    }
    if (input.letByTheBed && input.unitType !== "room") {
      throw new UnitConfigurationError("only a room is let by the bed");
    }
    if (input.letByTheBed && input.capacity > BEDS_PER_ROOM.max) {
      throw new UnitConfigurationError("a room holds at most twenty-six beds");
    }

    const names = roomNumbers(input.firstNumber, input.count);
    const letters = input.letByTheBed ? bedLetters(input.capacity) : [];

    try {
      return await withOrganizationContext(deps.db, { userId }, async (tx) => {
        const rooms = await tx.$queryRawUnsafe<
          { id: string; name: string; organizationId: string }[]
        >(
          `insert into public.accommodation_units
             (organization_id, property_id, name, unit_type, capacity,
              building, floor)
           select property.organization_id, property.id, wanted.name,
                  $3, $4::int, $5, $6::int
           from public.properties as property
           cross join unnest($2::text[]) as wanted (name)
           where property.id = $1::uuid
             and app.can_use_capability(property.id, $7, $8)
           returning id, name, organization_id as "organizationId"`,
          input.propertyId,
          names,
          input.unitType,
          input.capacity,
          building,
          input.floor,
          ROOMS_CAPABILITY.moduleKey,
          ROOMS_CAPABILITY.capabilityKey,
        );

        const [first] = rooms;
        if (!first) {
          // Out of reach, unentitled, lapsed, or never existed. One message
          // for all four: telling them apart would confirm that a Property
          // the caller cannot see is there.
          throw new UnitRefusedError("those rooms cannot be added");
        }

        const roomIds = rooms.map((room) => room.id);
        let bedCount = 0;
        if (letters.length > 0) {
          // A bed takes its room's building and floor, so a list of beds can
          // be grouped the way a list of rooms is.
          const beds = await tx.$queryRawUnsafe<{ id: string }[]>(
            `insert into public.accommodation_units
               (organization_id, property_id, parent_id, parent_unit_type,
                name, unit_type, capacity, building, floor)
             select room.organization_id, room.property_id, room.id, 'room',
                    bed.letter, 'bed', 1, room.building, room.floor
             from public.accommodation_units as room
             cross join unnest($2::text[]) as bed (letter)
             where room.id = any ($1::uuid[])
             returning id`,
            roomIds,
            letters,
          );
          bedCount = beds.length;
        }

        await recordWithin(tx, {
          organizationId: first.organizationId,
          locationId: input.propertyId,
          actorId: userId,
          action: "unit.added",
          subjectType: "property",
          subjectId: input.propertyId,
          context: {
            unitIds: roomIds,
            names,
            unitType: input.unitType,
            capacity: input.capacity,
            building,
            floor: input.floor,
            letByTheBed: input.letByTheBed,
            bedCount,
          },
        });

        return { unitIds: roomIds, names, bedCount };
      });
    } catch (error: unknown) {
      if (raised(error, UNIQUE_VIOLATION)) {
        // The index refused, and the transaction is gone. This read is only
        // the explanation: which of the names is the one already there.
        throw new UnitNameTakenError(
          await takenName(userId, input.propertyId, names),
        );
      }
      if (raised(error, INSUFFICIENT_PRIVILEGE)) {
        throw new UnitRefusedError("those rooms cannot be added");
      }
      throw error;
    }
  }

  /**
   * The first of `names` already at the Property, for the sentence a person
   * can act on (RB-S2-06). Under the same context, so a name the caller
   * cannot see is not disclosed by this either.
   */
  async function takenName(
    userId: string,
    propertyId: string,
    names: readonly string[],
  ): Promise<string> {
    const found = await withOrganizationContext(deps.db, { userId }, (tx) =>
      tx.$queryRawUnsafe<{ name: string }[]>(
        `select name from public.accommodation_units
          where property_id = $1::uuid
            and parent_id is null
            and name = any ($2::text[])
          order by name
          limit 1`,
        propertyId,
        names,
      ),
    );
    // Unreachable in practice — nothing deletes a Unit, so the row that won
    // is still there — but the type needs an answer.
    return found[0]?.name ?? names[0] ?? "";
  }

  /**
   * Blocking a Unit with a reason (RB-S3-01).
   *
   * `status = 'available'` in the predicate rather than a check: a Unit that
   * is already blocked, out of service, or not the caller's to see all return
   * no row, and they are deliberately one answer. The triggers are what
   * refuse a Unit somebody is in or a room let by the bed, and those are the
   * refusals worth telling apart because a Staff Member can act on them.
   */
  async function blockUnit(
    userId: string,
    unitId: string,
    reason: string,
  ): Promise<void> {
    const trimmed = reason.trim();
    if (
      trimmed.length < BLOCK_REASON.min ||
      trimmed.length > BLOCK_REASON.max
    ) {
      throw new UnitConfigurationError(
        "a reason is between three and two hundred characters",
      );
    }

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let blocked: {
        organizationId: string;
        propertyId: string;
        name: string;
      }[];
      try {
        blocked = await tx.$queryRaw<
          { organizationId: string; propertyId: string; name: string }[]
        >`
          update public.accommodation_units
             set status = 'blocked',
                 status_reason = ${trimmed},
                 updated_at = now()
           where id = ${unitId}::uuid
             and status = 'available'
          returning organization_id as "organizationId",
                    property_id     as "propertyId",
                    name
        `;
      } catch (error: unknown) {
        if (raised(error, NOT_PERMITTED_BY_STATE)) {
          throw new UnitOccupiedError(
            "that Accommodation Unit has somebody in it, or is let by the bed",
          );
        }
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new UnitRefusedError(
            "that Accommodation Unit cannot be blocked",
          );
        }
        throw error;
      }

      const [unit] = blocked;
      if (!unit) {
        throw new UnitRefusedError("that Accommodation Unit cannot be blocked");
      }

      await recordWithin(tx, {
        organizationId: unit.organizationId,
        locationId: unit.propertyId,
        actorId: userId,
        action: "unit.blocked",
        subjectType: "accommodation_unit",
        subjectId: unitId,
        reason: trimmed,
        context: { name: unit.name },
      });
    });
  }

  /** The way back (RB-S3-08). The reason goes with the block. */
  async function unblockUnit(userId: string, unitId: string): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const existing = await tx.$queryRaw<
        { organizationId: string; name: string; reason: string | null }[]
      >`
        select organization_id as "organizationId", name, status_reason as "reason"
        from public.accommodation_units
        where id = ${unitId}::uuid
          and status = 'blocked'
      `;
      const [current] = existing;
      if (!current) {
        throw new UnitRefusedError(
          "that Accommodation Unit cannot be unblocked",
        );
      }

      let unblocked: {
        organizationId: string;
        propertyId: string;
        name: string;
      }[];
      try {
        unblocked = await tx.$queryRaw<
          { organizationId: string; propertyId: string; name: string }[]
        >`
          update public.accommodation_units
             set status = 'available',
                 status_reason = null,
                 updated_at = now()
           where id = ${unitId}::uuid
             and status = 'blocked'
          returning organization_id as "organizationId",
                    property_id     as "propertyId",
                    name
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new UnitRefusedError(
            "that Accommodation Unit cannot be unblocked",
          );
        }
        throw error;
      }

      const [unit] = unblocked;
      if (!unit) {
        throw new UnitRefusedError(
          "that Accommodation Unit cannot be unblocked",
        );
      }

      // The reason it had been blocked for, kept where the history is.
      await recordWithin(tx, {
        organizationId: unit.organizationId,
        locationId: unit.propertyId,
        actorId: userId,
        action: "unit.unblocked",
        subjectType: "accommodation_unit",
        subjectId: unitId,
        context: { name: unit.name, hadBeenBlockedFor: current.reason },
      });
    });
  }

  return { addUnits, blockUnit, listUnits, unblockUnit };
}

export type AccommodationModule = ReturnType<typeof createAccommodationModule>;
