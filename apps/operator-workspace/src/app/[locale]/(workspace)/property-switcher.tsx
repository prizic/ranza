"use client";

import { useSearchParams } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ranza/ui";

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
 * With no `?property=` it names the first Property, the one every page opens
 * on. A `?property=` naming none of these — out of reach, stale, forged —
 * names no Property at all: the page beneath shows none either, and naming the
 * viewer's first one would put a Property where the page is working above a
 * page that says it is not (HK-S1-24).
 */
export function PropertySwitcher({
  chooseLabel,
  label,
  organization,
  slots,
}: {
  /** Shown in place of a Property's name when the URL names none of these. */
  chooseLabel: string;
  label: string;
  organization: string;
  slots: readonly { href: string; id: string; name: string }[];
}) {
  const requested = useSearchParams().get("property");
  const active = requested
    ? slots.find((slot) => slot.id === requested)
    : slots[0];

  if (slots.length === 0) return null;

  // One Property is not a choice. Name it, and offer no menu to open.
  if (active && slots.length === 1) {
    return (
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Building2
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="truncate">{active.name}</span>
      </p>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-secondary"
      >
        <Building2
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="max-w-[12rem] truncate">
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
              href={slot.href}
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
