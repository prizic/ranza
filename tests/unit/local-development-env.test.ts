/**
 * `.env.development` names this machine and nowhere else.
 *
 * That file is committed, which is what makes `pnpm dev` work on a fresh clone
 * — and also makes it the file somebody edits at 2am to point a dev server at a
 * hosted database "just to check something", and then commits. Every other
 * guard in this repository refuses a non-local URL at the moment of use:
 * `db:setup` before it writes a known password, `db:drift` before it DROPs a
 * database. Nothing refused one sitting in a committed file, because nothing
 * read that file until now.
 *
 * Uses `nonLocalHostsIn` from `scripts/local-url.mjs`, which is what `db:setup`
 * and `db:drift` already refuse with. Not a regex: the whole point of that
 * function is the places a host hides that a regex over the string would miss —
 * libpq's `host` and `hostaddr` query parameters override the URI's host, so
 * `postgresql://…@localhost:54322/r?host=db.production.internal` reads as
 * localhost and connects somewhere else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a .mjs script with no type declarations, deliberately:
// it is tooling shared with db:setup and db:drift, not a typed module.
import { nonLocalHostsIn } from "../../scripts/local-url.mjs";

const FILE = join(process.cwd(), ".env.development");

/** Every `KEY="value"` whose value looks like a URL, in file order. */
function urlsIn(contents: string): { key: string; url: string }[] {
  return contents
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .flatMap((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\s]+)"?\s*$/);
      if (!match) return [];
      const [, key, value] = match;
      return value.includes("://") ? [{ key, url: value }] : [];
    });
}

describe("the committed local development defaults", () => {
  const entries = urlsIn(readFileSync(FILE, "utf8"));

  it("has URLs in it at all, so the assertions below are about something", () => {
    // Without this, deleting every URL from the file makes every case below
    // pass vacuously — `it.each([])` runs nothing and reports green. The same
    // shape as an assertion that cannot fail.
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "AUTH_DATABASE_URL",
        "WORKER_DATABASE_URL",
        "BETTER_AUTH_URL",
      ]),
    );
  });

  it.each(entries)("$key names this machine", ({ url }) => {
    const offenders = nonLocalHostsIn(url);
    expect(offenders).not.toBeNull();
    // Named rather than counted: "expected 1 to be 0" sends somebody looking,
    // and `host "db.production.internal"` does not.
    expect(offenders).toEqual([]);
  });

  it("would catch a hosted URL, a hidden one and a list", () => {
    // The cases above pass when the file is correct, which is also what they
    // would do if `nonLocalHostsIn` returned [] for everything. These are the
    // assertions that say it does not.
    expect(
      nonLocalHostsIn(
        "postgresql://a:b@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
      ),
    ).toHaveLength(1);
    expect(
      nonLocalHostsIn(
        "postgresql://a:b@localhost:54322/ranza?host=db.production.internal",
      ),
    ).toHaveLength(1);
    // libpq connects to the first host that answers, so a local-looking prefix
    // is not local. Refused outright rather than checked element-wise.
    expect(
      nonLocalHostsIn("postgresql://a:b@localhost,db.production.internal/r"),
    ).toHaveLength(1);
    expect(nonLocalHostsIn("not a url")).toBeNull();
  });
});
