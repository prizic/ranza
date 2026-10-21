"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type { ArrivalRow, DepartureRow } from "../../../server/today-derive";
import { unitLabel } from "../../front-office/unit-label";
import { cutoffTime, duration, money, shortDay } from "../format";
import { todayHref } from "../links";
import { DoNow } from "./do-now";
import { RoomsBar, UnclosedDaysCard } from "./side-cards";
import {
  ArrivalCommand,
  DepartureCommand,
  Eyebrow,
  Panel,
  StateBadge,
  useCheckOutReviews,
  useElementWidth,
  usePropertyMinutes,
  type CheckOutReviews,
  type LayoutProps,
} from "./parts";
import {
  actionsFor,
  countsByState,
  houseFlow,
  isToCome,
  readinessOf,
  roomsByName,
  toMinutes,
  type Readiness,
} from "./model";

type Range = "next" | "day";

/** Window of the day shown: an hour back and five ahead, or the working day. */
function windowFor(range: Range, nowMinutes: number) {
  return range === "next"
    ? { from: nowMinutes - 60, to: nowMinutes + 240 }
    : { from: 6 * 60, to: 24 * 60 };
}

const CHIP_WIDTH = 208;
const ROW_HEIGHT = 104;

/**
 * Today as a line from morning to night with the present marked on it:
 * arrivals sit where the Guest said they would come, so the one who is late and
 * the one whose room is not ready show before they are a queue at the desk.
 *
 * Departures are not on the line, because a stay has a day to leave and no
 * time (docs/features/today-layouts, TL-DEF-01): they sit above it, overdue
 * first.
 */
export function TimelineLayout(props: LayoutProps) {
  const { desk, locale, nowMs, onChanged, scope, summary } = props;
  const nowMinutes = usePropertyMinutes(nowMs, summary.day.timezone);
  const { reviews, changed } = useCheckOutReviews(
    scope,
    desk.departures,
    onChanged,
  );
  const actions = actionsFor(desk, nowMinutes);
  const flow =
    summary.occupancy?.status === "ok" ? summary.occupancy.data : null;
  const counts = countsByState(desk.rooms);
  const unclosed =
    desk.unclosed?.status === "ok" && desk.unclosed.data.waiting > 0
      ? desk.unclosed.data
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Figures
        desk={desk}
        flowTonight={flow ? houseFlow(desk, flow) : null}
        locale={locale}
        scope={scope}
      />
      <FlowPanel
        arrivals={desk.arrivals}
        changed={changed}
        departures={desk.departures}
        desk={desk}
        locale={locale}
        nowMinutes={nowMinutes}
        reviews={reviews}
        scope={scope}
        currency={summary.day.currency}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <DoNow
          actions={actions}
          changed={changed}
          currency={summary.day.currency}
          desk={desk}
          locale={locale}
          reviews={reviews}
          scope={scope}
        />
        <div className="flex flex-col gap-6">
          <RoomsBar
            counts={counts}
            locale={locale}
            propertyId={scope.propertyId}
            sellable={flow?.sellable ?? desk.rooms.length}
          />
          {unclosed ? (
            <UnclosedDaysCard
              locale={locale}
              oldest={unclosed.oldest}
              propertyId={scope.propertyId}
              waiting={unclosed.waiting}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Figures({
  desk,
  flowTonight,
  locale,
  scope,
}: Pick<LayoutProps, "desk" | "locale" | "scope"> & {
  flowTonight: ReturnType<typeof houseFlow> | null;
}) {
  const t = useTranslations("todayLayouts");
  const counts = countsByState(desk.rooms);
  const arrivedCount = desk.arrivals.filter((a) => !isToCome(a)).length;
  const late = desk.arrivals.find(
    (a) => isToCome(a) && a.expectedArrivalPassed,
  );
  const overdue = desk.departures.filter((d) => d.overdue).length;
  const n = (value: number) => formatNumber(value, locale);
  const items = [
    {
      label: t("figure.checkedIn"),
      value: n(arrivedCount),
      of: n(desk.arrivals.length),
      sub: late
        ? t("figure.lateGuest", { guest: late.guestName ?? late.reference })
        : t("figure.toCome", { count: desk.arrivals.length - arrivedCount }),
      alert: late !== undefined,
      href: todayHref(locale, "arrivals", scope.propertyId),
    },
    {
      label: t("figure.checkedOut"),
      value: n(desk.departed),
      of: n(desk.departed + desk.departures.length),
      sub:
        overdue > 0
          ? t("figure.overdue", { count: overdue })
          : t("figure.toLeave", { count: desk.departures.length }),
      alert: overdue > 0,
      href: todayHref(locale, "departures", scope.propertyId),
    },
    {
      label: t("figure.inHouse"),
      value: n(counts.in_house),
      of: null,
      sub: flowTonight
        ? t("figure.tonight", {
            count: flowTonight.tonight,
            sellable: flowTonight.sellable,
          })
        : "",
      alert: false,
      href: todayHref(locale, "rooms", scope.propertyId),
    },
    {
      label: t("figure.readyToSell"),
      value: n(counts.ready),
      of: n(desk.rooms.length - counts.out_of_service),
      sub: t("figure.roomsRest", {
        awaiting: counts.awaiting_inspection,
        dirty: counts.dirty,
        outOfService: counts.out_of_service,
      }),
      alert: false,
      href: todayHref(locale, "housekeeping", scope.propertyId),
    },
  ];
  return (
    <ul className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
      {items.map((item) => (
        <li
          className="border-s border-line first:border-s-0 max-lg:odd:border-s-0"
          key={item.label}
        >
          <Link
            className="block px-5 py-6 first:ps-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            href={item.href}
          >
            <Eyebrow>{item.label}</Eyebrow>
            <span className="mt-4 flex items-baseline gap-1.5 text-6xl leading-none font-light tracking-tight tabular-nums">
              {item.value}
              {item.of ? (
                <span className="text-3xl text-muted-foreground">
                  /{item.of}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "mt-3 block min-h-10 text-sm text-muted-foreground",
                item.alert && "font-semibold text-danger",
              )}
            >
              {item.sub}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FlowPanel({
  arrivals,
  changed,
  currency,
  departures,
  desk,
  locale,
  nowMinutes,
  reviews,
  scope,
}: {
  arrivals: readonly ArrivalRow[];
  changed: () => void;
  currency: string;
  departures: readonly DepartureRow[];
  desk: LayoutProps["desk"];
  locale: SupportedLocale;
  nowMinutes: number;
  reviews: CheckOutReviews;
  scope: LayoutProps["scope"];
}) {
  const t = useTranslations("todayLayouts");
  const [range, setRange] = useState<Range>("next");
  const [laneRef, width] = useElementWidth<HTMLDivElement>();
  const window = windowFor(range, nowMinutes);
  const rooms = roomsByName(desk.rooms);

  const timed = arrivals.filter((a) => a.expectedArrival !== null);
  const untimed = arrivals.filter((a) => a.expectedArrival === null);
  const x = (minutes: number) =>
    (Math.min(Math.max(minutes, window.from), window.to) - window.from) /
    (window.to - window.from);
  const inWindow = timed.filter((a) => {
    const at = toMinutes(a.expectedArrival ?? "00:00");
    return (
      (at >= window.from && at <= window.to) ||
      (a.expectedArrivalPassed && isToCome(a) && at < window.from)
    );
  });
  const outside = timed.length - inWindow.length;

  const rows: number[] = [];
  const placed = inWindow
    .map((arrival) => ({
      arrival,
      at: toMinutes(arrival.expectedArrival ?? "00:00"),
    }))
    .sort((a, b) => a.at - b.at)
    .map(({ arrival, at }) => {
      const start = x(at) * width;
      const anchorEnd = start > width - CHIP_WIDTH - 8;
      const left = anchorEnd ? start - CHIP_WIDTH : start;
      let row = rows.findIndex((end) => end < left - 8);
      if (row < 0) {
        row = rows.length;
        rows.push(0);
      }
      rows[row] = left + CHIP_WIDTH;
      return { arrival, at, start, anchorEnd, top: row * ROW_HEIGHT + 20 };
    });

  const hours: number[] = [];
  for (let h = Math.ceil(window.from / 60); h * 60 <= window.to; h += 1) {
    hours.push(h * 60);
  }
  const laneHeight = Math.max(1, rows.length) * ROW_HEIGHT + 24;

  return (
    <Panel labelledBy="flow-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <h2 className="text-xl font-semibold tracking-tight" id="flow-title">
            {t("flow.title")}
          </h2>
          <div className="inline-flex rounded-full bg-muted p-1" role="group">
            {(["next", "day"] as const).map((option) => (
              <button
                aria-pressed={range === option}
                className={cn(
                  "min-h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  range === option
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={option}
                onClick={() => setRange(option)}
                type="button"
              >
                {t(`flow.range.${option}`)}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {(
            [
              ["bg-primary", "onTime"],
              ["bg-warning", "roomAtRisk"],
              ["bg-danger", "late"],
              ["bg-border", "done"],
            ] as const
          ).map(([swatch, key]) => (
            <li className="flex items-center gap-1.5" key={key}>
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-sm", swatch)}
              />
              {t(`flow.legend.${key}`)}
            </li>
          ))}
        </ul>
      </div>

      <DueOut
        changed={changed}
        currency={currency}
        departures={departures}
        locale={locale}
        reviews={reviews}
        scope={scope}
      />

      <div
        className="relative mt-6 h-7 border-b border-line"
        aria-hidden="true"
      >
        {hours.map((minutes) => (
          <span
            className="absolute -translate-x-1/2 font-mono text-[11px] text-muted-foreground rtl:translate-x-1/2"
            key={minutes}
            style={{ insetInlineStart: `${x(minutes) * 100}%` }}
          >
            {cutoffTime(`${Math.floor(minutes / 60) % 24}:00`, locale)}
          </span>
        ))}
        <span
          className="absolute -top-0.5 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground rtl:translate-x-1/2"
          style={{ insetInlineStart: `${x(nowMinutes) * 100}%` }}
        >
          {t("flow.now")}
        </span>
      </div>
      <div
        className="relative border-b border-line"
        ref={laneRef}
        style={{ height: laneHeight }}
      >
        {hours.map((minutes) => (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-border"
            key={minutes}
            style={{ insetInlineStart: `${x(minutes) * 100}%` }}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 start-0 bg-muted/60"
          style={{ width: `${x(nowMinutes) * 100}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 z-0 w-0.5 bg-primary"
          style={{ insetInlineStart: `${x(nowMinutes) * 100}%` }}
        />
        {placed.length === 0 ? (
          <p className="absolute inset-x-0 top-6 text-center text-sm text-muted-foreground">
            {t("flow.noArrivals")}
          </p>
        ) : null}
        {width > 0
          ? placed.map(({ arrival, at, start, anchorEnd, top }) => (
              <ArrivalChip
                anchorEnd={anchorEnd}
                arrival={arrival}
                at={at}
                changed={changed}
                key={arrival.reservationId}
                locale={locale}
                nowMinutes={nowMinutes}
                readiness={readinessOf(arrival, rooms)}
                start={start}
                top={top}
                width={width}
                lateFrom={at < window.from ? 0 : null}
                nowStart={x(nowMinutes) * width}
              />
            ))
          : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {untimed.map((arrival) => (
            <li key={arrival.reservationId}>
              <Link
                className="hover:underline"
                href={todayHref(locale, "arrivals", scope.propertyId)}
              >
                <bdi className="font-semibold text-foreground">
                  {arrival.guestName ?? arrival.reference}
                </bdi>{" "}
                · {unitLabel(arrival.unit.roomName, arrival.unit.unitName)} ·{" "}
                {t("flow.noTime")}
              </Link>
            </li>
          ))}
        </ul>
        {range === "next" && outside > 0 ? (
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => setRange("day")}
            type="button"
          >
            {t("flow.outside", { count: outside })}
          </button>
        ) : null}
      </div>
    </Panel>
  );
}

function ArrivalChip({
  anchorEnd,
  arrival,
  at,
  changed,
  lateFrom,
  locale,
  nowMinutes,
  nowStart,
  readiness,
  start,
  top,
  width,
}: {
  anchorEnd: boolean;
  arrival: ArrivalRow;
  at: number;
  changed: () => void;
  /** Where the overrun bar starts when the due time is off the left edge. */
  lateFrom: number | null;
  locale: SupportedLocale;
  nowMinutes: number;
  /** Where the present is on the line, in pixels. */
  nowStart: number;
  readiness: Readiness;
  start: number;
  top: number;
  width: number;
}) {
  const t = useTranslations("todayLayouts");
  const done = !isToCome(arrival);
  const late = !done && arrival.expectedArrivalPassed;
  const atRisk =
    !done &&
    (readiness === "awaiting_inspection" ||
      readiness === "dirty" ||
      readiness === "blocked");
  const tone = done
    ? "border-s-border opacity-60"
    : late
      ? "border-s-danger"
      : atRisk
        ? "border-s-warning"
        : "border-s-primary";
  const position = anchorEnd
    ? { insetInlineEnd: width - start }
    : { insetInlineStart: start };
  const ago = late ? nowMinutes - at : 0;
  return (
    <>
      {late ? (
        <span
          aria-hidden="true"
          className="absolute h-1 rounded-full bg-danger"
          style={{
            insetInlineStart: lateFrom ?? start,
            width: Math.max(4, nowStart - (lateFrom ?? start)),
            top: top - 8,
          }}
        />
      ) : null}
      <div
        className={cn(
          "absolute z-10 flex flex-col gap-1.5 rounded-xl border border-border border-s-4 bg-card px-3 py-2 shadow-xs",
          tone,
        )}
        style={{ ...position, top, width: CHIP_WIDTH }}
      >
        <span className="flex items-baseline justify-between gap-2">
          <bdi className="truncate text-sm font-semibold">
            {arrival.guestName ?? arrival.reference}
          </bdi>
          <span className="font-mono text-xs text-muted-foreground">
            {arrival.expectedArrival
              ? cutoffTime(arrival.expectedArrival, locale)
              : null}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <bdi>{unitLabel(arrival.unit.roomName, arrival.unit.unitName)}</bdi>
          <StateBadge state={done ? "in_house" : readiness} />
        </span>
        {late ? (
          <span className="text-xs font-semibold text-danger">
            {t("flow.lateBy", { duration: duration(ago, locale) })}
          </span>
        ) : atRisk ? (
          <span className="text-xs font-semibold text-warning">
            {t("flow.roomNotReady")}
          </span>
        ) : null}
        {!done && arrival.mayCheckIn && readiness === "ready" ? (
          <ArrivalCommand
            arrival={arrival}
            locale={locale}
            onChanged={changed}
          />
        ) : null}
      </div>
    </>
  );
}

function DueOut({
  changed,
  currency,
  departures,
  locale,
  reviews,
  scope,
}: {
  changed: () => void;
  currency: string;
  departures: readonly DepartureRow[];
  locale: SupportedLocale;
  reviews: CheckOutReviews;
  scope: LayoutProps["scope"];
}) {
  const t = useTranslations("todayLayouts");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <Eyebrow>{t("flow.dueOut")}</Eyebrow>
        <span className="text-xs text-muted-foreground">
          {t("flow.dueOutHint")}
        </span>
      </div>
      {departures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flow.nobodyDue")}</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {departures.map((departure) => (
            <li
              className={cn(
                "flex min-w-56 flex-col gap-1.5 rounded-xl border border-border border-s-4 bg-card px-3 py-2 shadow-xs",
                departure.overdue ? "border-s-danger" : "border-s-primary",
              )}
              key={departure.stayId}
            >
              <span className="flex items-baseline justify-between gap-3">
                <bdi className="text-sm font-semibold">
                  {departure.guestName}
                </bdi>
                <bdi className="text-xs text-muted-foreground">
                  {unitLabel(departure.unit.roomName, departure.unit.unitName)}
                </bdi>
              </span>
              <span
                className={cn(
                  "text-xs",
                  departure.overdue
                    ? "font-semibold text-danger"
                    : "text-muted-foreground",
                )}
              >
                {departure.overdue && departure.endsOn
                  ? t("flow.overdueSince", {
                      date: shortDay(departure.endsOn, locale),
                    })
                  : t("flow.leavesToday")}
                {departure.balance && departure.balance.amountMinor !== 0
                  ? ` · ${t("flow.owes", { amount: money([departure.balance], currency, locale) })}`
                  : null}
              </span>
              <DepartureCommand
                departure={departure}
                locale={locale}
                onChanged={changed}
                reviews={reviews}
                scope={scope}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
