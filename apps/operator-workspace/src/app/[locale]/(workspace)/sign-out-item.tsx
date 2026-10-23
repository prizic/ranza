"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@ranza/ui";
import { post } from "../../../lib/auth-client";

/**
 * Ends the session, on the server, and leaves for the sign-in page (SIGN-01).
 *
 * On a desk shared between shifts the next person was already signed in as the
 * last one: there was no way out of the Workspace but clearing the browser. The
 * request deletes the session row, so a copied cookie stops working too, and the
 * page is left with a full load rather than a client navigation — the cached
 * tree of the last person is dropped by construction, which is what ADR 0019
 * asks of a sign-out. The remembered Property is cleared by the route itself.
 *
 * A server that did not answer, or answered with an error of its own, leaves
 * the person signed in, and says so, rather than showing them a sign-in page
 * for a session that is still alive. A refusal of the request itself — the
 * session was already gone — is the same outcome they asked for.
 */
export function SignOutItem({
  failedLabel,
  label,
  signInHref,
  workingLabel,
}: {
  failedLabel: string;
  label: string;
  /** Where to go once the session is ended. */
  signInHref: string;
  workingLabel: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function signOut(event: Event) {
    // The menu stays open to say what happened.
    event.preventDefault();
    if (state === "working") return;
    setState("working");

    const response = await post("/api/auth/sign-out", {}, "sign-out");
    if (response === null || response.status >= 500) {
      console.error("sign-out did not end the session", response?.status);
      setState("failed");
      return;
    }
    window.location.assign(signInHref);
  }

  return (
    <DropdownMenuItem
      disabled={state === "working"}
      onSelect={signOut}
      variant="destructive"
    >
      <LogOut aria-hidden="true" className="size-4" />
      {state === "working"
        ? workingLabel
        : state === "failed"
          ? failedLabel
          : label}
    </DropdownMenuItem>
  );
}
