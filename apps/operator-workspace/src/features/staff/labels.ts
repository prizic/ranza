/**
 * The catalogue keys, narrowed so the message catalogue can be typed.
 *
 * `messages.ts` has no fallback locale on purpose — a missing string is a type
 * error rather than English quietly appearing on an Arabic page (ADR 0023) —
 * and that only works while the key handed to `t()` is a literal union. A role
 * key read from the database is a `string`, so this is where the two meet.
 *
 * Restated rather than imported: nothing outside `src/server/` may import a
 * Ranza module (ADR 0007). `public.staff_permissions` is the real list and a
 * role composed from a key that is not in it is refused by a trigger. A key
 * missing here is quieter — the People screen could not offer it and the audit
 * log would print it raw — so tests/integration/rates.test.ts compares this
 * list with the table.
 */

/**
 * How long a revoke can be undone, restated for the same reason: the screen
 * words it and the module decides it. `tests/unit/permission-sections.test.ts`
 * compares it with `UNDO_REVOKE_WINDOW_HOURS`.
 */
export const UNDO_WINDOW_HOURS = 24;

const SHIPPED_ROLES = [
  "owner",
  "manager",
  "front_desk",
  "housekeeping",
  "finance",
] as const;

export const PERMISSION_CATALOGUE = [
  "front_desk.book",
  "front_desk.check_in",
  "front_desk.check_out",
  "front_desk.cancel",
  "front_desk.amend",
  "front_desk.close_day",
  "finance.manage_folio",
  "finance.post_charge",
  "finance.reverse_charge",
  "finance.post_payment",
  "finance.reverse_payment",
  "finance.view_ledger",
  "staff.administer",
  "staff.define_roles",
  "accommodation.configure",
  "housekeeping.update_status",
  "maintenance.report",
  "maintenance.manage",
  "maintenance.take_out_of_order",
  "maintenance.equipment",
  "audit.read",
  "configuration.manage",
  "rates.manage",
  "data_export.read",
  "data_export.create",
  "guest_services.create_request",
  "guest_services.manage_requests",
  "hr.view",
  "hr.manage",
  "integrations.view",
  "integrations.manage",
  "branding.manage",
] as const;

export type ShippedRole = (typeof SHIPPED_ROLES)[number];
export type PermissionKey = (typeof PERMISSION_CATALOGUE)[number];

export function asShippedRole(key: string): ShippedRole | null {
  return (SHIPPED_ROLES as readonly string[]).includes(key)
    ? (key as ShippedRole)
    : null;
}

/**
 * The shipped role this is, or null for one an Organization wrote.
 *
 * By scope, not by key. An authored role's key is a slug of its name, so an
 * Organization's own "Front desk" is `front_desk` too, and naming it from the
 * key alone showed it as the shipped one — beside the shipped one, in the
 * same picker.
 */
export function shippedRoleOf(role: {
  key: string;
  organizationId: string | null;
}): ShippedRole | null {
  return role.organizationId === null ? asShippedRole(role.key) : null;
}

/**
 * A permission key, as a message key.
 *
 * `front_desk.book` cannot be one: next-intl reads a dot as a namespace
 * separator, so `staff.permissions.front_desk.book` would look for a `book`
 * inside a `front_desk` object that does not exist. The catalogue keeps the
 * qualified name — it is what the database stores and what a policy names — and
 * the copy is keyed on this instead.
 */
const MESSAGE_KEYS = {
  "front_desk.book": "book",
  "front_desk.check_in": "checkIn",
  "front_desk.check_out": "checkOut",
  "front_desk.cancel": "cancel",
  "front_desk.amend": "amend",
  "front_desk.close_day": "closeDay",
  "finance.manage_folio": "manageFolio",
  "finance.post_charge": "postCharge",
  "finance.reverse_charge": "reverseCharge",
  "finance.post_payment": "postPayment",
  "finance.reverse_payment": "reversePayment",
  "finance.view_ledger": "viewLedger",
  "staff.administer": "administerStaff",
  "staff.define_roles": "defineRoles",
  "accommodation.configure": "configureAccommodation",
  "housekeeping.update_status": "updateHousekeeping",
  "maintenance.report": "reportMaintenance",
  "maintenance.manage": "manageMaintenance",
  "maintenance.take_out_of_order": "takeOutOfOrder",
  "maintenance.equipment": "manageEquipment",
  "audit.read": "readAudit",
  "configuration.manage": "manageConfiguration",
  "rates.manage": "manageRates",
  "data_export.read": "readDataExports",
  "data_export.create": "createDataExports",
  "guest_services.create_request": "createServiceRequests",
  "guest_services.manage_requests": "manageServiceRequests",
  "hr.view": "viewHr",
  "hr.manage": "manageHr",
  "integrations.view": "viewIntegrations",
  "integrations.manage": "manageIntegrations",
  "branding.manage": "manageBranding",
} as const satisfies Record<PermissionKey, string>;

export type PermissionMessageKey =
  (typeof MESSAGE_KEYS)[keyof typeof MESSAGE_KEYS];

export function asPermission(key: string): PermissionMessageKey | null {
  return key in MESSAGE_KEYS ? MESSAGE_KEYS[key as PermissionKey] : null;
}

/** For the catalogue itself, where every key is known by construction. */
export function permissionMessageKey(key: PermissionKey): PermissionMessageKey {
  return MESSAGE_KEYS[key];
}

/**
 * The catalogue in the order a person asks about it, under a heading each.
 *
 * Thirty-two flat rows answer "who can see money?" only to somebody who reads
 * all thirty-two. A section is also the unit of the grid's filter, so the money
 * rows are one choice away (PEOPLE-06). Every permission sits in exactly one
 * section, which `tests/unit/permission-sections.test.ts` holds to.
 */
export const PERMISSION_SECTIONS = [
  {
    key: "frontDesk",
    permissions: [
      "front_desk.book",
      "front_desk.check_in",
      "front_desk.check_out",
      "front_desk.cancel",
      "front_desk.amend",
      "front_desk.close_day",
    ],
  },
  {
    key: "money",
    permissions: [
      "finance.manage_folio",
      "finance.post_charge",
      "finance.reverse_charge",
      "finance.post_payment",
      "finance.reverse_payment",
      "finance.view_ledger",
    ],
  },
  {
    key: "rooms",
    permissions: [
      "accommodation.configure",
      "housekeeping.update_status",
      "maintenance.report",
      "maintenance.manage",
      "maintenance.take_out_of_order",
      "maintenance.equipment",
    ],
  },
  {
    key: "guests",
    permissions: [
      "guest_services.create_request",
      "guest_services.manage_requests",
    ],
  },
  {
    key: "people",
    permissions: [
      "staff.administer",
      "staff.define_roles",
      "hr.view",
      "hr.manage",
    ],
  },
  {
    key: "setup",
    permissions: [
      "configuration.manage",
      "rates.manage",
      "branding.manage",
      "integrations.view",
      "integrations.manage",
      "audit.read",
      "data_export.read",
      "data_export.create",
    ],
  },
] as const satisfies readonly {
  key: "frontDesk" | "money" | "rooms" | "guests" | "people" | "setup";
  permissions: readonly PermissionKey[];
}[];

export type PermissionSectionKey = (typeof PERMISSION_SECTIONS)[number]["key"];
