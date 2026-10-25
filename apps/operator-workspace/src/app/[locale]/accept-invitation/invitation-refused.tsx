"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@ranza/ui";
import Link from "next/link";
import type { DeadLink } from "../../../server/invitation";
import { post } from "../../../lib/auth-client";

/**
 * What a link that cannot be used tells the person holding it: why, and what
 * to do next. The reason is the heading; this is the way out of it.
 *
 * A link opened on a machine where somebody else is signed in cannot be
 * answered with "go to sign in": that page sends a signed-in person straight
 * back to their own workspace. The page that asks for a sign-out offers it,
 * ends that session on the server, and returns to this same link (PEOPLE-02).
 */
export function InvitationRefused({
  continueHref,
  reason,
  signInHref,
}: {
  /** This same invitation link, to come back to once the other person is out. */
  continueHref: string;
  reason: DeadLink;
  signInHref: string;
}) {
  const t = useTranslations("acceptInvitation");
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function signOutAndContinue(): Promise<void> {
    if (state === "working") return;
    setState("working");
    const response = await post("/api/auth/sign-out", {}, "sign-out");
    // A refusal of the request itself means the session was already gone,
    // which is what was asked for; only a server that failed leaves them in.
    if (response === null || response.status >= 500) {
      console.error("sign-out did not end the session", response?.status);
      setState("failed");
      return;
    }
    window.location.assign(continueHref);
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t(`refused.${reason}.next`)}
      </p>
      {reason === "other_account" ? (
        <>
          <Button
            className="h-13 w-full rounded-md text-[15px]"
            disabled={state === "working"}
            onClick={() => void signOutAndContinue()}
            type="button"
          >
            {state === "working" ? t("working") : t("signOutAndContinue")}
          </Button>
          {state === "failed" ? (
            <p className="text-sm text-destructive" role="alert">
              {t("signOutFailed")}
            </p>
          ) : null}
        </>
      ) : reason === "accepted" ? (
        <Button asChild className="h-13 w-full rounded-md text-[15px]">
          <Link href={signInHref}>{t("goToSignIn")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
