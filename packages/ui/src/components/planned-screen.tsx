import { Compass } from "lucide-react";

/**
 * A destination that exists in navigation but has no workflow behind it yet.
 *
 * Not an error and not a 404: the route is real, the Organization is entitled
 * to it, and the screen is simply not built. Saying that plainly is better than
 * a blank page, and far better than a half-built screen that looks finished.
 *
 * It states what the screen is for and which section of the blueprint specifies
 * it, because the next person to open this file needs both before they can
 * start — and blueprint section 13 forbids building the tables behind it ahead
 * of the workflow that needs them, so "not built" is a position rather than an
 * oversight.
 */
export function PlannedScreen({
  blueprintSection,
  handoverHref,
  handoverLabel,
  heading,
  summary,
  title,
}: {
  /** e.g. "5.4" — the section that specifies this screen. */
  blueprintSection: string;
  handoverHref: string;
  handoverLabel: string;
  /** Localized "Planned". */
  heading: string;
  /** What this screen will do, in the reader's language. */
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
        {summary}
      </p>
      <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-5 text-step--1 text-muted-foreground">
        <a
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={handoverHref}
        >
          {handoverLabel}
        </a>
        <span className="tabular-nums opacity-70">
          Blueprint {blueprintSection}
        </span>
      </p>
    </section>
  );
}
