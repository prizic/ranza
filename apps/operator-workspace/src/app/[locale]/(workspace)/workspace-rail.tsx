"use client";

import type { ReactNode } from "react";
import { AppBottomNav, AppRail, type RailLabels } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { workspaceNav } from "../../../lib/nav";
import type { Messages } from "../../../messages";

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
  copy,
  entitled,
  labels,
  locale,
  root,
}: {
  actions?: ReactNode;
  brand: ReactNode;
  copy: Messages;
  entitled: readonly string[];
  labels: RailLabels;
  locale: SupportedLocale;
  root: string;
}) {
  const entries = workspaceNav(locale, copy, entitled);

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
  copy,
  entitled,
  label,
  locale,
  root,
}: {
  copy: Messages;
  entitled: readonly string[];
  label: string;
  locale: SupportedLocale;
  root: string;
}) {
  return (
    <AppBottomNav
      entries={workspaceNav(locale, copy, entitled)}
      label={label}
      root={root}
    />
  );
}
