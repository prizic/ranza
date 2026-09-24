"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeft, PanelLeftClose } from "lucide-react";
import {
  groupNavEntries,
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

/** Every string is the host's, localized. Required rather than defaulted: an
    English fallback here is English on an Arabic page. */
export interface RailLabels {
  /** Names the navigation landmark. */
  mainNavigation: string;
  /** The product's name, beside the mark; also names the link home. */
  home: string;
  /** The toggle that folds the sidebar to icons, and the one that opens it. */
  collapse: string;
  expand: string;
  /** Section titles, keyed by `Screen.section`. */
  sections?: Record<string, string> | undefined;
  /** Which application this is, under the product's name when there is no
      Organization to name instead. */
  badge?: string | undefined;
}

export type SidebarLabels = RailLabels;

function useActiveHref(root: string) {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || (href !== root && pathname.startsWith(`${href}/`));
}

/**
 * The workspace sidebar, drawn as the Leaders portal draws its own
 * (leaders-portal/src/components/layout/sidebar-content.tsx): a glass panel
 * floating in its own padded column, the brand at its head, and the account at
 * its foot.
 *
 * Leaders tightens its rows on a short screen; the thresholds here are higher
 * because the workspace has a dozen destinations to Leaders' nine, and at
 * Leaders' spacing a 900px laptop would scroll the last of them out of view.
 *
 * Two modes:
 * 1. Expanded: sections, inline accordion groups for sub-items (Front Office ->
 *    Arrivals / Departures), and the account card at the foot.
 * 2. Collapsed: centred icon tiles with tooltips, and flyout menus for groups.
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
        "sticky top-0 z-30 hidden h-svh shrink-0 p-2 transition-[width] duration-300 ease-out select-none md:flex xl:p-3 2xl:p-4",
        collapsed ? "w-24" : "w-[240px] xl:w-[260px] 2xl:w-[280px]",
      )}
    >
      <div className="glass-panel flex min-h-0 w-full flex-col overflow-hidden rounded-2xl lg:rounded-3xl">
        <div
          className={cn(
            "flex shrink-0 items-center",
            // Collapsed, the mark and the toggle stack, so the block takes
            // their height; a fixed one leaves the mark against the edge.
            collapsed
              ? "px-3 py-4"
              : "h-16 px-4 lg:h-20 lg:px-6 xl:h-24 [@media(max-height:750px)]:h-14 [@media(min-height:751px)_and_(max-height:960px)]:h-20",
          )}
        >
          {collapsed ? (
            <div className="flex w-full flex-col items-center gap-2">
              <a
                aria-label={labels.home}
                className="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20 transition-transform duration-500 hover:scale-105 hover:rotate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={root}
              >
                {brand}
              </a>
              <button
                aria-label={labels.expand}
                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                onClick={() => setCollapsed(false)}
                title={labels.expand}
                type="button"
              >
                <PanelLeft className="size-4 rtl:rotate-180" />
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              <a
                aria-label={labels.home}
                className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:gap-3.5"
                href={root}
              >
                <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20 transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3 lg:size-10 xl:size-11 [@media(max-height:750px)]:size-8">
                  {brand}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold tracking-tight text-foreground/80 transition-colors group-hover:text-foreground lg:text-base xl:text-lg">
                    {labels.home}
                  </span>
                  {(organization ?? labels.badge) ? (
                    <span className="truncate text-xs font-medium text-muted-foreground xl:text-sm">
                      {organization ?? labels.badge}
                    </span>
                  ) : null}
                </div>
              </a>

              <button
                aria-label={labels.collapse}
                className="ms-auto inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                onClick={toggle}
                title={labels.collapse}
                type="button"
              >
                <PanelLeftClose className="size-4 rtl:rotate-180" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Body */}
        <nav
          className={cn(
            "scrollbar-slim min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto py-2 focus:outline-none lg:py-4",
            collapsed ? "px-2" : "px-2.5 lg:px-3.5 xl:px-4",
          )}
        >
          {sections.map((section, secIdx) => (
            <div
              className="space-y-1 lg:space-y-2"
              key={section.id ?? `section-${secIdx}`}
            >
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
                  <div className="px-3 pb-1 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/70 uppercase select-none lg:px-3.5 xl:px-4">
                    {section.label}
                  </div>
                )
              ) : null}

              {/* Entries in this section */}
              <ul className="space-y-1 lg:space-y-2" role="list">
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

        {actions ? (
          <div
            className={cn(
              "mt-auto shrink-0 border-t border-border/20 p-2.5 lg:p-3.5 xl:p-4",
              collapsed && "flex flex-col items-center gap-2 px-2",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
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
    <a
      aria-current={active ? "page" : undefined}
      className={cn(
        "hover-lift group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 select-none lg:gap-3.5 lg:px-3.5 lg:py-2.5 lg:text-[15px] xl:px-4 xl:py-3 xl:text-base [@media(max-height:800px)]:py-1.5 [@media(min-height:801px)_and_(max-height:960px)]:py-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10"
          : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
      )}
      href={leaf.href}
    >
      <leaf.icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 transition-transform duration-300 lg:size-5 xl:size-5.5",
          !active && "group-hover:scale-110",
        )}
        strokeWidth={active ? 2 : 1.5}
      />
      <span className="truncate flex-1 text-start">{leaf.label}</span>
      {leaf.badge !== undefined ? (
        <span
          className={cn(
            "ms-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
            active
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {leaf.badge}
        </span>
      ) : null}
    </a>
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
          "group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 select-none lg:gap-3.5 lg:px-3.5 lg:py-2.5 lg:text-[15px] xl:px-4 xl:py-3 xl:text-base [@media(max-height:800px)]:py-1.5 [@media(min-height:801px)_and_(max-height:960px)]:py-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          hasActiveChild
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )}
        onClick={onToggle}
        type="button"
      >
        <group.icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform duration-300 lg:size-5 xl:size-5.5",
            !hasActiveChild && "group-hover:scale-110",
          )}
          strokeWidth={hasActiveChild ? 2 : 1.5}
        />
        <span className="truncate flex-1 text-start">{group.label}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 opacity-60 transition-transform duration-200 rtl:rotate-180",
            isOpen && "rotate-90 rtl:rotate-90",
          )}
        />
      </button>

      {isOpen ? (
        <div className="relative ms-5 space-y-1 border-s border-border/60 py-1 ps-3 xl:ms-6">
          {group.children.map((child) => {
            const childActive = isActive(child.href);
            return (
              <a
                aria-current={childActive ? "page" : undefined}
                className={cn(
                  "hover-lift group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 [@media(max-height:800px)]:py-1.5 [@media(min-height:801px)_and_(max-height:960px)]:py-2",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  childActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
                href={child.href}
                key={child.href}
              >
                <child.icon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  strokeWidth={childActive ? 2 : 1.5}
                />
                <span className="truncate text-start">{child.label}</span>
              </a>
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
      <a
        aria-current={active ? "page" : undefined}
        aria-label={leaf.label}
        className={cn(
          "hover-lift flex size-11 items-center justify-center rounded-xl transition-colors duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )}
        href={leaf.href}
      >
        <leaf.icon
          aria-hidden="true"
          className="size-5"
          strokeWidth={active ? 2 : 1.5}
        />
      </a>

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
            "flex size-11 cursor-pointer items-center justify-center rounded-xl transition-colors duration-300",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            hasActiveChild
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
          )}
        >
          <group.icon
            aria-hidden="true"
            className="size-5"
            strokeWidth={hasActiveChild ? 2 : 1.5}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="min-w-48 rounded-2xl"
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
                <a
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
                </a>
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
      className="glass-panel fixed inset-x-3 bottom-3 z-20 rounded-2xl md:hidden"
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
              <a
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-13 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/15"
                    : "text-muted-foreground hover:text-foreground",
                )}
                href={href}
              >
                <Icon
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={active ? 2 : 1.5}
                />
                <span className="max-w-full truncate leading-none">
                  {itemLabel}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
