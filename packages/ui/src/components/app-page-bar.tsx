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
 * The bar across the head of the page's sheet, and the page's title under it.
 *
 * The bar carries the trail — a quiet uppercase root, then the levels above,
 * then the page — with the page's controls on its end edge, and is divided from
 * the content by a hairline rather than floated above it. The title itself is
 * set light at the head of the content, where it reads as the page rather than
 * as chrome.
 *
 * A page whose content opens with its own display type (Today sets the weekday)
 * passes `display={false}`, and the bar's last crumb becomes the heading
 * instead, so there is still exactly one `h1`.
 *
 * On a phone the bar's width goes to the way up, the Property, the language
 * and the account, and the page's name — set under the bar anyway — is left to
 * assistive technology. A page that opens with display type of its own keeps
 * its name in the bar on a phone, since nothing under the bar names it as the
 * page (TODAY-21).
 *
 * `chips` — every page the person reaches, for a role with so few that the frame
 * has no sidebar (`NavChips`) — take the trail's place: the brand, the way up,
 * and the chips, which wrap onto a row of their own below a laptop's width, so
 * a tablet gives them the whole row and not what the controls leave. The
 * page's name is then left to assistive technology, as on a phone, because the
 * chip that is lit names it.
 *
 * `tabs` — the pages of the section this one belongs to — sit under the bar
 * rather than in it, where the bar keeps nothing but the trail and its controls.
 *
 * The title arrives as a prop rather than being resolved from the pathname here,
 * because the routes are locale-prefixed and this package deliberately knows
 * nothing about locales.
 */
export function AppPageBar({
  action,
  back,
  brand,
  breadcrumbLabel,
  chips,
  crumbs = [],
  display = true,
  tabs,
  title,
}: {
  /** The page's controls, on the end edge of the bar. */
  action?: ReactNode;
  /** The way up from an inner page, at the leading edge. Absent on the root. */
  back?: ReactNode;
  /** A mark after the way up and before the title: an Organization's logo, or the product's where there is no sidebar to carry it. */
  brand?: ReactNode;
  /** Names the trail's landmark. Localized; required once there are crumbs. */
  breadcrumbLabel?: string | undefined;
  /** The levels above this page, outermost first. Folded away on a phone,
      where `back` is the way up and the bar needs its width for the page's
      own controls. */
  crumbs?: readonly PageCrumb[];
  /** Every reachable page as chips, in place of the trail. */
  chips?: ReactNode;
  display?: boolean;
  tabs?: ReactNode;
  title: string;
}) {
  const leafClass = cn(
    "truncate text-sm font-semibold tracking-tight text-foreground",
    chips ? "sr-only" : display ? "max-sm:sr-only" : "",
  );
  const leaf = display ? (
    <span aria-current="page" className={leafClass}>
      {title}
    </span>
  ) : (
    <h1 className={leafClass}>{title}</h1>
  );

  return (
    <>
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-x-4 border-b border-border pe-4 md:pe-8",
          chips ? "min-h-16 flex-wrap py-2 xl:flex-nowrap" : "h-16",
          back ? "ps-2 md:ps-6" : "ps-4 md:ps-8",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 sm:gap-3",
            chips ? "xl:flex-1" : "flex-1",
          )}
        >
          {back}
          {brand}
          {chips ? (
            <>
              {leaf}
              <div className="hidden min-w-0 flex-1 xl:block">{chips}</div>
            </>
          ) : crumbs.length > 0 ? (
            <nav aria-label={breadcrumbLabel} className="min-w-0 flex-1">
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
                {/* The page's own name keeps its width and the levels above it
                    give way, so a narrow bar never shows a trail that stops
                    short of where the person is. */}
                <li className="max-w-full min-w-0 shrink-0 truncate">{leaf}</li>
              </ol>
            </nav>
          ) : (
            <div className="min-w-0 flex-1 truncate">{leaf}</div>
          )}
        </div>

        {/* A wrapper of its own: the action is an element serialized from a
            server component, and as one item of a children array React
            validates it as a dynamic child and asks for a key it cannot have. */}
        {action ? (
          <div
            className={cn(
              "ms-auto flex min-w-0 items-center gap-2 sm:gap-3",
              chips ? "shrink" : "shrink-0",
            )}
          >
            {action}
          </div>
        ) : null}
        {chips ? <div className="w-full min-w-0 xl:hidden">{chips}</div> : null}
      </header>

      {/* Present even when empty: its top padding is the space between the bar
          and the content on a page with no title or tabs of its own. */}
      <div className="px-4 pt-6 md:px-8">
        {tabs}

        {display ? (
          <h1 className="mb-1.5 text-2xl leading-tight font-light tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
        ) : null}
      </div>
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
