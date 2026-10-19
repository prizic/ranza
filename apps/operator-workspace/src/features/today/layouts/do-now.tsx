"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import { unitLabel } from "../../front-office/unit-label";
import { cutoffTime, duration, money, shortDay } from "../format";
import { todayHref } from "../links";
import type { TodayScope } from "../query-keys";
import { readinessOf, roomsByName, type DeskAction } from "./model";
import {
  ArrivalCommand,
  DepartureCommand,
  Panel,
  type CheckOutReviews,
  type LayoutProps,
} from "./parts";

const LINK_BUTTON =
  "inline-flex min-h-9 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * What to do, in order: the one list a desk can work down from the top. Each
 * row carries the command that settles it where the viewer holds the
 * permission, and a way into the screen that does where they do not.
 */
export function DoNow({
  actions,
  changed,
  currency,
  desk,
  locale,
  reviews,
  scope,
}: {
  actions: readonly DeskAction[];
  changed: () => void;
  currency: string;
  desk: LayoutProps["desk"];
  locale: SupportedLocale;
  reviews: CheckOutReviews;
  scope: TodayScope;
}) {
  const t = useTranslations("todayLayouts");
  const rooms = roomsByName(desk.rooms);
  const id = scope.propertyId;

  return (
    <Panel labelledBy="do-now-title">
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
        <ol>
          {actions.map((action, index) => {
            const arrival = action.arrival;
            const departure = action.departure;
            const who = arrival
              ? (arrival.guestName ?? arrival.reference)
              : (departure?.guestName ?? "");
            const unit = arrival?.unit ?? departure?.unit;
            const readiness = arrival ? readinessOf(arrival, rooms) : null;
            const state = readiness ? t(`state.${readiness}`) : "";
            const owed =
              departure?.balance && departure.balance.amountMinor > 0
                ? money([departure.balance], currency, locale)
                : null;
            const time = arrival?.expectedArrival
              ? cutoffTime(arrival.expectedArrival, locale)
              : "";
            return (
              <li
                className="grid grid-cols-[2.5rem_1fr] items-center gap-x-4 gap-y-3 border-t border-line py-4 sm:grid-cols-[2.5rem_1fr_auto]"
                key={`${action.kind}-${arrival?.reservationId ?? departure?.stayId}`}
              >
                <span
                  className={cn(
                    "text-3xl font-light tabular-nums",
                    action.severity === "late" && "text-danger",
                    action.severity === "risk" && "text-warning",
                    action.severity === "info" && "text-muted-foreground",
                  )}
                >
                  {formatNumber(index + 1, locale)}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    <bdi>{who}</bdi> ·{" "}
                    <bdi>
                      {unit ? unitLabel(unit.roomName, unit.unitName) : null}
                    </bdi>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {action.kind === "overdue_departure"
                      ? [
                          t("detail.overdueDeparture", {
                            date: departure?.endsOn
                              ? shortDay(departure.endsOn, locale)
                              : "",
                          }),
                          owed ? t("detail.owes", { amount: owed }) : null,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      : action.kind === "late_arrival"
                        ? t("detail.lateArrival", {
                            time,
                            duration: duration(action.minutes ?? 0, locale),
                            state,
                          })
                        : action.kind === "room_at_risk"
                          ? action.minutes === null
                            ? t("detail.riskNoTime", { state })
                            : t("detail.risk", {
                                time,
                                duration: duration(
                                  Math.max(0, action.minutes),
                                  locale,
                                ),
                                state,
                              })
                          : t("detail.noTime")}
                  </p>
                </div>
                <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
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
                  <Link
                    className={LINK_BUTTON}
                    href={
                      action.kind === "room_at_risk"
                        ? todayHref(locale, "housekeeping", id)
                        : departure
                          ? todayHref(locale, "departures", id)
                          : todayHref(locale, "arrivals", id)
                    }
                  >
                    {action.kind === "room_at_risk"
                      ? t("open.housekeeping")
                      : departure
                        ? t("open.departures")
                        : t("open.arrivals")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
