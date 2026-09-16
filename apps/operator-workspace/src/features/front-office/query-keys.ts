/**
 * Cache keys for the front desk.
 *
 * Every key begins with the viewer, their Organization and the Property. That
 * is the whole of this file's reason to exist, and it is not a convention: a key
 * of `["arrivals", date]` is correct until somebody switches Property, at which
 * point the cache answers the new Property's question with the old Property's
 * rows — instantly, from memory, with no request the server could have refused.
 *
 * Row-level security never sees that happen, because nothing happens. The
 * database is still the authorization boundary; this is the one leak it cannot
 * be (ADR 0019).
 *
 * Inline array keys in components are forbidden. A factory is how the prefix
 * stays impossible to forget.
 */

export interface Scope {
  userId: string;
  organizationId: string;
  propertyId: string;
}

export const frontOfficeKeys = {
  all: (scope: Scope) =>
    [
      "ranza",
      scope.userId,
      scope.organizationId,
      scope.propertyId,
      "front-office",
    ] as const,
  arrivals: (scope: Scope) =>
    [...frontOfficeKeys.all(scope), "arrivals"] as const,
  departures: (scope: Scope) =>
    [...frontOfficeKeys.all(scope), "departures"] as const,
};
