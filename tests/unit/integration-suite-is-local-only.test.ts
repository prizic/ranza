import { describe, expect, it } from "vitest";
import {
  GUARDED,
  offendingDatabases,
  requireLocalIntegrationDatabases,
} from "../../tests/integration/local-database";

/**
 * `pnpm test:integration` may only touch this machine.
 *
 * The suite it guards writes: it takes bookings, checks people in, posts
 * charges and creates Organizations, and none of that can be deleted
 * afterwards. `test:browser` has refused a non-local database since it was
 * written; this is the same refusal arriving late, and the lateness has a cost
 * attached — see the module's own comment.
 *
 * Tested through `offendingDatabases`, which is pure, rather than by catching a
 * process exit. The refusal is asserted too, because a guard that computes the
 * right answer and does not act on it is the shape of a green test that proves
 * nothing.
 */
const LOCAL = {
  DATABASE_URL: "postgresql://ranza_app:ranza_app@localhost:54322/ranza",
  DIRECT_URL: "postgresql://ranza:ranza@localhost:54322/ranza",
  AUTH_DATABASE_URL: "postgresql://ranza_auth:ranza_auth@localhost:54322/ranza",
  WORKER_DATABASE_URL:
    "postgresql://ranza_worker:ranza_worker@localhost:54322/ranza",
};

/** The real thing, shape for shape, so this is not a straw host. */
const HOSTED =
  "postgresql://postgres.qinhuiklbkjpptuqeoxd:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres";

describe("the integration suites refuse a database that is not local", () => {
  it("allows localhost, so the guard is not simply refusing everything", () => {
    expect(offendingDatabases(LOCAL)).toEqual([]);
    expect(() => requireLocalIntegrationDatabases(LOCAL)).not.toThrow();
    expect(
      offendingDatabases({
        ...LOCAL,
        DATABASE_URL: LOCAL.DATABASE_URL.replace("localhost", "127.0.0.1"),
      }),
    ).toEqual([]);
  });

  it("refuses the hosted database, on every variable a suite reads", () => {
    // Each one on its own: a guard that checks DATABASE_URL and lets DIRECT_URL
    // through is the one that would not have stopped what happened, because the
    // fixtures write through DIRECT_URL.
    for (const name of GUARDED) {
      const env = { ...LOCAL, [name]: HOSTED };
      const found = offendingDatabases(env);
      expect(
        found.map((problem) => problem.name),
        name,
      ).toEqual([name]);
      expect(() => requireLocalIntegrationDatabases(env)).toThrow(
        /refuses a database that is not local/,
      );
    }
  });

  it("refuses a hosted database hiding behind a local-looking URL", () => {
    // libpq's host parameter overrides the URI's host, so this reads as
    // localhost to anything doing a string match and connects elsewhere.
    const disguised = {
      ...LOCAL,
      DIRECT_URL:
        "postgresql://ranza:ranza@localhost:54322/ranza?host=db.production.internal",
    };
    expect(offendingDatabases(disguised).map((p) => p.name)).toEqual([
      "DIRECT_URL",
    ]);
    expect(() => requireLocalIntegrationDatabases(disguised)).toThrow();
  });

  it("refuses PGHOSTADDR, which redirects a URL that reads as local", () => {
    // Not a URL at all, so offendingDatabases cannot see it — the refusal
    // checks it separately and this is what says so.
    const redirected = { ...LOCAL, PGHOSTADDR: "203.0.113.7" };
    expect(offendingDatabases(redirected)).toEqual([]);
    expect(() => requireLocalIntegrationDatabases(redirected)).toThrow(
      /PGHOSTADDR/,
    );
  });

  it("says which variable is wrong, not merely that something is", () => {
    // A refusal that does not name the variable sends somebody looking through
    // four of them.
    expect(() =>
      requireLocalIntegrationDatabases({ ...LOCAL, AUTH_DATABASE_URL: HOSTED }),
    ).toThrow(/AUTH_DATABASE_URL/);
  });

  it("ignores a variable that is not set rather than inventing one", () => {
    // These suites already fail plainly on a missing URL. A default here would
    // be the guard choosing which database an unconfigured run talks to.
    expect(offendingDatabases({})).toEqual([]);
    expect(() => requireLocalIntegrationDatabases({})).not.toThrow();
  });
});
