// Is this connection string pointing at the developer's own machine?
//
// Shared by `db:setup` and `db:drift`, which both do something to a database
// that must never happen to a real one: setting a known development password on
// the runtime role, and DROPping a database to recreate it.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * True only for a single host that is this machine.
 *
 * libpq accepts a comma-separated list and connects to the first one that
 * answers, so `localhost,db.production.internal` is a real database behind a
 * local-looking prefix. A list is refused outright rather than checked
 * element-wise: there is no reason to give one of these scripts more than one
 * host, and "all of them are local" is a rule that gets relaxed later.
 */
function isLocalHost(value) {
  const hosts = value.split(",");
  return hosts.length === 1 && LOCAL_HOSTS.has(hosts[0]);
}

/**
 * Exits the process unless `url` names a host on this machine.
 *
 * Reading `new URL(url).hostname` is not enough, and this is the whole reason
 * this function exists rather than a one-line check at each call site. libpq
 * lets a `host` or `hostaddr` query parameter override the host in the URI, so
 *
 *   postgresql://ranza:ranza@localhost:54322/ranza?host=db.production.internal
 *
 * reports `localhost` to `new URL()` and connects psql to
 * db.production.internal. Verified, not assumed: psql fails resolving
 * db.production.internal, which is how we know which host it used.
 *
 * `because` completes "Refusing: ..." and should say what would happen to the
 * database, not that a rule was broken. A refusal that does not say what it
 * prevented gets worked around.
 */
export function requireLocalDatabase(url, { name, because }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`${name} is not a URL this can read.`);
    process.exit(1);
  }

  // Every place a host can hide, not just the obvious one.
  const offenders = [];
  if (!isLocalHost(parsed.hostname)) {
    offenders.push(`host "${parsed.hostname}"`);
  }
  for (const key of ["host", "hostaddr"]) {
    for (const value of parsed.searchParams.getAll(key)) {
      if (!isLocalHost(value)) {
        offenders.push(`${key}="${value}"`);
      }
    }
  }

  if (offenders.length > 0) {
    console.error(
      `${name} is not local: ${offenders.join(", ")}.\n` +
        `Refusing: ${because}\n` +
        "Allowed is a single host of localhost or 127.0.0.1. libpq's host and\n" +
        "hostaddr parameters override the URL's host, so they are checked too,\n" +
        "and a comma-separated list is refused whatever is in it.",
    );
    process.exit(1);
  }
}
