import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * The bar that names the page, above every surface.
 *
 * It is the top bar as well as the heading: a separate chrome row and a page
 * title underneath it were two bands saying one thing, and the bar's end was
 * empty on every page. The section switch and the page's primary control live
 * there instead of costing a row above the content.
 *
 * Ported from ryadh/mirhaal/apps/dashboard. The title arrives as a prop rather
 * than being resolved from the pathname here, because Ranza's routes are
 * locale-prefixed and this package deliberately knows nothing about locales.
 */
export function AppPageBar({
  action,
  parent,
  title,
  tabs,
}: {
  /** The page's primary control, on the end edge of the same bar. */
  action?: ReactNode;
  /** A child page names its parent so the bar can carry the way back. */
  parent?: { href: string; title: string };
  title: string;
  tabs?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 bg-card px-4 shadow-[inset_0_-1px_0_0_var(--border)] sm:px-6">
      <h1 className="flex min-w-0 items-center gap-1.5 text-2xl font-extrabold tracking-tight">
        {parent ? (
          <>
            {/* Context, not the page's name — muted so the leaf still reads as
                the heading. A link, because a trail that cannot be followed is
                decoration, and never hidden on small screens: on a phone this
                is the only way back out of a child page. */}
            <Link
              className="flex min-h-11 shrink-0 items-center transition-colors hover:text-primary"
              href={parent.href}
            >
              {parent.title}
            </Link>
            <ChevronLeft
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground ltr:-scale-x-100"
            />
          </>
        ) : null}
        <span
          className={
            parent
              ? // A sub-view of the section, not a page competing with it.
                "truncate text-lg font-semibold text-muted-foreground"
              : "truncate"
          }
        >
          {title}
        </span>
      </h1>

      <div className="ms-auto flex items-center gap-2">
        {tabs}
        {/* A wrapper of its own rather than sitting beside the tabs directly:
            it is an element serialized from a server component, and as one item
            of a two-child array React validates it as a dynamic child and asks
            for a key it cannot have. */}
        {action ? <div className="flex items-center">{action}</div> : null}
      </div>
    </header>
  );
}
