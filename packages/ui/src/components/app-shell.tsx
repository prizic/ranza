import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * The frame: a sidebar down the start edge and the page as one white sheet set
 * into the margin around it. The sidebar has no panel of its own — it is the
 * frame's colour, so the two read as one surface and the sheet is the only
 * white thing on the screen. On a phone the frame is dropped and the sheet is
 * the page; the rail is replaced by a dock at the foot, which is why `main`
 * reserves room for it — and none when there is no dock. A frame with neither
 * carries its navigation in the page bar, and the sheet is set in on every
 * side because no sidebar supplies the start edge's margin.
 *
 * Every part is a slot. The rail needs the navigation tree, which carries icon
 * components and therefore cannot cross the server/client boundary; the page
 * bar needs the route's title, which is locale-prefixed. Both are things only
 * the host knows, so this holds the arrangement and nothing else.
 *
 * The page scrolls as the document does, not inside the sheet, so sticky
 * elements and scroll restoration keep working as they would on any page.
 */
export function AppShell({
  bottomNav,
  children,
  pageBar,
  rail,
  skipLabel,
  style,
}: {
  bottomNav?: ReactNode;
  children: ReactNode;
  pageBar?: ReactNode;
  rail?: ReactNode;
  /** Localized: this is the first thing a keyboard user hears. */
  skipLabel: string;
  /** Theme tokens for everything inside the frame: an Organization's brand. */
  style?: CSSProperties | undefined;
}) {
  return (
    <div className="min-h-svh bg-background md:bg-frame" style={style}>
      <div className="mx-auto flex min-h-svh max-w-[1920px]">
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
          href="#main-content"
        >
          {skipLabel}
        </a>

        {rail}

        <div
          className={cn("min-w-0 flex-1 md:py-3 md:pe-3", !rail && "md:ps-3")}
        >
          <div className="flex min-h-svh flex-col bg-background md:min-h-[calc(100svh-1.5rem)] md:rounded-sheet">
            {pageBar}
            <main
              className={cn(
                "w-full flex-1 px-4 focus:outline-none md:px-8 md:pb-12",
                bottomNav
                  ? "pb-[calc(5.625rem+env(safe-area-inset-bottom))]"
                  : "pb-12",
              )}
              id="main-content"
              tabIndex={-1}
            >
              {children}
            </main>
          </div>
        </div>

        {bottomNav}
      </div>
    </div>
  );
}
