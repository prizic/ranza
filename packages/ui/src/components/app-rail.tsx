"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import {
  isNavGroup,
  navGroupFor,
  toMobileNav,
  type NavEntry,
  type NavGroup,
  type NavLeaf,
} from "./nav";
import { cn } from "../lib/utils";

/**
 * A menu item is 56x56 with a 12px radius and no padding, icon over label
 * inside that box. Long labels overflow the box rather than stretching it —
 * the tile is the hit and highlight area, not the text box.
 *
 * `rounded-lg`, not the `rounded-xl` this was ported from: 12px is the stated
 * intent, and the radius scales differ. Ours puts 12px on `lg`.
 */
const tileClass =
  "inline-flex size-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg p-0 transition-colors focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none";
const tileIdle = "hover:bg-muted/60";
const tileActive = "bg-muted";
const iconClass = "size-5 shrink-0";
const labelClass = "text-[11px] leading-none font-medium whitespace-nowrap";

export interface RailLabels {
  /** Names the landmark. Localized, because this is what a reader hears first. */
  mainNavigation: string;
  back: string;
  /** The brand link's accessible name. */
  home: string;
}

function useActiveHref(root: string) {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || (href !== root && pathname.startsWith(`${href}/`));
}

/**
 * Rail anatomy: mark, then two sliding levels of navigation, then icon-only
 * actions at the foot. It does not collapse — a rail that changes width is a
 * control the reader has to manage.
 *
 * The levels are two panels in one frame rather than a list that grows and
 * shrinks: sliding keeps the tiles in place so the eye can follow them, where
 * an expanding accordion moves everything below whichever group opened.
 *
 * Ported from ryadh/mirhaal/apps/dashboard. What changed: the entries arrive as
 * a prop rather than being imported, because which of them exist depends on
 * what the Organization is entitled to and only the server knows that; and the
 * strings are props, because this product has three locales and no fallback.
 */
export function AppRail({
  actions,
  brand,
  entries,
  labels,
  root,
}: {
  /** Icon-only controls pinned to the foot. */
  actions?: ReactNode;
  brand: ReactNode;
  entries: readonly NavEntry[];
  labels: RailLabels;
  root: string;
}) {
  const pathname = usePathname();
  const isActive = useActiveHref(root);

  // Opens itself where the reader already is, so arriving by link or refresh
  // shows the page's siblings rather than making them drill back down.
  const [open, setOpen] = useState<NavGroup | null>(() =>
    navGroupFor(pathname, entries),
  );
  useEffect(() => {
    const here = navGroupFor(pathname, entries);
    if (here) setOpen(here);
  }, [entries, pathname]);

  return (
    <aside
      aria-label={labels.mainNavigation}
      className="sticky top-0 z-30 hidden h-svh w-19 shrink-0 flex-col border-e border-border bg-card md:flex"
    >
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-border px-2">
        <a
          aria-label={labels.home}
          className="inline-flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          href={root}
        >
          {brand}
        </a>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* Deeper slides in from the start edge and the level above leaves the
            same way, so the movement reads as one push rather than a swap.
            `inert` keeps the hidden level off the tab order. */}
        <Level
          className={
            open ? "translate-x-full rtl:-translate-x-full" : "translate-x-0"
          }
          shown={!open}
        >
          {entries.map((entry) =>
            isNavGroup(entry) ? (
              <li className="flex w-full justify-center" key={entry.label}>
                <button
                  aria-expanded={false}
                  className={cn(
                    tileClass,
                    "group/tile relative text-foreground",
                    entry.children.some((c) => isActive(c.href))
                      ? tileActive
                      : tileIdle,
                  )}
                  onClick={() => setOpen(entry)}
                  type="button"
                >
                  <entry.icon
                    aria-hidden="true"
                    className={iconClass}
                    strokeWidth={1.5}
                  />
                  <span className={labelClass}>{entry.label}</span>
                  {/* Nothing at rest: the rail is 76px and every version of a
                      permanent caret either crowded the label or hung off the
                      icon. It appears on approach, which is the only moment it
                      has anything to say. */}
                  <ChevronLeft
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute end-1 top-1/2 size-3.5 text-muted-foreground rtl:rotate-180",
                      // Drifts in from the direction it points, so the motion
                      // says "this way" before the glyph does.
                      "-translate-y-1/2 -translate-x-1.5 opacity-0 rtl:translate-x-1.5",
                      "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                      "group-hover/tile:translate-x-0 group-hover/tile:opacity-100",
                      "group-focus-visible/tile:translate-x-0 group-focus-visible/tile:opacity-100",
                    )}
                    strokeWidth={2.5}
                  />
                </button>
              </li>
            ) : (
              <Tile
                active={isActive(entry.href)}
                key={entry.href}
                leaf={entry}
              />
            ),
          )}
        </Level>

        <Level
          className={
            open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
          }
          shown={Boolean(open)}
        >
          <li className="flex w-full justify-center">
            <button
              className={cn(tileClass, "text-muted-foreground", tileIdle)}
              onClick={() => setOpen(null)}
              type="button"
            >
              <ArrowLeft
                aria-hidden="true"
                className={cn(iconClass, "rtl:rotate-180")}
                strokeWidth={1.5}
              />
              <span className={labelClass}>{labels.back}</span>
            </button>
          </li>
          <li aria-hidden="true" className="my-0.5 h-px w-8 bg-border" />
          {open?.children.map((leaf) => (
            <Tile active={isActive(leaf.href)} key={leaf.href} leaf={leaf} />
          ))}
        </Level>
      </div>

      {actions ? (
        <div className="mt-auto flex flex-col items-center gap-3 px-1 pb-6">
          {actions}
        </div>
      ) : null}
    </aside>
  );
}

function Level({
  children,
  className,
  shown,
}: {
  children: ReactNode;
  className: string;
  shown: boolean;
}) {
  return (
    <nav
      aria-hidden={!shown}
      className={cn(
        "absolute inset-0 px-1 pt-2 transition-transform duration-300 ease-out motion-reduce:transition-none",
        className,
      )}
      inert={!shown}
    >
      <ul className="flex flex-col items-center gap-2.5" role="list">
        {children}
      </ul>
    </nav>
  );
}

function Tile({ active, leaf }: { active: boolean; leaf: NavLeaf }) {
  return (
    <li className="flex w-full justify-center">
      <a
        aria-current={active ? "page" : undefined}
        className={cn(
          tileClass,
          "text-foreground",
          active ? tileActive : tileIdle,
        )}
        href={leaf.href}
      >
        <leaf.icon
          aria-hidden="true"
          className={cn(iconClass, active && "text-primary")}
          strokeWidth={1.5}
        />
        <span className={labelClass}>{leaf.label}</span>
      </a>
    </li>
  );
}

/** Mobile dock. One tile per category — there is no room to drill in here. */
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className="grid px-1 pt-1"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map(({ href, icon: Icon, label: itemLabel }) => {
          const active = isActive(href);
          return (
            <li className="flex w-full justify-center" key={href}>
              <a
                aria-current={active ? "page" : undefined}
                className={cn(
                  // `w-full` is load-bearing: without it the link shrinks to
                  // its label and the shortest ones fall under a 44px target.
                  "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.6875rem] font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                href={href}
              >
                <Icon
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={active ? 2.25 : 2}
                />
                <span className="max-w-full truncate">{itemLabel}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
