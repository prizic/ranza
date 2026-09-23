"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface LocaleOption {
  code: string;
  nativeName: string;
  flag: string;
}

/** Each language named in itself, so a reader lost in the wrong one can still
    find their own. */
const LOCALES: readonly [LocaleOption, ...LocaleOption[]] = [
  { code: "tr", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "en", nativeName: "English", flag: "🇬🇧" },
  { code: "ar", nativeName: "العربية", flag: "🇸🇦" },
];

/** Exactly one way to build the links: an option that goes nowhere is worse
    than no switcher. */
type LinkSource =
  | {
      /** `/{locale}/sign-in`: a string, so a server component can pass it. */
      hrefPattern: string;
      getHref?: never;
    }
  | {
      /** For a client host that builds each link itself, e.g. to keep the
          query string. */
      getHref: (locale: string) => string;
      hrefPattern?: never;
    };

export type LanguageSwitcherProps = LinkSource & {
  className?: string;
  currentLocale: string;
  /** Accessible name for the trigger. Localized. */
  label?: string;
  /** `header` is the round flag in the page bar; `pill` adds the name, for
      the sign-in screens where it is the only control in its corner. */
  variant?: "header" | "pill";
};

/**
 * The language control, after the Leaders portal's: the current flag, opening
 * onto every language by its own name.
 *
 * Each option is a link to the same page in that language. The locale lives in
 * the URL, so the link is the whole mechanism — there is nothing to persist.
 */
export function LanguageSwitcher({
  className,
  currentLocale,
  getHref,
  hrefPattern,
  label = "Change language",
  variant = "header",
}: LanguageSwitcherProps) {
  const currentOption =
    LOCALES.find((option) => option.code === currentLocale) ?? LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "inline-flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none",
          variant === "header"
            ? "size-11 rounded-full border md:size-9 border-border/60 bg-card text-sm shadow-2xs hover:bg-secondary"
            : "glass h-11 gap-2 md:h-10 rounded-full px-4 text-sm font-medium shadow-xs hover:bg-secondary",
          className,
        )}
      >
        <span className="text-base shrink-0 leading-none">
          {currentOption.flag}
        </span>
        {variant === "pill" && (
          <>
            <span className="text-xs font-semibold text-foreground">
              {currentOption.nativeName}
            </span>
            <ChevronDown className="size-3 text-muted-foreground opacity-70 shrink-0" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={variant === "header" ? "end" : "center"}
        className="w-48 rounded-2xl"
        sideOffset={6}
      >
        {LOCALES.map((option) => {
          const isActive = option.code === currentLocale;
          const href = getHref
            ? getHref(option.code)
            : hrefPattern.replace("{locale}", option.code);

          const content = (
            <>
              <span className="text-base shrink-0 leading-none">
                {option.flag}
              </span>
              <span
                className={cn(
                  "flex-1 text-xs font-medium",
                  isActive
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {option.nativeName}
              </span>
              {isActive && (
                <Check className="size-3.5 text-primary shrink-0 ms-auto" />
              )}
            </>
          );

          return (
            <DropdownMenuItem
              asChild
              className="cursor-pointer gap-2.5 rounded-xl px-2.5 py-2 focus:bg-secondary focus:text-secondary-foreground"
              key={option.code}
            >
              <a
                aria-current={isActive ? "true" : undefined}
                href={href}
                hrefLang={option.code}
                lang={option.code}
              >
                {content}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
