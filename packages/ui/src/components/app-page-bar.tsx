import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export interface PageCrumb {
  /** Absent for a level that has no page of its own, such as a nav group. */
  href?: string | undefined;
  label: string;
}

/**
 * The bar above every surface, and the page's title under it.
 *
 * Leaders' header (leaders-portal/src/components/layout/header.tsx): a floating
 * glass bar that carries the trail — a quiet uppercase root, then the levels
 * above, then the page — with the page's controls on its end edge; and the title
 * itself set light at the head of the content, where it reads as the page rather
 * than as chrome.
 *
 * A page whose content opens with its own display type (Today sets the weekday)
 * passes `display={false}`, and the bar's last crumb becomes the heading
 * instead, so there is still exactly one `h1`.
 *
 * On a phone the bar's width goes to the Property, the language and the
 * account, and the page's name — set under the bar anyway, or opened by the
 * page's own display type — is left to assistive technology.
 *
 * `tabs` — the pages of the section this one belongs to — sit under the bar
 * rather than in it, where Leaders keeps nothing but the trail and its controls.
 *
 * The title arrives as a prop rather than being resolved from the pathname here,
 * because the routes are locale-prefixed and this package deliberately knows
 * nothing about locales.
 */
export function AppPageBar({
  action,
  breadcrumbLabel,
  crumbs = [],
  display = true,
  tabs,
  title,
}: {
  /** The page's controls, on the end edge of the bar. */
  action?: ReactNode;
  /** Names the trail's landmark. Localized; required once there are crumbs. */
  breadcrumbLabel?: string | undefined;
  /** The levels above this page, outermost first. Folded away on a phone,
      where the dock at the foot is the way back and the bar needs its width
      for the page's own controls. */
  crumbs?: readonly PageCrumb[];
  display?: boolean;
  tabs?: ReactNode;
  title: string;
}) {
  const leaf = display ? (
    <span
      aria-current="page"
      className="truncate text-sm font-semibold tracking-tight text-foreground max-sm:sr-only"
    >
      {title}
    </span>
  ) : (
    <h1 className="truncate text-sm font-semibold tracking-tight text-foreground max-sm:sr-only">
      {title}
    </h1>
  );

  return (
    <>
      <header className="glass-panel mb-6 flex h-16 shrink-0 items-center justify-between gap-4 rounded-2xl ps-4 pe-3 sm:px-6">
        {crumbs.length > 0 ? (
          <nav aria-label={breadcrumbLabel} className="min-w-0">
            <ol className="flex min-w-0 items-center gap-2">
              {crumbs.map((crumb, index) => (
                <li
                  className="hidden min-w-0 items-center gap-2 sm:flex"
                  key={`${index}-${crumb.label}`}
                >
                  <Crumb crumb={crumb} root={index === 0} />
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground/40 rtl:rotate-180"
                  />
                </li>
              ))}
              <li className="min-w-0">{leaf}</li>
            </ol>
          </nav>
        ) : (
          <div className="min-w-0">{leaf}</div>
        )}

        {/* A wrapper of its own: the action is an element serialized from a
            server component, and as one item of a children array React
            validates it as a dynamic child and asks for a key it cannot have. */}
        {action ? (
          <div className="ms-auto flex min-w-0 items-center gap-2 sm:gap-3">
            {action}
          </div>
        ) : null}
      </header>

      {tabs}

      {display ? (
        <h1 className="mb-1.5 text-2xl leading-tight font-light tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
      ) : null}
    </>
  );
}

function Crumb({ crumb, root }: { crumb: PageCrumb; root: boolean }) {
  const className = cn(
    "truncate font-medium transition-colors",
    root
      ? "text-xs tracking-wide text-muted-foreground uppercase opacity-70 hover:opacity-100"
      : "text-sm tracking-tight text-muted-foreground/60",
    crumb.href &&
      "flex min-h-11 items-center decoration-muted-foreground/30 underline-offset-4 hover:text-foreground hover:underline",
  );
  return crumb.href ? (
    <Link className={className} href={crumb.href}>
      {crumb.label}
    </Link>
  ) : (
    <span className={className}>{crumb.label}</span>
  );
}
