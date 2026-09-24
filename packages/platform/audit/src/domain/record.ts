/**
 * What an audit record is, and what makes one valid.
 *
 * Framework-independent by rule: no client, no SQL, no transport. This layer is
 * also where the module's ignorance is deliberate — a subject is an opaque type
 * name and identifier, and the scope is an opaque tenancy identifier. The module
 * records that something happened without being able to say what it was.
 */

/** Dotted, lower case: `organization.created`, `membership.revoked`. */
const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SUBJECT_TYPE = /^[a-z][a-z0-9_]*$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REASON_MIN = 3;
const REASON_MAX = 2000;

export class AuditEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditEntryError";
  }
}

/** What a caller must supply to record that something happened. */
export interface AuditEntry {
  /** Opaque tenancy scope. */
  organizationId: string;
  /**
   * Where inside the scope it happened, as the host names it — opaque here.
   * Omitted or null for an action about the whole scope. Read reach narrows to
   * it, so a record written without one is visible only to whoever reaches the
   * whole scope and to the actor.
   */
  locationId?: string | null;
  /** Who acted. Never inferred here: the caller knows, this module does not. */
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  /** Required by the caller for high-risk actions, not by this module. */
  reason?: string;
  context?: Record<string, unknown>;
}

export interface AuditRecord extends Omit<AuditEntry, "locationId"> {
  id: string;
  locationId: string | null;
  occurredAt: Date;
}

/**
 * Rejects an entry the database would reject anyway.
 *
 * The constraints exist in both places on purpose. The database is the boundary
 * that holds when this code is wrong; this is the one that says which field was
 * wrong, before a constraint violation has to be decoded.
 */
export function assertRecordable(entry: AuditEntry): void {
  if (!UUID.test(entry.organizationId)) {
    throw new AuditEntryError("organizationId must be a uuid");
  }
  if (!UUID.test(entry.actorId)) {
    throw new AuditEntryError("actorId must be a uuid");
  }
  if (
    entry.locationId !== undefined &&
    entry.locationId !== null &&
    !UUID.test(entry.locationId)
  ) {
    throw new AuditEntryError("locationId must be a uuid");
  }
  if (!UUID.test(entry.subjectId)) {
    throw new AuditEntryError("subjectId must be a uuid");
  }
  if (!ACTION.test(entry.action)) {
    throw new AuditEntryError(
      `action must look like "noun.verb", received "${entry.action}"`,
    );
  }
  if (!SUBJECT_TYPE.test(entry.subjectType)) {
    throw new AuditEntryError(
      `subjectType must be a lower-case name, received "${entry.subjectType}"`,
    );
  }
  if (entry.reason !== undefined) {
    const reason = entry.reason.trim();
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      throw new AuditEntryError(
        `reason must be between ${REASON_MIN} and ${REASON_MAX} characters`,
      );
    }
  }
}
