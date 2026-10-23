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
  /** The assignee's email: an account has no display name, so the caller decides how to show it. */
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

/** What the viewer may do with requests at a Property, for the screen to draw only what will work. */
export interface ServiceRequestAccess {
  mayCreate: boolean;
  mayManage: boolean;
}

/** Somebody who can take a request: a Staff Member who manages requests and reaches the Property. */
export interface ServiceRequestStaff {
  userId: string;
  email: string;
}

/** A Unit a request can be about, with who is in house in it, for the reporter to see before choosing. */
export interface ServiceRequestUnit {
  unitId: string;
  name: string;
  /** The Guest in house in it now, if any. */
  occupant: string | null;
}

/**
 * The write changed no row: the request is gone from the viewer's reach, or
 * their permission to manage requests was withdrawn after the page was read.
 * The two look the same to the database and are told apart by nobody.
 */
export class ServiceRequestUnavailableError extends Error {
  constructor() {
    super("that service request could not be changed");
    this.name = "ServiceRequestUnavailableError";
  }
}

/** The lifecycle refused the move; `reason` says which rule. */
export class ServiceRequestStateError extends Error {
  constructor(
    readonly reason: "resolvedCannotCancel" | "cancelledReopensToNew",
  ) {
    super(`that status change is not allowed: ${reason}`);
    this.name = "ServiceRequestStateError";
  }
}

/** A policy, a column grant or a foreign key said no, and gave no reason of its own. */
export class ServiceRequestRefusedError extends Error {
  constructor(options?: ErrorOptions) {
    super("that service request change was refused", options);
    this.name = "ServiceRequestRefusedError";
  }
}
