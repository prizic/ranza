"use client";

import { useState, type ReactNode } from "react";
import type { SupportedLocale } from "@ranza/i18n";
import { QueryProvider } from "../../providers/query-provider";
import { SessionEndedDialog } from "./session-ended-dialog";

/**
 * The client cache of the signed-in workspace, and what is said when the session
 * behind it ends while a page is open (SHELL-07). Split from the layout, which
 * is a server component and cannot hand a client one a function to call.
 */
export function WorkspaceSession({
  children,
  copy,
  locale,
  scope,
}: {
  children: ReactNode;
  copy: { description: string; signIn: string; title: string };
  locale: SupportedLocale;
  scope: string;
}) {
  const [ended, setEnded] = useState(false);
  return (
    <QueryProvider onSignedOut={() => setEnded(true)} scope={scope}>
      {children}
      <SessionEndedDialog
        description={copy.description}
        locale={locale}
        open={ended}
        signInLabel={copy.signIn}
        title={copy.title}
      />
    </QueryProvider>
  );
}
