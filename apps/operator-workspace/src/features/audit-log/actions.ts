/**
 * The host-side vocabulary of the audit log.
 *
 * The audit module records an action name and a subject type without knowing
 * what either means — its README says that translation is the host's job, and
 * this is where the host does it. The literals are the ones the Ranza modules
 * write, in `packages/ranza/<module>/src/module.ts`: either as `action: "…"`
 * in a `recordWithin` entry, or as the literal alone, passed by position to a
 * helper that records it (`@ranza/staff`'s `command` and `roleCommand`).
 *
 * An action this list does not know is not an error: it renders as its own
 * name, so a writer added later is visible on the day rather than blank — but
 * it is missing from the "What" filter until it is named here. The label
 * belongs in the same commit as the writer, and `tests/unit/audit-writers.test.ts`
 * reads the modules in both shapes above to notice when it is not. A third
 * shape of writer would slip past that scan; extend the test with it.
 */

export const KNOWN_ACTIONS = [
  "reservation.created",
  "reservation.checked_in",
  "reservation.check_in_reversed",
  "stay.checked_out",
  "folio.charge_posted",
  "folio.line_reversed",
  "folio.closed",
  "staff.invited",
  "staff.role_changed",
  "staff.property_assigned",
  "staff.property_unassigned",
  "staff.revoked",
  "staff.revoke_undone",
  "staff.role_defined",
  "staff.role_retired",
  "staff.role_reinstated",
] as const;

export type KnownAction = (typeof KNOWN_ACTIONS)[number];

export const KNOWN_SUBJECTS = [
  "reservation",
  "stay",
  "folio",
  "membership",
  "role",
] as const;

export type KnownSubject = (typeof KNOWN_SUBJECTS)[number];

/**
 * The actions that undo an earlier one with a reason (ADR 0022, ADR 0015) —
 * the rows a reader of this screen is looking for. `staff.revoke_undone` is
 * not one: it reverses a revocation, but the staff writers record no reason,
 * so it is not a correction in the sense this screen badges.
 */
export const CORRECTIONS: readonly KnownAction[] = [
  "reservation.check_in_reversed",
  "folio.line_reversed",
];

export function isKnownAction(action: string): action is KnownAction {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

export function isKnownSubject(subject: string): subject is KnownSubject {
  return (KNOWN_SUBJECTS as readonly string[]).includes(subject);
}

export function isCorrection(action: string): boolean {
  return (CORRECTIONS as readonly string[]).includes(action);
}

/**
 * Enough of a uuid to tell two apart on a screen. The whole id is always on
 * the element as well, for whoever needs to search a database with it.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
