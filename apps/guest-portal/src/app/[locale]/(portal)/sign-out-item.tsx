"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@ranza/ui";
import { post } from "../../../lib/auth-request";

/**
 * Ends the Resident's session, on the server, and leaves for the sign-in page.
 *
 * A dormitory's phones and computers are shared, and the avatar in the bar
 * looked like an account menu while offering nothing, so the next person was
 * already signed in as the last one. The Workspace closed the same gap as
 * SIGN-01, and this is the same item: the request deletes the session row, so
 * a copied cookie stops working too, and the page is left with a full load so
 * nothing of the last person's tree survives in the client.
 *
 * A server that did not answer leaves the person signed in, and says so,
 * rather than showing a sign-in page for a session that is still alive.
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

    const response = await post("/api/auth/sign-out", {});
    if (response === null || response.status >= 500) {
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
