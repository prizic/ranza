// @ts-expect-error — a .mjs script with no type declarations, deliberately:
// it is tooling shared with db:setup, db:drift and the browser suite, not a
// typed module.
import { nonLocalHostsIn } from "../../scripts/local-url.mjs";

/**
 * The connections the integration suites are allowed to touch.
 *
 * Every one of these is read by some suite, and every one of them is a write
 * path: the suites take bookings, check people in, post charges and create
 * Organizations.
 */
export const GUARDED = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_DATABASE_URL",
  "WORKER_DATABASE_URL",
] as const;

/**
 * Which of the guarded variables name a database that is not this machine's.
 *
 * Pure, and separate from the refusal below, so a test can ask the question
 * without the answer being `process.exit`. The check itself is
 * `nonLocalHostsIn` from `scripts/local-url.mjs` — the same one `db:setup`
 * refuses with before it writes a known password, and `db:drift` before it
 * DROPs a database. Not a regular expression over the string: libpq's `host`
 * and `hostaddr` query parameters override the URI's host, so
 * `postgresql://…@localhost:54322/r?host=db.production.internal` reads as
 * localhost and connects somewhere else.
 *
 * A variable that is not set is not an offender. These suites already fail
 * plainly on a missing URL, and inventing a default here would be this guard
 * deciding which database an unconfigured run talks to.
 */
export function offendingDatabases(env: NodeJS.ProcessEnv = process.env): {
  name: string;
  url: string;
  offenders: string[];
}[] {
  return GUARDED.flatMap((name) => {
    const url = env[name];
    if (!url) return [];
    const offenders: string[] | null = nonLocalHostsIn(url);
    // null is "not a URL this can read", which is a different complaint and
    // one the suite will make for itself the moment it tries to connect.
    if (!offenders || offenders.length === 0) return [];
    return [{ name, url, offenders }];
  });
}

/**
 * Refuses to run the integration suites against anything but this machine.
 *
 * `test:browser` has had this since it was written, and the reason it has it
 * applies here word for word: it signs in and checks a Guest in, which leaves
 * history that is never deleted. The integration suites do the same and more —
 * and unlike the browser suite, nothing about them says out loud which database
 * they are talking to.
 *
 * WHY THIS EXISTS RATHER THAN A CONVENTION. It did not exist, and on
 * 2026-09-16 `pnpm test:integration` was run with `.env` pointing at Supabase.
 * It left fourteen Reservations and fourteen Stays in the hosted database, six
 * of them a triple-booking on two Units that then blocked
 * `20260916002000_guests_and_reservation_creation` from applying — because that
 * migration adds `reservations_no_double_booking`, and PostgreSQL has no
 * `NOT VALID` for an exclusion constraint. Cleaning that up is a runbook with a
 * worksheet in it. `reservations` has no audit trail, so the only record of
 * what was changed is the one a person wrote by hand.
 *
 * Cleaning it up without this guard would leave tomorrow's version of that
 * night available. So: the door is shut first.
 *
 * `PGHOSTADDR` is checked too. It sets the address to dial while the URL's host
 * is still used for authentication, so a hosted database can hide behind a URL
 * that reads as local in every variable this inspects.
 */
export function requireLocalIntegrationDatabases(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const problems = offendingDatabases(env);
  const redirected = env.PGHOSTADDR
    ? [`PGHOSTADDR="${env.PGHOSTADDR}" in the environment`]
    : [];

  if (problems.length === 0 && redirected.length === 0) return;

  const detail = [
    ...problems.map((p) => `  ${p.name}: ${p.offenders.join(", ")}`),
    ...redirected.map((r) => `  ${r}`),
  ].join("\n");

  throw new Error(
    "pnpm test:integration refuses a database that is not local.\n" +
      `${detail}\n\n` +
      "These suites take bookings, check people in and post charges, and none\n" +
      "of it can be deleted afterwards. Run them against `pnpm db:up`.\n\n" +
      "This is not a style rule. On 2026-09-16 this suite was run against the\n" +
      "hosted database and left fourteen Reservations behind, six of them a\n" +
      "triple-booking that blocked the next migration from applying at all.",
  );
}

/** vitest calls this once, before any suite is loaded. */
export default function setup(): void {
  requireLocalIntegrationDatabases();
}
