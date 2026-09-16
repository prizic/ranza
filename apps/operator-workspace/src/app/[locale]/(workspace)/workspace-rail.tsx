"use client";

import type { ReactNode } from "react";
import { AppBottomNav, AppRail, type RailLabels } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useWorkspaceNav } from "../../../lib/nav";

/**
 * The rail, with the tree built on the client.
 *
 * The server decides *which* destinations exist — it sends the capability keys
 * the Organization is entitled to — and this turns those strings into entries
 * with icons. The icons cannot make that trip themselves: they are components,
 * and passing one from a server component is the "Only plain objects" error.
 */
export function WorkspaceRail({
  actions,
  brand,
  entitled,
  labels,
  locale,
  root,
}: {
  actions?: ReactNode;
  brand: ReactNode;
  entitled: readonly string[];
  labels: RailLabels;
  locale: SupportedLocale;
  root: string;
}) {
  const entries = useWorkspaceNav(locale, entitled);

  return (
    <AppRail
      {...(actions === undefined ? {} : { actions })}
      brand={brand}
      entries={entries}
      labels={labels}
      root={root}
    />
  );
}

export function WorkspaceBottomNav({
  entitled,
  label,
  locale,
  root,
}: {
  entitled: readonly string[];
  label: string;
  locale: SupportedLocale;
  root: string;
}) {
  const entries = useWorkspaceNav(locale, entitled);

  return <AppBottomNav entries={entries} label={label} root={root} />;
}
