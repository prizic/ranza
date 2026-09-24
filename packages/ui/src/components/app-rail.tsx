"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeft, PanelLeftClose } from "lucide-react";
import {
  groupNavEntries,
  hrefPath,
  isNavGroup,
  navGroupFor,
  toMobileNav,
  type NavEntry,
  type NavGroup,
  type NavLeaf,
} from "./nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { cn } from "../lib/utils";

export interface RailLabels {
  /** Accessible name for the navigation landmark */
  mainNavigation: string;
  back?: string | undefined;
  /** Accessible name for brand link */
  home: string;
  /** Label for collapse toggle */
  collapse?: string | undefined;
  /** Label for expand toggle */
  expand?: string | undefined;
  /** Localized titles for sections: e.g. { operations: "Operasyon", management: "Yönetim" } */
  sections?: Record<string, string> | undefined;
  /** Subtitle or badge in expanded sidebar header */
  workspaceBadge?: string | undefined;
}

export type SidebarLabels = RailLabels;

function useActiveHref(root: string) {
  const pathname = usePathname();
  return (href: string) => {
    const path = hrefPath(href);
    return (
      pathname === path ||
      (path !== hrefPath(root) && pathname.startsWith(`${path}/`))
    );
  };
}

/**
 * Modern, responsive, accessible workspace sidebar.
 *
 * Supports two distinct modes:
 * 1. Expanded (w-64): Clean sections, inline accordion groups for sub-items
 *    (e.g. Front Office -> Arrivals / Departures), rich staff profile, and clear typography.
 * 2. Collapsed (w-18 / 72px): Elegant centered icon tiles with floating tooltips and
 *    flyout menus for nested groups.
 */
export function AppSidebar({
  actions,
  brand,
  entries,
  labels,
  root,
  organization,
}: {
  actions?: ReactNode | undefined;
  brand: ReactNode;
  entries: readonly NavEntry[];
  labels: SidebarLabels;
  root: string;
  organization?: string | undefined;
}) {
  return (
    <SidebarProvider>
      <AppSidebarInner
        actions={actions}
        brand={brand}
        entries={entries}
        labels={labels}
        organization={organization}
        root={root}
      />
    </SidebarProvider>
  );
}

/** Backward-compatible alias for AppSidebar */
export const AppRail = AppSidebar;

function AppSidebarInner({
  actions,
  brand,
  entries,
  labels,
  root,
  organization,
}: {
  actions?: ReactNode | undefined;
  brand: ReactNode;
  entries: readonly NavEntry[];
  labels: SidebarLabels;
  root: string;
  organization?: string | undefined;
}) {
  const pathname = usePathname();
  const isActive = useActiveHref(root);
  const { collapsed, setCollapsed, toggle } = useSidebar();

  // Keep track of which accordion groups are open in expanded mode.
  // Initially open the group containing the active page.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const currentGroup = navGroupFor(pathname, entries);
    return currentGroup ? { [currentGroup.label]: true } : {};
  });

  // Whenever route changes, ensure the active group is open
  useEffect(() => {
    const currentGroup = navGroupFor(pathname, entries);
    if (currentGroup) {
      setOpenGroups((prev) => ({ ...prev, [currentGroup.label]: true }));
    }
  }, [pathname, entries]);

  const toggleGroup = (groupLabel: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupLabel]: !prev[groupLabel],
    }));
  };

  const sections = groupNavEntries(entries, labels.sections);

  return (
    <aside
      aria-label={labels.mainNavigation}
      className={cn(
        "sticky top-0 z-30 hidden h-svh shrink-0 flex-col border-e border-border/70 bg-card/95 backdrop-blur transition-[width] duration-200 ease-in-out select-none md:flex",
        collapsed ? "w-18" : "w-64",
      )}
    >
      {/* Sidebar Header */}
      <div className="flex h-16 shrink-0 items-center border-b border-border/60 px-3">
        {collapsed ? (
          <div className="flex w-full items-center justify-between">
            <Link
              aria-label={labels.home}
              className="inline-flex size-9 items-center justify-center rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={root}
            >
              {brand}
            </Link>
            <button
              aria-label={labels.expand ?? "Expand sidebar"}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              onClick={() => setCollapsed(false)}
              title={labels.expand ?? "Expand sidebar"}
              type="button"
            >
              <PanelLeft className="size-4 rtl:rotate-180" />
            </button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2.5">
            <Link
              aria-label={labels.home}
              className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={root}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {brand}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-bold tracking-tight text-foreground leading-none">
                  {labels.home || "Ranza"}
                </span>
                <span className="truncate text-[10px] font-semibold text-primary uppercase tracking-wider mt-0.5 leading-none">
                  {labels.workspaceBadge || organization || "Workspace"}
                </span>
              </div>
            </Link>

            <button
              aria-label={labels.collapse ?? "Collapse sidebar"}
              className="ms-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              onClick={toggle}
              title={labels.collapse ?? "Collapse sidebar"}
              type="button"
            >
              <PanelLeftClose className="size-4 rtl:rotate-180" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Body */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3 space-y-3.5 focus:outline-none">
        {sections.map((section, secIdx) => (
          <div className="space-y-1" key={section.id ?? `section-${secIdx}`}>
            {/* Section Header */}
            {section.label ? (
              collapsed ? (
                secIdx > 0 ? (
                  <div
                    aria-hidden="true"
                    className="my-2 h-px w-8 mx-auto bg-border/60"
                  />
                ) : null
              ) : (
                <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 select-none">
                  {section.label}
                </div>
              )
            ) : null}

            {/* Entries in this section */}
            <ul className="space-y-1" role="list">
              {section.entries.map((entry) =>
                isNavGroup(entry) ? (
                  <li key={entry.label}>
                    {collapsed ? (
                      <CollapsedGroupItem group={entry} isActive={isActive} />
                    ) : (
                      <ExpandedGroupItem
                        group={entry}
                        isActive={isActive}
                        isOpen={Boolean(openGroups[entry.label])}
                        onToggle={() => toggleGroup(entry.label)}
                      />
                    )}
                  </li>
                ) : (
                  <li key={entry.href}>
                    {collapsed ? (
                      <CollapsedLeafItem
                        active={isActive(entry.href)}
                        leaf={entry}
                      />
                    ) : (
                      <ExpandedLeafItem
                        active={isActive(entry.href)}
                        leaf={entry}
                      />
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      {actions ? (
        <div
          className={cn(
            "mt-auto shrink-0 border-t border-border/60 p-2",
            collapsed ? "flex flex-col items-center gap-2" : "px-2.5 py-2.5",
          )}
        >
          {actions}
        </div>
      ) : null}
    </aside>
  );
}

/** Single navigation leaf in expanded mode */
function ExpandedLeafItem({
  active,
  leaf,
}: {
  active: boolean;
  leaf: NavLeaf;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/10 text-primary font-semibold shadow-xs"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      href={leaf.href}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 start-0 w-1 rounded-e-full bg-primary"
        />
      ) : null}
      <leaf.icon
        aria-hidden="true"
        className={cn(
          "size-4.5 shrink-0 transition-transform duration-150 group-hover:scale-105",
          active
            ? "text-primary"
            : "text-muted-foreground group-hover:text-foreground",
        )}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="truncate flex-1 text-start">{leaf.label}</span>
      {leaf.badge !== undefined ? (
        <span className="ms-auto inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {leaf.badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Accordion group item in expanded mode */
function ExpandedGroupItem({
  group,
  isActive,
  isOpen,
  onToggle,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const hasActiveChild = group.children.some((c) => isActive(c.href));

  return (
    <div className="space-y-1">
      <button
        aria-expanded={isOpen}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 select-none cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          hasActiveChild
            ? "text-primary font-semibold bg-primary/5"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
        onClick={onToggle}
        type="button"
      >
        <group.icon
          aria-hidden="true"
          className={cn(
            "size-4.5 shrink-0 transition-transform duration-150 group-hover:scale-105",
            hasActiveChild
              ? "text-primary"
              : "text-muted-foreground group-hover:text-foreground",
          )}
          strokeWidth={hasActiveChild ? 2.25 : 1.75}
        />
        <span className="truncate flex-1 text-start">{group.label}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 rtl:rotate-180",
            isOpen && "rotate-90 rtl:rotate-90 text-primary",
          )}
        />
      </button>

      {isOpen ? (
        <div className="relative ms-4.5 ps-3 pt-0.5 pb-0.5 border-s border-border/70 space-y-1">
          {group.children.map((child) => {
            const childActive = isActive(child.href);
            return (
              <Link
                aria-current={childActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  childActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                href={child.href}
                key={child.href}
              >
                <child.icon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0",
                    childActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                  strokeWidth={childActive ? 2.25 : 1.75}
                />
                <span className="truncate text-start">{child.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Single navigation leaf in collapsed rail mode */
function CollapsedLeafItem({
  active,
  leaf,
}: {
  active: boolean;
  leaf: NavLeaf;
}) {
  return (
    <div className="relative group/tile flex justify-center py-0.5">
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={leaf.label}
        className={cn(
          "flex size-10 items-center justify-center rounded-xl transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-primary/10 text-primary shadow-xs font-semibold"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        )}
        href={leaf.href}
      >
        <leaf.icon
          aria-hidden="true"
          className="size-5"
          strokeWidth={active ? 2.25 : 1.75}
        />
      </Link>

      {/* Floating tooltip on hover/focus */}
      <div
        className={cn(
          "pointer-events-none absolute z-50 start-full top-1/2 -translate-y-1/2 ms-2.5",
          "whitespace-nowrap rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md border border-border/80",
          "opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100",
        )}
        role="tooltip"
      >
        {leaf.label}
      </div>
    </div>
  );
}

/** Group navigation item in collapsed rail mode */
function CollapsedGroupItem({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
}) {
  const hasActiveChild = group.children.some((c) => isActive(c.href));

  return (
    <div className="relative group/tile flex justify-center py-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={group.label}
          className={cn(
            "flex size-10 items-center justify-center rounded-xl transition-all duration-150 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            hasActiveChild
              ? "bg-primary/10 text-primary shadow-xs font-semibold"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <group.icon
            aria-hidden="true"
            className="size-5"
            strokeWidth={hasActiveChild ? 2.25 : 1.75}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="min-w-44 border border-border/80 shadow-lg"
          side="right"
          sideOffset={10}
        >
          <DropdownMenuLabel className="text-xs font-semibold text-foreground">
            {group.label}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {group.children.map((child) => {
            const childActive = isActive(child.href);
            return (
              <DropdownMenuItem asChild key={child.href}>
                <Link
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    childActive
                      ? "text-primary font-semibold"
                      : "text-foreground",
                  )}
                  href={child.href}
                >
                  <child.icon className="size-4 shrink-0" />
                  <span>{child.label}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Floating tooltip on hover before open */}
      <div
        className={cn(
          "pointer-events-none absolute z-40 start-full top-1/2 -translate-y-1/2 ms-2.5",
          "whitespace-nowrap rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md border border-border/80",
          "opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100",
        )}
        role="tooltip"
      >
        {group.label}
      </div>
    </div>
  );
}

/** Mobile dock navigation. Clean, scroll-safe, touch-friendly. */
export function AppBottomNav({
  entries,
  label,
  root,
}: {
  entries: readonly NavEntry[];
  label: string;
  root: string;
}) {
  const isActive = useActiveHref(root);
  const items = toMobileNav(entries);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-around overflow-x-auto px-1 py-1 scrollbar-none">
        {items.map(({ href, icon: Icon, label: itemLabel }) => {
          const active = isActive(href);
          return (
            <li
              className="flex flex-1 min-w-[4.25rem] justify-center"
              key={href}
            >
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-13 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                href={href}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-primary"
                  />
                ) : null}
                <Icon
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span className="max-w-full truncate leading-none">
                  {itemLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
