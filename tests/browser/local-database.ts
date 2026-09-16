import { spawnSync } from "node:child_process";

import {
  requireLocalDatabase,
  withoutConnectionOverrides,
} from "../../scripts/local-url.mjs";

/**
 * The database the browser tests are allowed to touch: this machine's, and no
 * other.
 *
 * They sign a Staff Member in and check a Guest in, which writes — and unlike
 * the read-only suites there is nothing about a browser test that says which
 * database it is talking to. So the same guard `db:setup` and `db:seed:dev`
 * use refuses anything that is not localhost, including the libpq variables
 * that quietly redirect a connection the URL calls local.
 *
 * Defaulted rather than required, like `db:seed:dev` defaults its own, so the
 * suite runs against a fresh `pnpm db:up` with nothing exported.
 */
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://ranza_app:ranza_app@localhost:54322/ranza";

export const AUTH_DATABASE_URL =
  process.env.AUTH_DATABASE_URL ??
  "postgresql://ranza_auth:ranza_auth@localhost:54322/ranza";

/**
 * The owner connection, for the rows a test brings with it.
 *
 * A fixture is not a tenant read: it creates the Reservation the run is about
 * to check in, before anybody has signed in to own it. `ranza_app` is denied
 * that by its policies, which is the arrangement working rather than an
 * obstacle — so the fixtures use the migration role, exactly as the integration
 * suites do.
 */
export const OWNER_DATABASE_URL =
  process.env.DIRECT_URL ?? "postgresql://ranza:ranza@localhost:54322/ranza";

for (const [name, url] of [
  ["DATABASE_URL", DATABASE_URL],
  ["AUTH_DATABASE_URL", AUTH_DATABASE_URL],
  ["DIRECT_URL", OWNER_DATABASE_URL],
] as const) {
  requireLocalDatabase(url, {
    name: `the browser tests' ${name}`,
    because:
      "they sign in, check a Guest in, and leave Reservations behind that\n" +
      "cannot be deleted. None of that belongs in a real database.",
  });
}

/** One statement, as the owner. Unaligned, so a single value comes back bare. */
export function psql(sql: string): string {
  const result = spawnSync(
    "psql",
    [OWNER_DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql],
    { encoding: "utf8", env: withoutConnectionOverrides() },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}
