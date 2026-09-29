import { verifyConnections } from "./composition";

/**
 * Stops the Workspace before it serves anything when a runtime connection's role
 * would not be subject to row-level security (OA-S1-05, ADR 0018 amended).
 *
 * A thrown error from `register()` is logged by Next and the server carries on
 * serving, which is the silent failure this exists to prevent; so the refusal
 * is printed and the process exits instead. Kept out of the composition root
 * so that `verifyConnections` can be asserted without ending the test run.
 */
export async function refuseAPrivilegedConnection(): Promise<void> {
  try {
    await verifyConnections();
  } catch (error) {
    console.error(
      `The Workspace will not start. ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
