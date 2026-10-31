import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  CURFEW_TIME,
  DEFAULT_CURFEW,
  LEAVE_NIGHTS_MAX,
  LEAVE_REASON,
  AttendanceInputError,
  AttendanceRefusedError,
  LeaveClosedError,
  LeaveOverlapsError,
  type CurrentLeave,
  type Mark,
  type NewLeave,
  type RecordedAttendance,
  type RollCall,
  type RollCallRow,
  type TonightFigures,
} from "./contracts";
import { figuresOf, inWalkingOrder, statusOf } from "./figures";
import type { AttendanceDeps } from "./ports";

/**
 * Leave (izin) and the nightly roll call (yoklama).
 *
 * Like every Ranza module this owns no authorization logic and no rule the
 * database can hold. Who may call the roll, who may grant leave, which Resident
 * may be called on which night, that leave never overlaps and is never deleted,
 * and who said what and when, are the policies and triggers of
 * `20260916014400_a_yurt_keeps_leave_and_a_roll_call`. This module reads the
 * night and asks for the writes.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const EXCLUSION_VIOLATION = "23P01";
const CHECK_VIOLATION = "23514";
const LEAVE_REFUSED = "RZL01";
const LEAVE_CLOSED = "RZL02";
const CALL_REFUSED = "RZA01";

/** As every module's: the code in Prisma's `meta`, or failing that the message. */
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function nightsBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

interface PropertyNight {
  organizationId: string;
  operatingModel: "hotel" | "dormitory";
  night: string;
  timezone: string;
  cutoff: string;
  storedCurfew: string | null;
  hasSetting: boolean;
  enabled: boolean;
  mayTake: boolean;
  mayGrant: boolean;
  mayConfigure: boolean;
}

interface RollCallQueryRow {
  stayId: string;
  residentName: string | null;
  building: string | null;
  floor: number | null;
  roomName: string;
  bedName: string | null;
  mark: Mark | null;
  markedAt: Date | null;
  leaveId: string | null;
  fromNight: string | null;
  toNight: string | null;
  reason: string | null;
}

interface Tx {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
}

export function createAttendanceModule(deps: AttendanceDeps) {
  /**
   * What the database says about this Property tonight and about this viewer:
   * the night, its curfew, and whether the viewer may take the roll, grant
   * leave or set the curfew. Null when the Property is out of reach, or does
   * not keep attendance, or the viewer may do neither: the three read as one,
   * so a screen is not an oracle for who holds what.
   */
  async function propertyNight(
    tx: Tx,
    propertyId: string,
  ): Promise<PropertyNight | null> {
    const [row] = await tx.$queryRaw<PropertyNight[]>`
      select property.organization_id           as "organizationId",
             property.operating_model           as "operatingModel",
             to_char(app.property_today(property.id), 'YYYY-MM-DD') as "night",
             property.timezone                  as "timezone",
             to_char(property.business_date_cutoff, 'HH24:MI') as "cutoff",
             to_char(setting.curfew_time, 'HH24:MI') as "storedCurfew",
             setting.property_id is not null    as "hasSetting",
             app.can_use_capability(property.id, 'front_office', 'attendance') as "enabled",
             app.has_organization_permission(property.organization_id, 'attendance.take') as "mayTake",
             app.has_organization_permission(property.organization_id, 'leave.grant') as "mayGrant",
             app.has_organization_permission(property.organization_id, 'configuration.manage') as "mayConfigure"
        from public.properties as property
        left join public.attendance_settings as setting
          on setting.property_id = property.id
       where property.id = ${propertyId}::uuid
    `;
    if (!row || !row.enabled || !(row.mayTake || row.mayGrant)) return null;
    return row;
  }

  function effectiveCurfew(property: PropertyNight): string | null {
    return property.hasSetting
      ? property.storedCurfew
      : DEFAULT_CURFEW[property.operatingModel];
  }

  async function curfewHasPassed(
    tx: Tx,
    property: PropertyNight,
  ): Promise<boolean> {
    const curfew = effectiveCurfew(property);
    if (curfew === null) return false;
    const [row] = await tx.$queryRaw<{ passed: boolean }[]>`
      select app.curfew_has_passed(
               ${property.night}::date, ${curfew}::time, ${property.cutoff}::time,
               ${property.timezone}, now()) as "passed"
    `;
    return row?.passed ?? false;
  }

  async function rowsOf(
    tx: Tx,
    propertyId: string,
    night: string,
  ): Promise<RollCallRow[]> {
    const rows = await tx.$queryRaw<RollCallQueryRow[]>`
      select stay.id                                   as "stayId",
             guest.full_name                           as "residentName",
             coalesce(room.building, unit.building)    as "building",
             coalesce(room.floor, unit.floor)          as "floor",
             coalesce(room.name, unit.name)            as "roomName",
             case when room.id is null then null else unit.name end as "bedName",
             mark.status                               as "mark",
             mark.marked_at                            as "markedAt",
             leave.id                                  as "leaveId",
             to_char(leave.from_night, 'YYYY-MM-DD')   as "fromNight",
             to_char(leave.to_night, 'YYYY-MM-DD')     as "toNight",
             reason.reason                             as "reason"
        from public.stays as stay
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.accommodation_units as room on room.id = unit.parent_id
        left join public.reservations as booking on booking.id = stay.reservation_id
        left join public.guests as guest on guest.id = booking.guest_id
        left join lateral (
          select m.status, m.marked_at
            from public.attendance_marks as m
           where m.stay_id = stay.id and m.night = ${night}::date
           order by m.id desc
           limit 1
        ) as mark on true
        left join lateral (
          select l.id, l.from_night, l.to_night
            from public.attendance_leaves as l
           where l.stay_id = stay.id
             and l.status <> 'cancelled'
             and ${night}::date between l.from_night and l.to_night
           limit 1
        ) as leave on true
        left join public.attendance_leave_reasons as reason
          on reason.leave_id = leave.id
       where stay.property_id = ${propertyId}::uuid
         and stay.status = 'in_house'
         and stay.stay_type = 'resident'
    `;
    return inWalkingOrder(
      rows.map((row) => ({
        stayId: row.stayId,
        residentName: row.residentName,
        building: row.building,
        floor: row.floor,
        roomName: row.roomName,
        bedName: row.bedName,
        status: statusOf(row.leaveId !== null, row.mark),
        markedAt: row.markedAt ? row.markedAt.toISOString() : null,
        leave:
          row.leaveId !== null && row.fromNight && row.toNight
            ? {
                leaveId: row.leaveId,
                fromNight: row.fromNight,
                toNight: row.toNight,
                reason: row.reason,
              }
            : null,
      })),
    );
  }

  async function currentLeaves(
    tx: Tx,
    propertyId: string,
    night: string,
    mayClose: boolean,
  ): Promise<CurrentLeave[]> {
    const rows = await tx.$queryRaw<
      {
        leaveId: string;
        stayId: string;
        residentName: string | null;
        fromNight: string;
        toNight: string;
        plannedToNight: string;
        reason: string | null;
      }[]
    >`
      select l.id                                       as "leaveId",
             l.stay_id                                  as "stayId",
             guest.full_name                            as "residentName",
             to_char(l.from_night, 'YYYY-MM-DD')        as "fromNight",
             to_char(l.to_night, 'YYYY-MM-DD')          as "toNight",
             to_char(l.planned_to_night, 'YYYY-MM-DD')  as "plannedToNight",
             reason.reason                              as "reason"
        from public.attendance_leaves as l
        join public.stays as stay on stay.id = l.stay_id
        left join public.reservations as booking on booking.id = stay.reservation_id
        left join public.guests as guest on guest.id = booking.guest_id
        left join public.attendance_leave_reasons as reason on reason.leave_id = l.id
       where l.property_id = ${propertyId}::uuid
         and l.status = 'granted'
         and l.to_night >= ${night}::date
       order by l.from_night, l.to_night, guest.full_name
    `;
    return rows.map((row) => ({
      ...row,
      mayClose,
      begun: row.fromNight < night,
    }));
  }

  /**
   * Tonight's roll call at one Property: every Resident in house, grouped as
   * the caller will walk them, with the figures counted from those same rows.
   * One snapshot, so the figures cannot disagree with the list by a mark that
   * landed between two queries. Null where the viewer has no roll call to see.
   */
  async function rollCall(
    userId: string,
    propertyId: string,
  ): Promise<RollCall | null> {
    return withOrganizationContext(
      deps.db,
      { userId },
      async (tx) => {
        const property = await propertyNight(tx, propertyId);
        if (!property) return null;
        const rows = await rowsOf(tx, propertyId, property.night);
        return {
          propertyId,
          night: property.night,
          curfew: effectiveCurfew(property),
          curfewIsDefault: !property.hasSetting,
          curfewPassed: await curfewHasPassed(tx, property),
          figures: figuresOf(rows),
          rows,
          leaves: await currentLeaves(
            tx,
            propertyId,
            property.night,
            property.mayGrant,
          ),
          mayTake: property.mayTake,
          mayGrant: property.mayGrant,
          mayConfigure: property.mayConfigure,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  /**
   * The figures of tonight alone, for Today: who is on leave, who is absent
   * and not on leave, who is not yet called. The same count as the screen's,
   * from the same rows. Null where the viewer has no roll call to see.
   */
  async function figuresTonight(
    userId: string,
    propertyId: string,
  ): Promise<TonightFigures | null> {
    return withOrganizationContext(
      deps.db,
      { userId },
      async (tx) => {
        const property = await propertyNight(tx, propertyId);
        if (!property) return null;
        const rows = await rowsOf(tx, propertyId, property.night);
        return {
          ...figuresOf(rows),
          propertyId,
          night: property.night,
          curfewPassed: await curfewHasPassed(tx, property),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  interface ResidentStay {
    stayId: string;
    propertyId: string;
    organizationId: string;
  }

  async function stayRows(
    tx: Tx,
    stayIds: readonly string[],
  ): Promise<ResidentStay[]> {
    return tx.$queryRaw<ResidentStay[]>`
      select stay.id as "stayId", stay.property_id as "propertyId",
             stay.organization_id as "organizationId"
        from public.stays as stay
       where stay.id = any(${stayIds as string[]}::uuid[])
    `;
  }

  /**
   * Answers for a night: each Resident present or absent. An answer already
   * standing writes nothing, so a second tap is not a revision; an answer that
   * differs from the one standing is a correction, kept above the old one with
   * who and when. One audit record for the first answers of the call and one
   * for each correction.
   */
  async function record(
    userId: string,
    propertyId: string,
    night: string,
    answers: readonly { stayId: string; mark: Mark }[],
  ): Promise<RecordedAttendance> {
    if (!isDay(night)) {
      throw new AttendanceInputError("a night is a date", "night");
    }
    const wanted = new Map(
      answers.map((answer) => [answer.stayId, answer.mark]),
    );
    if (wanted.size === 0) return { recorded: 0, unchanged: 0 };

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const stays = await stayRows(tx, [...wanted.keys()]);
      if (
        stays.length !== wanted.size ||
        stays.some((stay) => stay.propertyId !== propertyId)
      ) {
        throw new AttendanceRefusedError("those Residents cannot be called");
      }
      const standing = await tx.$queryRaw<{ stayId: string; mark: Mark }[]>`
        select distinct on (m.stay_id) m.stay_id as "stayId", m.status as "mark"
          from public.attendance_marks as m
         where m.property_id = ${propertyId}::uuid
           and m.night = ${night}::date
           and m.stay_id = any(${[...wanted.keys()]}::uuid[])
         order by m.stay_id, m.id desc
      `;
      const before = new Map(standing.map((row) => [row.stayId, row.mark]));

      let unchanged = 0;
      const first: Mark[] = [];
      const corrections: { stayId: string; from: Mark; to: Mark }[] = [];
      for (const stay of stays) {
        const mark = wanted.get(stay.stayId);
        if (!mark) continue;
        const was = before.get(stay.stayId);
        if (was === mark) {
          unchanged += 1;
          continue;
        }
        try {
          await tx.$executeRaw`
            insert into public.attendance_marks
              (organization_id, property_id, stay_id, night, status)
            values (${stay.organizationId}::uuid, ${stay.propertyId}::uuid,
                    ${stay.stayId}::uuid, ${night}::date, ${mark})
          `;
        } catch (error: unknown) {
          if (
            raised(error, INSUFFICIENT_PRIVILEGE) ||
            raised(error, CALL_REFUSED)
          ) {
            throw new AttendanceRefusedError(
              "those Residents cannot be called",
            );
          }
          throw error;
        }
        if (was === undefined) first.push(mark);
        else corrections.push({ stayId: stay.stayId, from: was, to: mark });
      }

      const organizationId = stays[0]?.organizationId;
      if (organizationId && first.length > 0) {
        await recordWithin(tx, {
          organizationId,
          locationId: propertyId,
          actorId: userId,
          action: "roll_call.recorded",
          subjectType: "property",
          subjectId: propertyId,
          context: {
            night,
            present: first.filter((mark) => mark === "present").length,
            absent: first.filter((mark) => mark === "absent").length,
          },
        });
      }
      for (const correction of corrections) {
        if (!organizationId) break;
        await recordWithin(tx, {
          organizationId,
          locationId: propertyId,
          actorId: userId,
          action: "roll_call.corrected",
          subjectType: "stay",
          subjectId: correction.stayId,
          context: { night, from: correction.from, to: correction.to },
        });
      }
      return { recorded: first.length + corrections.length, unchanged };
    });
  }

  /**
   * "Mark the rest present" for the Residents named, usually a floor: those
   * with no answer tonight and not on leave. A Resident already answered or
   * away is left as they are, so one press cannot overwrite an "absent".
   */
  async function markTheRestPresent(
    userId: string,
    propertyId: string,
    stayIds: readonly string[],
  ): Promise<RecordedAttendance> {
    const night = await withOrganizationContext(
      deps.db,
      { userId },
      async (tx) => {
        const property = await propertyNight(tx, propertyId);
        if (!property?.mayTake) {
          throw new AttendanceRefusedError("those Residents cannot be called");
        }
        const rows = await rowsOf(tx, propertyId, property.night);
        const named = new Set(stayIds);
        return {
          night: property.night,
          remaining: rows
            .filter(
              (row) => named.has(row.stayId) && row.status === "not_called",
            )
            .map((row) => row.stayId),
        };
      },
    );
    return record(
      userId,
      propertyId,
      night.night,
      night.remaining.map((stayId) => ({ stayId, mark: "present" as const })),
    );
  }

  /**
   * A Resident's leave, with the reason it was given for. Both rows are
   * written in one transaction, and the database refuses a leave that commits
   * without its reason.
   */
  async function grantLeave(userId: string, leave: NewLeave): Promise<string> {
    const reason = leave.reason.trim();
    const length = [...reason].length;
    if (length < LEAVE_REASON.min || length > LEAVE_REASON.max) {
      throw new AttendanceInputError(
        `a reason is ${LEAVE_REASON.min} to ${LEAVE_REASON.max} characters`,
        "reason",
      );
    }
    if (!isDay(leave.fromNight)) {
      throw new AttendanceInputError("a night is a date", "fromNight");
    }
    if (!isDay(leave.toNight) || leave.toNight < leave.fromNight) {
      throw new AttendanceInputError(
        "the last night is not before the first",
        "toNight",
      );
    }
    if (nightsBetween(leave.fromNight, leave.toNight) >= LEAVE_NIGHTS_MAX) {
      throw new AttendanceInputError(
        `a leave is at most ${LEAVE_NIGHTS_MAX - 1} nights`,
        "toNight",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [stay] = await stayRows(tx, [leave.stayId]);
      if (!stay)
        throw new AttendanceRefusedError("that Resident cannot be given leave");

      let leaveId: string;
      try {
        const [created] = await tx.$queryRaw<{ id: string }[]>`
          insert into public.attendance_leaves
            (organization_id, property_id, stay_id, from_night, to_night)
          values (${stay.organizationId}::uuid, ${stay.propertyId}::uuid,
                  ${stay.stayId}::uuid, ${leave.fromNight}::date,
                  ${leave.toNight}::date)
          returning id
        `;
        if (!created)
          throw new AttendanceRefusedError(
            "that Resident cannot be given leave",
          );
        leaveId = created.id;
        await tx.$executeRaw`
          insert into public.attendance_leave_reasons
            (leave_id, organization_id, property_id, reason)
          values (${leaveId}::uuid, ${stay.organizationId}::uuid,
                  ${stay.propertyId}::uuid, ${reason})
        `;
      } catch (error: unknown) {
        if (error instanceof AttendanceRefusedError) throw error;
        if (raised(error, EXCLUSION_VIOLATION)) {
          throw new LeaveOverlapsError(
            "that Resident is already away on some of those nights",
          );
        }
        if (raised(error, CHECK_VIOLATION)) {
          throw new AttendanceInputError(
            "those nights are not a leave",
            "toNight",
          );
        }
        if (
          raised(error, INSUFFICIENT_PRIVILEGE) ||
          raised(error, LEAVE_REFUSED)
        ) {
          throw new AttendanceRefusedError(
            "that Resident cannot be given leave",
          );
        }
        throw error;
      }

      await recordWithin(tx, {
        organizationId: stay.organizationId,
        locationId: stay.propertyId,
        actorId: userId,
        action: "resident_leave.granted",
        subjectType: "attendance_leave",
        subjectId: leaveId,
        context: {
          stayId: stay.stayId,
          fromNight: leave.fromNight,
          toNight: leave.toNight,
        },
      });
      return leaveId;
    });
  }

  async function closeLeave(
    userId: string,
    leaveId: string,
    how: "back" | "cancel",
  ): Promise<"ended" | "cancelled"> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [leave] = await tx.$queryRaw<
        {
          organizationId: string;
          propertyId: string;
          stayId: string;
          status: string;
          fromNight: string;
          toNight: string;
          today: string;
        }[]
      >`
        select l.organization_id as "organizationId", l.property_id as "propertyId",
               l.stay_id as "stayId", l.status,
               to_char(l.from_night, 'YYYY-MM-DD') as "fromNight",
               to_char(l.to_night, 'YYYY-MM-DD')   as "toNight",
               to_char(app.property_today(l.property_id), 'YYYY-MM-DD') as "today"
          from public.attendance_leaves as l
         where l.id = ${leaveId}::uuid
      `;
      if (!leave)
        throw new AttendanceRefusedError("that leave cannot be changed");
      if (leave.status !== "granted") {
        throw new LeaveClosedError("that leave is already over");
      }

      // Back from leave is the one thing a desk means: cancelled while no
      // night of it has passed, ended once one has. The database enforces the
      // same line, so a stale page cannot cross it.
      const began = leave.fromNight < leave.today;
      const outcome: "ended" | "cancelled" =
        how === "cancel" || !began ? "cancelled" : "ended";

      try {
        if (outcome === "cancelled") {
          await tx.$executeRaw`
            update public.attendance_leaves set status = 'cancelled'
             where id = ${leaveId}::uuid
          `;
        } else {
          if (leave.toNight < leave.today) {
            throw new LeaveClosedError("that leave is already over");
          }
          await tx.$executeRaw`
            update public.attendance_leaves
               set status = 'ended', to_night = ${leave.today}::date - 1
             where id = ${leaveId}::uuid
          `;
        }
      } catch (error: unknown) {
        if (error instanceof LeaveClosedError) throw error;
        if (raised(error, LEAVE_CLOSED)) {
          throw new LeaveClosedError("that leave cannot be closed that way");
        }
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new AttendanceRefusedError("that leave cannot be changed");
        }
        throw error;
      }

      const closed = {
        organizationId: leave.organizationId,
        locationId: leave.propertyId,
        actorId: userId,
        subjectType: "attendance_leave",
        subjectId: leaveId,
        context: {
          stayId: leave.stayId,
          fromNight: leave.fromNight,
          toNight: leave.toNight,
        },
      };
      if (outcome === "ended") {
        await recordWithin(tx, {
          ...closed,
          action: "resident_leave.ended",
        });
      } else {
        await recordWithin(tx, {
          ...closed,
          action: "resident_leave.cancelled",
        });
      }
      return outcome;
    });
  }

  /**
   * The Resident is back: a leave that has begun is ended at last night, one
   * that has not is cancelled. Returns which.
   */
  function returnFromLeave(userId: string, leaveId: string) {
    return closeLeave(userId, leaveId, "back");
  }

  /** A leave given in error, while no night of it has passed. */
  function cancelLeave(userId: string, leaveId: string) {
    return closeLeave(userId, leaveId, "cancel");
  }

  /**
   * The Property's curfew as `HH:MM`, or null for none. Setting it is a
   * decision of the Property, apart from the roll call, so it asks
   * `configuration.manage`; the policy decides.
   */
  async function setCurfew(
    userId: string,
    propertyId: string,
    curfew: string | null,
  ): Promise<void> {
    if (curfew !== null && !CURFEW_TIME.test(curfew)) {
      throw new AttendanceInputError(
        "a curfew is a time, like 23:00",
        "curfew",
      );
    }
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [property] = await tx.$queryRaw<
        { organizationId: string; hasSetting: boolean; stored: string | null }[]
      >`
        select property.organization_id as "organizationId",
               setting.property_id is not null as "hasSetting",
               to_char(setting.curfew_time, 'HH24:MI') as "stored"
          from public.properties as property
          left join public.attendance_settings as setting
            on setting.property_id = property.id
         where property.id = ${propertyId}::uuid
      `;
      if (!property)
        throw new AttendanceRefusedError("that curfew cannot be set");

      try {
        await tx.$executeRaw`
          insert into public.attendance_settings
            (property_id, organization_id, curfew_time)
          values (${propertyId}::uuid, ${property.organizationId}::uuid,
                  ${curfew}::time)
          on conflict (property_id) do update set curfew_time = excluded.curfew_time
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new AttendanceRefusedError("that curfew cannot be set");
        }
        throw error;
      }

      await recordWithin(tx, {
        organizationId: property.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "attendance_setting.changed",
        subjectType: "property",
        subjectId: propertyId,
        context: { setting: "curfew", from: property.stored, to: curfew },
      });
    });
  }

  return {
    rollCall,
    figuresTonight,
    record,
    markTheRestPresent,
    grantLeave,
    returnFromLeave,
    cancelLeave,
    setCurfew,
  };
}

export type AttendanceModule = ReturnType<typeof createAttendanceModule>;
