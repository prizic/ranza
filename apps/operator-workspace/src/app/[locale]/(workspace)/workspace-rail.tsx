"use client";

import type { ReactNode } from "react";
import { AppBottomNav, AppSidebar, type SidebarLabels } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useWithProperty, useWorkspaceNav } from "../../../lib/nav";

/**
 * The workspace sidebar / rail, with the navigation tree built on the client.
 *
 * The server decides *which* destinations exist — it sends the capability keys
 * the Organization is entitled to — and this turns those strings into entries
 * with icons. The icons cannot make that trip themselves: they are components,
 * and passing one from a server component is the "Only plain objects" error.
 */
export function WorkspaceRail({
  actions,
  brand,
  defaultProperty,
  entitled,
  labels,
  locale,
  organization,
  root,
}: {
  actions?: ReactNode | undefined;
  brand: ReactNode;
  /** The Property the switcher names when the URL names none. */
  defaultProperty: string | undefined;
  entitled: readonly string[];
  labels: SidebarLabels;
  locale: SupportedLocale;
  organization?: string | undefined;
  root: string;
}) {
  const entries = useWorkspaceNav(locale, entitled, defaultProperty);
  const withProperty = useWithProperty(defaultProperty);

  return (
    <AppSidebar
      {...(actions === undefined ? {} : { actions })}
      {...(organization === undefined ? {} : { organization })}
      brand={brand}
      entries={entries}
      labels={labels}
      root={withProperty(root)}
    />
  );
}

export function WorkspaceBottomNav({
  defaultProperty,
  entitled,
  label,
  locale,
  root,
}: {
  /** The Property the switcher names when the URL names none. */
  defaultProperty: string | undefined;
  entitled: readonly string[];
  label: string;
  locale: SupportedLocale;
  root: string;
}) {
  const entries = useWorkspaceNav(locale, entitled, defaultProperty);
  const withProperty = useWithProperty(defaultProperty);

  return (
    <AppBottomNav entries={entries} label={label} root={withProperty(root)} />
  );
}
