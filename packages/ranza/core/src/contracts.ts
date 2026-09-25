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

/** Every Property one capability may be used in — an answer from `listEntitledPropertiesByCapability`. */
export interface CapabilityProperties {
  capability: CapabilityRef;
  properties: EntitledProperty[];
}

/**
 * Configuration (blueprint 5.1): Platform Core's own screen. Every Organization
 * holds Platform Core, so this capability is the switch a Property turns it on
 * with, not something an Organization buys separately (ADR 0036).
 */
export const CONFIGURATION_CAPABILITY: CapabilityRef = {
  moduleKey: PLATFORM_CORE_MODULE,
  capabilityKey: "configuration",
};

/**
 * Changing a Property's settings or the Organization's name. The shipped Owner
 * and Manager roles hold it; reach decides which rows (ADR 0036).
 */
export const CONFIGURATION_MANAGE_PERMISSION = "configuration.manage";

/** The settings a form may change, and the only names a refusal points at. */
export type ConfigurationField =
  "name" | "timezone" | "currency" | "businessDateCutoff" | "organizationName";

/**
 * A Property's settings as the screen shows them, with the versions a save
 * names to prove it was made against what is there now.
 *
 * A version is the row's stamp as ISO text to the microsecond. Never a `Date`:
 * a JavaScript date keeps milliseconds, so a version that went through one
 * would never match again and every save would read as stale.
 */
export interface PropertySettings {
  propertyId: string;
  name: string;
  timezone: string;
  currency: string;
  /** `HH:MM`, local to the Property. */
  businessDateCutoff: string;
  version: string;
  /** The business date at this Property now, `YYYY-MM-DD`. */
  businessDate: string;
  /** A Folio has been opened here, so the currency is fixed (CF-S1-04). */
  currencyFixed: boolean;
  mayConfigure: boolean;
  organization: {
    organizationId: string;
    name: string;
    version: string;
    /** The permission and reach to every Property (CF-S2-02). */
    mayRename: boolean;
  };
}

export interface PropertySettingsInput {
  name: string;
  timezone: string;
  currency: string;
  businessDateCutoff: string;
  version: string;
}

export interface OrganizationNameInput {
  name: string;
  version: string;
}

/** `unchanged` when the save named what was already there: nothing recorded. */
export interface SettingsSaved {
  status: "saved" | "unchanged";
  version: string;
}

/** The business date now, and the one a changed timezone or cutoff would make. */
export interface BusinessDatePreview {
  current: string;
  /** Null for a timezone Postgres does not know. */
  proposed: string | null;
}

/** A value the settings cannot hold; `field` is null when the database said so without naming one. */
export class ConfigurationInputError extends Error {
  constructor(readonly field: ConfigurationField | null) {
    super(field ? `invalid ${field}` : "invalid settings");
    this.name = "ConfigurationInputError";
  }
}

/**
 * Nothing was changed. One refusal for every reason — out of reach, another
 * Organization, no permission, a lapsed Subscription — so a refusal cannot be
 * told from a Property that does not exist.
 */
export class ConfigurationRefusedError extends Error {
  constructor() {
    super("those settings cannot be changed");
    this.name = "ConfigurationRefusedError";
  }
}

/** Somebody saved since the form was read; `current` is what is there now (CF-S1-16). */
export class ConfigurationStaleError extends Error {
  constructor(readonly current: PropertySettings) {
    super("the settings changed since they were read");
    this.name = "ConfigurationStaleError";
  }
}

/** The Property has a Folio, so its currency stays (CF-S1-04). */
export class ConfigurationCurrencyFixedError extends Error {
  constructor() {
    super("the currency is fixed by the first Folio");
    this.name = "ConfigurationCurrencyFixedError";
  }
}
