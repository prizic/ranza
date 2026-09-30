/**
 * What the Workspace and the Portal refuse to start on (OA-S1-05).
 *
 * Both request hosts used to refuse only a DATABASE_URL equal to DIRECT_URL. A
 * URL can name the migration role, but it cannot say whether the role behind
 * it owns a table or carries BYPASSRLS — the owner reached through any other
 * spelling of its URL passed. Now each host asks the database, before it
 * serves, what both of its runtime connections connect as: the check the
 * worker makes (ADR 0018, amended).
 *
 * `src/instrumentation.ts` runs `refuseAPrivilegedConnection()` once per server
 * instance, and it was watched stopping `next start` and the standalone server
 * for each host (docs/evidence/decision-sheet/access.md). What is asserted here
 * is the refusal itself, and that a refusal ends the process.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/operator-workspace/node_modules/server-only", () => ({}));
vi.mock("../../apps/guest-portal/node_modules/server-only", () => ({}));

const workspace =
  await import("../../apps/operator-workspace/src/server/composition");
const workspaceStartup =
  await import("../../apps/operator-workspace/src/server/startup");
const portal = await import("../../apps/guest-portal/src/server/composition");
const portalStartup =
  await import("../../apps/guest-portal/src/server/startup");

const direct = process.env.DIRECT_URL!;

/**
 * The owner, reached through a URL that is not DIRECT_URL's string. The
 * equality refusal cannot see it; only asking the database can.
 */
function disguised(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return parsed.toString();
}

/** Restores the environment whatever the assertion did. */
async function withEnv<T>(
  overrides: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, overrides);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ["the Workspace", workspace, workspaceStartup, "Workspace"],
  ["the Portal", portal, portalStartup, "Portal"],
] as const)("%s", (_name, host, startup, label) => {
  it("starts on ranza_app and ranza_auth, which own nothing and bypass nothing", async () => {
    await expect(host.verifyConnections()).resolves.toBeUndefined();
  });

  it("refuses DATABASE_URL set to the migration connection, by name", async () => {
    await withEnv({ DATABASE_URL: direct }, async () => {
      await expect(host.verifyConnections()).rejects.toThrow(
        /DATABASE_URL must not be the migration connection/,
      );
    });
  });

  it("refuses AUTH_DATABASE_URL set to the migration connection, by name", async () => {
    await withEnv({ AUTH_DATABASE_URL: direct }, async () => {
      await expect(host.verifyConnections()).rejects.toThrow(
        /AUTH_DATABASE_URL must not be the migration connection/,
      );
    });
  });

  // The important half. The owner under another spelling of its URL passes the
  // equality check and serves perfectly, which is why nothing else would notice.
  it("refuses a tenant connection whose role owns the tables, whatever its URL", async () => {
    await withEnv({ DATABASE_URL: disguised(direct) }, async () => {
      await expect(host.verifyConnections()).rejects.toThrow(
        /^DATABASE_URL connects as a role that .*owns tenant tables/,
      );
    });
  });

  it("and a credential connection whose role does", async () => {
    await withEnv({ AUTH_DATABASE_URL: disguised(direct) }, async () => {
      await expect(host.verifyConnections()).rejects.toThrow(
        /^AUTH_DATABASE_URL connects as a role that .*owns tenant tables/,
      );
    });
  });

  it("stops the process with the refusal, rather than serving on", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await withEnv({ DATABASE_URL: disguised(direct) }, async () => {
      await startup.refuseAPrivilegedConnection();
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logged).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^The ${label} will not start\\. DATABASE_URL connects as`),
      ),
    );
  });
});
