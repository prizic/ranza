"use client";

import { useSearchParams } from "next/navigation";

/**
 * The rack: every Property this viewer may reach, with the current one pulled.
 *
 * A client component for one reason — the selection lives in the query string,
 * and a router layout cannot read search parameters. There is nothing to
 * authorize here: the server already decided what may appear.
 *
 * The pulled slot is marked by a brass edge and a lifted surface, not by colour
 * alone (blueprint 18.5), and `aria-current` says the same thing to a reader.
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
    <nav
      aria-label={label}
      className="flex gap-px overflow-x-auto bg-petrol-line px-(--page) pt-px"
    >
      {slots.map((slot) => (
        <a
          aria-current={slot.id === selected ? "true" : undefined}
          className="border-t-2 border-transparent bg-petrol-lift px-4 py-2 text-step--1 whitespace-nowrap text-background/60 transition-colors hover:text-background aria-[current=true]:border-brass aria-[current=true]:bg-background aria-[current=true]:text-foreground"
          href={slot.href}
          key={slot.id}
        >
          {slot.name}
        </a>
      ))}
    </nav>
  );
}
