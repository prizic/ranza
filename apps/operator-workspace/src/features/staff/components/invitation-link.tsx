"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { formatDate, localizeHref, type SupportedLocale } from "@ranza/i18n";
import { Button, Input } from "@ranza/ui";

/**
 * The link to hand over, with a way to copy it and a plain statement that
 * nothing was sent.
 *
 * Notifications is blueprint 5.12 and is not built, so an invitation is
 * delivered by whoever created it. Saying so where the link is shown is the
 * difference between "sent" and "not sent" for a person waiting on it. The
 * link is a full address because the token alone opens nothing (PEOPLE-01).
 */
export function InvitationLink({
  expiresAt,
  locale,
  token,
}: {
  expiresAt: string;
  locale: SupportedLocale;
  token: string;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  const href = `${window.location.origin}${localizeHref(locale, "accept-invitation")}?token=${encodeURIComponent(token)}`;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(href);
      setCopied("yes");
    } catch (error) {
      console.error("staff.invitation_copy_failed", error);
      setCopied("failed");
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("staff.linkToPassOn")}</p>
      <div className="flex gap-2">
        <Input
          readOnly
          aria-label={t("staff.linkToPassOn")}
          data-testid="invitation-link"
          dir="ltr"
          onFocus={(event) => event.currentTarget.select()}
          value={href}
        />
        <Button onClick={() => void copy()} type="button" variant="outline">
          {copied === "yes" ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied === "yes" ? t("staff.linkCopied") : t("staff.copyLink")}
        </Button>
      </div>
      {copied === "failed" ? (
        <p className="text-sm text-destructive" role="alert">
          {t("staff.copyFailed")}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {t("staff.linkExpires", {
          date: formatDate(new Date(expiresAt), locale, {}),
        })}
      </p>
      <p className="text-sm text-muted-foreground">{t("staff.linkNotSent")}</p>
    </div>
  );
}
