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

  return (
    <DropdownMenu>
      {isExpanded ? (
        <DropdownMenuTrigger
          aria-label={label}
          className="group flex w-full items-center gap-3 rounded-xl p-2 text-start transition-all hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none cursor-pointer"
        >
          <Avatar className="size-9 shrink-0 rounded-lg border border-primary/20 shadow-xs transition-transform duration-150 group-hover:scale-105">
            <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-bold uppercase tracking-wider text-primary">
              {initials(name, email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
              {name}
            </span>
            <span
              className="truncate text-[11px] text-muted-foreground"
              dir="ltr"
            >
              {email}
            </span>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label={label}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl transition-all hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <Avatar className="size-8.5 rounded-lg border border-primary/20 shadow-xs">
            <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-bold uppercase tracking-wider text-primary">
              {initials(name, email)}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        align="end"
        className="w-60 border border-border/80 shadow-lg"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel className="grid gap-0.5 p-2.5">
          <span className="text-sm font-semibold text-foreground">{name}</span>
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
