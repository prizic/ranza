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
 */
export function PropertySwitcher({
  label,
  organization,
  slots,
}: {
  label: string;
  organization: string;
  slots: readonly { href: string; id: string; name: string }[];
}) {
  const selected = useSearchParams().get("property") ?? slots[0]?.id;
  const active = slots.find((slot) => slot.id === selected) ?? slots[0];

  if (!active) return null;

  // One Property is not a choice. Name it, and offer no menu to open.
  if (slots.length === 1) {
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
        <span className="min-w-0 truncate sm:max-w-[12rem]">{active.name}</span>
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
        {slots.map((slot) => (
          <DropdownMenuItem asChild key={slot.id}>
            <a
              aria-current={slot.id === active.id ? "true" : undefined}
              href={slot.href}
            >
              <Check
                aria-hidden="true"
                className={
                  slot.id === active.id
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
