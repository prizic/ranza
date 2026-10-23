/**
 * Where the Guest/Resident Portal is served while the browser tests run: a
 * server of its own beside the Workspace's, started by `playwright.config.ts`.
 *
 * `PORTAL_URL` moves it, and an address that names no port gets the Portal's
 * own (3001, as `pnpm dev` serves it) rather than the scheme's: the config
 * starts a server on whatever port this says, and an empty one would start it
 * on none.
 */
export const DEFAULT_PORTAL_PORT = "3001";

export function portalUrl(
  configured: string | undefined = process.env.PORTAL_URL,
): string {
  const url = new URL(configured ?? `http://localhost:${DEFAULT_PORTAL_PORT}`);
  if (!url.port) url.port = DEFAULT_PORTAL_PORT;
  return url.origin;
}
