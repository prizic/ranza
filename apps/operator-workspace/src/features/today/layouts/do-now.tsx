"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import { unitLabel } from "../../front-office/unit-label";
import { cutoffTime, duration, money, shortDay } from "../format";
import { todayHref } from "../links";
import type { TodayScope } from "../query-keys";
import {
  readinessOf,
  roomsByName,
  type ActionKind,
  type DeskAction,
  type Readiness,
} from "./model";
import {
  ArrivalCommand,
  DepartureCommand,
  FoldToggle,
  Panel,
  reviewFor,
  type CheckOutReviews,
  type LayoutProps,
} from "./parts";

const LINK_BUTTON =
  "inline-flex min-h-9 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Rows shown before "show more": what a desk can start on at a glance. */
const DO_NOW_COLLAPSED = 5;

const KINDS: readonly ActionKind[] = [
  "overdue_departure",
  "late_arrival",
  "room_at_risk",
  "no_time",
];

interface Shared {
  changed: () => void;
  currency: string;
  desk: LayoutProps["desk"];
  locale: SupportedLocale;
  reviews: CheckOutReviews;
  scope: TodayScope;
}

/**
 * What to do, in order: the one list a desk can work down from the top.
 *
 * Folded it is the five most urgent; opened it is everything, grouped by what
 * kind of thing is waiting, the order inside it unchanged. Each row carries
 * the command that settles it where the viewer holds the permission, and a
 * way into the screen that does where they do not.
 */
export function DoNow({
  actions,
  ...shared
}: Shared & { actions: readonly DeskAction[] }) {
  const t = useTranslations("todayLayouts");
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const n = (value: number) => formatNumber(value, shared.locale);

  const ranked = actions.map((action, index) => ({
    action,
    number: index + 1,
  }));
  const collapsible = ranked.length > DO_NOW_COLLAPSED;
  const showAll = expanded || !collapsible;
  const visible = showAll ? ranked : ranked.slice(0, DO_NOW_COLLAPSED);
  const kinds = KINDS.filter((kind) =>
    visible.some((row) => row.action.kind === kind),
  );
  const groups =
    showAll && new Set(actions.map((a) => a.kind)).size > 1
      ? kinds.map((kind) => ({
          kind,
          label: t(`doNow.group.${kind}`),
          rows: visible.filter((row) => row.action.kind === kind),
        }))
      : [{ kind: "all", label: null, rows: visible }];

  const toggle = () => {
    setExpanded((open) => !open);
    // Folding a long list lifts its own button out from under the pointer.
    if (expanded) sectionRef.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <Panel labelledBy="do-now-title">
      <div ref={sectionRef}>
        <h2 className="text-xl font-semibold tracking-tight" id="do-now-title">
          {t("doNow.title")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          {t("doNow.sub")}
        </p>
        {actions.length === 0 ? (
          <p className="rounded-2xl bg-muted px-5 py-4 text-sm text-muted-foreground">
            {t("doNow.empty")}
          </p>
        ) : (
          <>
            <div id={listId}>
              {groups.map((group) => (
                <section className="mb-3 last:mb-0" key={group.kind}>
                  {group.label ? (
                    <p className="mt-4 mb-1 text-xs font-semibold text-muted-foreground first:mt-0">
                      {group.label} · {n(group.rows.length)}
                    </p>
                  ) : null}
                  <ol>
                    {group.rows.map(({ action, number }) => (
                      <DoNowRow
                        action={action}
                        key={`${action.kind}-${action.arrival?.reservationId ?? action.departure?.stayId}`}
                        number={number}
                        {...shared}
                      />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
            {collapsible ? (
              <FoldToggle
                controls={listId}
                expanded={expanded}
                hidden={ranked.length - DO_NOW_COLLAPSED}
                onToggle={toggle}
              />
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}

const TONE: Record<DeskAction["severity"], string> = {
  late: "text-danger",
  risk: "text-warning",
  info: "text-muted-foreground",
};

function DoNowRow({
  action,
  changed,
  currency,
  desk,
  locale,
  number,
  reviews,
  scope,
}: Shared & { action: DeskAction; number: number }) {
  const t = useTranslations("todayLayouts");
  const { arrival, departure } = action;
  const rooms = roomsByName(desk.rooms);
  const readiness: Readiness | null = arrival
    ? readinessOf(arrival, rooms)
    : null;
  const unit = arrival?.unit ?? departure?.unit;
  const who = arrival
    ? (arrival.guestName ?? arrival.reference)
    : (departure?.guestName ?? "");
  const owed =
    departure?.balance && departure.balance.amountMinor > 0
      ? money([departure.balance], currency, locale)
      : null;
  const hasCommand = departure
    ? reviewFor(departure, reviews) !== undefined
    : Boolean(arrival?.mayCheckIn && readiness === "ready");
  const id = scope.propertyId;
  const screen =
    action.kind === "room_at_risk"
      ? "housekeeping"
      : departure
        ? "departures"
        : "arrivals";

  return (
    <li className="@container/row grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-t border-line py-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto]">
      <span
        className={cn("text-xl font-light tabular-nums", TONE[action.severity])}
      >
        {formatNumber(number, locale)}
      </span>
      <div className="grid min-w-0 gap-x-3 @min-[26rem]/row:grid-cols-[minmax(0,1fr)_auto]">
        <h3 className="min-w-0 truncate text-sm font-semibold">
          <bdi>{who}</bdi> ·{" "}
          <bdi>{unit ? unitLabel(unit.roomName, unit.unitName) : null}</bdi>
        </h3>
        <p className="text-sm text-balance text-muted-foreground @min-[26rem]/row:col-span-2">
          {detailOf(action, readiness, desk, locale, t)}
        </p>
        {owed ? (
          <span className="text-sm font-medium tabular-nums @min-[26rem]/row:col-start-2 @min-[26rem]/row:row-start-1">
            <span className="sr-only">
              {t("detail.owes", { amount: owed })}
            </span>
            <span aria-hidden="true">{owed}</span>
          </span>
        ) : null}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:min-w-44 sm:justify-end">
        {departure ? (
          <DepartureCommand
            departure={departure}
            locale={locale}
            onChanged={changed}
            reviews={reviews}
            scope={scope}
          />
        ) : null}
        {arrival && readiness === "ready" ? (
          <ArrivalCommand
            arrival={arrival}
            locale={locale}
            onChanged={changed}
          />
        ) : null}
        {hasCommand ? null : (
          <Link className={LINK_BUTTON} href={todayHref(locale, screen, id)}>
            {t(`open.${screen}`)}
          </Link>
        )}
      </div>
    </li>
  );
}

/** What is wrong with this row, in a sentence; what is owed is shown apart. */
function detailOf(
  action: DeskAction,
  readiness: Readiness | null,
  desk: LayoutProps["desk"],
  locale: SupportedLocale,
  t: ReturnType<typeof useTranslations<"todayLayouts">>,
): string {
  const { arrival, departure } = action;
  const state = readiness ? t(`state.${readiness}`) : "";
  const time = arrival?.expectedArrival
    ? cutoffTime(arrival.expectedArrival, locale)
    : "";
  switch (action.kind) {
    case "overdue_departure":
      return t("detail.overdueDeparture", {
        date: departure?.endsOn ? shortDay(departure.endsOn, locale) : "",
      });
    case "late_arrival":
      return t("detail.lateArrival", {
        time,
        duration: duration(action.minutes ?? 0, locale),
        state,
      });
    case "room_at_risk":
      return action.minutes === null
        ? t("detail.riskNoTime", { state })
        : t("detail.risk", {
            time,
            duration: duration(Math.max(0, action.minutes), locale),
            state,
          });
    case "no_time":
      return t("detail.noTime");
  }
}
