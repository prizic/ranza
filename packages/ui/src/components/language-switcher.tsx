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
  /** Names the control, localized; the current language is added to it,
      so the name holds the words the pill shows and a voice user can say
      them. */
  label?: string;
  /** `header` is the round flag in the page bar; `pill` adds the name, for
      the sign-in screens where it is the only control in its corner. */
  variant?: "header" | "pill";
};

/**
 * The language control, as the Leaders portal draws it: the current flag alone
 * in the page bar, or flag and name on the sign-in screen, opening onto every
 * language by its own name.
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
        aria-label={`${label}: ${currentOption.nativeName}`}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          variant === "header"
            ? "size-11 rounded-full text-lg hover:bg-secondary md:size-9"
            : "h-11 gap-3 rounded-lg border border-border/50 bg-background/80 px-4 backdrop-blur-sm hover:bg-secondary md:h-10",
          className,
        )}
      >
        <span aria-hidden="true" className="leading-none">
          {currentOption.flag}
        </span>
        {variant === "pill" ? (
          <>
            <span className="text-sm font-medium">
              {currentOption.nativeName}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 opacity-50"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LOCALES.map((option) => {
          const isActive = option.code === currentLocale;
          const href = getHref
            ? getHref(option.code)
            : hrefPattern.replace("{locale}", option.code);

          return (
            <DropdownMenuItem
              asChild
              className="relative cursor-pointer gap-2 ps-8"
              key={option.code}
            >
              <a
                aria-current={isActive ? "true" : undefined}
                href={href}
                hrefLang={option.code}
                lang={option.code}
              >
                {isActive ? (
                  <Check
                    aria-hidden="true"
                    className="absolute start-2 size-4"
                  />
                ) : null}
                <span aria-hidden="true">{option.flag}</span>
                <span>{option.nativeName}</span>
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
