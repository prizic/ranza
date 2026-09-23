import type { AuditRecord } from "@ranza/platform-audit";
import type { AuditNames } from "./audit-log";

/**
 * The public vocabulary of Ranza core: Organization, Property, and the
 * capability keys the rest of the product gates on.
 */

/**
 * Names a capability precisely enough for blueprint 3.5 to be evaluated.
 *
 * Both halves are needed because the gates are independent: an Entitlement is
 * granted to an Organization for a module, while a capability is enabled on one
 * Property. Holding the Entitlement does not turn the capability on.
 */
export interface CapabilityRef {
  /** Entitlement key, matched against `entitlements.module_key` (gate 2). */
  moduleKey: string;
  /** Matched against `property_capabilities.capability_key` (gate 3). */
  capabilityKey: string;
}

/**
 * Platform Core (blueprint 5.1): Organization and Property structure, identity,
 * roles and assignments, localization, audit. Every Subscription includes it
 * (blueprint 3.1), so the Entitlement row exists for every Organization — which
 * is not the same as the gate being decorative. A suspended Subscription or a
 * revoked Entitlement still denies.
 */
export const PLATFORM_CORE_MODULE = "platform_core";

/** The shell's first destination (blueprint 4.6). */
export const TODAY_CAPABILITY: CapabilityRef = {
  moduleKey: PLATFORM_CORE_MODULE,
  capabilityKey: "today",
};

/**
 * Reading the audit log — what was done, by whom, and why.
 *
 * A permission, not a Property capability. Audit is a baseline right no
 * package selection removes (blueprint 3.6), so no commercial gate stands in
 * front of it; who may read it is a question about the person's role, which is
 * blueprint 3.5's gate 4. The shipped Owner and Manager roles hold it; an
 * Organization composes it into any other role it likes (ADR 0031).
 */
export const AUDIT_READ_PERMISSION = "audit.read";

/**
 * What a reader narrows the log by. Every field arrives from a URL, so every
 * one is optional and every one is validated before it reaches a statement.
 */
export interface AuditFilters {
  /** Action names; any of them. */
  actions?: readonly string[] | undefined;
  /** One Property's records rather than every one the viewer reaches. */
  propertyId?: string | undefined;
  /** A calendar day, `YYYY-MM-DD`, in the opened Property's wall clock. */
  from?: string | undefined;
  /** Inclusive: the whole of this day is included. */
  to?: string | undefined;
  /** A Guest, a room, a colleague's address, or words from a reason. */
  q?: string | undefined;
  /** From a previous page's `nextCursor`. */
  cursor?: string | undefined;
}

/** One record, with where it happened and whose clock tells its time. */
export interface AuditEntry extends AuditRecord {
  /** The Property it happened at, or null for the whole Organization. */
  propertyName: string | null;
  /** Its own Property's timezone; the opened Property's when it has none. */
  timeZone: string;
}

/** A page of the log, and the names its ids are shown by. */
export interface AuditPage extends AuditNames {
  entries: AuditEntry[];
  /** Records matching the filters, across every page. */
  total: number;
  nextCursor: string | null;
}

/** A Property the acting Staff Member may use a capability in. */
export interface EntitledProperty {
  propertyId: string;
  propertyName: string;
  timezone: string;
  organizationId: string;
  organizationName: string;
}
