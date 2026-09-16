// Is this connection string pointing at the developer's own machine?
//
// Shared by `db:setup` and `db:drift`, which both do something to a database
// that must never happen to a real one: setting a known development password on
// the runtime role, and DROPping a database to recreate it.
//
// The host is parsed, never matched as a substring. A URL whose password or
// database name contains "localhost" satisfies /localhost/ while connecting
// somewhere else entirely — and the one shape of mistake worth catching here is
// a hosted URL that looks local at a glance.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Exits the process unless `url` names a host on this machine.
 *
 * `because` completes "Refusing: ..." and should say what would happen to the
 * database, not that a rule was broken. A refusal that does not say what it
 * prevented gets worked around.
 */
export function requireLocalDatabase(url, { name, because }) {
  let hostname;
  try {
    ({ hostname } = new URL(url));
  } catch {
    console.error(`${name} is not a URL this can read.`);
    process.exit(1);
  }

  if (!LOCAL_HOSTS.has(hostname)) {
    console.error(
      `${name} points at ${hostname}, which is not local.\n` +
        `Refusing: ${because}\n` +
        "Allowed hosts are localhost and 127.0.0.1.",
    );
    process.exit(1);
  }
}
