"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, type ReactNode } from "react";
import {
  BedDouble,
  Clock,
  LogIn,
  LogOut,
  Sparkles,
  CheckCheck,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { Section, TodaySummary } from "../../../server/today-derive";
import { clockAt, money, percent } from "../format";
import { todayHref } from "../links";
import { hasStale, mergeSummary } from "../merge";
import { todayKeys, type TodayScope } from "../query-keys";
import { AttentionQueue } from "./attention-queue";
import { CleanFirstCard } from "./clean-first-card";
import { MaintenanceCard } from "./maintenance-card";
import { MoneyLists } from "./money-cards";
import { MovementsCard } from "./movements-card";
import { RoomsCard } from "./rooms-card";
import { SectionUnavailable } from "./section-unavailable";
import { OfTotal, StatTile } from "./stat-tile";
import { TodayHeader, type Greeting } from "./today-header";

/** Once a minute, and on focus: a front desk leaves this open for a shift. */
export const REFRESH_MS = 60_000;

async function fetchSummary(propertyId: string): Promise<TodaySummary> {
  const response = await fetch(
    `/api/today?property=${encodeURIComponent(propertyId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw Object.assign(new Error("today could not be read"), {
      status: response.status,
    });
  }
  const body = (await response.json()) as { summary: TodaySummary | null };
  // Null is Today withdrawn at this Property since the page opened. Kept as a
  // failure rather than an empty page: the next full load answers it properly.
  if (!body.summary) throw new Error("today is no longer available here");
  return body.summary;
}

/**
 * Today, live (ADR 0019): prefetched on the server, then refreshed on an
 * interval and on focus, one card failing without taking the page with it.
 *
 * It never sets `aria-busy` while refreshing: the page is never blank, and a
 * background refresh is not the page loading.
 */
export function TodayDashboard({
  clock,
  greeting,
  locale,
  name,
  scope,
}: {
  clock: string;
  greeting: Greeting;
  locale: SupportedLocale;
  name: string;
  scope: TodayScope;
}) {
  const t = useTranslations("dashboard");
  const client = useQueryClient();
  const key = todayKeys.summary(scope);
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      mergeSummary(
        client.getQueryData<TodaySummary>(key),
        await fetchSummary(scope.propertyId),
      ),
    refetchInterval: REFRESH_MS,
    // Coming back to the tab reads again at once, whatever the provider's
    // stale time (TD-S1-26). Not `staleTime: 0`: that would also re-read on
    // mount, a second read of what the server has just prefetched.
    refetchOnWindowFocus: "always",
  });

  // When every card was last current: what "showing" names when a refresh, or
  // any one card in it, could not be read.
  const summary = query.data;
  const lastComplete = useRef(query.dataUpdatedAt);
  const partlyStale = summary ? hasStale(summary) : false;
  if (summary && !query.isError && !partlyStale) {
    lastComplete.current = query.dataUpdatedAt;
  }
  if (!summary) return null;

  const retry = () => void query.refetch();
  // A focus is not a card: a role can lead somewhere nothing it may see is
  // switched on, and an empty grid under "nothing needs attention" would be a
  // false all-clear (TD-S1-30).
  const noCards = [
    summary.arrivals,
    summary.departures,
    summary.occupancy,
    summary.rooms,
    summary.money,
    summary.maintenance,
  ].every((section) => section === undefined);
  const day = summary.day;
  const propertyId = day.propertyId;

  return (
    <div className="flex flex-col gap-6">
      <TodayHeader
        clock={clock}
        day={day}
        freshAt={clockAt(lastComplete.current, locale, day.timezone)}
        greeting={greeting}
        locale={locale}
        mayBook={summary.mayBook}
        name={name}
        stale={query.isError || partlyStale}
      />

      {summary.focus === "none" || noCards ? (
        <p className="rounded-2xl bg-muted px-5 py-4 text-muted-foreground">
          {t("nothingForRole")}
        </p>
      ) : (
        <>
          <AttentionQueue
            complete={summary.attention.complete}
            currency={day.currency}
            items={summary.attention.items}
            locale={locale}
            propertyId={propertyId}
            roomsBoard={summary.rooms !== undefined}
          />
          {/* A phone leads with the task, so the list comes before the
              figures there and after them from md (blueprint 18.8). */}
          <div className="order-3 md:order-2">
            <Tiles locale={locale} onRetry={retry} summary={summary} />
          </div>
          <div className="order-2 md:order-3">
            <MainRow locale={locale} onRetry={retry} summary={summary} />
          </div>
        </>
      )}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** A tile for a section that may be absent, unavailable, or answered. */
function Tile<T>({
  children,
  onRetry,
  section,
}: {
  children: (data: T, stale: boolean) => ReactNode;
  onRetry: () => void;
  section: Section<T> | undefined;
}) {
  if (section === undefined) return null;
  if (section.status === "unavailable") {
    return <SectionUnavailable onRetry={onRetry} />;
  }
  return <>{children(section.data, section.stale === true)}</>;
}

function Tiles({
  locale,
  onRetry,
  summary,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  summary: TodaySummary;
}) {
  const t = useTranslations("dashboard");
  const n = (value: number) => formatNumber(value, locale);
  const href = (
    segment: "arrivals" | "departures" | "housekeeping" | "finance" | "rooms",
  ) => todayHref(locale, segment, summary.day.propertyId);
  const currency = summary.day.currency;

  const arrivals = (
    <Tile key="arrivals" onRetry={onRetry} section={summary.arrivals}>
      {(data, stale) => (
        <StatTile
          href={href("arrivals")}
          icon={LogIn}
          label={t("checkedIn")}
          opens={t("arrivals")}
          progress={{
            done: data.expected ? data.checkedIn / data.expected : 0,
          }}
          stale={stale}
        >
          <OfTotal of={n(data.expected)} value={n(data.checkedIn)} />
        </StatTile>
      )}
    </Tile>
  );

  const departures = (
    <Tile key="departures" onRetry={onRetry} section={summary.departures}>
      {(data, stale) => (
        <StatTile
          href={href("departures")}
          icon={LogOut}
          label={t("checkedOut")}
          opens={t("departures")}
          progress={{ done: data.due ? data.departed / data.due : 0 }}
          stale={stale}
          sub={
            data.overdue > 0 ? t("overdueCount", { count: data.overdue }) : null
          }
        >
          <OfTotal of={n(data.due)} value={n(data.departed)} />
        </StatTile>
      )}
    </Tile>
  );

  const occupancy = (
    <Tile key="occupancy" onRetry={onRetry} section={summary.occupancy}>
      {(data, stale) => {
        const now = percent(data.inHouse, data.sellable, locale);
        const tonight = percent(data.expectedTonight, data.sellable, locale);
        return (
          <StatTile
            accent
            href={href("rooms")}
            icon={BedDouble}
            label={
              now === null
                ? t("noUnits")
                : t("inHouseOf", {
                    count: n(data.inHouse),
                    of: n(data.sellable),
                  })
            }
            opens={t("occupancy")}
            progress={
              data.sellable
                ? {
                    done: data.inHouse / data.sellable,
                    ahead:
                      Math.max(0, data.expectedTonight - data.inHouse) /
                      data.sellable,
                  }
                : undefined
            }
            stale={stale}
            sub={
              tonight === null ? null : t("expectedTonight", { value: tonight })
            }
          >
            {now ?? "—"}
          </StatTile>
        );
      }}
    </Tile>
  );

  const readyForArrivals =
    summary.arrivals?.status === "ok" ? (
      <Tile key="ready-for-arrivals" onRetry={onRetry} section={summary.rooms}>
        {(rooms, stale) => {
          const arrivalsData =
            summary.arrivals?.status === "ok" ? summary.arrivals.data : null;
          const toCome = arrivalsData
            ? arrivalsData.expected - arrivalsData.checkedIn
            : 0;
          const waiting = Math.min(rooms.arrivalsWaiting, toCome);
          return (
            <StatTile
              href={href("housekeeping")}
              icon={Sparkles}
              label={t("roomsReadyForArrivals")}
              opens={t("rooms")}
              stale={stale}
              sub={
                waiting > 0 ? t("roomsNotReadyYet", { count: waiting }) : null
              }
            >
              <OfTotal of={n(toCome)} value={n(toCome - waiting)} />
            </StatTile>
          );
        }}
      </Tile>
    ) : null;

  const readyRooms = (
    <Tile key="ready-rooms" onRetry={onRetry} section={summary.rooms}>
      {(rooms, stale) => (
        <StatTile
          href={href("housekeeping")}
          icon={CheckCheck}
          label={t("readyRooms")}
          opens={t("rooms")}
          progress={{
            done:
              rooms.total - rooms.outOfService
                ? rooms.ready / (rooms.total - rooms.outOfService)
                : 0,
          }}
          stale={stale}
          sub={`${t("dirty")} ${n(rooms.dirty)} · ${t("awaitingInspection")} ${n(rooms.awaitingInspection)}`}
        >
          <OfTotal
            of={n(rooms.total - rooms.outOfService)}
            value={n(rooms.ready)}
          />
        </StatTile>
      )}
    </Tile>
  );

  if (summary.focus === "housekeeping") {
    return (
      <Grid>
        <Tile onRetry={onRetry} section={summary.rooms}>
          {(rooms, stale) => (
            <>
              <StatTile
                href={href("housekeeping")}
                icon={Sparkles}
                label={t("toClean")}
                opens={t("dirty")}
                stale={stale}
              >
                {n(rooms.dirty)}
              </StatTile>
              <StatTile
                accent
                href={href("housekeeping")}
                icon={CheckCheck}
                label={t("awaitingInspection")}
                opens={t("awaiting")}
                stale={stale}
              >
                {n(rooms.awaitingInspection)}
              </StatTile>
              {readyRooms}
              <StatTile
                href={href("housekeeping")}
                icon={LogIn}
                label={t("arrivalsWaiting")}
                opens={t("cleanFirst")}
                stale={stale}
              >
                {n(rooms.arrivalsWaiting)}
              </StatTile>
            </>
          )}
        </Tile>
      </Grid>
    );
  }

  if (summary.focus === "finance") {
    return (
      <Grid>
        <Tile onRetry={onRetry} section={summary.money}>
          {(data, stale) => (
            <>
              {data.leaving ? (
                <StatTile
                  accent
                  href={href("departures")}
                  icon={LogOut}
                  label={t("owedOnDepartures")}
                  opens={t("departures")}
                  stale={stale}
                  sub={t("guests", { count: data.leaving.owing })}
                >
                  {money(data.leaving.owed, currency, locale)}
                </StatTile>
              ) : null}
              <StatTile
                href={href("finance")}
                icon={Wallet}
                label={t("openFolios")}
                opens={t("allFolios")}
                stale={stale}
              >
                {n(data.openFolios)}
              </StatTile>
              <StatTile
                href={href("finance")}
                icon={Wallet}
                label={t("openBalance")}
                opens={t("allFolios")}
                stale={stale}
              >
                {money(data.openBalance, currency, locale)}
              </StatTile>
              {data.leaving ? (
                <StatTile
                  href={href("departures")}
                  icon={Clock}
                  label={t("overdueOwing")}
                  opens={t("departures")}
                  stale={stale}
                  sub={
                    data.leaving.overdueOwing > 0
                      ? money(data.leaving.overdueBalance, currency, locale)
                      : null
                  }
                >
                  {n(data.leaving.overdueOwing)}
                </StatTile>
              ) : null}
            </>
          )}
        </Tile>
      </Grid>
    );
  }

  return (
    <Grid>
      {summary.focus === "manager"
        ? [occupancy, arrivals, departures, readyRooms]
        : [arrivals, departures, occupancy, readyForArrivals]}
    </Grid>
  );
}

function MainRow({
  locale,
  onRetry,
  summary,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  summary: TodaySummary;
}) {
  const propertyId = summary.day.propertyId;
  const currency = summary.day.currency;

  if (summary.focus === "finance") {
    return summary.money ? (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <MoneyLists
          currency={currency}
          locale={locale}
          onRetry={onRetry}
          propertyId={propertyId}
          section={summary.money}
        />
      </div>
    ) : null;
  }

  const primary =
    summary.focus === "housekeeping" ? (
      summary.rooms ? (
        <CleanFirstCard
          locale={locale}
          onRetry={onRetry}
          propertyId={propertyId}
          rooms={summary.rooms}
        />
      ) : null
    ) : summary.arrivals || summary.departures ? (
      <MovementsCard
        arrivals={summary.arrivals}
        currency={currency}
        departures={summary.departures}
        locale={locale}
        onRetry={onRetry}
        propertyId={propertyId}
      />
    ) : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      {primary}
      {summary.rooms || summary.maintenance ? (
        <div className="flex flex-col gap-4">
          {summary.rooms ? (
            <RoomsCard
              locale={locale}
              onRetry={onRetry}
              propertyId={propertyId}
              rooms={summary.rooms}
            />
          ) : null}
          {summary.maintenance ? (
            <MaintenanceCard
              locale={locale}
              maintenance={summary.maintenance}
              onRetry={onRetry}
              propertyId={propertyId}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
