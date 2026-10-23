"use client";

import { onlineManager, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
import { ActivityCard } from "./activity-card";
import { AttentionQueue } from "./attention-queue";
import { BookedAheadCard } from "./booked-ahead-card";
import { ChargesCard } from "./charges-card";
import { CleanFirstCard } from "./clean-first-card";
import { MaintenanceCard } from "./maintenance-card";
import { MoneyLists } from "./money-cards";
import { MovementsCard } from "./movements-card";
import { RoomsCard } from "./rooms-card";
import { SectionUnavailable } from "./section-unavailable";
import { OrganizationStrip } from "./organization-strip";
import { OfTotal, StatTile } from "./stat-tile";
import { TodayHeader, type Greeting } from "./today-header";
import { DeskLayout } from "../layouts/desk-layout";
import { LayoutSwitcher } from "../layouts/layout-switcher";
import { layoutCookieName, type TodayLayout } from "../layouts/model";

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
  initialLayout,
  locale,
  name,
  nowMs,
  properties,
  scope,
}: {
  clock: string;
  greeting: Greeting;
  /** How this Staff Member last chose to have Today drawn, read from their cookie. */
  initialLayout: TodayLayout;
  locale: SupportedLocale;
  name: string;
  /** The server's clock when the page was built, so the first paint agrees. */
  nowMs: number;
  /** The Organization's Properties with Today, for the strip; one or none is no strip. */
  properties: readonly { propertyId: string; propertyName: string }[];
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
  // A refresh the browser holds back while it is offline is not failing, so
  // nothing reports it; but the figures on screen are going stale all the same.
  const online = useSyncExternalStore(
    onlineManager.subscribe.bind(onlineManager),
    () => onlineManager.isOnline(),
    () => true,
  );
  const paused = !online || query.fetchStatus === "paused";
  // Stable, because a row's command calls it from an effect that runs when
  // its own outcome lands and must not run again for a new function.
  const refetch = query.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  const [layout, setLayout] = useState(initialLayout);
  const chooseLayout = useCallback(
    (next: TodayLayout) => {
      setLayout(next);
      // A year, on this device: a preference of the person, not a record.
      document.cookie = `${layoutCookieName(scope.userId)}=${next}; path=/; max-age=31536000; samesite=lax`;
    },
    [scope.userId],
  );
  if (!summary) return null;

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
        {...(summary.desk
          ? {
              layoutSwitcher: (
                <LayoutSwitcher onChange={chooseLayout} value={layout} />
              ),
            }
          : {})}
        locale={locale}
        mayBook={summary.mayBook}
        name={name}
        stale={query.isError || partlyStale || paused}
      />

      {summary.desk && layout !== "overview" ? (
        summary.desk.status === "ok" ? (
          <DeskLayout
            desk={summary.desk.data}
            layout={layout}
            locale={locale}
            nowMs={nowMs}
            onChanged={retry}
            scope={scope}
            summary={summary}
          />
        ) : (
          <SectionUnavailable onRetry={retry} />
        )
      ) : summary.focus === "none" || noCards ? (
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
            mayMark={
              summary.rooms?.status === "ok" && summary.rooms.data.mayMark
            }
            roomsBoard={summary.rooms !== undefined}
          />
          {/* The four figures answer "how is the day" and sit straight under
              what needs somebody, on a phone as on a desk: the movements list
              is long, and a figure 2,900 px down is not a figure. */}
          <div className="order-2">
            <Tiles locale={locale} onRetry={retry} summary={summary} />
          </div>
          <div className="order-3">
            <MainRow
              locale={locale}
              onChanged={retry}
              onRetry={retry}
              scope={scope}
              summary={summary}
            />
          </div>
          <div className="order-4">
            <OrganizationStrip
              locale={locale}
              properties={properties}
              scope={scope}
            />
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
    extra?: Record<string, string>,
  ) => todayHref(locale, segment, summary.day.propertyId, extra);
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
            data.overdue > 0 ? (
              <span className="font-medium text-danger">
                {t("leaveOverdue", {
                  count: data.overdue,
                  days: data.longestOverdueDays,
                })}
              </span>
            ) : null
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
        const tonight = percent(data.expectedTonight, data.available, locale);
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
              tonight === null
                ? null
                : t("expectedTonight", {
                    count: n(data.expectedTonight),
                    of: n(data.available),
                    value: tonight,
                  })
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
        {(_rooms, stale) => {
          const arrivalsData =
            summary.arrivals?.status === "ok" ? summary.arrivals.data : null;
          const toCome = arrivalsData
            ? arrivalsData.expected - arrivalsData.checkedIn
            : 0;
          const notReady = arrivalsData?.notReady ?? 0;
          return (
            <StatTile
              href={href("arrivals", { show: "to_come" })}
              icon={Sparkles}
              label={t("roomsReadyForArrivals")}
              opens={t("arrivalRooms")}
              stale={stale}
              sub={
                notReady > 0 ? t("roomsNotReadyYet", { count: notReady }) : null
              }
            >
              <OfTotal of={n(toCome)} value={n(arrivalsData?.ready ?? 0)} />
            </StatTile>
          );
        }}
      </Tile>
    ) : null;

  const readyRooms = (
    <Tile key="ready-rooms" onRetry={onRetry} section={summary.rooms}>
      {(rooms, stale) => (
        <StatTile
          href={href("housekeeping", { show: "in_service" })}
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
                href={href("housekeeping", { show: "dirty" })}
                icon={Sparkles}
                label={t("toClean")}
                opens={t("dirty")}
                stale={stale}
              >
                {n(rooms.dirty)}
              </StatTile>
              <StatTile
                accent
                href={href("housekeeping", { show: "awaiting_inspection" })}
                icon={CheckCheck}
                label={t("awaitingInspection")}
                opens={t("awaiting")}
                stale={stale}
              >
                {n(rooms.awaitingInspection)}
              </StatTile>
              {readyRooms}
              <StatTile
                href={href("housekeeping", { show: "for_arrival" })}
                icon={LogIn}
                label={t("arrivalsWaiting")}
                opens={t("arrivalRooms")}
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
                  href={href("departures", { show: "owing" })}
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
                href={href("finance", { show: "open" })}
                icon={Wallet}
                label={t("openFolios")}
                opens={t("allFolios")}
                stale={stale}
              >
                {n(data.openFolios)}
              </StatTile>
              <StatTile
                href={href("finance", { show: "open" })}
                icon={Wallet}
                label={t("openBalance")}
                opens={t("allFolios")}
                stale={stale}
              >
                {money(data.openBalance, currency, locale)}
              </StatTile>
              {data.leaving ? (
                <StatTile
                  href={href("departures", { show: "overdue_owing" })}
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
  onChanged,
  onRetry,
  scope,
  summary,
}: {
  locale: SupportedLocale;
  /** A command run from a row changed the day: read it again. */
  onChanged: () => void;
  onRetry: () => void;
  scope: TodayScope;
  summary: TodaySummary;
}) {
  const propertyId = summary.day.propertyId;
  const currency = summary.day.currency;

  if (summary.focus === "finance") {
    return summary.money ? (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <MoneyLists
          aside={
            summary.charges ? (
              <ChargesCard
                charges={summary.charges}
                currency={currency}
                locale={locale}
                onRetry={onRetry}
                propertyId={propertyId}
              />
            ) : null
          }
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
          onChanged={onChanged}
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
        onChanged={onChanged}
        onRetry={onRetry}
        scope={scope}
      />
    ) : null;

  const side = summary.rooms || summary.maintenance || summary.charges;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="flex flex-col gap-4">
        {primary}
        {summary.booked ? (
          <BookedAheadCard
            booked={summary.booked}
            locale={locale}
            onRetry={onRetry}
            propertyId={propertyId}
          />
        ) : null}
        {summary.activity ? (
          <ActivityCard
            activity={summary.activity}
            locale={locale}
            onRetry={onRetry}
            propertyId={propertyId}
            userId={scope.userId}
          />
        ) : null}
      </div>
      {side ? (
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
          {summary.charges ? (
            <ChargesCard
              charges={summary.charges}
              currency={currency}
              locale={locale}
              onRetry={onRetry}
              propertyId={propertyId}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
