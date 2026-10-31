/**
 * What the audit log knows how to say about a record's context.
 *
 * A module records its facts under camelCase keys of its own choosing. A key
 * that is not here is printed as itself, so a fact added by a writer later is
 * visible on the day, in the module's own words — which is exactly what the
 * log must not do for long: `changeId` and `toEndsOn` read as a database, not
 * as an account of what happened (AUDIT-01).
 *
 * Every key a writer records is one of three things, and
 * `tests/unit/audit-writers.test.ts` reads the writers and fails on a fourth:
 *
 *  - labelled: a row of the details table with a name in all three languages;
 *  - hidden: a fact only a database could use, or one the row already says;
 *  - structured: a fact the record's action shows another way, as a row per
 *    setting, a price or a brand part, so its key is never a row of its own.
 */

export const CONTEXT_KEYS = [
  "amountMinor",
  "balanceMinor",
  "totalGrossMinor",
  "totalNetMinor",
  "grossPayMinor",
  "fromAmountMinor",
  "employeeId",
  "leaveFrom",
  "leaveTo",
  "contractType",
  "hasSystemAccess",
  "terminatedOn",
  "effectiveFrom",
  "period",
  "employeeCount",
  "fields",
  "description",
  "paymentMethod",
  "stayId",
  "reservationId",
  "folioId",
  "accommodationUnitId",
  "guestId",
  "guestCreated",
  "guestChosen",
  "startsOn",
  "endsOn",
  "plannedEndsOn",
  "fromStartsOn",
  "toStartsOn",
  "fromEndsOn",
  "toEndsOn",
  "fromTime",
  "toTime",
  "fromUnitId",
  "toUnitId",
  "reasonKind",
  "earlyDeparture",
  "folioClosed",
  "nightsCharged",
  "roomNightsCharged",
  "roomNightsNotCharged",
  "roomWasNotReady",
  "businessDate",
  "from",
  "to",
  "role",
  "added",
  "removed",
  "permissions",
  "propertyIds",
  "properties",
  "propertyId",
  "userId",
  "name",
  "names",
  "key",
  "holders",
  "unitIds",
  "unitId",
  "unitName",
  "unitType",
  "capacity",
  "bedCount",
  "building",
  "floor",
  "admits",
  "letByTheBed",
  "hadBeenBlockedFor",
  "status",
  "previousStatus",
  "returnAs",
  "kind",
  "priority",
  "number",
  "title",
  "assigneeId",
  "equipmentId",
  "servicedOn",
  "expectedBackOn",
  "resourceTypes",
  "format",
  "bytes",
  "rangeFrom",
  "rangeTo",
] as const;

export type ContextKey = (typeof CONTEXT_KEYS)[number];

export function isContextKey(key: string): key is ContextKey {
  return (CONTEXT_KEYS as readonly string[]).includes(key);
}

/**
 * Folded into the fact beside it, or only an id of a record the row already
 * names: `currency` is the unit of an amount, a role's `Authored` flag is part
 * of how the role is named, `changeId` is the database's own handle on an
 * amendment and `requestId` is the subject of the maintenance record it is on.
 * The ids of Folio lines are no screen's address: a reader cannot look one up,
 * and the Folio the record is about is its subject (DATA-01).
 */
export const HIDDEN_CONTEXT_KEYS: ReadonlySet<string> = new Set([
  "currency",
  "roleAuthored",
  "fromAuthored",
  "toAuthored",
  "changeId",
  "requestId",
  "lineId",
  "reversedLineId",
  "reversalLineId",
]);

/**
 * Shown by the action's own layout instead of one row each: a configuration
 * or brand change lists what changed, a price list lists its kinds.
 */
export const STRUCTURED_CONTEXT_KEYS: ReadonlySet<string> = new Set([
  "changed",
  "changes",
  "color",
  "logo",
]);

/** Whether the log has anything to say about a key, in any of the three ways. */
export function isAccountedFor(key: string): boolean {
  return (
    isContextKey(key) ||
    HIDDEN_CONTEXT_KEYS.has(key) ||
    STRUCTURED_CONTEXT_KEYS.has(key)
  );
}
