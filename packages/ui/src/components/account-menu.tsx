"use client";

import type { ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useSidebar } from "./sidebar-context";
import { cn } from "../lib/utils";

/**
 * First two letters of the name, or of the address when there is no name,
 * capitalised by the page's language — Turkish makes "i" into "İ", English
 * does not.
 */
function initials(name: string, email: string, locale: string): string {
  const source = name.trim() || email.trim();
  return source.slice(0, 2).toLocaleUpperCase(locale);
}

const CARD =
  "flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-white/50 bg-secondary/30 p-1.5 text-start select-none lg:gap-3 lg:rounded-2xl lg:p-2";

/**
 * The account control, in Leaders' two forms: the card at the foot of the
 * sidebar, with the name and address beside a round avatar, and the avatar
 * alone at the end of the page bar or in a collapsed sidebar.
 *
 * It is a menu only when there is something in it. An account with nothing to
 * offer — the Portal's, until it has a setting of its own — is drawn the same
 * way but announced as who is signed in, rather than as a button that opens
 * onto nothing.
 */
export function AccountMenu({
  children,
  email,
  label,
  locale,
  name,
  variant = "auto",
}: {
  /** What the account offers. */
  children?: ReactNode;
  email: string;
  /** Accessible name for the trigger. */
  label: string;
  /** The page's language, for capitalising the initials. */
  locale: string;
  name: string;
  variant?: "auto" | "compact" | "expanded" | undefined;
}) {
  const { collapsed, inSidebar } = useSidebar();
  const isExpanded =
    variant === "expanded" || (variant === "auto" && inSidebar && !collapsed);
  // Until a Staff Member has a display name the host passes the address as
  // both, and printing it twice says nothing the first line did not.
  const showEmail = name.trim() !== "" && name !== email;
  const letters = initials(name, email, locale);

  const identity = (
    <div className="flex min-w-0 flex-1 flex-col py-0.5">
      <span
        className="truncate text-sm leading-tight font-medium text-foreground/90 xl:text-[15px]"
        dir={showEmail ? undefined : "ltr"}
      >
        {name || email}
      </span>
      {showEmail ? (
        <span
          className="mt-0.5 truncate text-[11px] text-muted-foreground opacity-80 lg:text-xs"
          dir="ltr"
        >
          {email}
        </span>
      ) : null}
    </div>
  );

  if (!children) {
    return isExpanded ? (
      <div className={CARD}>
        <Initials letters={letters} size="md" />
        {identity}
      </div>
    ) : (
      <span className="inline-flex size-11 shrink-0 items-center justify-center md:size-9">
        <Initials letters={letters} size="sm" />
        <span className="sr-only">
          {label}: {name || email}
        </span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      {isExpanded ? (
        <DropdownMenuTrigger
          aria-label={label}
          className={cn(
            CARD,
            "group cursor-pointer transition-all duration-300 hover:bg-white/60 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <Initials letters={letters} size="md" />
          {identity}
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
          />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          aria-label={label}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:size-9"
        >
          <Initials letters={letters} size="sm" />
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        align="end"
        className="w-64"
        side={isExpanded ? "top" : "bottom"}
        sideOffset={8}
      >
        <DropdownMenuLabel className="grid gap-0.5">
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

/** Leaders' avatar: initials on a slate disc with a hairline ring. */
function Initials({ letters, size }: { letters: string; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={
        size === "md"
          ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-800 shadow-xs ring-1 ring-slate-200/80"
          : "flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-800 shadow-xs ring-1 ring-slate-200/80"
      }
    >
      {letters}
    </span>
  );
}
