"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { DepartureView } from "@ranza/reservations";
import type { SupportedLocale } from "@ranza/i18n";
import { ListFilterNotice } from "../../today/components/list-filter-notice";
import { money } from "../../today/format";
import {
  inDepartureFilter,
  totals,
  type DepartureFilter,
} from "../../today/views";
import { frontOfficeKeys, type Scope } from "../query-keys";
import { fetchDepartures } from "../queries";
import { DeparturesTable } from "./departures-table";
import { ListFreshness } from "./list-freshness";

/**
 * Departures, on a screen that stays open.
 *
 * The same shape as `LiveArrivals` and for the same reason: two desks check
 * Guests out at once, and a list read once at page load keeps offering to
 * check out somebody a colleague already sent home.
 */
export function LiveDepartures({
  allHref,
  filter,
  locale,
  scope,
  timeZone,
  view,
}: {
  /** This list unnarrowed, for the way back from a figure on Today. */
  allHref: string;
  /** The part of the day a figure on Today counted (TD-S5-01). */
  filter: DepartureFilter | null;
  locale: SupportedLocale;
  scope: Scope;
  /** The Property's own clock, which the freshness line is told in. */
  timeZone: string;
  view: DepartureView;
}) {
  const t = useTranslations();
  const { data, dataUpdatedAt, error } = useQuery({
    queryKey: frontOfficeKeys.departures(scope, view),
    queryFn: () => fetchDepartures(scope.propertyId, view),
    refetchInterval: 30_000,
  });

  // Present on first paint from the prefetch. A refusal leaves the last good
  // rows on screen rather than blanking a working list.
  const rows = (data ?? []).filter((departure) =>
    inDepartureFilter(filter, departure),
  );
  const first = rows[0];
  const viewOnly =
    rows.length > 0 && rows.every((departure) => !departure.mayCheckOut);
  const chips = [
    { href: allHref, label: t("departuresChipAll"), filter: null },
    {
      href: `${allHref}&show=owing`,
      label: t("departuresChipOwing"),
      filter: "owing",
    },
    {
      href: `${allHref}&show=overdue_owing`,
      label: t("departuresChipOverdueOwing"),
      filter: "overdue_owing",
    },
  ] as const;
  return (
    <>
      {view === "due" ? (
        <nav
          aria-label={t("departuresFilters")}
          className="mt-3 flex flex-wrap gap-2"
        >
          {chips.map((chip) => (
            <Link
              aria-current={chip.filter === filter ? "page" : undefined}
              className={
                chip.filter === filter
                  ? "inline-flex min-h-8 items-center rounded-full border border-primary bg-primary/10 px-3 text-step--1 font-medium"
                  : "inline-flex min-h-8 items-center rounded-full border px-3 text-step--1 text-muted-foreground hover:text-foreground"
              }
              href={chip.href}
              key={chip.label}
              prefetch={false}
            >
              {chip.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <ListFreshness
        error={error}
        locale={locale}
        timeZone={timeZone}
        updatedAt={dataUpdatedAt}
      />
      {viewOnly ? (
        <p className="mt-3 text-step--1 text-muted-foreground">
          {t("viewOnlyDepartures")}
        </p>
      ) : null}
      {filter === null ? null : (
        <div className="mt-4">
          <ListFilterNotice
            allHref={allHref}
            count={rows.length}
            detail={
              first
                ? money(
                    totals(
                      rows.map((row) => ({
                        amountMinor: row.balanceMinor,
                        currency: row.currency,
                      })),
                    ),
                    first.currency,
                    locale,
                  )
                : undefined
            }
            filter={filter === "owing" ? "filterOwing" : "filterOverdueOwing"}
          />
        </div>
      )}
      <DeparturesTable
        departures={rows}
        filtered={
          filter === null ? null : { allHref, others: (data ?? []).length }
        }
        locale={locale}
        propertyId={scope.propertyId}
        view={view}
      />
    </>
  );
}
