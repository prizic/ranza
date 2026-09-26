"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  Landmark,
  Sparkles,
  ToggleRight,
  Wrench,
} from "lucide-react";
import { cn } from "@ranza/ui";

/**
 * Keyed by section so the server page can name its sections: a component is
 * not something a server component may hand to a client one.
 */
const ICONS = {
  organization: Landmark,
  property: Building2,
  time: CalendarClock,
  housekeeping: Sparkles,
  maintenance: Wrench,
  modules: ToggleRight,
  elsewhere: ExternalLink,
} as const;

export type SectionId = keyof typeof ICONS;

export interface Section {
  id: SectionId;
  label: string;
}

/**
 * The page's sections at a glance (CF-S3-09): a list beside the cards on a
 * wide screen, a row of chips above them on a narrow one. The section being
 * read is marked, so the list doubles as "where am I".
 *
 * Links rather than buttons: each is an anchor, so it works before the script
 * does, can be opened or copied, and the browser's own back returns to it.
 */
export function SectionNav({
  label,
  sections,
}: {
  label: string;
  sections: readonly Section[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);
    // A section counts as being read once it crosses the upper third of the
    // viewport — the reader's eye, not the top edge a sticky bar covers.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    targets.forEach((target) => observer.observe(target));

    // The last sections are short and can never reach that band, so at the
    // foot of the page the last one is the one being read.
    const last = sections.at(-1)?.id;
    function atTheFoot() {
      const bottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 1;
      if (bottom && last) setActive(last);
    }
    window.addEventListener("scroll", atTheFoot, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", atTheFoot);
    };
  }, [sections]);

  function jump(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: still ? "auto" : "smooth",
      block: "start",
    });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

  return (
    <nav
      aria-label={label}
      className="min-w-0 lg:sticky lg:top-24 lg:self-start"
    >
      <p className="mb-3 hidden text-xs font-medium tracking-wider text-muted-foreground uppercase lg:block">
        {label}
      </p>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
        {sections.map(({ id, label: name }) => {
          const current = id === active;
          const Icon = ICONS[id];
          return (
            <li className="shrink-0 lg:w-full" key={id}>
              <a
                aria-current={current ? "location" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-step--1 whitespace-nowrap transition-colors lg:w-full lg:rounded-lg lg:border-transparent lg:px-3 lg:py-2 lg:whitespace-normal",
                  current
                    ? "border-primary/30 bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                href={`#${id}`}
                onClick={(event) => {
                  event.preventDefault();
                  jump(id);
                }}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 text-start leading-snug">
                  {name}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
