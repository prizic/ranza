"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import { unitLabel } from "../../front-office/unit-label";
import { cutoffTime, duration, money, nights, shortDay } from "../format";
import { todayHref } from "../links";
import {
  actionsFor,
  isToCome,
  readinessOf,
  roomsByName,
  type DeskAction,
} from "./model";
import {
  ArrivalCommand,
  DepartureCommand,
  Panel,
  StateBadge,
  useCheckOutReviews,
  usePropertyMinutes,
  type LayoutProps,
} from "./parts";

const LANE_ROWS = 4;
const DAY_MS = 86_400_000;

/** Whole days between two `YYYY-MM-DD` business dates. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS,
  );
}

/**
 * One thing at a time. The most urgent item is the page; what is blocking it is
 * a short checklist, and the command that settles it is the largest button. The
 * rest of the day waits in a ranked queue and three short lanes underneath.
 *
 * For a quiet desk, or one person on it. In a rush the whole day in view is
 * better, which is why this is a choice and not the only page.
 */
export function NextUpLayout(props: LayoutProps) {
  const { desk, locale, nowMs, onChanged, scope, summary } = props;
  const t = useTranslations("todayLayouts");
  const nowMinutes = usePropertyMinutes(nowMs, summary.day.timezone);
  const { reviews, changed } = useCheckOutReviews(
    scope,
    desk.departures,
    onChanged,
  );
  const actions = actionsFor(desk, nowMinutes);
  const [chosen, setChosen] = useState(0);
  const index = Math.min(chosen, Math.max(0, actions.length - 1));
  const current = actions[index];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[5fr_4fr]">
        {current ? (
          <Hero
            action={current}
            businessDate={summary.day.businessDate}
            changed={changed}
            currency={summary.day.currency}
            desk={desk}
            locale={locale}
            onNext={() => setChosen((index + 1) % actions.length)}
            onPrevious={() =>
              setChosen((index + actions.length - 1) % actions.length)
            }
            reviews={reviews}
            scope={scope}
            single={actions.length === 1}
          />
        ) : (
          <Panel className="grid min-h-80 place-content-center bg-primary text-center text-primary-foreground">
            <p className="text-3xl font-light">{t("nextUp.clear")}</p>
            <p className="mt-2 text-sm text-primary-foreground/75">
              {t("nextUp.clearHint")}
            </p>
          </Panel>
        )}
        <Panel labelledBy="queue-title" className="px-2 md:px-2">
          <h2
            className="px-5 text-xl font-semibold tracking-tight"
            id="queue-title"
          >
            {t("nextUp.queue")}
          </h2>
          <p className="mt-1 mb-3 px-5 text-sm text-muted-foreground">
            {t("nextUp.queueHint")}
          </p>
          <ol>
            {actions.map((action, position) => (
              <li
                key={`${action.kind}-${action.arrival?.reservationId ?? action.departure?.stayId}`}
              >
                <button
                  aria-pressed={position === index}
                  className="grid w-full grid-cols-[0.375rem_2rem_1fr_auto] items-center gap-3.5 rounded-2xl py-3.5 ps-4 pe-5 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-accent aria-pressed:ring-[1.5px] aria-pressed:ring-primary"
                  onClick={() => setChosen(position)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-10 rounded-full",
                      action.severity === "late" && "bg-danger",
                      action.severity === "risk" && "bg-warning",
                      action.severity === "info" && "bg-line-strong",
                    )}
                  />
                  <span className="text-2xl font-light text-muted-foreground tabular-nums">
                    {formatNumber(position + 1, locale)}
                  </span>
                  <span className="min-w-0">
                    <bdi className="block truncate font-semibold">
                      {t(`nextUp.kinds.${action.kind}`, {
                        guest: subject(action),
                      })}
                    </bdi>
                    <bdi className="block text-sm text-muted-foreground">
                      {where(action)}
                    </bdi>
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {action.minutes !== null && action.severity === "late"
                      ? duration(action.minutes, locale)
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      <Lanes {...props} />
    </div>
  );
}

function subject(action: DeskAction): string {
  return (
    action.arrival?.guestName ??
    action.arrival?.reference ??
    action.departure?.guestName ??
    ""
  );
}

function where(action: DeskAction): string {
  const unit = action.arrival?.unit ?? action.departure?.unit;
  return unit ? unitLabel(unit.roomName, unit.unitName) : "";
}

function Hero({
  action,
  businessDate,
  changed,
  currency,
  desk,
  locale,
  onNext,
  onPrevious,
  reviews,
  scope,
  single,
}: {
  action: DeskAction;
  businessDate: string;
  changed: () => void;
  currency: string;
  desk: LayoutProps["desk"];
  locale: SupportedLocale;
  onNext: () => void;
  onPrevious: () => void;
  reviews: ReturnType<typeof useCheckOutReviews>["reviews"];
  scope: LayoutProps["scope"];
  single: boolean;
}) {
  const t = useTranslations("todayLayouts");
  const rooms = roomsByName(desk.rooms);
  const { arrival, departure } = action;
  const readiness = arrival ? readinessOf(arrival, rooms) : null;
  const length = arrival ? nights(arrival.startsOn, arrival.endsOn) : null;
  const daysLate = departure?.endsOn
    ? daysBetween(departure.endsOn, businessDate)
    : 0;
  const owed =
    departure?.balance && departure.balance.amountMinor > 0
      ? money([departure.balance], currency, locale)
      : null;

  const big =
    action.kind === "overdue_departure"
      ? t("nextUp.days", { count: daysLate })
      : action.minutes !== null
        ? duration(Math.max(0, action.minutes), locale)
        : "—";
  const bigNote =
    action.kind === "overdue_departure"
      ? t("nextUp.bigOverdue")
      : action.kind === "late_arrival"
        ? t("nextUp.bigLate", {
            time: arrival?.expectedArrival
              ? cutoffTime(arrival.expectedArrival, locale)
              : "",
          })
        : action.kind === "room_at_risk" && action.minutes !== null
          ? t("nextUp.bigUntil", {
              time: arrival?.expectedArrival
                ? cutoffTime(arrival.expectedArrival, locale)
                : "",
            })
          : t("nextUp.bigNoTime");

  const checks: { ok: boolean; label: string; value: ReactNode }[] = [];
  if (arrival && readiness) {
    checks.push({
      ok: readiness === "ready",
      label: t("nextUp.checkRoom", {
        room: unitLabel(arrival.unit.roomName, arrival.unit.unitName),
      }),
      value: t(`state.${readiness}`),
    });
    checks.push({
      ok: arrival.expectedArrival !== null,
      label: t("nextUp.checkTime"),
      value: arrival.expectedArrival
        ? cutoffTime(arrival.expectedArrival, locale)
        : t("house.noTime"),
    });
    checks.push({
      ok: true,
      label: t("nextUp.checkBooking", { reference: arrival.reference }),
      value:
        length === null
          ? t("house.openEnded")
          : t("house.nights", { count: length }),
    });
  }
  if (departure) {
    if (departure.balance) {
      checks.push({
        ok: !owed,
        label: t("house.balance"),
        value: owed ? t("flow.owes", { amount: owed }) : t("house.nothingOwed"),
      });
    }
    checks.push({
      ok: false,
      label: t("nextUp.checkDeparture"),
      value: departure.endsOn ? shortDay(departure.endsOn, locale) : "—",
    });
  }

  const eyebrowRoom = unitLabel(
    (arrival ?? departure)?.unit.roomName ?? null,
    (arrival ?? departure)?.unit.unitName ?? "",
  );

  return (
    <section
      aria-live="polite"
      className="flex min-h-[32rem] flex-col rounded-[2rem] bg-primary p-7 text-primary-foreground shadow-raised md:p-9"
    >
      <p className="text-[10px] font-bold tracking-[0.2em] text-primary-foreground/70 uppercase">
        {t(`nextUp.eyebrow.${action.kind}`, { room: eyebrowRoom })}
      </p>
      <p className="mt-6 flex flex-wrap items-baseline gap-x-4">
        <span className="text-7xl leading-none font-extralight tracking-tight tabular-nums md:text-8xl">
          {big}
        </span>
        <span className="text-lg text-primary-foreground/75">{bigNote}</span>
      </p>
      <h2 className="mt-4 text-3xl font-light tracking-tight md:text-4xl">
        <bdi className="font-semibold">{subject(action)}</bdi>{" "}
        {t(`nextUp.headline.${action.kind}`)}
      </h2>
      <p className="mt-2 max-w-prose text-primary-foreground/80">
        {t(`nextUp.why.${action.kind}`)}
      </p>
      <ul className="my-7 border-t border-primary-foreground/20">
        {checks.map((check) => (
          <li
            className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 border-b border-primary-foreground/20 py-3"
            key={check.label}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full",
                check.ok
                  ? "bg-primary-foreground text-primary"
                  : "bg-danger-soft text-danger",
              )}
            >
              {check.ok ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                <X aria-hidden="true" className="size-3.5" />
              )}
            </span>
            <span>
              {check.label}
              <span className="sr-only">
                {check.ok ? t("nextUp.fine") : t("nextUp.blocking")}
              </span>
            </span>
            <span
              className={cn(
                "text-sm",
                check.ok ? "text-primary-foreground/75" : "font-semibold",
              )}
            >
              {check.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-3">
        {departure || (arrival && readiness === "ready") ? (
          // The command's own button is the theme's primary, which is the
          // hero's own ground: it gets a light pill to sit on.
          <div className="rounded-full bg-primary-foreground p-1">
            {departure ? (
              <DepartureCommand
                departure={departure}
                locale={locale}
                onChanged={changed}
                reviews={reviews}
                scope={scope}
              />
            ) : arrival ? (
              <ArrivalCommand
                arrival={arrival}
                locale={locale}
                onChanged={changed}
              />
            ) : null}
          </div>
        ) : null}
        <Link
          className="inline-flex min-h-10 items-center rounded-full border border-primary-foreground/40 px-5 text-sm font-medium transition-colors hover:bg-primary-foreground/10 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
          href={
            action.kind === "room_at_risk"
              ? todayHref(locale, "housekeeping", scope.propertyId)
              : departure
                ? todayHref(locale, "departures", scope.propertyId)
                : todayHref(locale, "arrivals", scope.propertyId)
          }
        >
          {action.kind === "room_at_risk"
            ? t("open.housekeeping")
            : departure
              ? t("open.departures")
              : t("open.arrivals")}
        </Link>
        {single ? null : (
          <span className="ms-auto flex gap-2">
            <button
              aria-label={t("nextUp.previous")}
              className="grid size-10 place-items-center rounded-full border border-primary-foreground/40 hover:bg-primary-foreground/10 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
              onClick={onPrevious}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
            </button>
            <button
              aria-label={t("nextUp.next")}
              className="grid size-10 place-items-center rounded-full border border-primary-foreground/40 hover:bg-primary-foreground/10 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
              onClick={onNext}
              type="button"
            >
              <ArrowRight
                aria-hidden="true"
                className="size-4 rtl:rotate-180"
              />
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

function Lanes({ desk, locale, scope, summary }: LayoutProps) {
  const t = useTranslations("todayLayouts");
  const rooms = roomsByName(desk.rooms);
  const toCome = desk.arrivals.filter(isToCome);
  const inHouse = desk.rooms
    .filter((room) => room.state === "in_house" && room.guestName)
    .sort((a, b) => (a.endsOn ?? "￿").localeCompare(b.endsOn ?? "￿"));
  const id = scope.propertyId;
  const more = (shown: number, total: number) =>
    total > shown ? t("nextUp.more", { count: total - shown }) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Lane
        count={toCome.length}
        href={todayHref(locale, "arrivals", id)}
        locale={locale}
        more={more(LANE_ROWS, toCome.length)}
        sub={t("nextUp.arrivingSub", {
          done: desk.arrivals.length - toCome.length,
          total: desk.arrivals.length,
        })}
        title={t("nextUp.arriving")}
      >
        {toCome.slice(0, LANE_ROWS).map((arrival) => (
          <li
            className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 border-t border-line py-3 text-sm"
            key={arrival.reservationId}
          >
            <bdi className="text-xl font-light">
              {unitLabel(arrival.unit.roomName, arrival.unit.unitName)}
            </bdi>
            <span>
              <bdi className="block font-medium">
                {arrival.guestName ?? arrival.reference}
              </bdi>
              <span className="text-xs text-muted-foreground">
                {arrival.expectedArrival
                  ? cutoffTime(arrival.expectedArrival, locale)
                  : t("house.noTime")}
              </span>
            </span>
            <StateBadge state={readinessOf(arrival, rooms)} />
          </li>
        ))}
      </Lane>
      <Lane
        count={inHouse.length}
        href={todayHref(locale, "rooms", id)}
        locale={locale}
        more={more(LANE_ROWS, inHouse.length)}
        sub={t("nextUp.inHouseSub", {
          count:
            summary.occupancy?.status === "ok"
              ? summary.occupancy.data.expectedTonight
              : inHouse.length,
        })}
        title={t("nextUp.inHouse")}
      >
        {inHouse.slice(0, LANE_ROWS).map((room) => (
          <li
            className="grid grid-cols-[3.25rem_1fr] items-center gap-3 border-t border-line py-3 text-sm"
            key={room.unitId}
          >
            <bdi className="text-xl font-light">{room.name}</bdi>
            <span>
              <bdi className="block font-medium">{room.guestName}</bdi>
              <span className="text-xs text-muted-foreground">
                {room.endsOn
                  ? t("house.leavesOn", { date: shortDay(room.endsOn, locale) })
                  : null}
              </span>
            </span>
          </li>
        ))}
      </Lane>
      <Lane
        count={desk.departures.length}
        href={todayHref(locale, "departures", id)}
        locale={locale}
        more={more(LANE_ROWS, desk.departures.length)}
        sub={t("nextUp.leavingSub", {
          done: desk.departed,
          total: desk.departed + desk.departures.length,
        })}
        title={t("nextUp.leaving")}
      >
        {desk.departures.slice(0, LANE_ROWS).map((departure) => (
          <li
            className="grid grid-cols-[3.25rem_1fr] items-center gap-3 border-t border-line py-3 text-sm"
            key={departure.stayId}
          >
            <bdi className="text-xl font-light">
              {unitLabel(departure.unit.roomName, departure.unit.unitName)}
            </bdi>
            <span>
              <bdi className="block font-medium">{departure.guestName}</bdi>
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
              </span>
            </span>
          </li>
        ))}
      </Lane>
    </div>
  );
}

function Lane({
  children,
  count,
  href,
  locale,
  more,
  sub,
  title,
}: {
  children: ReactNode;
  count: number;
  href: string;
  locale: SupportedLocale;
  more: string | null;
  sub: string;
  title: string;
}) {
  return (
    <Panel className="md:p-6">
      <header className="flex items-baseline justify-between">
        <Link className="text-lg font-semibold hover:underline" href={href}>
          {title}
        </Link>
        <span className="text-4xl font-light tabular-nums">
          {formatNumber(count, locale)}
        </span>
      </header>
      <p className="mb-3 text-sm text-muted-foreground">{sub}</p>
      <ul>{children}</ul>
      {more ? (
        <p className="border-t border-line pt-3 text-sm text-muted-foreground">
          {more}
        </p>
      ) : null}
    </Panel>
  );
}
