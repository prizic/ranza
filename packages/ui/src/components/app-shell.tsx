import type { ReactNode } from "react";

/**
 * The frame: a rail down the start edge, a page bar across the top of what is
 * left, and the work surface under it. On a phone the rail is replaced by a
 * dock at the foot, which is why `main` reserves room for it.
 *
 * Every part is a slot. The rail needs the navigation tree, which carries icon
 * components and therefore cannot cross the server/client boundary; the page
 * bar needs the route's title, which is locale-prefixed. Both are things only
 * the host knows, so this holds the arrangement and nothing else.
 */
export function AppShell({
  bottomNav,
  children,
  pageBar,
  rail,
  skipLabel,
}: {
  bottomNav?: ReactNode;
  children: ReactNode;
  pageBar?: ReactNode;
  rail?: ReactNode;
  /** Localized: this is the first thing a keyboard user hears. */
  skipLabel: string;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        href="#main-content"
      >
        {skipLabel}
      </a>

      {rail}

      <div className="flex min-w-0 flex-1 flex-col">
        {pageBar}
        <main
          className="w-full flex-1 px-4 py-5 pb-[calc(4.75rem+env(safe-area-inset-bottom))] focus:outline-none sm:px-6 sm:py-6 md:px-8 md:pb-8"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      {bottomNav}
    </div>
  );
}
