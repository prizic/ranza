import type { ReactNode } from "react";
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";

/**
 * Server-side prefetch, so a live screen renders with rows rather than a
 * spinner and then settles into polling.
 *
 * The client is created here, per call, and that is the point of the file. A
 * `QueryClient` held at module scope on the server is one object shared by
 * every concurrent request on that instance — which is one tenant's data
 * dehydrated into another tenant's HTML (ADR 0019). It looks like ordinary
 * module-scope code, which is what makes it worth a function with a name and a
 * paragraph rather than a line in a page.
 *
 * `@tanstack/react-query` is confined to this directory and to feature folders,
 * enforced by `scripts/dependency-boundaries.mjs`, so a page reaches it through
 * these two exports and not otherwise.
 */
export function requestQueryClient(): QueryClient {
  return new QueryClient();
}

/** Hands the prefetched rows to the client, once, for this request. */
export function Hydrated({
  children,
  client,
}: {
  children: ReactNode;
  client: QueryClient;
}) {
  return (
    <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>
  );
}
