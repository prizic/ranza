/**
 * Guest Services & Service Requests domain contracts (Blueprint 5.5, 4.3).
 */

export type ServiceRequestCategory =
  "housekeeping" | "maintenance" | "amenities" | "front_desk" | "other";

export const SERVICE_REQUEST_CATEGORIES: readonly ServiceRequestCategory[] = [
  "housekeeping",
  "maintenance",
  "amenities",
  "front_desk",
  "other",
];

export type ServiceRequestPriority = "low" | "normal" | "high" | "urgent";

export const SERVICE_REQUEST_PRIORITIES: readonly ServiceRequestPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export type ServiceRequestStatus =
  "new" | "in_progress" | "resolved" | "cancelled";

export const SERVICE_REQUEST_STATUSES: readonly ServiceRequestStatus[] = [
  "new",
  "in_progress",
  "resolved",
  "cancelled",
];

export const GUEST_SERVICES_CAPABILITY = {
  moduleKey: "guest_services",
  capabilityKey: "guest_experience",
} as const;

export const GUEST_SERVICES_PERMISSIONS = {
  createRequest: "guest_services.create_request",
  manageRequests: "guest_services.manage_requests",
} as const;

export interface ServiceRequestItem {
  id: string;
  number: number;
  organizationId: string;
  propertyId: string;
  title: string;
  details: string | null;
  category: ServiceRequestCategory;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  cancelReason: string | null;
  resolutionNotes: string | null;
  accommodationUnitId: string | null;
  unitName: string | null;
  stayId: string | null;
  guestId: string | null;
  guestName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  reportedByUserId: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceRequestInput {
  propertyId: string;
  organizationId?: string | undefined;
  title: string;
  details?: string | null | undefined;
  category: ServiceRequestCategory;
  priority: ServiceRequestPriority;
  accommodationUnitId?: string | null | undefined;
  stayId?: string | null | undefined;
  guestId?: string | null | undefined;
  assignedToUserId?: string | null | undefined;
}

export interface UpdateServiceRequestInput {
  status?: ServiceRequestStatus | undefined;
  cancelReason?: string | null | undefined;
  resolutionNotes?: string | null | undefined;
  priority?: ServiceRequestPriority | undefined;
  category?: ServiceRequestCategory | undefined;
  assignedToUserId?: string | null | undefined;
  accommodationUnitId?: string | null | undefined;
}
