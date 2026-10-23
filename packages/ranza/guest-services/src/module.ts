import { withOrganizationContext, type PrismaClient } from "@ranza/db";
import {
  GUEST_SERVICES_CAPABILITY,
  GUEST_SERVICES_PERMISSIONS,
  ServiceRequestRefusedError,
  ServiceRequestStateError,
  ServiceRequestUnavailableError,
  type ServiceRequestAccess,
  type ServiceRequestStaff,
} from "./contracts";
import type {
  CreateServiceRequestInput,
  ServiceRequestCategory,
  ServiceRequestItem,
  ServiceRequestPriority,
  ServiceRequestStatus,
  UpdateServiceRequestInput,
} from "./contracts";
import type { GuestServicesDeps } from "./ports";

async function readRequest(
  client: PrismaClient,
  requestId: string,
): Promise<ServiceRequestItem | null> {
  const record = await client.serviceRequest.findUnique({
    where: { id: requestId },
    include: {
      accommodationUnit: {
        select: { name: true },
      },
      guest: {
        select: { fullName: true },
      },
      assignedTo: {
        select: { email: true },
      },
    },
  });

  if (!record) return null;

  return {
    id: record.id,
    number: record.number,
    organizationId: record.organizationId,
    propertyId: record.propertyId,
    title: record.title,
    details: record.details,
    category: record.category as ServiceRequestCategory,
    priority: record.priority as ServiceRequestPriority,
    status: record.status as ServiceRequestStatus,
    cancelReason: record.cancelReason,
    resolutionNotes: record.resolutionNotes,
    accommodationUnitId: record.accommodationUnitId,
    unitName: record.accommodationUnit?.name ?? null,
    stayId: record.stayId,
    guestId: record.guestId,
    guestName: record.guest?.fullName ?? null,
    assignedToUserId: record.assignedToUserId,
    assignedToName: record.assignedTo?.email ?? null,
    reportedByUserId: record.reportedByUserId,
    reportedAt: record.reportedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const INSUFFICIENT_PRIVILEGE = "42501";
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Whether a failure carries a SQLSTATE, read from the driver's `meta` and from
 * the message, as `@ranza/maintenance` reads it.
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

/**
 * What the database says when it refuses a write to a request, as this
 * module's errors. Anything it does not recognise is returned as it came.
 */
function refusal(error: unknown): unknown {
  const message =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  if (message.includes("a resolved request cannot be cancelled")) {
    return new ServiceRequestStateError("resolvedCannotCancel");
  }
  if (message.includes("a cancelled request can only be reopened to new")) {
    return new ServiceRequestStateError("cancelledReopensToNew");
  }
  if (
    raised(error, INSUFFICIENT_PRIVILEGE) ||
    raised(error, FOREIGN_KEY_VIOLATION)
  ) {
    return new ServiceRequestRefusedError({ cause: error });
  }
  return error;
}

export function createGuestServicesModule({ db }: GuestServicesDeps) {
  return {
    /**
     * Lists all service requests at a Property.
     * Filtered by RLS to properties the viewer reaches.
     */
    async requests(
      userId: string,
      propertyId: string,
    ): Promise<ServiceRequestItem[]> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const client = tx as unknown as PrismaClient;
        const records = await client.serviceRequest.findMany({
          where: { propertyId },
          include: {
            accommodationUnit: {
              select: { name: true },
            },
            guest: {
              select: { fullName: true },
            },
            assignedTo: {
              select: { email: true },
            },
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        });

        return records.map((record) => ({
          id: record.id,
          number: record.number,
          organizationId: record.organizationId,
          propertyId: record.propertyId,
          title: record.title,
          details: record.details,
          category: record.category as ServiceRequestCategory,
          priority: record.priority as ServiceRequestPriority,
          status: record.status as ServiceRequestStatus,
          cancelReason: record.cancelReason,
          resolutionNotes: record.resolutionNotes,
          accommodationUnitId: record.accommodationUnitId,
          unitName: record.accommodationUnit?.name ?? null,
          stayId: record.stayId,
          guestId: record.guestId,
          guestName: record.guest?.fullName ?? null,
          assignedToUserId: record.assignedToUserId,
          assignedToName: record.assignedTo?.email ?? null,
          reportedByUserId: record.reportedByUserId,
          reportedAt: record.reportedAt.toISOString(),
          resolvedAt: record.resolvedAt?.toISOString() ?? null,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        }));
      });
    },

    /**
     * What the viewer may do with requests at a Property: the screen draws
     * only the controls that will work, and the policies decide all the same.
     */
    async access(
      userId: string,
      propertyId: string,
    ): Promise<ServiceRequestAccess> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        const [row] = await tx.$queryRaw<ServiceRequestAccess[]>`
          select app.can_use_capability(
                   property.id,
                   ${GUEST_SERVICES_CAPABILITY.moduleKey},
                   ${GUEST_SERVICES_CAPABILITY.capabilityKey})
                 and app.has_organization_permission(
                   property.organization_id,
                   ${GUEST_SERVICES_PERMISSIONS.createRequest}) as "mayCreate",
                 app.can_use_capability(
                   property.id,
                   ${GUEST_SERVICES_CAPABILITY.moduleKey},
                   ${GUEST_SERVICES_CAPABILITY.capabilityKey})
                 and app.has_organization_permission(
                   property.organization_id,
                   ${GUEST_SERVICES_PERMISSIONS.manageRequests}) as "mayManage"
            from public.properties as property
           where property.id = ${propertyId}::uuid
        `;
        return row ?? { mayCreate: false, mayManage: false };
      });
    },

    /**
     * Who a request can be given to: Staff Members who reach the Property and
     * hold the permission to manage requests, because anybody else could be
     * assigned work they cannot move.
     */
    async assignees(
      userId: string,
      propertyId: string,
    ): Promise<ServiceRequestStaff[]> {
      return withOrganizationContext(
        db,
        { userId },
        (tx) =>
          tx.$queryRaw<ServiceRequestStaff[]>`
          select membership.user_id as "userId", account.email
            from public.properties as property
            join public.organization_memberships as membership
              on membership.organization_id = property.organization_id
            join public.users as account
              on account.id = membership.user_id
            join public.staff_roles as role
              on role.scope_id = membership.role_scope_id
             and role.key = membership.role
           where property.id = ${propertyId}::uuid
             and membership.status = 'active'
             and role.status = 'active'
             and ${GUEST_SERVICES_PERMISSIONS.manageRequests} = any (role.permissions)
             and (membership.access_scope = 'organization_wide'
                  or exists (
                    select 1
                      from public.property_assignments as assignment
                     where assignment.user_id = membership.user_id
                       and assignment.property_id = property.id
                       and assignment.status = 'active'))
           order by account.email
        `,
      );
    },

    /**
     * Finds one request by its ID.
     */
    async request(
      userId: string,
      requestId: string,
    ): Promise<ServiceRequestItem | null> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        return readRequest(tx as unknown as PrismaClient, requestId);
      });
    },

    /**
     * Logs a new request.
     * Number and reported_at are stamped by the database trigger.
     * Raw query is used to respect column-level INSERT grants for ranza_app (ADR 0012).
     */
    async createRequest(
      userId: string,
      input: CreateServiceRequestInput,
    ): Promise<ServiceRequestItem> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        let rows: { id: string }[];
        try {
          rows = await tx.$queryRaw<{ id: string }[]>`
          insert into public.service_requests
            (organization_id, property_id, title, details, category, priority,
             accommodation_unit_id, stay_id, guest_id, assigned_to_user_id)
          select property.organization_id, property.id,
                 ${input.title},
                 ${input.details ?? null},
                 ${input.category},
                 ${input.priority},
                 ${input.accommodationUnitId ?? null}::uuid,
                 coalesce(${input.stayId ?? null}::uuid, occupant.stay_id),
                 coalesce(${input.guestId ?? null}::uuid, occupant.guest_id),
                 ${input.assignedToUserId ?? null}::uuid
            from public.properties as property
            left join lateral (
              -- The Guest in the room is who the request is for (GX-07): read
              -- here, from the Stay, so a form cannot name somebody else's.
              select stay.id as stay_id, reservation.guest_id
                from public.stays as stay
                left join public.reservations as reservation
                  on reservation.id = stay.reservation_id
               where stay.accommodation_unit_id = ${input.accommodationUnitId ?? null}::uuid
                 and stay.status = 'in_house'
               limit 1
            ) as occupant on true
           where property.id = ${input.propertyId}::uuid
          returning id
        `;
        } catch (error: unknown) {
          throw refusal(error);
        }

        const row = rows[0];
        if (!row) {
          throw new Error("Failed to insert service request");
        }

        const created = await readRequest(
          tx as unknown as PrismaClient,
          row.id,
        );
        if (!created) {
          throw new Error("Failed to read back created service request");
        }
        return created;
      });
    },

    /**
     * Updates an existing service request.
     * Raw query is used to respect column-level UPDATE grants for ranza_app (ADR 0012).
     */
    async updateRequest(
      userId: string,
      requestId: string,
      input: UpdateServiceRequestInput,
    ): Promise<ServiceRequestItem> {
      return withOrganizationContext(db, { userId }, async (tx) => {
        let changed: { id: string }[];
        try {
          changed = await tx.$queryRaw<{ id: string }[]>`
            update public.service_requests
               set status = coalesce(${input.status ?? null}, status),
                   cancel_reason = case when ${input.cancelReason !== undefined} then ${input.cancelReason ?? null} else cancel_reason end,
                   resolution_notes = case when ${input.resolutionNotes !== undefined} then ${input.resolutionNotes ?? null} else resolution_notes end,
                   priority = coalesce(${input.priority ?? null}, priority),
                   category = coalesce(${input.category ?? null}, category),
                   assigned_to_user_id = case when ${input.assignedToUserId !== undefined} then ${input.assignedToUserId ?? null}::uuid else assigned_to_user_id end,
                   accommodation_unit_id = case when ${input.accommodationUnitId !== undefined} then ${input.accommodationUnitId ?? null}::uuid else accommodation_unit_id end
             where id = ${requestId}::uuid
            returning id
          `;
        } catch (error: unknown) {
          throw refusal(error);
        }
        // A policy that says no to an update says it by matching no row.
        if (changed.length === 0) throw new ServiceRequestUnavailableError();

        const updated = await readRequest(
          tx as unknown as PrismaClient,
          requestId,
        );
        if (!updated) {
          throw new Error("Service request not found after update");
        }
        return updated;
      });
    },
  };
}
