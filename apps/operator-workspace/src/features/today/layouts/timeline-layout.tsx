"use client";

import { useId, useRef, useState } from "react";
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
  blockerScreen,
  DepartureCommand,
  Eyebrow,
  FoldToggle,
  LINK_BUTTON,
  Panel,
  StateBadge,
  useArrivalReason,
  useCheckOutReviews,
  useElementWidth,
  usePropertyMinutes,
  type CheckOutReviews,
  type LayoutProps,
} from "./parts";
import {
  actionsFor,
  countsByState,
  departureCounts,
  houseFlow,
  isToCome,
  minutesLate,
  owedByDepartures,
  readinessOf,
  roomsByName,
  toMinutes,
  type HouseFlow,
  type Readiness,
} from "./model";

type Range = "next" | "day";

/**
 * Window of the day shown: an hour back and five ahead, or the whole day. An
 * early flight lands at 05:00, so "whole" starts at midnight; a window that began
 * at 06:00 counted that arrival as "outside" with no way to show it.
 */
function windowFor(range: Range, nowMinutes: number) {
  return range === "next"
    ? { from: nowMinutes - 60, to: nowMinutes + 240 }
    : { from: 0, to: 24 * 60 };
}

/** The room an hour label needs along the axis, in pixels. */
const HOUR_LABEL_SPACE = 44;

/**
 * Hours between two labels on the axis: every hour for a few hours, every
 * second hour for a day (24 labels are too close to read), and as many more as
 * it takes for the labels not to touch in the width the lane has. A phone's
 * lane is a third of a desk's, and every second hour set the "00:00" of one
 * label over the "02:00" of the next.
 */
export function hourStepFor(spanHours: number, width: number): number {
  const fits = width > 0 ? Math.floor(width / HOUR_LABEL_SPACE) : spanHours;
  const wanted = spanHours > 12 ? 2 : 1;
  return (
    [wanted, 2, 3, 4, 6, 12].find(
      (step) => step >= wanted && spanHours / step + 1 <= fits,
    ) ?? 12
  );
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
  // The overdue Guests are the due-out list's, above: listing them again here
  // made every one of them two rows with two Check out buttons (TODAY-11).
  const actions = actionsFor(desk, nowMinutes).filter(
    (action) => action.kind !== "overdue_departure",
  );
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
      <div className="grid gap-6 max-md:order-3 lg:grid-cols-[3fr_2fr]">
        <DoNow
          actions={actions}
          changed={changed}
          currency={summary.day.currency}
          desk={desk}
          locale={locale}
          overdueAbove={departureCounts(desk).overdue}
          reviews={reviews}
          scope={scope}
        />
        <div className="flex flex-col gap-6">
          <RoomsBar
            counts={counts}
            locale={locale}
            propertyId={scope.propertyId}
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
  flowTonight: HouseFlow | null;
}) {
  const t = useTranslations("todayLayouts");
  const counts = countsByState(desk.rooms);
  const arrivedCount = desk.arrivals.filter((a) => !isToCome(a)).length;
  const late = desk.arrivals.find(
    (a) => isToCome(a) && a.expectedArrivalPassed,
  );
  const departures = departureCounts(desk);
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
      of: n(departures.dueToday),
      sub:
        departures.overdue > 0
          ? t("figure.overdue", { count: departures.overdue })
          : t("figure.toLeave", { count: desk.departures.length }),
      alert: departures.overdue > 0,
      href: todayHref(locale, "departures", scope.propertyId),
    },
    {
      label: t("figure.inHouse"),
      value: n(counts.in_house),
      of: null,
      sub: flowTonight
        ? [
            t("figure.tonight", {
              count: flowTonight.tonight,
              available: flowTonight.available,
            }),
            flowTonight.overdueStaying > 0
              ? t("figure.tonightOverdue", {
                  count: flowTonight.overdueStaying,
                })
              : null,
          ]
            .filter((line) => line !== null)
            .join(" ")
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
    <ul className="grid grid-cols-2 border-y border-line max-md:order-2 lg:grid-cols-4">
      {items.map((item) => (
        <li
          className="border-s border-line first:border-s-0 max-lg:odd:border-s-0 [&:first-child>a]:ps-0 max-lg:[&:nth-child(odd)>a]:ps-0"
          key={item.label}
        >
          <Link
            className="block px-3 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-5 sm:py-6"
            href={item.href}
          >
            <Eyebrow>{item.label}</Eyebrow>
            <span className="mt-2 flex items-baseline gap-1.5 text-4xl leading-none font-light tracking-tight tabular-nums sm:mt-4 sm:text-6xl">
              {item.value}
              {item.of ? (
                <span className="text-xl text-muted-foreground sm:text-3xl">
                  /{item.of}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "mt-2 block text-sm text-muted-foreground sm:mt-3 sm:min-h-10",
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
  const toCome = arrivals.filter(isToCome);
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
  const hourStep = hourStepFor((window.to - window.from) / 60, width);
  for (
    let h = Math.ceil(window.from / 60);
    h * 60 <= window.to;
    h += hourStep
  ) {
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
          {timed.length > 0 ? (
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
          ) : null}
        </div>
        {timed.length > 0 ? (
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
        ) : null}
      </div>

      <ArrivalsToCome
        arrivals={toCome}
        changed={changed}
        locale={locale}
        nowMinutes={nowMinutes}
        rooms={rooms}
        scope={scope}
      />

      <DueOut
        changed={changed}
        currency={currency}
        departures={departures}
        locale={locale}
        reviews={reviews}
        scope={scope}
      />

      {timed.length > 0 ? (
        <>
          <div
            className="relative mt-6 h-12 border-b border-line"
            aria-hidden="true"
          >
            {hours.map((minutes) => (
              <span
                className="absolute bottom-1.5 -translate-x-1/2 font-mono text-[11px] text-muted-foreground rtl:translate-x-1/2"
                key={minutes}
                style={{ insetInlineStart: `${x(minutes) * 100}%` }}
              >
                {cutoffTime(`${Math.floor(minutes / 60) % 24}:00`, locale)}
              </span>
            ))}
            <span
              className="absolute top-0 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground rtl:translate-x-1/2"
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
        </>
      ) : null}
    </Panel>
  );
}

/** Arrivals shown before "show more". */
const ARRIVALS_COLLAPSED = 6;

/**
 * Who is still to arrive, as rows with the command beside each: the chart
 * below shows when, this says what to do. An arrival with no time is a row like
 * any other (it used to be a bare link), and the check-in is offered whatever
 * the room's state, asking in place when the room is not ready (TODAY-07,
 * TODAY-09).
 */
function ArrivalsToCome({
  arrivals,
  changed,
  locale,
  nowMinutes,
  rooms,
  scope,
}: {
  arrivals: readonly ArrivalRow[];
  changed: () => void;
  locale: SupportedLocale;
  nowMinutes: number;
  rooms: ReturnType<typeof roomsByName>;
  scope: LayoutProps["scope"];
}) {
  const t = useTranslations("todayLayouts");
  const reasonOf = useArrivalReason();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (arrivals.length === 0) return null;

  const ordered = [...arrivals].sort(
    (a, b) =>
      Number(b.expectedArrivalPassed) - Number(a.expectedArrivalPassed) ||
      (a.expectedArrival === null ? 1 : 0) -
        (b.expectedArrival === null ? 1 : 0) ||
      toMinutes(a.expectedArrival ?? "00:00") -
        toMinutes(b.expectedArrival ?? "00:00"),
  );
  const collapsible = ordered.length > ARRIVALS_COLLAPSED;
  const visible =
    expanded || !collapsible ? ordered : ordered.slice(0, ARRIVALS_COLLAPSED);

  return (
    <section aria-label={t("flow.arrivalsToCome")} className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <Eyebrow>{t("flow.arrivalsToCome")}</Eyebrow>
        <span className="text-xs text-muted-foreground">
          {t("flow.arrivalsToComeHint")}
        </span>
      </div>
      <div className="@container">
        <ul className="grid gap-x-8 @2xl:grid-cols-2" id={listId}>
          {visible.map((arrival) => {
            const readiness = readinessOf(arrival, rooms);
            const room = unitLabel(
              arrival.unit.roomName,
              arrival.unit.unitName,
            );
            const late =
              arrival.expectedArrivalPassed && arrival.expectedArrival !== null;
            const when = arrival.expectedArrival
              ? late
                ? t("flow.lateBy", {
                    duration: duration(
                      minutesLate(
                        nowMinutes,
                        toMinutes(arrival.expectedArrival),
                      ),
                      locale,
                    ),
                  })
                : t("flow.expectedAt", {
                    time: cutoffTime(arrival.expectedArrival, locale),
                  })
              : t("flow.noTime");
            const canCheckIn = arrival.mayCheckIn && readiness !== "blocked";
            const screen =
              readiness === "blocked" ? blockerScreen(arrival) : "arrivals";
            return (
              <li
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2.5"
                key={arrival.reservationId}
              >
                <bdi
                  className="truncate font-mono text-sm text-muted-foreground"
                  title={room}
                >
                  {room}
                </bdi>
                <div className="min-w-0">
                  <bdi className="block truncate text-sm font-semibold">
                    {arrival.guestName ?? arrival.reference}
                  </bdi>
                  <span
                    className={cn(
                      "block text-xs text-balance",
                      late
                        ? "font-semibold text-danger"
                        : "text-muted-foreground",
                    )}
                  >
                    {when}
                  </span>
                  {readiness !== "ready" ? (
                    <span className="block text-xs text-balance text-warning">
                      {reasonOf(arrival, readiness)}
                    </span>
                  ) : null}
                </div>
                {canCheckIn ? (
                  <ArrivalCommand
                    arrival={arrival}
                    locale={locale}
                    onChanged={changed}
                    readiness={readiness}
                  />
                ) : (
                  <Link
                    className={LINK_BUTTON}
                    href={todayHref(locale, screen, scope.propertyId)}
                  >
                    {t(`open.${screen}`)}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        {collapsible ? (
          <FoldToggle
            controls={listId}
            expanded={expanded}
            hidden={ordered.length - ARRIVALS_COLLAPSED}
            onToggle={() => setExpanded((open) => !open)}
          />
        ) : null}
      </div>
    </section>
  );
}

function ArrivalChip({
  anchorEnd,
  arrival,
  at,
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
  const reasonOf = useArrivalReason();
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
          "absolute z-10 flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border border-s-4 bg-card px-3 py-2 shadow-xs",
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
          <bdi className="max-w-20 shrink-0 truncate">
            {unitLabel(arrival.unit.roomName, arrival.unit.unitName)}
          </bdi>
          {/* The longest state, "Clean, awaiting inspection", is wider than the
              card's inside: it gives way here, and the line under it says it
              whole, rather than push the page sideways. */}
          <StateBadge
            className="min-w-0 shrink justify-start"
            state={done ? "in_house" : readiness}
          />
        </span>
        {late ? (
          <span className="text-xs font-semibold text-danger">
            {t("flow.lateBy", { duration: duration(ago, locale) })}
          </span>
        ) : atRisk ? (
          <span className="text-xs font-semibold text-warning">
            {reasonOf(arrival, readiness)}
          </span>
        ) : null}
      </div>
    </>
  );
}

/** Departures shown before "show more": the most urgent, on one glance. */
const DUE_OUT_COLLAPSED = 6;

/**
 * Who is due out, as rows rather than cards: a day can end with a dozen
 * guests past their day to leave, and a card each, with a button each, pushed
 * the timeline off the screen. Collapsed it is the most urgent few and a line
 * that still counts the rest; expanded it is everybody, overdue apart from
 * those leaving today.
 */
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
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const overdue = departures.filter((d) => d.overdue);
  const leavingToday = departures.filter((d) => !d.overdue);
  const owed = owedByDepartures(departures);
  const collapsible = departures.length > DUE_OUT_COLLAPSED;
  const showAll = expanded || !collapsible;
  const n = (value: number) => formatNumber(value, locale);

  const toggle = () => {
    setExpanded((open) => !open);
    // Folding a long list lifts its own button out from under the pointer.
    if (expanded) sectionRef.current?.scrollIntoView({ block: "nearest" });
  };

  const rowProps = { changed, currency, locale, reviews, scope };
  const groups =
    showAll && overdue.length > 0 && leavingToday.length > 0
      ? [
          { key: "overdue", label: t("flow.overdueGroup"), rows: overdue },
          { key: "today", label: t("flow.leavesToday"), rows: leavingToday },
        ]
      : [
          {
            key: "all",
            label: null,
            rows: showAll ? departures : departures.slice(0, DUE_OUT_COLLAPSED),
          },
        ];

  return (
    <div ref={sectionRef}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Eyebrow>{t("flow.dueOut")}</Eyebrow>
          <span className="text-xs text-muted-foreground">
            {t("flow.dueOutHint")}
          </span>
        </div>
        {departures.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {overdue.length > 0 ? (
              <span className="font-semibold text-danger">
                {t("flow.summary.overdue", { count: overdue.length })}
              </span>
            ) : null}
            {overdue.length > 0 && leavingToday.length > 0 ? " · " : null}
            {leavingToday.length > 0
              ? t("flow.summary.leavingToday", { count: leavingToday.length })
              : null}
            {owed !== null && owed > 0
              ? ` · ${t("flow.summary.owed", { amount: money([{ amountMinor: owed, currency }], currency, locale) })}`
              : null}
          </p>
        ) : null}
      </div>
      {departures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flow.nobodyDue")}</p>
      ) : (
        <div className="@container">
          <div id={listId}>
            {groups.map((group) => (
              <section
                aria-label={group.label ?? t("flow.dueOut")}
                className="mb-3 last:mb-0"
                key={group.key}
              >
                {group.label ? (
                  <h3 className="mt-4 mb-1 text-xs font-semibold text-muted-foreground first:mt-0">
                    {group.label} · {n(group.rows.length)}
                  </h3>
                ) : null}
                <ul className="grid gap-x-8 @2xl:grid-cols-2">
                  {group.rows.map((departure) => (
                    <DueOutRow
                      departure={departure}
                      key={departure.stayId}
                      {...rowProps}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {collapsible ? (
            <FoldToggle
              controls={listId}
              expanded={expanded}
              hidden={departures.length - DUE_OUT_COLLAPSED}
              onToggle={toggle}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function DueOutRow({
  changed,
  currency,
  departure,
  locale,
  reviews,
  scope,
}: {
  changed: () => void;
  currency: string;
  departure: DepartureRow;
  locale: SupportedLocale;
  reviews: CheckOutReviews;
  scope: LayoutProps["scope"];
}) {
  const t = useTranslations("todayLayouts");
  const room = unitLabel(departure.unit.roomName, departure.unit.unitName);
  const owed =
    departure.balance && departure.balance.amountMinor > 0
      ? money([departure.balance], currency, locale)
      : null;
  const status =
    departure.overdue && departure.endsOn
      ? t("flow.overdueSince", { date: shortDay(departure.endsOn, locale) })
      : t("flow.leavesToday");
  return (
    <li className="@container/row grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2.5">
      <bdi
        className="truncate font-mono text-sm text-muted-foreground"
        title={room}
      >
        {room}
      </bdi>
      <div className="grid min-w-0 gap-x-3 @min-[26rem]/row:grid-cols-[minmax(0,1fr)_auto]">
        <bdi className="min-w-0 truncate text-sm font-semibold">
          {departure.guestName}
        </bdi>
        <span
          className={cn(
            "text-xs text-balance @min-[26rem]/row:col-span-2",
            departure.overdue
              ? "font-semibold text-danger"
              : "text-muted-foreground",
          )}
        >
          {status}
        </span>
        {owed ? (
          <span className="text-sm font-medium tabular-nums @min-[26rem]/row:col-start-2 @min-[26rem]/row:row-start-1">
            <span className="sr-only">{t("flow.owes", { amount: owed })}</span>
            <span aria-hidden="true">{owed}</span>
          </span>
        ) : null}
      </div>
      {departure.mayCheckOut ? (
        <DepartureCommand
          departure={departure}
          locale={locale}
          onChanged={changed}
          reviews={reviews}
          scope={scope}
        />
      ) : (
        <Link
          className={LINK_BUTTON}
          href={todayHref(locale, "departures", scope.propertyId)}
        >
          {t("open.departures")}
        </Link>
      )}
    </li>
  );
}
