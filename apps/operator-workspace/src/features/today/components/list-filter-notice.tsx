"use client";

import Link from "next/link";
import { ListFilter } from "lucide-react";
import { useTranslations } from "next-intl";

/** What a list was narrowed to by a figure on Today (TD-S5-01). */
export type ListFilterKey =
  | "filterArrivalsToCome"
  | "filterOwing"
  | "filterOverdueOwing"
  | "filterInService"
  | "filterReady"
  | "filterAwaitingInspection"
  | "filterDirty"
  | "filterOutOfService"
  | "filterForArrival"
  | "filterCleanFirst"
  | "filterFloor"
  | "filterNoFloor"
  | "filterOpenFolios";

/**
 * Says a list is showing part of itself, how many rows that is, and the way
 * back to all of it. A narrowed list that did not say so would read as a
 * Property with few arrivals, rooms or Folios.
 *
 * The count is the number the figure on Today showed, so it is the number the
 * reader came to check.
 */
export function ListFilterNotice({
  allHref,
  count,
  detail,
  filter,
  floor,
}: {
  /** The same list, unnarrowed. */
  allHref: string;
  count: number;
  /** A total the filtered rows add up to, already formatted. */
  detail?: string | undefined;
  filter: ListFilterKey;
  floor?: string | undefined;
}) {
  const t = useTranslations("dashboard");

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-4 py-2.5 text-step--1"
      data-testid="list-filter-notice"
      role="status"
    >
      <ListFilter
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="font-medium">
        {t(filter, { count, floor: floor ?? "" })}
      </span>
      {detail ? (
        <span className="text-muted-foreground tabular-nums">{detail}</span>
      ) : null}
      <Link
        className="ms-auto font-semibold text-primary hover:underline"
        href={allHref}
        prefetch={false}
      >
        {t("filterShowAll")}
      </Link>
    </div>
  );
}
