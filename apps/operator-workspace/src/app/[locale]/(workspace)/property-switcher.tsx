"use client";

import { useSearchParams } from "next/navigation";

/**
 * Chooses which Property the shell is looking at.
 *
 * A client component for one reason: the selection lives in the query string,
 * and a router layout cannot read search parameters. Everything it can show was
 * already filtered by the server — this list is what the viewer may reach, so
 * there is nothing here to authorize.
 */
export function PropertySwitcher({
  label,
  options,
}: {
  label: string;
  options: readonly { href: string; id: string; name: string }[];
}) {
  const selected = useSearchParams().get("property") ?? options[0]?.id;

  if (options.length < 2) return null;

  return (
    <nav aria-label={label} className="locale-nav">
      {options.map((option) => (
        <a
          aria-current={option.id === selected ? "true" : undefined}
          href={option.href}
          key={option.id}
        >
          {option.name}
        </a>
      ))}
    </nav>
  );
}
