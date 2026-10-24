"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { Button, EmptyState } from "@ranza/ui";
import { useTranslations } from "next-intl";
import type { Denial } from "@ranza/core";
import { asPermission } from "../../../features/staff/labels";
import { pageTitleFor, useWorkspacePageTitles } from "../../../lib/page-titles";

/**
 * Every way a destination says no has one shape: a title, one reason in plain
 * words and one next action. Without an action of its own the next action is
 * the way back to Today, so a refusal is never a dead end (SHELL-05).
 */
export function ScreenRefusal({
  action,
  description,
  locale,
  title,
}: {
  action?: ReactNode;
  description: string;
  locale: SupportedLocale;
  title: string;
}) {
  const t = useTranslations();
  return (
    <EmptyState
      action={
        action ?? (
          <Button asChild>
            <Link href={localizeHref(locale, "today")}>
              {t("denied.goToToday")}
            </Link>
          </Button>
        )
      }
      description={description}
      title={title}
    />
  );
}

/**
 * What a destination says to a viewer it will not open for, in the words of the
 * gate that stopped them: not in the Subscription, not switched on at this
 * Property, not in the role (naming the page, the permission and who can give
 * it), or a `?property=` that is not one they reach.
 *
 * One refusal for all of those said "This module is not in your Subscription"
 * to a Front desk Staff Member whose Organization had bought it — a remedy that
 * was not theirs, for a cause that was not the Subscription. The reason is read
 * only once a page has found nothing to show (`whyDenied`), so the page that
 * opens pays nothing for it.
 *
 * Given the answer rather than asking for it, so that a page's refusal is one
 * `await` and this stays a plain component a test can render. A client
 * component only to read the route, which names the page that refused.
 */
export function ScreenDenied({
  denial,
  locale,
}: {
  denial: Denial;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const titles = useWorkspacePageTitles();
  const page = pageTitleFor(usePathname() ?? "", titles)?.title;

  switch (denial.reason) {
    case "no_property":
      return (
        <ScreenRefusal
          description={t("noPropertyDescription")}
          locale={locale}
          title={t("noPropertyTitle")}
        />
      );
    case "not_reachable":
      return (
        <ScreenRefusal
          description={t("denied.notReachableDescription")}
          locale={locale}
          title={t("denied.notReachableTitle")}
        />
      );
    case "not_subscribed":
      return (
        <ScreenRefusal
          description={t("denied.notSubscribedDescription")}
          locale={locale}
          title={t("denied.notSubscribedTitle")}
        />
      );
    case "not_enabled":
      return (
        <ScreenRefusal
          description={t("denied.notEnabledDescription")}
          locale={locale}
          title={t("denied.notEnabledTitle")}
        />
      );
    case "no_permission": {
      const key = asPermission(denial.permission);
      return (
        <ScreenRefusal
          description={t("denied.noPermissionDescription", {
            page: page ?? t("denied.thisPage"),
            permission: key ? t(`staff.permissions.${key}`) : denial.permission,
          })}
          locale={locale}
          title={t("denied.noPermissionTitle")}
        />
      );
    }
    case "open":
      return (
        <ScreenRefusal
          description={t("denied.openDescription")}
          locale={locale}
          title={t("denied.openTitle")}
        />
      );
  }
}
