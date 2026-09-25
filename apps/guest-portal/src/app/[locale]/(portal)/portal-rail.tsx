"use client";

import type { ReactNode } from "react";
import { BedDouble } from "lucide-react";
import {
  AppBottomNav,
  AppRail,
  BrandMark,
  type NavEntry,
  type RailLabels,
} from "@ranza/ui";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";

/**
 * The Portal's rail.
 *
 * Its tree is built here rather than passed in, for the same reason the
 * Workspace's is: every entry carries an icon component, and a server component
 * handing one across the boundary is the "Only plain objects" error.
 *
 * One destination, so the rail never opens a second level. It is still a rail
 * rather than a single link, because the Portal grows the blueprint 4.3
 * capabilities into it and a reader should not have to relearn where they are.
 */
function useEntries(locale: SupportedLocale): NavEntry[] {
  const t = useTranslations();
  return [
    { href: localizeHref(locale, "stay"), icon: BedDouble, label: t("stay") },
  ];
}

export function PortalRail({
  actions,
  labels,
  locale,
  root,
}: {
  actions?: ReactNode;
  labels: RailLabels;
  locale: SupportedLocale;
  root: string;
}) {
  const entries = useEntries(locale);
  return (
    <AppRail
      {...(actions === undefined ? {} : { actions })}
      brand={<BrandMark className="size-5" />}
      entries={entries}
      labels={labels}
      root={root}
    />
  );
}

export function PortalBottomNav({
  label,
  locale,
  root,
}: {
  label: string;
  locale: SupportedLocale;
  root: string;
}) {
  const entries = useEntries(locale);
  return <AppBottomNav entries={entries} label={label} root={root} />;
}
