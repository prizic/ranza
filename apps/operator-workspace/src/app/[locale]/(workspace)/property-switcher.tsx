"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ranza/ui";
import { rememberProperty, switchTarget } from "../../../lib/property-choice";

/**
 * The Property switcher, in the page bar.
 *
 * Blueprint 7.2 story 10: it must be obvious which Property is active at all
 * times, which is why the active one is the trigger's label rather than
 * something you open the menu to discover.
 *
 * The Organization names the set being chosen from, so it belongs in the menu's
 * label rather than stacked above the Property in a 64px bar — two lines of
 * 13px text there were cramped, and the muted one was the wrong contrast for a
 * light surface. It was written for a dark sidebar that no longer exists.
 *
 * A client component for one reason — the selection lives in the query string,
 * and a router layout cannot read search parameters. There is nothing to
 * authorize here: the server already decided which Properties may appear.
 *
 * With no `?property=` it names `defaultId` — the Property remembered on this
 * device, or the first — which the server resolved as the page did. A
 * `?property=` naming none of these — out of reach, stale, forged — names no
 * Property at all: the page beneath shows none either, and naming another
 * would put a Property where the page is working above a page that says it is
 * not (HK-S1-24).
 *
 * It lists every Property the viewer can use at least one destination in
 * (OA-S3-07), and choosing one keeps the page being viewed when it is open
 * there, and otherwise opens Today, or the first destination open there. The
 * choice is remembered on this device (OA-S3-05).
 */
export function PropertySwitcher({
  chooseLabel,
  defaultId,
  label,
  locale,
  slots,
}: {
  /** Shown in place of a Property's name when the URL names none of these. */
  chooseLabel: string;
  defaultId: string;
  label: string;
  locale: SupportedLocale;
  slots: readonly {
    id: string;
    name: string;
    organization: string;
    /** Route segments open to the viewer there, in rail order. */
    segments: readonly string[];
  }[];
}) {
  const requested = useSearchParams().get("property");
  const current = usePathname().split("/")[2];
  const active = requested
    ? slots.find((slot) => slot.id === requested)
    : (slots.find((slot) => slot.id === defaultId) ?? slots[0]);
  // The Organization of the Property being worked in: a Staff Member of two
  // Organizations has Properties of both here.
  const organization = (active ?? slots[0])?.organization ?? "";
  const hrefFor = (slot: (typeof slots)[number]) => {
    const target = switchTarget(current, slot.segments) ?? "today";
    return `${localizeHref(locale, target)}?property=${encodeURIComponent(slot.id)}`;
  };

  if (slots.length === 0) return null;

  // One Property is not a choice. Name it, and offer no menu to open.
  if (active && slots.length === 1) {
    return (
      <p className="flex min-w-0 items-center gap-2 px-2 text-sm font-medium">
        <Building2
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate sm:max-w-[12rem]">{active.name}</span>
      </p>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="flex h-11 min-w-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-secondary md:h-9"
      >
        <Building2
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate sm:max-w-[12rem]">
          {active ? active.name : chooseLabel}
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="text-xs font-normal text-muted-foreground">
            {label}
          </span>
          <span className="truncate text-sm font-medium">{organization}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* A full load rather than a Link, on purpose: ADR 0019 drops the
            client cache on a Property switch, and a new document drops it by
            construction. */}
        {slots.map((slot) => (
          <DropdownMenuItem asChild key={slot.id}>
            <a
              aria-current={slot.id === active?.id ? "true" : undefined}
              href={hrefFor(slot)}
              onClick={() => rememberProperty(slot.id)}
            >
              <Check
                aria-hidden="true"
                className={
                  slot.id === active?.id
                    ? "size-4 shrink-0"
                    : "size-4 shrink-0 invisible"
                }
              />
              <span className="truncate">{slot.name}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
