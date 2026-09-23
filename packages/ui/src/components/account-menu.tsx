"use client";

import type { ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useSidebar } from "./sidebar-context";

/** First letter of the name, or of the address when there is no name. */
function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  return source.slice(0, 2).toLocaleUpperCase("tr");
}

/**
 * The account control at the foot of the rail or sidebar.
 *
 * Automatically adapts between an expanded user card with name, email and
 * chevron, or a compact avatar tile when the sidebar is collapsed or when placed
 * on mobile.
 */
export function AccountMenu({
  children,
  email,
  label,
  name,
  variant = "auto",
}: {
  children: ReactNode;
  email: string;
  /** Accessible name for the trigger. */
  label: string;
  name: string;
  variant?: "auto" | "compact" | "expanded" | undefined;
}) {
  const { collapsed, inSidebar } = useSidebar();
  const isExpanded =
    variant === "expanded" || (variant === "auto" && inSidebar && !collapsed);
  // Until a Staff Member has a display name the host passes the address as
  // both, and printing it twice says nothing the first line did not.
  const showEmail = name.trim() !== "" && name !== email;

  return (
    <DropdownMenu>
      {isExpanded ? (
        <DropdownMenuTrigger
          aria-label={label}
          className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/60 bg-secondary/50 p-2 text-start transition-all duration-300 select-none hover:bg-white/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-10 shrink-0 rounded-xl">
            <AvatarFallback className="rounded-xl bg-primary text-xs font-semibold uppercase tracking-wider text-primary-foreground">
              {initials(name, email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className="truncate text-sm font-medium text-foreground/90"
              dir={showEmail ? undefined : "ltr"}
            >
              {name || email}
            </span>
            {showEmail ? (
              <span
                className="truncate text-xs text-muted-foreground"
                dir="ltr"
              >
                {email}
              </span>
            ) : null}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label={label}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9 rounded-xl">
            <AvatarFallback className="rounded-xl bg-primary text-xs font-semibold uppercase tracking-wider text-primary-foreground">
              {initials(name, email)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        align="end"
        className="w-64 rounded-2xl"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel className="grid gap-0.5 p-2.5">
          <span className="truncate text-sm font-semibold text-foreground">
            {name || email}
          </span>
          {showEmail ? (
            <span
              className="truncate text-xs font-normal text-muted-foreground"
              dir="ltr"
            >
              {email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
