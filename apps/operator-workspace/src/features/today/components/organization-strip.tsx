"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import { rememberProperty } from "../../../lib/property-choice";
import type { TodayStripEntry } from "../../../server/viewer";
import { percent } from "../format";
import { todayKeys, type TodayScope } from "../query-keys";

/** Each Property is a whole Today to read, so the strip asks rarely. */
const STRIP_REFRESH_MS = 300_000;

async function fetchStrip(
  propertyId: string,
): Promise<readonly TodayStripEntry[]> {
  const response = await fetch(
    `/api/today/properties?property=${encodeURIComponent(propertyId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw Object.assign(new Error("the strip could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as {
    entries: readonly TodayStripEntry[];
  };
  return body.entries;
}

/**
 * Every Property of the Organization the viewer has Today at, each with its own
 * occupancy and how many things need attention there (TD-S3-03). Absent with
 * one Property, where it would compare a Property with itself.
 *
 * Choosing one is a full load, like the switcher (ADR 0019): a new document
 * drops the client cache by construction, so nothing of one Property's day is
 * ever shown under another's name. The Property is remembered on the device as
 * the switcher does.
 *
 * The names arrive with the page and the figures after it, so the strip is
 * there at once and fills in; a Property whose figures could not be read says
 * so rather than reading zero.
 */
export function OrganizationStrip({
  locale,
  properties,
  scope,
}: {
  locale: SupportedLocale;
  /** The Organization's Properties with Today, names only: the page's own. */
  properties: readonly { propertyId: string; propertyName: string }[];
  scope: TodayScope;
}) {
  const t = useTranslations("dashboard");
  const { data } = useQuery({
    queryKey: todayKeys.strip(scope),
    queryFn: () => fetchStrip(scope.propertyId),
    refetchInterval: STRIP_REFRESH_MS,
    // One Property has no strip, and nothing to read for it.
    enabled: properties.length > 1,
  });

  if (properties.length < 2) return null;

  return (
    <section aria-labelledby="today-properties">
      <h2 className="text-base font-semibold" id="today-properties">
        {t("stripTitle")}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => {
          const entry = data?.find((e) => e.propertyId === property.propertyId);
          const current = property.propertyId === scope.propertyId;
          const share = entry?.occupancy
            ? percent(entry.occupancy.inHouse, entry.occupancy.sellable, locale)
            : null;
          return (
            <li key={property.propertyId}>
              {/* A full load rather than a Link, on purpose: see above. */}
              <a
                aria-current={current ? "true" : undefined}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-[1.25rem] border bg-card px-5 py-3.5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  current
                    ? "border-primary ring-1 ring-primary"
                    : "border-slate-100",
                )}
                href={`${localizeHref(locale, "today")}?property=${encodeURIComponent(property.propertyId)}`}
                onClick={() => rememberProperty(property.propertyId)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    <bdi>{property.propertyName}</bdi>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {entry === undefined
                      ? "…"
                      : entry.attention === null
                        ? t("stripUnread")
                        : t("stripAttention", { count: entry.attention })}
                    {entry && entry.attention !== null && !entry.complete
                      ? ` · ${t("stripPartial")}`
                      : null}
                  </span>
                </span>
                <span className="text-2xl font-light tabular-nums">
                  {share ?? "—"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
