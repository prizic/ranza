"use client";

import { useSelectedLayoutSegment } from "next/navigation";

/**
 * The primary navigation, with the current destination marked.
 *
 * A client component for one reason — which item is current depends on the
 * route, and a router layout cannot read the pathname. The same reason the
 * Property rack is one. There is nothing to authorize here: the server already
 * decided what may appear, and an item the viewer is not entitled to never
 * reaches this list.
 */
export function WorkspaceNav({
  items,
  label,
}: {
  items: readonly { href: string; label: string; segment: string }[];
  label: string;
}) {
  const segment = useSelectedLayoutSegment();

  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className="primary-nav">
      {items.map((item) => (
        <a
          aria-current={item.segment === segment ? "page" : undefined}
          href={item.href}
          key={item.href}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
