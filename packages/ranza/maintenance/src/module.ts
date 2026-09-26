import {
  lockUnitWithin,
  returnUnitToServiceWithin,
  takeUnitOutOfServiceWithin,
} from "@ranza/accommodation";
import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import { publishWithin } from "@ranza/platform-outbox";
import {
  BOARD_STATES,
  CANCEL_REASON,
  DETAILS,
  MAINTENANCE_CAPABILITY,
  MaintenanceInputError,
  MaintenanceRefusedError,
  OutOfOrderImpactError,
  PRIORITIES,
  PRODUCT_DEFAULTS,
  RECENT_DAYS,
  ReleaseNeedsPermissionError,
  RequestMovedError,
  RETURN_AS,
  RETURN_NOTE,
  TITLE,
  UnitBlockedError,
  type BoardState,
  type MaintenanceBoard,
  type MaintenanceCounts,
  type MaintenanceRequestCard,
  type MaintenanceSettings,
  type Moved,
  type OutOfOrderImpact,
  type Priority,
  type Reported,
  type ReportOptions,
  type RequestCharge,
  type RequestKind,
  type RequestStatus,
  type ReturnAs,
  type RoomsMaintenance,
  type SettingOverrides,
  type SettingValues,
  type TodayMaintenance,
  type UnitHold,
} from "./contracts";
import { createEquipmentCommands, recordServiceWithin } from "./equipment";
import { boundedDate } from "./input";
import { createMoneyCommands } from "./money";
import type { MaintenanceDeps, WriteClient } from "./ports";
import {
  CHECK_VIOLATION,
  INSUFFICIENT_PRIVILEGE,
  raised,
  refusal,
  says,
} from "./refusals";

/**
 * The Maintenance screen: reporting a problem, working it on a board, and
 * holding its Unit out of order until it is fixed (ADR 0032).
 *
 * Every statement runs inside a request context. Reads carry the commercial
 * gates in their own predicate; writes carry nothing of the kind, because the
 * policies on `maintenance_requests`, `maintenance_unit_holds` and
 * `accommodation_units` are the whole of what bounds them (ADR 0012). Nothing
 * below asks whether the actor may do something — except which of two outcomes
 * a done move has, which is a choice between writes and not a guard on one.
 */

function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

function isBoardState(value: string): value is BoardState {
  return (BOARD_STATES as readonly string[]).includes(value);
}

function isReturnAs(value: string): value is ReturnAs {
  return (RETURN_AS as readonly string[]).includes(value);
}

function boundedTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < TITLE.min || trimmed.length > TITLE.max) {
    throw new MaintenanceInputError(
      "a title is between three and two hundred characters",
    );
  }
  return trimmed;
}

function boundedDetails(details: string | null | undefined): string | null {
  const trimmed = details?.trim() ?? "";
  if (trimmed.length > DETAILS.max) {
    throw new MaintenanceInputError(
      "details are at most two thousand characters",
    );
  }
  return trimmed === "" ? null : trimmed;
}

/** A request as the commands below need it: where it is, and what it holds. */
interface RequestRow {
  requestId: string;
  organizationId: string;
  propertyId: string;
  unitId: string | null;
  equipmentId: string | null;
  kind: RequestKind;
  number: number;
  status: RequestStatus;
  holding: boolean;
}

interface CardRow {
  requestId: string;
  number: number;
  title: string;
  details: string | null;
  status: RequestStatus;
  kind: RequestKind;
  priority: Priority;
  unitId: string | null;
  unitName: string | null;
  roomName: string | null;
  equipmentId: string | null;
  equipmentName: string | null;
  costMinor: bigint | null;
  currency: string;
  vendor: string | null;
  charges: RequestCharge[] | null;
  assigneeId: string | null;
  assigneeEmail: string | null;
  assigneeReaches: boolean;
  reportedBy: string;
  reporterEmail: string | null;
  reportedAt: Date;
  statusChangedAt: Date;
  cancelReason: string | null;
  holdSince: Date | null;
  expectedBackOn: string | null;
  today: string;
  mayReport: boolean;
  mayManage: boolean;
  mayTakeOutOfOrder: boolean;
  mayCharge: boolean;
}

function cardOf(row: CardRow): MaintenanceRequestCard {
  return {
    requestId: row.requestId,
    number: row.number,
    title: row.title,
    details: row.details,
    status: row.status,
    kind: row.kind,
    priority: row.priority,
    unit:
      row.unitId === null || row.unitName === null
        ? null
        : { unitId: row.unitId, name: row.unitName, roomName: row.roomName },
    equipment:
      row.equipmentId === null || row.equipmentName === null
        ? null
        : { equipmentId: row.equipmentId, name: row.equipmentName },
    costMinor: row.costMinor === null ? null : Number(row.costMinor),
    currency: row.currency,
    vendor: row.vendor,
    charges: row.charges ?? [],
    assignee:
      row.assigneeId === null
        ? null
        : {
            userId: row.assigneeId,
            email: row.assigneeEmail,
            reachesProperty: row.assigneeReaches,
          },
    reporter: { userId: row.reportedBy, email: row.reporterEmail },
    reportedAt: row.reportedAt.toISOString(),
    statusChangedAt: row.statusChangedAt.toISOString(),
    cancelReason: row.cancelReason,
    hold:
      row.holdSince === null
        ? null
        : {
            since: row.holdSince.toISOString(),
            expectedBackOn: row.expectedBackOn,
            overdue:
              row.expectedBackOn !== null && row.expectedBackOn < row.today,
          },
  };
}

function countsOf(cards: readonly MaintenanceRequestCard[]): MaintenanceCounts {
  const counts: MaintenanceCounts = {
    new: 0,
    in_progress: 0,
    waiting_for_parts: 0,
    done: 0,
    cancelled: 0,
    outOfOrder: 0,
  };
  for (const card of cards) {
    counts[card.status] += 1;
    if (card.hold !== null) counts.outOfOrder += 1;
  }
  return counts;
}

export function createMaintenanceModule(deps: MaintenanceDeps) {
  /**
   * Every request at a Property that is open, or was done or cancelled in the
   * last thirty days, or still holds its room, with what the reader may do
   * (MT-S1-10). A done request that holds its room waits for somebody to
   * return it (MT-S2-15); if it aged off the board nothing would offer that.
   *
   * One statement, so the cards and the counts agree. The commercial gates are
   * in the predicate: a Property out of reach, or without maintenance, returns
   * nothing, indistinguishable from a quiet one (MT-S1-05, MT-S1-06).
   */
  async function board(
    userId: string,
    propertyId: string,
  ): Promise<MaintenanceBoard> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<(CardRow | (Partial<CardRow> & { requestId: null }))[]>`
        with scope as (
          select property.id, property.organization_id, property.currency,
                 app.property_today(property.id) as today
            from public.properties as property
           where property.id = ${propertyId}::uuid
             and app.can_use_capability(
                   property.id,
                   ${MAINTENANCE_CAPABILITY.moduleKey},
                   ${MAINTENANCE_CAPABILITY.capabilityKey})
        )
        select request.id                 as "requestId",
               request.number,
               request.title,
               request.details,
               request.status,
               request.kind,
               request.priority,
               unit.id                    as "unitId",
               unit.name                  as "unitName",
               room.name                  as "roomName",
               equipment.id               as "equipmentId",
               equipment.name             as "equipmentName",
               request.cost_minor         as "costMinor",
               scope.currency,
               request.vendor,
               (select json_agg(json_build_object(
                         'lineId', line.id,
                         'amountMinor', line.amount_minor,
                         'currency', folio.currency,
                         'guestName', guest.full_name,
                         'reversed', exists (
                           select 1 from public.folio_lines as cancelling
                            where cancelling.reverses_line_id = line.id))
                         order by line.posted_at)
                  from public.maintenance_request_charges as charge
                  join public.folio_lines as line on line.id = charge.folio_line_id
                  join public.folios as folio on folio.id = charge.folio_id
                  left join public.stays as stay on stay.id = folio.stay_id
                  left join public.reservations as reservation
                    on reservation.id = stay.reservation_id
                  left join public.guests as guest on guest.id = reservation.guest_id
                 where charge.request_id = request.id)
                                          as charges,
               request.assignee_id        as "assigneeId",
               assignee.email             as "assigneeEmail",
               (request.assignee_id is not null and exists (
                  select 1
                    from public.organization_memberships as membership
                   where membership.user_id = request.assignee_id
                     and membership.organization_id = request.organization_id
                     and membership.status = 'active'
                     and (membership.access_scope = 'organization_wide'
                          or exists (
                            select 1
                              from public.property_assignments as assignment
                             where assignment.user_id = membership.user_id
                               and assignment.property_id = request.property_id
                               and assignment.status = 'active')))
               )                          as "assigneeReaches",
               request.reported_by        as "reportedBy",
               reporter.email             as "reporterEmail",
               request.reported_at        as "reportedAt",
               request.status_changed_at  as "statusChangedAt",
               request.cancel_reason      as "cancelReason",
               hold.since                 as "holdSince",
               to_char(hold.expected_back_on, 'YYYY-MM-DD') as "expectedBackOn",
               to_char(scope.today, 'YYYY-MM-DD') as today,
               app.has_organization_permission(
                 scope.organization_id, 'maintenance.report') as "mayReport",
               app.has_organization_permission(
                 scope.organization_id, 'maintenance.manage') as "mayManage",
               app.has_organization_permission(
                 scope.organization_id, 'maintenance.take_out_of_order')
                                          as "mayTakeOutOfOrder",
               (app.can_use_capability(scope.id, 'billing_folios', 'finance')
                and app.has_organization_permission(
                      scope.organization_id, 'finance.post_charge'))
                                          as "mayCharge"
          from scope
          left join public.maintenance_requests as request
            on request.property_id = scope.id
           and (request.status not in ('done', 'cancelled')
                or request.status_changed_at > now() - make_interval(days => ${RECENT_DAYS})
                or exists (
                  select 1
                    from public.maintenance_unit_holds as holding
                   where holding.request_id = request.id
                     and holding.returned_at is null))
          left join public.accommodation_units as unit
            on unit.id = request.accommodation_unit_id
          left join public.accommodation_units as room
            on room.id = unit.parent_id
          left join public.maintenance_equipment as equipment
            on equipment.id = request.equipment_id
          left join public.users as assignee
            on assignee.id = request.assignee_id
          left join public.users as reporter
            on reporter.id = request.reported_by
          left join public.maintenance_unit_holds as hold
            on hold.request_id = request.id
           and hold.returned_at is null
         order by request.number desc
      `,
    );

    const first = rows[0];
    const requests = rows
      .filter((row): row is CardRow => row.requestId !== null)
      .map(cardOf);
    return {
      today: first?.today ?? new Date().toISOString().slice(0, 10),
      requests,
      counts: countsOf(requests),
      mayReport: first?.mayReport ?? false,
      mayManage: first?.mayManage ?? false,
      mayTakeOutOfOrder: first?.mayTakeOutOfOrder ?? false,
      mayCharge: first?.mayCharge ?? false,
    };
  }

  /**
   * What the report form offers: every Unit at the Property, with its status
   * so the form can say why one cannot be taken out of order, and everybody
   * who reaches the Property, for the assignee picker (MT-S1-18).
   */
  async function reportOptions(
    userId: string,
    propertyId: string,
  ): Promise<ReportOptions> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const units = await tx.$queryRaw<ReportOptions["units"][number][]>`
        select unit.id     as "unitId",
               unit.name,
               room.name   as "roomName",
               unit.status
          from public.accommodation_units as unit
          left join public.accommodation_units as room
            on room.id = unit.parent_id
         where unit.property_id = ${propertyId}::uuid
           and app.can_use_capability(
                 unit.property_id,
                 ${MAINTENANCE_CAPABILITY.moduleKey},
                 ${MAINTENANCE_CAPABILITY.capabilityKey})
         order by coalesce(room.name, unit.name), room.name nulls first, unit.name
      `;
      const assignees = await tx.$queryRaw<
        ReportOptions["assignees"][number][]
      >`
        select membership.user_id as "userId", account.email
          from public.properties as property
          join public.organization_memberships as membership
            on membership.organization_id = property.organization_id
          join public.users as account
            on account.id = membership.user_id
         where property.id = ${propertyId}::uuid
           and membership.status = 'active'
           and (membership.access_scope = 'organization_wide'
                or exists (
                  select 1
                    from public.property_assignments as assignment
                   where assignment.user_id = membership.user_id
                     and assignment.property_id = property.id
                     and assignment.status = 'active'))
           and app.can_use_capability(
                 property.id,
                 ${MAINTENANCE_CAPABILITY.moduleKey},
                 ${MAINTENANCE_CAPABILITY.capabilityKey})
         order by account.email
      `;
      const equipment = await tx.$queryRaw<
        ReportOptions["equipment"][number][]
      >`
        select equipment.id as "equipmentId",
               equipment.name,
               coalesce(unit.name, equipment.location) as "where"
          from public.maintenance_equipment as equipment
          left join public.accommodation_units as unit
            on unit.id = equipment.accommodation_unit_id
         where equipment.property_id = ${propertyId}::uuid
           and equipment.retired_at is null
           and app.can_use_capability(
                 equipment.property_id,
                 ${MAINTENANCE_CAPABILITY.moduleKey},
                 ${MAINTENANCE_CAPABILITY.capabilityKey})
         order by equipment.name, "where"
      `;
      return { units, assignees, equipment };
    });
  }

  /**
   * Who taking a Unit out of order affects: a Guest in house in it or in a bed
   * under it, and every confirmed Reservation holding one of its nights from
   * today on (MT-S2-09, MT-S2-10). Read, never changed: nothing is cancelled or
   * moved, and moving a booking is not built (MT-DEF-07).
   */
  async function impactOf(
    tx: WriteClient,
    unitId: string,
  ): Promise<OutOfOrderImpact> {
    const inHouse = await tx.$queryRaw<OutOfOrderImpact["inHouse"][number][]>`
      select unit.name as "unitName",
             guest.full_name as "guestName",
             to_char(stay.ends_on, 'YYYY-MM-DD') as "endsOn"
        from public.stays as stay
        join public.accommodation_units as unit
          on unit.id = stay.accommodation_unit_id
        left join public.reservations as reservation
          on reservation.id = stay.reservation_id
        left join public.guests as guest
          on guest.id = reservation.guest_id
       where stay.status = 'in_house'
         and (unit.id = ${unitId}::uuid or unit.parent_id = ${unitId}::uuid)
       order by unit.name
    `;
    const reservations = await tx.$queryRaw<
      OutOfOrderImpact["reservations"][number][]
    >`
      select unit.name as "unitName",
             guest.full_name as "guestName",
             to_char(reservation.starts_on, 'YYYY-MM-DD') as "startsOn",
             to_char(reservation.ends_on, 'YYYY-MM-DD') as "endsOn"
        from public.reservations as reservation
        join public.accommodation_units as unit
          on unit.id = reservation.accommodation_unit_id
        left join public.guests as guest
          on guest.id = reservation.guest_id
       where reservation.status = 'confirmed'
         and (unit.id = ${unitId}::uuid or unit.parent_id = ${unitId}::uuid)
         and (reservation.ends_on is null
              or reservation.ends_on > app.property_today(unit.property_id))
       order by reservation.starts_on, unit.name
    `;
    return { inHouse, reservations };
  }

  /** The same, for the screen to show before anybody presses anything. */
  async function outOfOrderImpact(
    userId: string,
    unitId: string,
  ): Promise<OutOfOrderImpact> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      impactOf(tx, unitId),
    );
  }

  /** A request the caller can see, with whether it holds its Unit now. */
  async function requestWithin(
    tx: WriteClient,
    requestId: string,
  ): Promise<RequestRow> {
    const [request] = await tx.$queryRaw<RequestRow[]>`
      select request.id                    as "requestId",
             request.organization_id       as "organizationId",
             request.property_id           as "propertyId",
             request.accommodation_unit_id as "unitId",
             request.equipment_id          as "equipmentId",
             request.kind,
             request.number,
             request.status,
             exists (
               select 1 from public.maintenance_unit_holds as hold
                where hold.request_id = request.id
                  and hold.returned_at is null
             )                             as holding
        from public.maintenance_requests as request
       where request.id = ${requestId}::uuid
    `;
    if (!request) throw new MaintenanceRefusedError();
    return request;
  }

  /** What a Property's setting says, with the product's own defaults under it. */
  async function effectiveSettingsWithin(
    tx: WriteClient,
    propertyId: string,
  ): Promise<SettingValues> {
    const [row] = await tx.$queryRaw<
      {
        assigneeRequired: boolean | null;
        returnOnDone: boolean | null;
        returnAs: ReturnAs | null;
      }[]
    >`
      select coalesce(own.assignee_required, fallback.assignee_required)
               as "assigneeRequired",
             coalesce(own.return_on_done, fallback.return_on_done)
               as "returnOnDone",
             coalesce(own.return_as, fallback.return_as) as "returnAs"
        from public.properties as property
        left join public.maintenance_settings as own
          on own.property_id = property.id
        left join public.maintenance_settings as fallback
          on fallback.organization_id = property.organization_id
         and fallback.property_id is null
       where property.id = ${propertyId}::uuid
    `;
    return {
      assigneeRequired:
        row?.assigneeRequired ?? PRODUCT_DEFAULTS.assigneeRequired,
      returnOnDone: row?.returnOnDone ?? PRODUCT_DEFAULTS.returnOnDone,
      returnAs: row?.returnAs ?? PRODUCT_DEFAULTS.returnAs,
    };
  }

  /**
   * Whether a move to done returns the room: the setting says rooms return on
   * done, and the mover may return rooms. Otherwise the request is done and
   * still holds, and the card offers the return to whoever may (MT-S2-15).
   * This chooses between two outcomes; the policies still bound each write.
   */
  async function mayReturnOnDone(
    tx: WriteClient,
    request: RequestRow,
  ): Promise<boolean> {
    const { returnOnDone } = await effectiveSettingsWithin(
      tx,
      request.propertyId,
    );
    if (!returnOnDone) return false;
    const [row] = await tx.$queryRaw<{ mayReturn: boolean }[]>`
      select app.has_organization_permission(
               ${request.organizationId}::uuid, 'maintenance.take_out_of_order')
               as "mayReturn"
    `;
    return row?.mayReturn ?? false;
  }

  /**
   * Takes a request's Unit out of order: the Unit's row locked, the hold
   * written, the status written, in the caller's transaction (ADR 0032).
   *
   * Who is affected is read under the Unit's lock, so a check-in committing
   * in between is either seen or waits for this (MT-S2-09): read before the
   * lock, the desk could be told nobody is in a room somebody just entered.
   * An unacknowledged impact throws, and the caller's transaction writes
   * nothing.
   *
   * Taken again after a return is the same row with its return cleared; taken
   * while already held changes only the expected-back date (MT-S2-20).
   */
  async function holdWithin(
    tx: WriteClient,
    userId: string,
    request: RequestRow,
    options: { expectedBackOn: string | null; acknowledged: boolean },
  ): Promise<void> {
    if (request.unitId === null) throw new MaintenanceRefusedError();
    const { expectedBackOn } = options;

    const unit = await lockUnitWithin(tx, request.unitId);
    if (!unit) throw new MaintenanceRefusedError();
    if (unit.status === "blocked") throw new UnitBlockedError();

    if (!options.acknowledged) {
      const impact = await impactOf(tx, request.unitId);
      if (impact.inHouse.length > 0 || impact.reservations.length > 0) {
        throw new OutOfOrderImpactError(impact);
      }
    }

    try {
      await tx.$queryRaw`
        insert into public.maintenance_unit_holds
          (request_id, organization_id, property_id, expected_back_on)
        values (${request.requestId}::uuid, ${request.organizationId}::uuid,
                ${request.propertyId}::uuid, ${expectedBackOn}::date)
        on conflict (request_id) do update
           set returned_at = null,
               expected_back_on = excluded.expected_back_on
        returning request_id
      `;
      if (!(await takeUnitOutOfServiceWithin(tx, request.unitId))) {
        throw new MaintenanceRefusedError();
      }
    } catch (error: unknown) {
      if (raised(error, CHECK_VIOLATION) && says(error, "expected-back")) {
        throw new MaintenanceInputError(
          "the expected-back date is before today",
        );
      }
      throw refusal(error);
    }

    await recordWithin(tx, {
      organizationId: request.organizationId,
      locationId: request.propertyId,
      actorId: userId,
      action: "unit.taken_out_of_order",
      subjectType: "accommodation_unit",
      subjectId: request.unitId,
      context: {
        name: unit.name,
        requestId: request.requestId,
        number: request.number,
        expectedBackOn,
      },
    });
  }

  /**
   * Releases a request's hold, and returns its Unit to service when no other
   * request holds it (MT-S2-11). The Unit's row is locked first, so the count
   * of holds left is taken on what every other holder committed (MT-S2-12).
   *
   * Returning publishes `unit.returned_to_service` with what the setting says
   * a returned room comes back as; Housekeeping applies it (MT-S2-17). A
   * release that leaves the room out of order is audited as the request's,
   * because the room did not come back.
   */
  async function releaseWithin(
    tx: WriteClient,
    userId: string,
    request: RequestRow,
    note: string | null,
  ): Promise<Pick<Moved, "returned" | "heldElsewhere">> {
    if (request.unitId === null || !request.holding) {
      return { returned: false, heldElsewhere: false };
    }

    // The Unit is visible to anyone at the Property; a lock that finds nothing
    // means the update policies did not admit the caller.
    const unit = await lockUnitWithin(tx, request.unitId);
    if (!unit) throw new ReleaseNeedsPermissionError();

    let released: { returnedAs: ReturnAs }[];
    try {
      released = await tx.$queryRaw`
        update public.maintenance_unit_holds
           set returned_at = now()
         where request_id = ${request.requestId}::uuid
           and returned_at is null
        returning returned_as as "returnedAs"
      `;
    } catch (error: unknown) {
      if (raised(error, INSUFFICIENT_PRIVILEGE)) {
        throw new ReleaseNeedsPermissionError();
      }
      throw refusal(error);
    }
    const [release] = released;

    const [left] = await tx.$queryRaw<{ count: number }[]>`
      select count(*)::int as count
        from public.maintenance_unit_holds as hold
        join public.maintenance_requests as other
          on other.id = hold.request_id
       where other.accommodation_unit_id = ${request.unitId}::uuid
         and hold.returned_at is null
    `;
    const heldElsewhere = (left?.count ?? 0) > 0;

    // Read as holding before the Unit's lock, and let go by somebody else by
    // the time it was taken: nothing was released here, and the room is held
    // elsewhere exactly when a hold is left.
    if (!release) return { returned: false, heldElsewhere };

    if (heldElsewhere) {
      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.hold_released",
        subjectType: "maintenance_request",
        subjectId: request.requestId,
        ...(note === null ? {} : { reason: note }),
        context: { number: request.number, unitName: unit.name },
      });
      return { returned: false, heldElsewhere: true };
    }

    if (!(await returnUnitToServiceWithin(tx, request.unitId))) {
      throw new MaintenanceRefusedError();
    }
    await publishWithin(tx, {
      organizationId: request.organizationId,
      eventType: "unit.returned_to_service",
      // Ids only: what the room comes back as is read from the hold, where
      // the release stamped it, because anybody may publish an event.
      payload: { requestId: request.requestId, unitId: request.unitId },
    });
    await recordWithin(tx, {
      organizationId: request.organizationId,
      locationId: request.propertyId,
      actorId: userId,
      action: "unit.returned_to_service",
      subjectType: "accommodation_unit",
      subjectId: request.unitId,
      ...(note === null ? {} : { reason: note }),
      context: {
        name: unit.name,
        requestId: request.requestId,
        number: request.number,
        returnAs: release.returnedAs,
      },
    });
    return { returned: true, heldElsewhere: false };
  }

  /**
   * Reports a problem about a Unit (MT-S1-01), and takes it out of order in the
   * same transaction when asked (MT-S2-01).
   *
   * The Organization is read from the Property, never taken from the caller.
   * Taking it out of order when somebody is in it or booked on it waits for
   * the acknowledgement: the request and the hold roll back together until it
   * comes (MT-S2-09).
   */
  async function report(
    userId: string,
    input: {
      propertyId: string;
      /** The room or bed, the item, or both (MT-S3-07). */
      unitId?: string | null;
      equipmentId?: string | null;
      title: string;
      details?: string | null;
      priority: string;
      assigneeId?: string | null;
      outOfOrder?: {
        expectedBackOn?: string | null;
        acknowledged: boolean;
      } | null;
    },
  ): Promise<Reported> {
    const title = boundedTitle(input.title);
    const details = boundedDetails(input.details);
    if (!isPriority(input.priority)) {
      throw new MaintenanceInputError(
        "a priority is urgent, this week or can wait",
      );
    }
    const priority = input.priority;
    const expectedBackOn = boundedDate(input.outOfOrder?.expectedBackOn);
    const assigneeId = input.assigneeId || null;
    const unitId = input.unitId || null;
    const equipmentId = input.equipmentId || null;
    if (unitId === null && equipmentId === null) {
      throw new MaintenanceInputError("a problem is about a room or equipment");
    }
    if (input.outOfOrder && unitId === null) {
      throw new MaintenanceInputError("only a room is taken out of order");
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let written: {
        requestId: string;
        organizationId: string;
        propertyId: string;
        number: number;
      }[];
      try {
        written = await tx.$queryRaw`
          insert into public.maintenance_requests
            (organization_id, property_id, title, details,
             accommodation_unit_id, equipment_id, priority, assignee_id)
          select property.organization_id, property.id, ${title}, ${details},
                 ${unitId}::uuid, ${equipmentId}::uuid, ${priority},
                 ${assigneeId}::uuid
            from public.properties as property
           where property.id = ${input.propertyId}::uuid
          returning id as "requestId",
                    organization_id as "organizationId",
                    property_id as "propertyId",
                    number
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [request] = written;
      if (!request) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.reported",
        subjectType: "maintenance_request",
        subjectId: request.requestId,
        context: {
          number: request.number,
          title,
          unitId,
          equipmentId,
          priority,
          assigneeId,
        },
      });

      if (input.outOfOrder && unitId !== null) {
        await holdWithin(
          tx,
          userId,
          {
            requestId: request.requestId,
            organizationId: request.organizationId,
            propertyId: input.propertyId,
            unitId,
            equipmentId,
            kind: "fault",
            number: request.number,
            status: "new",
            holding: false,
          },
          { expectedBackOn, acknowledged: input.outOfOrder.acknowledged },
        );
      }

      return { requestId: request.requestId, number: request.number };
    });
  }

  /**
   * Moves a request to another board state, or reopens a cancelled one to new
   * (MT-S1-11, MT-S1-17).
   *
   * `from` is the state the mover saw. A request that has left it since is
   * refused rather than overwritten, and the error says where it is now
   * (MT-S1-14). A move to the state it is in is harmless and writes nothing
   * (MT-S1-13).
   *
   * A move to done returns the room when the setting says so and the mover may
   * return rooms; otherwise the request stays done and still holding, and the
   * card offers the return to whoever may (MT-S2-14, MT-S2-15).
   */
  async function move(
    userId: string,
    input: { requestId: string; from: string; to: string },
  ): Promise<Moved> {
    const { from, to } = input;
    if (!isBoardState(to)) {
      throw new MaintenanceInputError(
        "a request moves to one of the board's four states",
      );
    }
    if (from === "cancelled" && to !== "new") {
      throw new MaintenanceInputError("a cancelled request is reopened as new");
    }
    if (!isBoardState(from) && from !== "cancelled") {
      throw new MaintenanceInputError(
        "a request moves from a state it can be in",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const request = await requestWithin(tx, input.requestId);
      if (request.status !== from) throw new RequestMovedError(request.status);
      if (from === to) {
        return {
          returned: false,
          stillOutOfOrder: request.holding,
          heldElsewhere: false,
        };
      }

      // A move that may return a room takes the room's lock before the
      // request's row, the order every command here takes them in: a cancel
      // holding the room and waiting on this request would otherwise deadlock
      // with this move holding the request and waiting on the room.
      const releasing =
        to === "done" &&
        request.holding &&
        request.unitId !== null &&
        (await mayReturnOnDone(tx, request));
      if (releasing && request.unitId !== null) {
        await lockUnitWithin(tx, request.unitId);
      }

      let moved: { requestId: string }[];
      try {
        moved = await tx.$queryRaw`
          update public.maintenance_requests
             set status = ${to},
                 cancel_reason = null
           where id = ${input.requestId}::uuid
             and status = ${from}
          returning id as "requestId"
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      if (moved.length === 0) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.moved",
        subjectType: "maintenance_request",
        subjectId: request.requestId,
        context: { number: request.number, from, to },
      });

      // A work order done is the service done (MT-S4-04). Not a fault: a
      // repair is not a service (MT-S4-05).
      if (to === "done" && request.kind === "service") {
        await recordServiceWithin(tx, userId, request);
      }

      if (!releasing) {
        return {
          returned: false,
          stillOutOfOrder: request.holding,
          heldElsewhere: false,
        };
      }
      const { returned, heldElsewhere } = await releaseWithin(
        tx,
        userId,
        request,
        null,
      );
      return { returned, stillOutOfOrder: false, heldElsewhere };
    });
  }

  /**
   * Cancels an open request with a reason (MT-S1-15). A request that holds its
   * room lets go of it first, in the same transaction, so a cancelled request
   * never keeps a room out of order (MT-S2-16).
   */
  async function cancel(
    userId: string,
    input: { requestId: string; from: string; reason: string },
  ): Promise<Moved> {
    const reason = input.reason.trim();
    if (
      reason.length < CANCEL_REASON.min ||
      reason.length > CANCEL_REASON.max
    ) {
      throw new MaintenanceInputError(
        "a reason is between three and two hundred characters",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const request = await requestWithin(tx, input.requestId);
      if (request.status !== input.from) {
        throw new RequestMovedError(request.status);
      }
      const { returned, heldElsewhere } = await releaseWithin(
        tx,
        userId,
        request,
        reason,
      );

      let cancelled: { requestId: string }[];
      try {
        cancelled = await tx.$queryRaw`
          update public.maintenance_requests
             set status = 'cancelled',
                 cancel_reason = ${reason}
           where id = ${input.requestId}::uuid
             and status = ${input.from}
          returning id as "requestId"
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      if (cancelled.length === 0) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.cancelled",
        subjectType: "maintenance_request",
        subjectId: request.requestId,
        reason,
        context: { number: request.number, from: input.from },
      });
      return {
        returned,
        stillOutOfOrder: false,
        heldElsewhere,
      };
    });
  }

  /** Assigns a request to somebody who reaches its Property, or to nobody. */
  async function assign(
    userId: string,
    input: { requestId: string; assigneeId: string | null },
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const request = await requestWithin(tx, input.requestId);
      let assigned: { previous: string | null }[];
      try {
        assigned = await tx.$queryRaw`
          with previous as (
            select assignee_id from public.maintenance_requests
             where id = ${input.requestId}::uuid
          )
          update public.maintenance_requests
             set assignee_id = ${input.assigneeId}::uuid
           where id = ${input.requestId}::uuid
          returning (select assignee_id from previous) as previous
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [row] = assigned;
      if (!row) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.assigned",
        subjectType: "maintenance_request",
        subjectId: request.requestId,
        context: {
          number: request.number,
          from: row.previous,
          to: input.assigneeId,
        },
      });
    });
  }

  /** Changes how urgent a request is (MT-S1-21). */
  async function prioritise(
    userId: string,
    input: { requestId: string; priority: string },
  ): Promise<void> {
    const { priority } = input;
    if (!isPriority(priority)) {
      throw new MaintenanceInputError(
        "a priority is urgent, this week or can wait",
      );
    }

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const request = await requestWithin(tx, input.requestId);
      let changed: { previous: Priority }[];
      try {
        changed = await tx.$queryRaw`
          with previous as (
            select priority from public.maintenance_requests
             where id = ${input.requestId}::uuid
          )
          update public.maintenance_requests
             set priority = ${priority}
           where id = ${input.requestId}::uuid
          returning (select priority from previous) as previous
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [row] = changed;
      if (!row) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.prioritised",
        subjectType: "maintenance_request",
        subjectId: request.requestId,
        context: { number: request.number, from: row.previous, to: priority },
      });
    });
  }

  /**
   * Takes an open request's room out of order after it was reported
   * (MT-S2-02), or again after a mistaken return (MT-S2-20).
   */
  async function takeOutOfOrder(
    userId: string,
    input: {
      requestId: string;
      expectedBackOn?: string | null;
      acknowledged: boolean;
    },
  ): Promise<void> {
    const expectedBackOn = boundedDate(input.expectedBackOn);

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      const request = await requestWithin(tx, input.requestId);
      if (
        request.unitId === null ||
        request.status === "done" ||
        request.status === "cancelled"
      ) {
        throw new MaintenanceRefusedError();
      }
      await holdWithin(tx, userId, request, {
        expectedBackOn,
        acknowledged: input.acknowledged,
      });
    });
  }

  /**
   * Returns a request's room to service now, with an optional note
   * (MT-S2-15, MT-S2-21). The room comes back only if no other request still
   * holds it.
   */
  async function returnToService(
    userId: string,
    input: { requestId: string; note?: string | null },
  ): Promise<Pick<Moved, "returned" | "heldElsewhere">> {
    const note = input.note?.trim() || null;
    if (note !== null && note.length > RETURN_NOTE.max) {
      throw new MaintenanceInputError(
        "a note is at most two hundred characters",
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const request = await requestWithin(tx, input.requestId);
      if (!request.holding) throw new MaintenanceRefusedError();
      return releaseWithin(tx, userId, request, note);
    });
  }

  /**
   * What Rooms shows of maintenance (MT-S2-28): every Unit held out of order
   * at a Property, and whether the reader may report a problem there. Empty
   * and false where maintenance is not available.
   */
  async function roomsView(
    userId: string,
    propertyId: string,
  ): Promise<RoomsMaintenance> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [scope] = await tx.$queryRaw<{ mayReport: boolean }[]>`
        select app.has_organization_permission(
                 property.organization_id, 'maintenance.report') as "mayReport"
          from public.properties as property
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${MAINTENANCE_CAPABILITY.moduleKey},
                 ${MAINTENANCE_CAPABILITY.capabilityKey})
      `;
      if (!scope) return { holds: [], mayReport: false };

      const holds = await tx.$queryRaw<UnitHold[]>`
        select request.accommodation_unit_id as "unitId",
               request.id                    as "requestId",
               request.number,
               to_char(hold.expected_back_on, 'YYYY-MM-DD') as "expectedBackOn"
          from public.maintenance_unit_holds as hold
          join public.maintenance_requests as request
            on request.id = hold.request_id
         where hold.property_id = ${propertyId}::uuid
           and hold.returned_at is null
         order by request.number
      `;
      return { holds, mayReport: scope.mayReport };
    });
  }

  /**
   * What Today shows of maintenance (TD-S4-01 to TD-S4-04): open requests by
   * state, the Units held out of order, the open urgent requests and every
   * hold. Empty and zero where maintenance is not available.
   *
   * The capability is asked here, in the first statement, and nowhere else:
   * the row policies check reach only, so without it a Property whose
   * maintenance was switched off would still show its requests. Nothing about
   * money, vendors or people is selected — Today is read by roles the board
   * would not show those to.
   */
  async function todayView(
    userId: string,
    propertyId: string,
  ): Promise<TodayMaintenance> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [scope] = await tx.$queryRaw<
        {
          new: number;
          inProgress: number;
          waitingForParts: number;
          outOfOrder: number;
        }[]
      >`
        select count(*) filter (where request.status = 'new')::int as new,
               count(*) filter (where request.status = 'in_progress')::int
                                                                  as "inProgress",
               count(*) filter (where request.status = 'waiting_for_parts')::int
                                                                  as "waitingForParts",
               (select count(distinct held.accommodation_unit_id)::int
                  from public.maintenance_unit_holds as hold
                  join public.maintenance_requests as held
                    on held.id = hold.request_id
                 where hold.property_id = property.id
                   and hold.returned_at is null)                  as "outOfOrder"
          from public.properties as property
          left join public.maintenance_requests as request
            on request.property_id = property.id
           and request.status in ('new', 'in_progress', 'waiting_for_parts')
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${MAINTENANCE_CAPABILITY.moduleKey},
                 ${MAINTENANCE_CAPABILITY.capabilityKey})
         group by property.id
      `;
      if (!scope) {
        return {
          open: { new: 0, in_progress: 0, waiting_for_parts: 0 },
          outOfOrder: 0,
          urgent: [],
          holds: [],
        };
      }

      const rows = await tx.$queryRaw<
        {
          requestId: string;
          number: number;
          title: string;
          status: RequestStatus;
          priority: Priority;
          unitId: string | null;
          unitName: string | null;
          roomName: string | null;
          equipmentId: string | null;
          equipmentName: string | null;
          holding: boolean;
          expectedBackOn: string | null;
        }[]
      >`
        select request.id          as "requestId",
               request.number,
               request.title,
               request.status,
               request.priority,
               unit.id             as "unitId",
               unit.name           as "unitName",
               room.name           as "roomName",
               equipment.id        as "equipmentId",
               equipment.name      as "equipmentName",
               hold.request_id is not null as holding,
               to_char(hold.expected_back_on, 'YYYY-MM-DD') as "expectedBackOn"
          from public.maintenance_requests as request
          left join public.accommodation_units as unit
            on unit.id = request.accommodation_unit_id
          left join public.accommodation_units as room
            on room.id = unit.parent_id
          left join public.maintenance_equipment as equipment
            on equipment.id = request.equipment_id
          left join public.maintenance_unit_holds as hold
            on hold.request_id = request.id
           and hold.returned_at is null
         where request.property_id = ${propertyId}::uuid
           and ((request.priority = 'urgent'
                 and request.status not in ('done', 'cancelled'))
                or hold.request_id is not null)
         order by request.reported_at, request.number
      `;

      const unitOf = (row: (typeof rows)[number]) =>
        row.unitId === null || row.unitName === null
          ? null
          : { unitId: row.unitId, name: row.unitName, roomName: row.roomName };
      const urgent = rows
        .filter(
          (row) =>
            row.priority === "urgent" &&
            row.status !== "done" &&
            row.status !== "cancelled",
        )
        .map((row) => ({
          requestId: row.requestId,
          number: row.number,
          title: row.title,
          unit: unitOf(row),
          equipment:
            row.equipmentId === null || row.equipmentName === null
              ? null
              : { equipmentId: row.equipmentId, name: row.equipmentName },
        }));
      const holds = rows.flatMap((row) => {
        const unit = unitOf(row);
        if (!row.holding || unit === null) return [];
        return [
          {
            unitId: unit.unitId,
            requestId: row.requestId,
            number: row.number,
            title: row.title,
            status: row.status,
            unit,
            expectedBackOn: row.expectedBackOn,
          },
        ];
      });

      return {
        open: {
          new: scope.new,
          in_progress: scope.inProgress,
          waiting_for_parts: scope.waitingForParts,
        },
        outOfOrder: scope.outOfOrder,
        urgent,
        holds,
      };
    });
  }

  /**
   * What a Property's Maintenance setting says and inherits, and whether the
   * reader may change it. Null where there is nothing to configure.
   */
  async function settings(
    userId: string,
    propertyId: string,
  ): Promise<MaintenanceSettings | null> {
    const [row] = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<
          {
            defaultAssignee: boolean | null;
            defaultReturnOnDone: boolean | null;
            defaultReturnAs: ReturnAs | null;
            ownAssignee: boolean | null;
            ownReturnOnDone: boolean | null;
            ownReturnAs: ReturnAs | null;
            mayManage: boolean;
            wideReach: boolean;
          }[]
        >`
        select fallback.assignee_required as "defaultAssignee",
               fallback.return_on_done    as "defaultReturnOnDone",
               fallback.return_as         as "defaultReturnAs",
               own.assignee_required      as "ownAssignee",
               own.return_on_done         as "ownReturnOnDone",
               own.return_as              as "ownReturnAs",
               app.has_organization_permission(
                 property.organization_id, 'maintenance.manage') as "mayManage",
               app.has_organization_wide_reach(property.organization_id)
                                          as "wideReach"
          from public.properties as property
          left join public.maintenance_settings as own
            on own.property_id = property.id
          left join public.maintenance_settings as fallback
            on fallback.organization_id = property.organization_id
           and fallback.property_id is null
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${MAINTENANCE_CAPABILITY.moduleKey},
                 ${MAINTENANCE_CAPABILITY.capabilityKey})
      `,
    );
    if (!row) return null;

    const organizationDefault: SettingValues = {
      assigneeRequired:
        row.defaultAssignee ?? PRODUCT_DEFAULTS.assigneeRequired,
      returnOnDone: row.defaultReturnOnDone ?? PRODUCT_DEFAULTS.returnOnDone,
      returnAs: row.defaultReturnAs ?? PRODUCT_DEFAULTS.returnAs,
    };
    const propertyOverride: SettingOverrides = {
      assigneeRequired: row.ownAssignee,
      returnOnDone: row.ownReturnOnDone,
      returnAs: row.ownReturnAs,
    };
    return {
      organizationDefault,
      propertyOverride,
      effective: {
        assigneeRequired:
          propertyOverride.assigneeRequired ??
          organizationDefault.assigneeRequired,
        returnOnDone:
          propertyOverride.returnOnDone ?? organizationDefault.returnOnDone,
        returnAs: propertyOverride.returnAs ?? organizationDefault.returnAs,
      },
      mayConfigure: row.mayManage,
      mayConfigureDefault: row.mayManage && row.wideReach,
    };
  }

  function assertOverrides(values: SettingOverrides): void {
    if (values.returnAs !== null && !isReturnAs(values.returnAs)) {
      throw new MaintenanceInputError(
        "a room returns dirty, clean or inspected",
      );
    }
  }

  /**
   * One Property's own answers; null in a field follows the default again.
   * Clearing is a write of nulls, never a delete, and the audit record keeps
   * what it was (MT-S2-27).
   */
  async function setPropertySettings(
    userId: string,
    propertyId: string,
    values: SettingOverrides,
  ): Promise<void> {
    assertOverrides(values);
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: {
        organizationId: string;
        previous: SettingOverrides | null;
      }[];
      try {
        changed = await tx.$queryRaw`
          with previous as (
            select json_build_object(
                     'assigneeRequired', setting.assignee_required,
                     'returnOnDone', setting.return_on_done,
                     'returnAs', setting.return_as) as value
              from public.maintenance_settings as setting
             where setting.property_id = ${propertyId}::uuid
          )
          insert into public.maintenance_settings
            (organization_id, property_id, assignee_required, return_on_done, return_as)
          select property.organization_id, property.id,
                 ${values.assigneeRequired}::boolean,
                 ${values.returnOnDone}::boolean,
                 ${values.returnAs}
            from public.properties as property
           where property.id = ${propertyId}::uuid
          on conflict (property_id) where property_id is not null do update
             set assignee_required = excluded.assignee_required,
                 return_on_done = excluded.return_on_done,
                 return_as = excluded.return_as
          returning organization_id as "organizationId",
                    (select value from previous) as previous
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [setting] = changed;
      if (!setting) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: setting.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "maintenance_setting.changed",
        subjectType: "property",
        subjectId: propertyId,
        context: { from: setting.previous, to: values },
      });
    });
  }

  /**
   * The Organization's default, named through a Property the reader is on.
   * Needs reach to every Property it governs (MT-S2-23).
   */
  async function setOrganizationSettings(
    userId: string,
    propertyId: string,
    values: SettingValues,
  ): Promise<void> {
    if (!isReturnAs(values.returnAs)) {
      throw new MaintenanceInputError(
        "a room returns dirty, clean or inspected",
      );
    }
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: { organizationId: string; previous: SettingValues | null }[];
      try {
        changed = await tx.$queryRaw`
          with target as (
            select property.organization_id
              from public.properties as property
             where property.id = ${propertyId}::uuid
          ),
          previous as (
            select json_build_object(
                     'assigneeRequired', setting.assignee_required,
                     'returnOnDone', setting.return_on_done,
                     'returnAs', setting.return_as) as value
              from public.maintenance_settings as setting
             where setting.organization_id = (select organization_id from target)
               and setting.property_id is null
          )
          insert into public.maintenance_settings
            (organization_id, assignee_required, return_on_done, return_as)
          select organization_id, ${values.assigneeRequired}::boolean,
                 ${values.returnOnDone}::boolean, ${values.returnAs}
            from target
          on conflict (organization_id) where property_id is null do update
             set assignee_required = excluded.assignee_required,
                 return_on_done = excluded.return_on_done,
                 return_as = excluded.return_as
          returning organization_id as "organizationId",
                    (select value from previous) as previous
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [setting] = changed;
      if (!setting) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: setting.organizationId,
        // The default is about the whole Organization, so it names no Property
        // (ADR 0031).
        locationId: null,
        actorId: userId,
        action: "maintenance_setting.changed",
        subjectType: "organization",
        subjectId: setting.organizationId,
        context: { from: setting.previous ?? PRODUCT_DEFAULTS, to: values },
      });
    });
  }

  return {
    board,
    reportOptions,
    outOfOrderImpact,
    report,
    move,
    cancel,
    assign,
    prioritise,
    takeOutOfOrder,
    returnToService,
    roomsView,
    todayView,
    settings,
    setPropertySettings,
    setOrganizationSettings,
    ...createEquipmentCommands(deps),
    ...createMoneyCommands(deps),
  };
}

export type MaintenanceModule = ReturnType<typeof createMaintenanceModule>;
