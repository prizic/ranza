import type { ReactNode } from "react";
import { Compass } from "lucide-react";

/**
 * A destination that exists in navigation but has no workflow behind it yet.
 *
 * Not an error and not a 404: the route is real, the Organization is entitled
 * to it, and the screen is simply not built. Saying that plainly is better than
 * a blank page, and far better than a half-built screen that looks finished.
 *
 * It says first that the screen cannot be used yet, then what it will do and
 * what has to exist first, and offers one way on. It names nothing a hotel
 * cannot act on: which document of the repository specifies it, and where, is
 * for the next developer and is in `docs/handover/operator-workspace-screens.md`,
 * not on a page an Owner opens (SHELL-08). Blueprint section 13 forbids building
 * the tables behind it ahead of the workflow that needs them, so "not built" is
 * a position rather than an oversight.
 */
export function PlannedScreen({
  action,
  heading,
  lead,
  summary,
  title,
}: {
  /** The one way on, so the screen is never a dead end (PORTAL-02). */
  action?: ReactNode;
  /** Localized "Coming later". */
  heading: string;
  /** Localized "Not available yet.": the first thing read, before what it will do. */
  lead: string;
  /** What this screen will do and what has to exist first, in the reader's language. */
  summary: string;
  /** The screen's own name, so the state is not anonymous. */
  title: string;
}) {
  return (
    // Named by `title` rather than repeating it: the page's own heading already
    // sets the screen's name large directly above.
    <section
      aria-label={title}
      className="max-w-2xl rounded-4xl border border-border/70 bg-card p-7 shadow-low sm:p-9"
    >
      <p className="flex items-center gap-3 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
        <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
          <Compass aria-hidden="true" className="size-5" />
        </span>
        {heading}
      </p>
      <p className="mt-7 text-2xl leading-snug font-light text-balance">
        {lead}
      </p>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        {summary}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
