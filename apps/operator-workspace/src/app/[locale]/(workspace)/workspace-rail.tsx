"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AppBottomNav, AppSidebar, type SidebarLabels } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { useWithProperty, useWorkspaceNav } from "../../../lib/nav";
import { organizationFor } from "../../../lib/property-choice";

/**
 * The workspace sidebar / rail, with the navigation tree built on the client.
 *
 * The server decides *which* destinations exist — it sends the route segments
 * the viewer can open, and which of them are open at each Property — and this
 * turns those strings into entries with icons. The icons cannot make that trip themselves: they are components,
 * and passing one from a server component is the "Only plain objects" error.
 */
export function WorkspaceRail({
  actions,
  brand,
  defaultProperty,
  labels,
  locale,
  organization: fallback,
  organizations,
  reachable,
  root,
  segmentsByProperty,
}: {
  actions?: ReactNode | undefined;
  brand: ReactNode;
  /** The Property the switcher names when the URL names none. */
  defaultProperty: string | undefined;
  labels: SidebarLabels;
  locale: SupportedLocale;
  /** The working Property's Organization, named when the URL names none. */
  organization?: string | undefined;
  /** Each switchable Property's Organization, by Property id. */
  organizations: Readonly<Record<string, string>>;
  /** The destinations open somewhere the viewer reaches, by route segment. */
  reachable: readonly string[];
  root: string;
  /** The destinations open at each switchable Property, by Property id. */
  segmentsByProperty: Readonly<Record<string, readonly string[]>>;
}) {
  const entries = useWorkspaceNav(
    locale,
    reachable,
    defaultProperty,
    segmentsByProperty,
  );
  const withProperty = useWithProperty(
    defaultProperty,
    Object.keys(segmentsByProperty),
  );
  // The Organization of the Property being worked in, read from the URL as
  // the switcher reads it: a layout renders once, and ?property= changes.
  const organization = organizationFor(
    useSearchParams().get("property"),
    organizations,
    fallback,
  );

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
  label,
  locale,
  reachable,
  root,
  segmentsByProperty,
}: {
  /** The Property the switcher names when the URL names none. */
  defaultProperty: string | undefined;
  label: string;
  locale: SupportedLocale;
  reachable: readonly string[];
  root: string;
  segmentsByProperty: Readonly<Record<string, readonly string[]>>;
}) {
  const entries = useWorkspaceNav(
    locale,
    reachable,
    defaultProperty,
    segmentsByProperty,
  );
  const withProperty = useWithProperty(
    defaultProperty,
    Object.keys(segmentsByProperty),
  );

  return (
    <AppBottomNav entries={entries} label={label} root={withProperty(root)} />
  );
}
