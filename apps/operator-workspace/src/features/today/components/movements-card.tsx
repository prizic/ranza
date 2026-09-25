"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, StatusBadge, cn } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type {
  ArrivalRow,
  ArrivalsCard,
  DepartureRow,
  DeparturesCard,
  Section,
} from "../../../server/today-derive";
import { unitLabel } from "../../front-office/unit-label";
import { todayHref } from "../links";
import { money, nights, shortDay } from "../format";
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
  onRetry,
  propertyId,
}: {
  arrivals: Section<ArrivalsCard> | undefined;
  currency: string;
  departures: Section<DeparturesCard> | undefined;
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
}) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<Tab>(arrivals ? "arrivals" : "departures");

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
        <div className="inline-flex rounded-full bg-muted p-1" role="group">
          {arrivals ? (
            <TabButton
              active={tab === "arrivals"}
              onClick={() => setTab("arrivals")}
            >
              {t("tabArrivals", { count: toCome ?? "–" })}
            </TabButton>
          ) : null}
          {departures ? (
            <TabButton
              active={tab === "departures"}
              onClick={() => setTab("departures")}
            >
              {t("tabDepartures", { count: stillHere ?? "–" })}
            </TabButton>
          ) : null}
        </div>
      </div>

      {tab === "arrivals" && arrivals ? (
        arrivals.status === "unavailable" ? (
          <SectionUnavailable onRetry={onRetry} />
        ) : (
          <ArrivalRows
            locale={locale}
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
            locale={locale}
            propertyId={propertyId}
            rows={departures.data.rows}
            total={stillHere ?? 0}
          />
        )
      ) : null}
    </section>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const ROW =
  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function ArrivalRows({
  locale,
  propertyId,
  remaining,
  rows,
}: {
  locale: SupportedLocale;
  propertyId: string;
  remaining: number;
  rows: readonly ArrivalRow[];
}) {
  const t = useTranslations("dashboard");
  const stay = useTranslations("stayType");
  const href = todayHref(locale, "arrivals", propertyId);

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
            <li key={row.reservationId}>
              <Link className={ROW} href={href} prefetch={false}>
                <span className="min-w-40 flex-1">
                  <span className="block font-semibold">
                    {row.guestName ?? row.reference}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {row.reference} · {stay(row.stayType)}
                  </span>
                </span>
                <span className="w-20 tabular-nums">
                  {unitLabel(row.unit.roomName, row.unit.unitName)}
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
            </li>
          );
        })}
      </ul>
      <AllLink href={href}>{t("allArrivals", { count: remaining })}</AllLink>
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
  locale,
  propertyId,
  rows,
  total,
}: {
  currency: string;
  locale: SupportedLocale;
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
        {rows.map((row) => (
          <li key={row.stayId}>
            <Link className={ROW} href={href} prefetch={false}>
              <span className="min-w-40 flex-1">
                <span className="block font-semibold">{row.guestName}</span>
                {row.reference ? (
                  <span className="block font-mono text-xs text-muted-foreground">
                    {row.reference}
                  </span>
                ) : null}
              </span>
              <span className="w-20 tabular-nums">
                {unitLabel(row.unit.roomName, row.unit.unitName)}
              </span>
              <span className="w-44">
                {row.overdue && row.endsOn ? (
                  <StatusBadge
                    icon={Clock}
                    label={shortDay(row.endsOn, locale)}
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
          </li>
        ))}
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
