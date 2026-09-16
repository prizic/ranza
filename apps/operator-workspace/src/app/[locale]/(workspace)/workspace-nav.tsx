"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { CalendarCheck, House, type LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ranza/ui";

/**
 * Job-based navigation (blueprint 4.6), with the current destination marked.
 *
 * A client component for one reason — which item is current depends on the
 * route, and a router layout cannot read the pathname. There is nothing to
 * authorize here: the server already decided what may appear, and a capability
 * the Organization is not entitled to never reaches this list. Hiding is never
 * the boundary; the server and the database deny it either way.
 */
/**
 * The icons live here, not in the layout that lists the items.
 *
 * A Lucide icon is a React component, and a server component handing one to a
 * client component across the boundary is the "Only plain objects can be passed
 * to Client Components" error — it fails at request time, not at build time,
 * which is why it is worth a comment rather than a fix. So the server sends
 * strings and this module turns a segment into a glyph.
 *
 * An unknown segment renders no icon rather than throwing: navigation is not
 * the authorization boundary, and a missing glyph is not worth a 500.
 */
const ICON: Record<string, LucideIcon> = {
  "front-office": CalendarCheck,
  today: House,
};

/** Everything here is serializable, by construction. */
export interface NavItem {
  href: string;
  label: string;
  /** Matched against the route segment, so a nested page keeps its parent lit. */
  segment: string;
}

export function WorkspaceNav({ items }: { items: readonly NavItem[] }) {
  const segment = useSelectedLayoutSegment();

  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = ICON[item.segment];
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={item.segment === segment}
                  tooltip={item.label}
                >
                  <a
                    aria-current={item.segment === segment ? "page" : undefined}
                    href={item.href}
                  >
                    {Icon ? <Icon aria-hidden="true" /> : null}
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
