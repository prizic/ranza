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
 * Reading the Organization's audit log — what was done, by whom, and why.
 *
 * Audit is Platform Core (blueprint 5.1) and a baseline right no package
 * selection can remove (3.6), which is why the module key is Core's own. The
 * capability is still a Property capability like every other destination: it
 * is what puts the screen in the rail and what the read is gated on, and a
 * Property that has it off reaches nothing — the same shape as `today`.
 */
export const AUDIT_CAPABILITY: CapabilityRef = {
  moduleKey: PLATFORM_CORE_MODULE,
  capabilityKey: "audit",
};

/** A Property the acting Staff Member may use a capability in. */
export interface EntitledProperty {
  propertyId: string;
  propertyName: string;
  timezone: string;
  organizationId: string;
  organizationName: string;
}
