import { withOrganizationContext, type PrismaClient } from "@ranza/db";
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
        const rows = await tx.$queryRaw<{ id: string }[]>`
          insert into public.service_requests
            (organization_id, property_id, title, details, category, priority,
             accommodation_unit_id, stay_id, guest_id, assigned_to_user_id)
          select property.organization_id, property.id,
                 ${input.title},
                 ${input.details ?? null},
                 ${input.category},
                 ${input.priority},
                 ${input.accommodationUnitId ?? null}::uuid,
                 ${input.stayId ?? null}::uuid,
                 ${input.guestId ?? null}::uuid,
                 ${input.assignedToUserId ?? null}::uuid
            from public.properties as property
           where property.id = ${input.propertyId}::uuid
          returning id
        `;

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
        await tx.$queryRaw`
          update public.service_requests
             set status = coalesce(${input.status ?? null}, status),
                 cancel_reason = case when ${input.cancelReason !== undefined} then ${input.cancelReason ?? null} else cancel_reason end,
                 resolution_notes = case when ${input.resolutionNotes !== undefined} then ${input.resolutionNotes ?? null} else resolution_notes end,
                 priority = coalesce(${input.priority ?? null}, priority),
                 category = coalesce(${input.category ?? null}, category),
                 assigned_to_user_id = case when ${input.assignedToUserId !== undefined} then ${input.assignedToUserId ?? null}::uuid else assigned_to_user_id end,
                 accommodation_unit_id = case when ${input.accommodationUnitId !== undefined} then ${input.accommodationUnitId ?? null}::uuid else accommodation_unit_id end
           where id = ${requestId}::uuid
        `;

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
