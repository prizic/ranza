"use client";

import { RouteError } from "../route-error";

/**
 * Any workspace page that fails to render, with the shell around it left in
 * place so the rail still leads somewhere. The pages that have a screen of
 * their own say more; this is for the rest, which had none and showed the
 * framework's blank error.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError error={error} event="workspace.render_failed" reset={reset} />
  );
}
