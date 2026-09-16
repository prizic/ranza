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
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import type { Messages } from "../../../messages";

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
function entriesFor(locale: SupportedLocale, copy: Messages): NavEntry[] {
  return [
    { href: localizeHref(locale, "stay"), icon: BedDouble, label: copy.stay },
  ];
}

export function PortalRail({
  actions,
  copy,
  labels,
  locale,
  root,
}: {
  actions?: ReactNode;
  copy: Messages;
  labels: RailLabels;
  locale: SupportedLocale;
  root: string;
}) {
  return (
    <AppRail
      {...(actions === undefined ? {} : { actions })}
      brand={<BrandMark className="size-7 text-primary" />}
      entries={entriesFor(locale, copy)}
      labels={labels}
      root={root}
    />
  );
}

export function PortalBottomNav({
  copy,
  label,
  locale,
  root,
}: {
  copy: Messages;
  label: string;
  locale: SupportedLocale;
  root: string;
}) {
  return (
    <AppBottomNav
      entries={entriesFor(locale, copy)}
      label={label}
      root={root}
    />
  );
}
