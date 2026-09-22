import type { ReactNode } from "react";
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
 * Taken from the Leaders portal: a floating glass bar that carries the trail —
 * a quiet uppercase root, then the levels above, then the page — with the
 * section switch and the page's controls on its end edge; and the title itself
 * set large and light at the head of the content, where it reads as the page
 * rather than as chrome.
 *
 * A page whose content opens with its own display type (Today sets the weekday)
 * passes `display={false}`, and the bar's last crumb becomes the heading
 * instead, so there is still exactly one `h1`.
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
  /** The page's primary control, on the end edge of the bar. */
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
    <span aria-current="page" className="truncate text-sm font-semibold">
      {title}
    </span>
  ) : (
    <h1 className="truncate text-sm font-semibold tracking-normal">{title}</h1>
  );

  return (
    <>
      <header className="glass-panel sticky top-3 z-20 mx-4 mt-3 flex h-16 shrink-0 items-center justify-between gap-3 rounded-2xl px-4 sm:mx-6 sm:px-6 md:mx-8">
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

        <div className="ms-auto flex items-center gap-2">
          {tabs}
          {/* A wrapper of its own rather than sitting beside the tabs directly:
              it is an element serialized from a server component, and as one
              item of a two-child array React validates it as a dynamic child
              and asks for a key it cannot have. */}
          {action ? <div className="flex items-center">{action}</div> : null}
        </div>
      </header>

      {display ? (
        <h1 className="mx-4 mt-7 text-4xl leading-tight font-light tracking-tight text-foreground sm:mx-6 md:mx-8 md:mt-9 md:text-5xl">
          {title}
        </h1>
      ) : null}
    </>
  );
}

function Crumb({ crumb, root }: { crumb: PageCrumb; root: boolean }) {
  const className = cn(
    "truncate transition-colors",
    root
      ? "text-xs font-medium tracking-wide uppercase text-muted-foreground/70"
      : "text-sm font-medium text-muted-foreground/70",
    crumb.href &&
      "flex min-h-11 items-center hover:text-foreground hover:underline decoration-muted-foreground/30 underline-offset-4",
  );
  return crumb.href ? (
    <a className={className} href={crumb.href}>
      {crumb.label}
    </a>
  ) : (
    <span className={className}>{crumb.label}</span>
  );
}
