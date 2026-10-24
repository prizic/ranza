"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

/**
 * The client cache, for screens that stay open and change underneath the user.
 *
 * Mounted in the authenticated workspace layout rather than the root one, so
 * sign-in and every public page carry no tenant cache at all — there is nothing
 * to leave behind because there was never anything there.
 *
 * `useState` rather than a module-level client, and the difference is not
 * stylistic. A module-level `QueryClient` is one object for the lifetime of the
 * JavaScript context; on the server that is one object shared by every
 * concurrent request, which is one tenant's data dehydrated into another
 * tenant's HTML (ADR 0019).
 */

/** Anything but a 4xx. A refusal will be refused again. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status >= 500 : true;
}

/** The session behind a request has ended: the API answers 401 and nothing else. */
function isSignedOut(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 401;
}

function createClient(onSignedOut: () => void): QueryClient {
  return new QueryClient({
    // Every read an open screen makes passes through here, so the session
    // ending is noticed once, centrally, and not by each screen's own
    // "couldn't refresh" (SHELL-07).
    queryCache: new QueryCache({
      onError: (error) => {
        if (isSignedOut(error)) onSignedOut();
      },
    }),
    defaultOptions: {
      queries: {
        retry: (count, error) => isRetryable(error) && count < 2,
        staleTime: 30_000,
      },
      // A failed write is shown to the person who made it, not repeated behind
      // their back. Retrying a mutation is how one check-in becomes two.
      mutations: { retry: false },
    },
  });
}

/**
 * `scope` identifies who the cache belongs to. When it changes — a different
 * Staff Member signs in — everything held for the previous one is dropped
 * before anything is rendered for the new one.
 *
 * Belt and braces rather than the load-bearing protection: every key already
 * begins with the user, Organization and Property (`query-keys.ts`), so a cache
 * that somehow survived still cannot answer one Property's question with
 * another's rows. This is the half that also frees the memory.
 */
export function QueryProvider({
  children,
  onSignedOut,
  scope,
}: {
  children: ReactNode;
  /** Told when a read is answered 401. Read once: it has to be stable. */
  onSignedOut: () => void;
  scope: string;
}) {
  const [client] = useState(() => createClient(onSignedOut));
  const held = useRef(scope);

  if (held.current !== scope) {
    client.clear();
    held.current = scope;
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
