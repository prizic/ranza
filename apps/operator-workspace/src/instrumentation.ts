import type { Instrumentation } from "next";

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

/**
 * Records every failure the server catches while answering a request.
 *
 * The error screens tell a person a reference, and this is the line that
 * reference finds: the same digest, with where the request was going and what
 * Next was doing for it. Next calls it for rendering, route handlers, server
 * actions and the proxy, so a failure that reaches a boundary or a bare 500
 * leaves a record either way. The error itself goes last, whole, for its stack.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  console.error(
    "request.failed",
    {
      digest:
        typeof error === "object" && error !== null && "digest" in error
          ? String(error.digest)
          : undefined,
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
    error,
  );
};
