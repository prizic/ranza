"use client";

import { useSearchParams } from "next/navigation";

/**
 * The rack: every Property this viewer may reach, with the current one pulled.
 *
 * A client component for one reason — the selection lives in the query string,
 * and a router layout cannot read search parameters. There is nothing to
 * authorize here: the server already decided what may appear.
 */
export function PropertyRack({
  label,
  slots,
}: {
  label: string;
  slots: readonly { href: string; id: string; name: string }[];
}) {
  const selected = useSearchParams().get("property") ?? slots[0]?.id;

  if (slots.length === 0) return null;

  return (
    <nav aria-label={label} className="rack">
      {slots.map((slot) => (
        <a
          aria-current={slot.id === selected ? "true" : undefined}
          href={slot.href}
          key={slot.id}
        >
          {slot.name}
        </a>
      ))}
    </nav>
  );
}
