"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { Departure } from "@ranza/reservations";
import { EmptyState, StatusBadge, cn } from "@ranza/ui";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type {
  ArrivalRow,
  ArrivalsCard,
  DepartureRow,
  DeparturesCard,
  Section,
} from "../../../server/today-derive";
import { CheckInAction } from "../../front-office/components/check-in-action";
import { CheckOutDialog } from "../../front-office/components/check-out-dialog";
import { frontOfficeKeys } from "../../front-office/query-keys";
import { fetchDepartures } from "../../front-office/queries";
import { unitLabel } from "../../front-office/unit-label";
import { todayHref } from "../links";
import type { TodayScope } from "../query-keys";
import { money, nights } from "../format";
import { SectionUnavailable } from "./section-unavailable";

type Tab = "arrivals" | "departures";

/**
 * Who is coming and who is going, the first few of each (TD-S1-10, TD-S1-12).
 *
 * The switch between the two is this card's own state rather than a link: the
 * page is one read, and swapping which half of it is shown is not a
 * navigation. Each row is a way into the list it came from, where the command
 * that acts on it lives.
 */
export function MovementsCard({
  arrivals,
  currency,
  departures,
  locale,
  onChanged,
  onRetry,
  scope,
}: {
  arrivals: Section<ArrivalsCard> | undefined;
  currency: string;
  departures: Section<DeparturesCard> | undefined;
  locale: SupportedLocale;
  /** Somebody was checked in or out from a row: read the day again. */
  onChanged: () => void;
  onRetry: () => void;
  scope: TodayScope;
}) {
  const t = useTranslations("dashboard");
  const propertyId = scope.propertyId;
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>(arrivals ? "arrivals" : "departures");

  // What the Departures screen reads, for the dialog a row opens: the bill
  // under review is that screen's, not a copy Today derived, and Today's own
  // summary carries no balance for a viewer who may not see money (TD-S1-03).
  const mayCheckOut =
    departures?.status === "ok" &&
    departures.data.rows.some((row) => row.mayCheckOut);
  const full = useQuery({
    queryKey: frontOfficeKeys.departures(scope, "due"),
    queryFn: () => fetchDepartures(propertyId, "due"),
    enabled: mayCheckOut,
    refetchInterval: 60_000,
  });
  // A check-in or check-out moves a row on the screens beside this one too.
  const changed = useCallback(() => {
    void client.invalidateQueries({ queryKey: frontOfficeKeys.all(scope) });
    onChanged();
  }, [client, onChanged, scope]);

  const toCome =
    arrivals?.status === "ok"
      ? arrivals.data.expected - arrivals.data.checkedIn
      : null;
  const stillHere =
    departures?.status === "ok"
      ? departures.data.due - departures.data.departed + departures.data.overdue
      : null;

  return (
    <section
      aria-labelledby="today-movements"
      className={cn(
        "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6",
        [arrivals, departures].some(
          (section) => section?.status === "ok" && section.stale,
        ) && "opacity-70",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="today-movements">
          {t("movements")}
        </h2>
        <div
          aria-labelledby="today-movements"
          className="inline-flex rounded-full bg-muted p-1"
          onKeyDown={(event) => {
            const other = tab === "arrivals" ? "departures" : "arrivals";
            const available = other === "arrivals" ? arrivals : departures;
            if (
              available &&
              (event.key === "ArrowLeft" || event.key === "ArrowRight")
            ) {
              setTab(other);
              document.getElementById(`today-tab-${other}`)?.focus();
            }
          }}
          role="tablist"
        >
          {arrivals ? (
            <TabButton
              active={tab === "arrivals"}
              id="arrivals"
              onClick={() => setTab("arrivals")}
            >
              {t("tabArrivals", {
                count: toCome === null ? "–" : formatNumber(toCome, locale),
              })}
            </TabButton>
          ) : null}
          {departures ? (
            <TabButton
              active={tab === "departures"}
              id="departures"
              onClick={() => setTab("departures")}
            >
              {t("tabDepartures", {
                count:
                  stillHere === null ? "–" : formatNumber(stillHere, locale),
              })}
            </TabButton>
          ) : null}
        </div>
      </div>

      <div
        aria-labelledby={`today-tab-${tab}`}
        id="today-movements-panel"
        role="tabpanel"
      >
        {tab === "arrivals" && arrivals ? (
          arrivals.status === "unavailable" ? (
            <SectionUnavailable onRetry={onRetry} />
          ) : (
            <ArrivalRows
              locale={locale}
              onChanged={changed}
              propertyId={propertyId}
              remaining={toCome ?? 0}
              rows={arrivals.data.rows}
            />
          )
        ) : null}
        {tab === "departures" && departures ? (
          departures.status === "unavailable" ? (
            <SectionUnavailable onRetry={onRetry} />
          ) : (
            <DepartureRows
              currency={currency}
              full={full.data ?? []}
              locale={locale}
              onChanged={changed}
              propertyId={propertyId}
              rows={departures.data.rows}
              total={stillHere ?? 0}
            />
          )
        ) : null}
      </div>
    </section>
  );
}

function TabButton({
  active,
  children,
  id,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  id: Tab;
  onClick: () => void;
}) {
  return (
    <button
      aria-controls="today-movements-panel"
      aria-selected={active}
      className={cn(
        "min-h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
      )}
      id={`today-tab-${id}`}
      onClick={onClick}
      role="tab"
      tabIndex={active ? 0 : -1}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * A row is the way in and, beside it, the command that acts on it: two
 * controls, not one inside the other. The way in fills the row, so the whole of
 * it still opens the list (TD-S1-22).
 */
const ROW =
  "flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl bg-muted/60 pe-3 transition-colors hover:bg-muted";
const ROW_LINK =
  "flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function ArrivalRows({
  locale,
  onChanged,
  propertyId,
  remaining,
  rows,
}: {
  locale: SupportedLocale;
  onChanged: () => void;
  propertyId: string;
  remaining: number;
  rows: readonly ArrivalRow[];
}) {
  const t = useTranslations("dashboard");
  const stay = useTranslations("stayType");
  const href = todayHref(locale, "arrivals", propertyId);
  const toCome = todayHref(locale, "arrivals", propertyId, { show: "to_come" });

  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            href={todayHref(locale, "reservations", propertyId)}
          >
            {t("openReservations")}
          </Link>
        }
        description={t("noArrivalsDescription")}
        title={t("noArrivalsTitle")}
      />
    );
  }

  return (
    <>
      <ul className="grid gap-2">
        {rows.map((row) => {
          const length = nights(row.startsOn, row.endsOn);
          return (
            <li className={ROW} key={row.reservationId}>
              <Link className={ROW_LINK} href={href} prefetch={false}>
                <span className="min-w-40 flex-1">
                  <span className="block font-semibold">
                    <bdi>{row.guestName ?? row.reference}</bdi>
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    <bdi>{row.reference}</bdi> · {stay(row.stayType)}
                  </span>
                </span>
                <span className="w-20 tabular-nums">
                  <bdi>{unitLabel(row.unit.roomName, row.unit.unitName)}</bdi>
                </span>
                <span className="w-44">
                  <ArrivalBadge row={row} />
                </span>
                <span className="w-28 text-sm text-muted-foreground">
                  {length === null
                    ? t("openEnded")
                    : t("nights", { count: length })}
                </span>
              </Link>
              {row.mayCheckIn ? (
                <CheckInAction
                  locale={locale}
                  onDone={onChanged}
                  reservationId={row.reservationId}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <AllLink href={toCome}>{t("allArrivals", { count: remaining })}</AllLink>
    </>
  );
}

function ArrivalBadge({ row }: { row: ArrivalRow }) {
  const t = useTranslations("dashboard");
  switch (row.state) {
    case "ready":
    case "checked_in":
      return (
        <StatusBadge icon={Check} label={t("stateReady")} tone="success" />
      );
    case "not_ready":
      return (
        <StatusBadge
          icon={AlertTriangle}
          label={t("stateNotReady")}
          tone="danger"
        />
      );
    case "blocked":
      return (
        <StatusBadge icon={BedDouble} label={t("stateBlocked")} tone="info" />
      );
  }
}

function DepartureRows({
  currency,
  full,
  locale,
  onChanged,
  propertyId,
  rows,
  total,
}: {
  currency: string;
  /** The Departures screen's own rows, which the check-out dialog reviews. */
  full: readonly Departure[];
  locale: SupportedLocale;
  onChanged: () => void;
  propertyId: string;
  rows: readonly DepartureRow[];
  total: number;
}) {
  const t = useTranslations("dashboard");
  const href = todayHref(locale, "departures", propertyId);

  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            href={href}
          >
            {t("openDepartures")}
          </Link>
        }
        description={t("noDeparturesDescription")}
        title={t("noDeparturesTitle")}
      />
    );
  }

  return (
    <>
      <ul className="grid gap-2">
        {rows.map((row) => {
          const review = row.mayCheckOut
            ? full.find((candidate) => candidate.stayId === row.stayId)
            : undefined;
          return (
            <li className={ROW} key={row.stayId}>
              <Link className={ROW_LINK} href={href} prefetch={false}>
                <span className="min-w-40 flex-1">
                  <span className="block font-semibold">
                    <bdi>{row.guestName}</bdi>
                  </span>
                  {row.reference ? (
                    <span className="block font-mono text-xs text-muted-foreground">
                      <bdi>{row.reference}</bdi>
                    </span>
                  ) : null}
                </span>
                <span className="w-20 tabular-nums">
                  <bdi>{unitLabel(row.unit.roomName, row.unit.unitName)}</bdi>
                </span>
                <span className="w-44">
                  {row.overdue && row.endsOn ? (
                    <StatusBadge
                      icon={Clock}
                      label={t("overdueLabel", { days: row.overdueDays })}
                      tone="danger"
                    />
                  ) : (
                    <StatusBadge
                      icon={CalendarDays}
                      label={t("leavesToday")}
                      tone="warning"
                    />
                  )}
                </span>
                {row.balance ? (
                  <span className="w-28 font-semibold tabular-nums">
                    {money([row.balance], currency, locale)}
                  </span>
                ) : null}
              </Link>
              {review ? (
                <CheckOutDialog
                  departure={review}
                  locale={locale}
                  onDone={onChanged}
                  propertyId={propertyId}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <AllLink href={href}>{t("allDepartures", { count: total })}</AllLink>
    </>
  );
}

export function AllLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      href={href}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
    </Link>
  );
}
