/**
 * Runs once when a server instance starts, before it takes a request.
 *
 * Only in the Node.js runtime: the check opens a database connection, which the
 * edge runtime cannot, and the import is dynamic so the edge bundle never
 * reaches for it. `next build` does not call `register()`, so a build still
 * needs no reachable database.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { refuseAPrivilegedConnection } = await import("./server/startup");
  await refuseAPrivilegedConnection();
}
