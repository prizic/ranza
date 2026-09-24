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
 * role composed from a key that is not in it is refused by a trigger, so these
 * going stale is a loud failure rather than a quiet one.
 */

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
  "finance.manage_folio",
  "finance.post_charge",
  "staff.administer",
  "staff.define_roles",
  "accommodation.configure",
  "housekeeping.update_status",
  "audit.read",
] as const;

export type ShippedRole = (typeof SHIPPED_ROLES)[number];
export type PermissionKey = (typeof PERMISSION_CATALOGUE)[number];

export function asShippedRole(key: string): ShippedRole | null {
  return (SHIPPED_ROLES as readonly string[]).includes(key)
    ? (key as ShippedRole)
    : null;
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
  "finance.manage_folio": "manageFolio",
  "finance.post_charge": "postCharge",
  "staff.administer": "administerStaff",
  "staff.define_roles": "defineRoles",
  "accommodation.configure": "configureAccommodation",
  "housekeeping.update_status": "updateHousekeeping",
  "audit.read": "readAudit",
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
