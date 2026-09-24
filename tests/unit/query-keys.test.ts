/**
 * The cache keys for the front desk.
 *
 * This is the only file in the repository that tests something the database
 * cannot protect. A key of `["arrivals", date]` is correct until somebody
 * switches Property, at which point the cache answers the new Property's
 * question with the old Property's rows — instantly, from memory, with no
 * request that row-level security would ever see (ADR 0019).
 *
 * So the prefix is asserted rather than trusted, including the three separate
 * ways it can go wrong.
 */
import { describe, expect, it } from "vitest";
import {
  frontOfficeKeys,
  type Scope,
} from "../../apps/operator-workspace/src/features/front-office/query-keys";

const scope: Scope = {
  organizationId: "org-1",
  propertyId: "property-1",
  userId: "user-1",
};

describe("a front-office cache key", () => {
  it("begins with the viewer, their Organization and the Property", () => {
    expect(frontOfficeKeys.arrivals(scope)).toEqual([
      "ranza",
      "user-1",
      "org-1",
      "property-1",
      "front-office",
      "arrivals",
    ]);
  });

  it("differs when the Property differs, so a switch cannot be served from cache", () => {
    expect(frontOfficeKeys.arrivals(scope)).not.toEqual(
      frontOfficeKeys.arrivals({ ...scope, propertyId: "property-2" }),
    );
  });

  // The case a Property-only prefix would miss: the same Property id could not
  // belong to two Organizations, but the key is the defence and it should not
  // depend on that being true.
  it("differs when the Organization differs", () => {
    expect(frontOfficeKeys.arrivals(scope)).not.toEqual(
      frontOfficeKeys.arrivals({ ...scope, organizationId: "org-2" }),
    );
  });

  // Two Staff Members on one browser — a shared terminal at a front desk, which
  // is the normal case rather than the exotic one.
  it("differs when the viewer differs", () => {
    expect(frontOfficeKeys.arrivals(scope)).not.toEqual(
      frontOfficeKeys.arrivals({ ...scope, userId: "user-2" }),
    );
  });

  it("keeps two lists on one Property apart", () => {
    expect(frontOfficeKeys.arrivals(scope)).not.toEqual(
      frontOfficeKeys.departures(scope),
    );
  });

  // Invalidating `all` must reach both lists, which is only true if each is
  // built from it rather than beside it.
  it("nests both lists under one prefix, so invalidating it reaches them", () => {
    const all = frontOfficeKeys.all(scope);
    for (const key of [
      frontOfficeKeys.arrivals(scope),
      frontOfficeKeys.departures(scope),
    ]) {
      expect(key.slice(0, all.length)).toEqual([...all]);
    }
  });

  it("RC-S1-63: keys the room calendar by viewer, Property and window, apart from every other list", () => {
    const aroundToday = frontOfficeKeys.roomCalendar(scope, {
      from: null,
      days: 14,
    });
    expect(aroundToday.slice(0, 5)).toEqual(frontOfficeKeys.all(scope));
    expect(aroundToday).not.toEqual(
      frontOfficeKeys.roomCalendar(scope, { from: "2026-09-21", days: 14 }),
    );
    expect(aroundToday).not.toEqual(
      frontOfficeKeys.roomCalendar(scope, { from: null, days: 30 }),
    );
    expect(aroundToday).not.toEqual(
      frontOfficeKeys.roomCalendar(
        { ...scope, propertyId: "property-2" },
        { from: null, days: 14 },
      ),
    );
  });
});
