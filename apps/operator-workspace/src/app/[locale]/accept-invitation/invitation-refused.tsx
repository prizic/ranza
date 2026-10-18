import { useTranslations } from "next-intl";
import { Button } from "@ranza/ui";
import Link from "next/link";
import type { DeadLink } from "../../../server/invitation";

/**
 * What a link that cannot be used tells the person holding it: why, and what
 * to do next. The reason is the heading; this is the way out of it.
 */
export function InvitationRefused({
  reason,
  signInHref,
}: {
  reason: DeadLink;
  signInHref: string;
}) {
  const t = useTranslations("acceptInvitation");
  const hasAccount = reason === "accepted" || reason === "other_account";
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {t(`refused.${reason}.next`)}
      </p>
      {hasAccount ? (
        <Button asChild className="h-13 w-full rounded-md text-[15px]">
          <Link href={signInHref}>{t("goToSignIn")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
