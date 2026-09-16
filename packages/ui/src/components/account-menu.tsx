"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** First letter of the name, or of the address when there is no name. */
function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  return source.slice(0, 2).toLocaleUpperCase("tr");
}

/**
 * The account control at the foot of the rail.
 *
 * `children` arrives rendered rather than as actions: this is a client island
 * and cannot own a server action itself, so the host passes the sign-out form
 * and any account links already built.
 */
export function AccountMenu({
  children,
  email,
  label,
  name,
}: {
  children: ReactNode;
  email: string;
  /** Accessible name for the trigger. */
  label: string;
  name: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground uppercase">
            {initials(name, email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56" side="top">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="text-sm font-medium">{name}</span>
          {/* ltr: an address is never right-to-left, even on an Arabic page. */}
          <span className="text-xs font-normal text-muted-foreground" dir="ltr">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
