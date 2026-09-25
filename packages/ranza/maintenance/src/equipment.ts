import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  DUE_WITHIN_DAYS,
  EQUIPMENT_CATEGORY,
  EQUIPMENT_LOCATION,
  EQUIPMENT_NAME,
  MAINTENANCE_CAPABILITY,
  MaintenanceInputError,
  MaintenanceRefusedError,
  SERVICE_INTERVAL,
  TITLE,
  type EquipmentChange,
  type EquipmentCondition,
  type EquipmentInput,
  type EquipmentItem,
  type EquipmentRegister,
  type Reported,
} from "./contracts";
import { boundedDate } from "./input";
import type { MaintenanceDeps, WriteClient } from "./ports";
import { CHECK_VIOLATION, raised, refusal, says } from "./refusals";

/**
 * The equipment register and the service plan (RANZ-33 slices 3 and 4).
 *
 * The plan is not a table: it is the register read by next service date, and
 * a work order is a request whose kind is `service`, worked on the same board.
 * An item's condition is worked out from its dates and its open requests in
 * the read, never stored, so nothing has to keep it true (MT-S3-04).
 */

function boundedText(
  value: string,
  bounds: { min: number; max: number },
  what: string,
): string {
  const trimmed = value.trim();
  if (trimmed.length < bounds.min || trimmed.length > bounds.max) {
    throw new MaintenanceInputError(
      `${what} is between ${bounds.min} and ${bounds.max} characters`,
    );
  }
  return trimmed;
}

/**
 * A write to the register refused for what was typed rather than who typed
 * it: a last service after the Property's today (MT-S3-03), which only the
 * database can see, because only it knows the Property's today.
 */
function equipmentRefusal(error: unknown): Error {
  if (raised(error, CHECK_VIOLATION) && says(error, "serviced in the future")) {
    return new MaintenanceInputError("equipment is not serviced in the future");
  }
  return refusal(error);
}

/** The fields an item is written with, checked before any statement runs. */
function boundedEquipment(input: EquipmentInput): EquipmentInput {
  const location = input.location?.trim() || null;
  const unitId = input.unitId || null;
  if ((unitId === null) === (location === null)) {
    throw new MaintenanceInputError("an item is at a room or a named place");
  }
  const interval = input.serviceIntervalMonths;
  if (
    interval !== null &&
    (!Number.isInteger(interval) ||
      interval < SERVICE_INTERVAL.min ||
      interval > SERVICE_INTERVAL.max)
  ) {
    throw new MaintenanceInputError(
      "a service interval is between one and a hundred and twenty months",
    );
  }
  return {
    name: boundedText(input.name, EQUIPMENT_NAME, "a name"),
    category: boundedText(input.category, EQUIPMENT_CATEGORY, "a category"),
    unitId,
    location:
      location === null
        ? null
        : boundedText(location, EQUIPMENT_LOCATION, "a place"),
    serviceIntervalMonths: interval,
    lastServicedOn: boundedDate(input.lastServicedOn),
  };
}

interface ItemRow {
  equipmentId: string;
  name: string;
  category: string;
  unitId: string | null;
  unitName: string | null;
  roomName: string | null;
  location: string | null;
  serviceIntervalMonths: number | null;
  lastServicedOn: string | null;
  nextServiceOn: string | null;
  condition: EquipmentCondition;
  retired: boolean;
  faultId: string | null;
  faultNumber: number | null;
  workOrderId: string | null;
  workOrderNumber: number | null;
  today: string;
  mayManageEquipment: boolean;
  mayReport: boolean;
}

function itemOf(row: ItemRow): EquipmentItem {
  return {
    equipmentId: row.equipmentId,
    name: row.name,
    category: row.category,
    unit:
      row.unitId === null || row.unitName === null
        ? null
        : { unitId: row.unitId, name: row.unitName, roomName: row.roomName },
    location: row.location,
    serviceIntervalMonths: row.serviceIntervalMonths,
    lastServicedOn: row.lastServicedOn,
    nextServiceOn: row.nextServiceOn,
    condition: row.condition,
    retired: row.retired,
    openFault:
      row.faultId === null || row.faultNumber === null
        ? null
        : { requestId: row.faultId, number: row.faultNumber },
    openWorkOrder:
      row.workOrderId === null || row.workOrderNumber === null
        ? null
        : { requestId: row.workOrderId, number: row.workOrderNumber },
  };
}

/**
 * Audits the service a work order recorded on its item (MT-S4-04). The date
 * itself is written by the database, in the statement that moved the work
 * order to done, whoever moved it — `maintenance.manage` works the board and
 * need not keep the register (20260916004600). This reads back what it wrote.
 */
export async function recordServiceWithin(
  tx: WriteClient,
  userId: string,
  request: {
    requestId: string;
    organizationId: string;
    propertyId: string;
    number: number;
    equipmentId: string | null;
  },
): Promise<void> {
  if (request.equipmentId === null) return;
  const [item] = await tx.$queryRaw<{ name: string; servicedOn: string }[]>`
    select name,
           to_char(last_serviced_on, 'YYYY-MM-DD') as "servicedOn"
      from public.maintenance_equipment
     where id = ${request.equipmentId}::uuid
  `;
  // The mover reaches the request's Property and the item is at it, so an
  // item that cannot be read here is a defect, not a refusal.
  if (!item) {
    throw new Error(`work order ${request.requestId} has no readable item`);
  }

  await recordWithin(tx, {
    organizationId: request.organizationId,
    locationId: request.propertyId,
    actorId: userId,
    action: "maintenance_equipment.serviced",
    subjectType: "maintenance_equipment",
    subjectId: request.equipmentId,
    context: {
      name: item.name,
      servicedOn: item.servicedOn,
      requestId: request.requestId,
      number: request.number,
    },
  });
}

export function createEquipmentCommands(deps: MaintenanceDeps) {
  /**
   * Every item at a Property, retired ones included for the reader to show or
   * hide, each with its condition and next service (MT-S3-04, MT-S4-01).
   *
   * A service falls due its interval after the last one; an item with an
   * interval and no service yet is due today. Fault wins over the dates: a
   * broken boiler is not "working" because it was serviced last week.
   */
  async function equipmentRegister(
    userId: string,
    propertyId: string,
  ): Promise<EquipmentRegister> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<(ItemRow | (Partial<ItemRow> & { equipmentId: null }))[]>`
        with scope as (
          select property.id, property.organization_id,
                 app.property_today(property.id) as today
            from public.properties as property
           where property.id = ${propertyId}::uuid
             and app.can_use_capability(
                   property.id,
                   ${MAINTENANCE_CAPABILITY.moduleKey},
                   ${MAINTENANCE_CAPABILITY.capabilityKey})
        ),
        item as (
          select equipment.*,
                 case
                   when equipment.service_interval_months is null then null
                   when equipment.last_serviced_on is null then scope.today
                   else (equipment.last_serviced_on
                         + make_interval(months => equipment.service_interval_months))::date
                 end as next_service_on
            from public.maintenance_equipment as equipment
            join scope on scope.id = equipment.property_id
        )
        select item.id                                         as "equipmentId",
               item.name,
               item.category,
               unit.id                                         as "unitId",
               unit.name                                       as "unitName",
               room.name                                       as "roomName",
               item.location,
               item.service_interval_months                    as "serviceIntervalMonths",
               to_char(item.last_serviced_on, 'YYYY-MM-DD')    as "lastServicedOn",
               to_char(item.next_service_on, 'YYYY-MM-DD')     as "nextServiceOn",
               case
                 when fault.id is not null then 'fault'
                 when item.next_service_on is null then 'working'
                 when item.next_service_on < scope.today then 'overdue'
                 when item.next_service_on <= scope.today + ${DUE_WITHIN_DAYS}::int then 'due'
                 else 'working'
               end                                             as condition,
               item.retired_at is not null                     as retired,
               fault.id                                        as "faultId",
               fault.number                                    as "faultNumber",
               work_order.id                                   as "workOrderId",
               work_order.number                               as "workOrderNumber",
               to_char(scope.today, 'YYYY-MM-DD')              as today,
               app.has_organization_permission(
                 scope.organization_id, 'maintenance.equipment') as "mayManageEquipment",
               app.has_organization_permission(
                 scope.organization_id, 'maintenance.report')    as "mayReport"
          from scope
          left join item on true
          left join public.accommodation_units as unit
            on unit.id = item.accommodation_unit_id
          left join public.accommodation_units as room
            on room.id = unit.parent_id
          left join lateral (
            select request.id, request.number
              from public.maintenance_requests as request
             where request.equipment_id = item.id
               and request.kind = 'fault'
               and request.status not in ('done', 'cancelled')
             order by request.number
             limit 1
          ) as fault on true
          left join lateral (
            select request.id, request.number
              from public.maintenance_requests as request
             where request.equipment_id = item.id
               and request.kind = 'service'
               and request.status not in ('done', 'cancelled')
             limit 1
          ) as work_order on true
         order by item.next_service_on nulls last, item.name
      `,
    );

    const first = rows[0];
    return {
      today: first?.today ?? new Date().toISOString().slice(0, 10),
      items: rows
        .filter((row): row is ItemRow => row.equipmentId !== null)
        .map(itemOf),
      mayManageEquipment: first?.mayManageEquipment ?? false,
      mayReport: first?.mayReport ?? false,
    };
  }

  /** Registers an item (MT-S3-01). The Organization comes from the Property. */
  async function addEquipment(
    userId: string,
    propertyId: string,
    input: EquipmentInput,
  ): Promise<{ equipmentId: string }> {
    const item = boundedEquipment(input);
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let added: {
        equipmentId: string;
        organizationId: string;
        propertyId: string;
      }[];
      try {
        added = await tx.$queryRaw`
          insert into public.maintenance_equipment
            (organization_id, property_id, name, category,
             accommodation_unit_id, location, service_interval_months,
             last_serviced_on)
          select property.organization_id, property.id, ${item.name},
                 ${item.category}, ${item.unitId}::uuid, ${item.location},
                 ${item.serviceIntervalMonths}::int, ${item.lastServicedOn}::date
            from public.properties as property
           where property.id = ${propertyId}::uuid
          returning id as "equipmentId", organization_id as "organizationId",
                    property_id as "propertyId"
        `;
      } catch (error: unknown) {
        throw equipmentRefusal(error);
      }
      const [row] = added;
      if (!row) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: row.organizationId,
        locationId: row.propertyId,
        actorId: userId,
        action: "maintenance_equipment.added",
        subjectType: "maintenance_equipment",
        subjectId: row.equipmentId,
        context: { ...item },
      });
      return { equipmentId: row.equipmentId };
    });
  }

  /**
   * Changes an item, keeping what it was in the audit record (MT-S3-05).
   *
   * The row is locked and read first, so what the audit calls "from" is what
   * the change replaced rather than an older snapshot, and a service recorded
   * while the form was open is seen. A last-serviced date the person left as
   * the form showed it is not written over that service.
   */
  async function changeEquipment(
    userId: string,
    equipmentId: string,
    input: EquipmentChange,
  ): Promise<void> {
    const item = boundedEquipment(input);
    const was = boundedDate(input.lastServicedOnWas);
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      // A row lock applies the register's update policy as well as its read
      // one, so a Staff Member without maintenance.equipment locks nothing.
      // NO KEY: a request naming the item takes KEY SHARE for its foreign
      // key, and need not wait for an edit that never changes the key.
      const [previous] = await tx.$queryRaw<
        {
          organizationId: string;
          propertyId: string;
          name: string;
          category: string;
          unitId: string | null;
          location: string | null;
          serviceIntervalMonths: number | null;
          lastServicedOn: string | null;
        }[]
      >`
        select organization_id as "organizationId",
               property_id as "propertyId", name, category,
               accommodation_unit_id as "unitId", location,
               service_interval_months as "serviceIntervalMonths",
               to_char(last_serviced_on, 'YYYY-MM-DD') as "lastServicedOn"
          from public.maintenance_equipment
         where id = ${equipmentId}::uuid
           for no key update
      `;
      if (!previous) throw new MaintenanceRefusedError();

      const lastServicedOn =
        item.lastServicedOn === was
          ? previous.lastServicedOn
          : item.lastServicedOn;
      const written = { ...item, lastServicedOn };
      try {
        await tx.$queryRaw`
          update public.maintenance_equipment
             set name = ${written.name},
                 category = ${written.category},
                 accommodation_unit_id = ${written.unitId}::uuid,
                 location = ${written.location},
                 service_interval_months = ${written.serviceIntervalMonths}::int,
                 last_serviced_on = ${written.lastServicedOn}::date
           where id = ${equipmentId}::uuid
          returning id
        `;
      } catch (error: unknown) {
        throw equipmentRefusal(error);
      }

      const { organizationId, propertyId, ...from } = previous;
      await recordWithin(tx, {
        organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "maintenance_equipment.changed",
        subjectType: "maintenance_equipment",
        subjectId: equipmentId,
        context: { from, to: written },
      });
    });
  }

  /**
   * Retires an item, or restores one (MT-S3-06). Retired, it leaves the
   * register, the plan and the report form, and keeps its requests. The action
   * is passed by position so the audit-writers scan reads it.
   */
  async function setRetired(
    userId: string,
    equipmentId: string,
    retired: boolean,
    action: string,
  ): Promise<void> {
    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: {
        organizationId: string;
        propertyId: string;
        name: string;
      }[];
      try {
        changed = await tx.$queryRaw`
          update public.maintenance_equipment
             set retired_at = case when ${retired}::boolean then now() end
           where id = ${equipmentId}::uuid
             and (retired_at is null) = ${retired}::boolean
          returning organization_id as "organizationId",
                    property_id as "propertyId", name
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [row] = changed;
      if (!row) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: row.organizationId,
        locationId: row.propertyId,
        actorId: userId,
        action,
        subjectType: "maintenance_equipment",
        subjectId: equipmentId,
        context: { name: row.name },
      });
    });
  }

  function retireEquipment(userId: string, equipmentId: string) {
    return setRetired(
      userId,
      equipmentId,
      true,
      "maintenance_equipment.retired",
    );
  }

  function restoreEquipment(userId: string, equipmentId: string) {
    return setRetired(
      userId,
      equipmentId,
      false,
      "maintenance_equipment.restored",
    );
  }

  /**
   * Raises a work order for an item (MT-S4-02): a service request, urgent
   * when the service is overdue and this week otherwise — overdue as the
   * register means it, so an item never serviced is due today, not late. The
   * title is the caller's, in the reader's language; the rest is read from the
   * item. A second open work order is refused by a partial unique index
   * (MT-S4-03).
   */
  async function createWorkOrder(
    userId: string,
    input: { equipmentId: string; title: string },
  ): Promise<Reported> {
    const title = boundedText(input.title, TITLE, "a title");
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let written: {
        requestId: string;
        organizationId: string;
        propertyId: string;
        number: number;
        priority: string;
      }[];
      try {
        written = await tx.$queryRaw`
          insert into public.maintenance_requests
            (organization_id, property_id, title, equipment_id, kind, priority)
          select equipment.organization_id, equipment.property_id, ${title},
                 equipment.id, 'service',
                 case
                   when (equipment.last_serviced_on
                         + make_interval(months => equipment.service_interval_months))::date
                        < app.property_today(equipment.property_id)
                   then 'urgent'
                   else 'this_week'
                 end
            from public.maintenance_equipment as equipment
           where equipment.id = ${input.equipmentId}::uuid
             and equipment.retired_at is null
          returning id as "requestId", organization_id as "organizationId",
                    property_id as "propertyId", number, priority
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
          equipmentId: input.equipmentId,
          kind: "service",
          priority: request.priority,
        },
      });
      return { requestId: request.requestId, number: request.number };
    });
  }

  return {
    equipmentRegister,
    addEquipment,
    changeEquipment,
    retireEquipment,
    restoreEquipment,
    createWorkOrder,
  };
}
