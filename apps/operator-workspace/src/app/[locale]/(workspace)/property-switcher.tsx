"use client";

import { useSearchParams } from "next/navigation";
import { Building2, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@ranza/ui";

/**
 * The Property switcher, in the rail beneath the Organization.
 *
 * Blueprint 7.2 story 10: it must be obvious which Property is active at all
 * times, which is why the active one is the trigger's label rather than
 * something you open the menu to discover.
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent/60 px-2.5 py-2 text-start transition-colors hover:bg-sidebar-accent"
      >
        <Building2 aria-hidden="true" className="size-4 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-step--1 opacity-60">
            {organization}
          </span>
          <span className="block truncate text-sm font-medium">
            {active.name}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 opacity-60"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {slots.map((slot) => (
          <DropdownMenuItem asChild key={slot.id}>
            <a
              aria-current={slot.id === active.id ? "true" : undefined}
              href={slot.href}
            >
              {slot.name}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
