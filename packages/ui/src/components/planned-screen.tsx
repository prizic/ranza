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
    <section className="max-w-prose rounded-xl bg-card p-6 shadow-low">
      <p className="flex items-center gap-2 text-step--1 font-medium text-muted-foreground">
        <Compass aria-hidden="true" className="size-4" />
        {heading}
      </p>
      <h2 className="mt-3 text-step-1 font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{summary}</p>
      <p className="mt-4 text-step--1 text-muted-foreground">
        <a className="underline underline-offset-4" href={handoverHref}>
          {handoverLabel}
        </a>
        <span className="ms-2 tabular-nums opacity-70">
          Blueprint {blueprintSection}
        </span>
      </p>
    </section>
  );
}
