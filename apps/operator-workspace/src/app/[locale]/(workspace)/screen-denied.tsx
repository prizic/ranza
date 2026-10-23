import Link from "next/link";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { Button, EmptyState } from "@ranza/ui";
import { useTranslations } from "next-intl";
import type { Denial } from "@ranza/core";
import { asPermission } from "../../../features/staff/labels";

/**
 * What a destination says to a viewer it will not open for, in the words of the
 * gate that stopped them: not in the Subscription, not switched on at this
 * Property, not in the role (naming the permission and who can give it), or a
 * `?property=` that is not one they reach.
 *
 * One refusal for all of those said "This module is not in your Subscription"
 * to a Front desk Staff Member whose Organization had bought it — a remedy that
 * was not theirs, for a cause that was not the Subscription. The reason is read
 * only once a page has found nothing to show (`whyDenied`), so the page that
 * opens pays nothing for it.
 *
 * Given the answer rather than asking for it, so that a page's refusal is one
 * `await` and this stays a plain component a test can render.
 */
export function ScreenDenied({
  denial,
  locale,
}: {
  denial: Denial;
  locale: SupportedLocale;
}) {
  const t = useTranslations();

  switch (denial.reason) {
    case "no_property":
      return (
        <EmptyState
          description={t("noPropertyDescription")}
          title={t("noPropertyTitle")}
        />
      );
    case "not_reachable":
      return (
        <EmptyState
          action={
            <Button asChild>
              <Link href={localizeHref(locale, "today")}>
                {t("denied.goToToday")}
              </Link>
            </Button>
          }
          description={t("denied.notReachableDescription")}
          title={t("denied.notReachableTitle")}
        />
      );
    case "not_subscribed":
      return (
        <EmptyState
          description={t("denied.notSubscribedDescription")}
          title={t("denied.notSubscribedTitle")}
        />
      );
    case "not_enabled":
      return (
        <EmptyState
          description={t("denied.notEnabledDescription")}
          title={t("denied.notEnabledTitle")}
        />
      );
    case "no_permission": {
      const key = asPermission(denial.permission);
      return (
        <EmptyState
          description={t("denied.noPermissionDescription", {
            permission: key ? t(`staff.permissions.${key}`) : denial.permission,
          })}
          title={t("denied.noPermissionTitle")}
        />
      );
    }
    case "open":
      return (
        <EmptyState
          description={t("denied.openDescription")}
          title={t("denied.openTitle")}
        />
      );
  }
}
