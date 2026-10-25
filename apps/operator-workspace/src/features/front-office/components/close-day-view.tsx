"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Clock,
  Info,
} from "lucide-react";
import {
  formatDate,
  formatMoney,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import type { CloseTheDay } from "../../../server/viewer";
import type { Scope } from "../query-keys";
import { unitLabel } from "../unit-label";
import {
  ChangeDepartureDialog,
  type ChangeableStay,
} from "./change-departure-dialog";
import { CloseDayCheckOut } from "./close-day-check-out";
import { CloseDayDialog } from "./close-day-dialog";
import { FrontDeskRowMenu } from "./row-menu";

/** How many waiting days are listed with what holds each (a month of them). */
const WAITING_DAYS_SHOWN = 31;

/**
 * Close the day (blueprint 6.4, ADR 0034): the day waiting to be closed, what
 * still holds it up, and the recent closes.
 *
 * The steps are the mockup's. Beside a Guest due out or past their departure
 * is Extend, which opens Change departure for a viewer who may change it
 * (`mayAmend`, AB-S2-05 — CD-DEF-01 resolved). Room nights are charged by the
 * close itself (ADR 0038); what it will charge, and the Guests whose nights it
 * will not, are shown before it, and never block it. What is offered for an
 * open item is what resolves it today: a no-show, a cancellation or an
 * extension here, and the arrivals and departures screens for checking
 * somebody in or out, which already decide whether they can and say why not.
 *
 * Presentational. Whether the day may be closed, and by this viewer, is the
 * database's answer when the dialog asks; `mayClose` only decides whether the
 * control is offered.
 */
export function CloseDayView({
  day,
  locale,
  scope,
}: {
  day: CloseTheDay;
  locale: SupportedLocale;
  /** The viewer's, for reading the Departures list a check-out reviews. */
  scope: Scope;
}) {
  const t = useTranslations();
  const open = day.notArrived.length + day.notDeparted.length;
  const arrivalsHref = `${localizeHref(locale, "arrivals")}?property=${day.propertyId}`;
  const reservationsHref = `${localizeHref(locale, "reservations")}?property=${day.propertyId}`;
  const firstWaiting = day.waitingDays[0];
  const lastWaiting = day.waitingDays.at(-1);
  // Items only accumulate, so the same count on the first and the last waiting
  // day is the same items holding every one of them (CLOSE-01).
  const sameItemsEveryDay =
    firstWaiting !== undefined &&
    lastWaiting !== undefined &&
    day.waitingDays.length > 1 &&
    firstWaiting.openItems === lastWaiting.openItems;
  const holding = [
    ...day.notDeparted.map((row) => ({
      name: row.guestName ?? unitLabel(row.roomName, row.unitName),
      detail: [
        unitLabel(row.roomName, row.unitName),
        t("overdueDays", { count: row.overdueDays }),
      ].join(" · "),
    })),
    ...day.notArrived.map((row) => ({
      name: row.guestName,
      detail: [
        unitLabel(row.roomName, row.unitName),
        t("closeDay.dueOn", { date: shortDay(row.startsOn, locale) }),
      ].join(" · "),
    })),
  ];
  const charges = day.nightsToCharge
    ? [
        t("closeDay.roomNightsToCharge", { n: day.nightsToCharge.nights }),
        ...(day.nightsToCharge.amountMinor !== null &&
        day.nightsToCharge.nights > 0
          ? [
              formatMoney(
                day.nightsToCharge.amountMinor,
                day.nightsToCharge.currency,
                locale,
              ),
            ]
          : []),
      ].join(" · ")
    : null;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-step-1">
            {day.dayToClose
              ? t("closeDay.dueTitle", {
                  date: longDay(day.dayToClose, locale),
                })
              : t("closeDay.preparingTitle", {
                  date: longDay(day.today, locale),
                })}
          </CardTitle>
          <CardDescription>
            {day.dayToClose
              ? t("closeDay.dueDescription", { time: day.cutoff })
              : t("closeDay.preparingDescription", { time: day.cutoff })}
          </CardDescription>
          <CardAction>
            {day.dayToClose ? (
              <StatusBadge
                icon={CalendarCheck}
                label={t("closeDay.waitingBadge", { n: day.waiting })}
                tone={day.waiting > 1 ? "warning" : "info"}
              />
            ) : (
              <StatusBadge icon={Clock} label={day.cutoff} tone="neutral" />
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-step--1 text-muted-foreground">
            {t("closeDay.businessDateNow", {
              date: longDay(day.today, locale),
              zone: day.timezone,
              time: day.cutoff,
            })}
          </p>
          {day.waiting > 1 && firstWaiting && lastWaiting ? (
            <div className="grid gap-2">
              <p className="text-step--1">
                {t("closeDay.waiting", {
                  n: day.waiting,
                  from: shortDay(firstWaiting.date, locale),
                  to: shortDay(lastWaiting.date, locale),
                })}{" "}
                {t("closeDay.oldestAgo", {
                  date: shortDay(firstWaiting.date, locale),
                  n: daysBetween(firstWaiting.date, day.today),
                })}
              </p>
              {sameItemsEveryDay ? (
                <p className="text-step--1">
                  {t("closeDay.holdsEveryDay", {
                    n: firstWaiting.openItems,
                    names: holding.map((item) => item.name).join(", "),
                  })}
                </p>
              ) : (
                <div className="grid gap-1 text-step--1">
                  <p className="font-medium">{t("closeDay.holdsByDay")}</p>
                  <ul className="grid gap-0.5 text-muted-foreground">
                    {day.waitingDays
                      .slice(0, WAITING_DAYS_SHOWN)
                      .map((waiting) => (
                        <li key={waiting.date}>
                          {t("closeDay.dayOpen", {
                            date: shortDay(waiting.date, locale),
                            n: waiting.openItems,
                          })}
                        </li>
                      ))}
                    {day.waitingDays.length > WAITING_DAYS_SHOWN ? (
                      <li>
                        {t("closeDay.moreDays", {
                          n: day.waitingDays.length - WAITING_DAYS_SHOWN,
                        })}
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
          <p className="text-step--1 text-muted-foreground">
            {t("closeDay.whatHolds")} {t("closeDay.automatic")}
          </p>
          {day.dayToClose ? (
            day.mayClose ? (
              <div className="flex flex-wrap gap-2">
                {sameItemsEveryDay && lastWaiting ? (
                  <CloseDayDialog
                    all={{
                      count: day.waiting,
                      from: shortDay(day.dayToClose, locale),
                      to: shortDay(lastWaiting.date, locale),
                    }}
                    businessDate={day.dayToClose}
                    charges={charges}
                    dayLabel={longDay(day.dayToClose, locale)}
                    items={holding}
                    key={`${day.dayToClose}:all`}
                    locale={locale}
                    openItems={open}
                    propertyId={day.propertyId}
                    waitingMany
                  />
                ) : null}
                <CloseDayDialog
                  businessDate={day.dayToClose}
                  charges={charges}
                  dayLabel={longDay(day.dayToClose, locale)}
                  items={holding}
                  // A new day to close is a new form: a reason typed for the
                  // day before must not survive into this one.
                  key={day.dayToClose}
                  locale={locale}
                  openItems={open}
                  propertyId={day.propertyId}
                  waitingMany={day.waiting > 1}
                  alongsideAll={Boolean(sameItemsEveryDay && lastWaiting)}
                />
              </div>
            ) : (
              <p className="text-step--1">{t("closeDay.noPermission")}</p>
            )
          ) : null}
        </CardContent>
      </Card>

      <Step
        help={t("closeDay.notArrivedHelp")}
        open={day.notArrived.length}
        title={t("closeDay.notArrivedTitle")}
      >
        <ul className="divide-y divide-border">
          {day.notArrived.map((row) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              key={row.reservationId}
            >
              <div className="grid gap-0.5">
                <bdi className="font-medium">{row.guestName}</bdi>
                <span className="text-step--1 text-muted-foreground">
                  <bdi className="tabular-nums">{row.reference}</bdi>
                  {" · "}
                  <bdi className="tabular-nums">
                    {unitLabel(row.roomName, row.unitName)}
                  </bdi>
                  {" · "}
                  {t("closeDay.dueOn", {
                    date: shortDay(row.startsOn, locale),
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {row.status === "requested" ? (
                  <StatusBadge
                    icon={Info}
                    label={t("reservationStatus.requested")}
                    tone="neutral"
                  />
                ) : null}
                {row.expected ? (
                  <StatusBadge
                    icon={Clock}
                    label={t("closeDay.expectedToday")}
                    tone="info"
                  />
                ) : null}
                {row.arrivable ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={arrivalsHref}>
                      {t("closeDay.openArrivals")}
                    </Link>
                  </Button>
                ) : null}
                <FrontDeskRowMenu
                  booking={{
                    reservationId: row.reservationId,
                    reference: row.reference,
                    unitLabel: unitLabel(row.roomName, row.unitName),
                    mayCancel: row.mayCancel,
                    // Not before the day has ended: until then the Guest may
                    // still arrive, and a no-show cannot be taken back.
                    mayMarkNoShow: row.mayMarkNoShow && !row.expected,
                  }}
                  folioId={null}
                  guestName={row.guestName}
                  locale={locale}
                  propertyId={day.propertyId}
                />
              </div>
            </li>
          ))}
        </ul>
      </Step>

      <Step
        help={t("closeDay.notDepartedHelp")}
        open={day.notDeparted.length}
        title={t("closeDay.notDepartedTitle")}
      >
        <ul className="divide-y divide-border">
          {day.notDeparted.map((row) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              key={row.stayId}
            >
              <div className="grid gap-0.5">
                <StayLine
                  detail={[
                    t("closeDay.dueOutOn", {
                      date: shortDay(row.endsOn, locale),
                    }),
                    ...(row.overdueDays > 0
                      ? [t("overdueDays", { count: row.overdueDays })]
                      : []),
                  ].join(" · ")}
                  guestName={row.guestName}
                  unit={unitLabel(row.roomName, row.unitName)}
                  {...(row.reference ? { reference: row.reference } : {})}
                />
                {row.overdueDays > 0 ? (
                  <span className="text-step--1 text-muted-foreground">
                    {t("overdueNightsNote")}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.mayCheckOut ? (
                  <CloseDayCheckOut
                    locale={locale}
                    scope={scope}
                    stayId={row.stayId}
                  />
                ) : (
                  <span className="max-w-64 text-step--1 text-muted-foreground">
                    {t("closeDay.departuresViewOnly")}
                  </span>
                )}
                {row.mayAmend ? (
                  <ExtendStay
                    locale={locale}
                    stay={{
                      stayId: row.stayId,
                      reference: row.reference,
                      guestName: row.guestName ?? t("noGuestRecorded"),
                      unitLabel: unitLabel(row.roomName, row.unitName),
                      startsOn: row.startsOn,
                      endsOn: row.endsOn,
                      unpriced: !row.priced,
                    }}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Step>

      <Card>
        <CardHeader>
          <CardTitle>{t("closeDay.roomNightsTitle")}</CardTitle>
          <CardDescription>
            {day.nightsToCharge
              ? t("closeDay.roomNightsHelp")
              : t("closeDay.roomNightsTodayHelp")}
          </CardDescription>
          {day.nightsToCharge ? (
            <CardAction>
              <StatusBadge
                icon={BedDouble}
                label={[
                  t("closeDay.roomNightsToCharge", {
                    n: day.nightsToCharge.nights,
                  }),
                  ...(day.nightsToCharge.amountMinor !== null &&
                  day.nightsToCharge.nights > 0
                    ? [
                        formatMoney(
                          day.nightsToCharge.amountMinor,
                          day.nightsToCharge.currency,
                          locale,
                        ),
                      ]
                    : []),
                ].join(" · ")}
                tone="info"
              />
            </CardAction>
          ) : null}
        </CardHeader>
        {day.nightsToCharge ? (
          <CardContent>
            {day.nightsNotCharged.length === 0 ? (
              <p className="text-muted-foreground">
                {t("closeDay.roomNightsAllCharged")}
              </p>
            ) : (
              // Grouped by why: a Property that has not priced a kind of
              // room lists every such Guest every day, and one heading with
              // a count says that better than the reason on every row.
              <div className="grid gap-5">
                {byReason(day.nightsNotCharged).map(([reason, rows]) => (
                  <section className="grid gap-1" key={reason}>
                    <h3 className="text-step--1 font-medium">
                      {t(`closeDay.notChargedReason.${reason}`)}
                      <span className="text-muted-foreground tabular-nums">
                        {" · "}
                        {rows.length}
                      </span>
                    </h3>
                    {reason === "unpriced" ? (
                      <p className="text-step--1 text-muted-foreground">
                        {t("closeDay.unpricedNote")}
                      </p>
                    ) : null}
                    <ul className="divide-y divide-border">
                      {rows.map((row) => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                          key={row.stayId}
                        >
                          <span>
                            <bdi className="tabular-nums">
                              {row.guestName ??
                                unitLabel(row.roomName, row.unitName)}
                            </bdi>
                            {row.guestName ? (
                              <span className="text-step--1 text-muted-foreground">
                                {" · "}
                                <bdi className="tabular-nums">
                                  {unitLabel(row.roomName, row.unitName)}
                                </bdi>
                              </span>
                            ) : null}
                          </span>
                          {row.reservationId ? (
                            <Link
                              className="text-step--1 underline underline-offset-4"
                              href={`${reservationsHref}&open=${row.reservationId}`}
                              prefetch={false}
                            >
                              {t("closeDay.openBooking")}
                              {row.reference ? (
                                <>
                                  {" "}
                                  <bdi className="font-mono tabular-nums">
                                    {row.reference}
                                  </bdi>
                                </>
                              ) : null}
                            </Link>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        ) : null}
      </Card>

      {day.foliosLeftOpen.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("closeDay.foliosTitle")}</CardTitle>
            <CardDescription>{t("closeDay.foliosHelp")}</CardDescription>
            <CardAction>
              <StatusBadge
                icon={Info}
                label={t("closeDay.notBlocking")}
                tone="info"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {day.foliosLeftOpen.map((row) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={row.folioId}
                >
                  <StayLine
                    detail={t("closeDay.leftOn", {
                      date: shortDay(row.departedOn, locale),
                    })}
                    guestName={row.guestName}
                    unit={unitLabel(row.roomName, row.unitName)}
                  />
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatMoney(row.balanceMinor, row.currency, locale)}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`${localizeHref(locale, "finance")}?property=${day.propertyId}&folio=${row.folioId}`}
                      >
                        {t("closeDay.openFolio")}
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="recent-closes" className="grid gap-3">
        <h2 className="text-step-1 font-medium" id="recent-closes">
          {t("closeDay.recentTitle")}
        </h2>
        {day.recent.length === 0 ? (
          <p className="text-muted-foreground">{t("closeDay.recentEmpty")}</p>
        ) : (
          <>
            {/* Below 640 px each close is a card: seven columns do not fit a
                phone, and the ones that fell off the edge were the room
                nights and what was left open (CLOSE-10). */}
            <ul className="grid gap-3 sm:hidden">
              {day.recent.map((close) => (
                <li
                  className="grid gap-1 rounded-xl border bg-card p-4 text-step--1"
                  key={close.closeId}
                >
                  <p className="flex items-baseline justify-between gap-2">
                    <time className="font-medium" dateTime={close.businessDate}>
                      {shortDay(close.businessDate, locale)}
                    </time>
                    <span className="text-muted-foreground">
                      {close.automatic ? (
                        t("closeDay.automatically")
                      ) : (
                        <bdi>{close.closedBy}</bdi>
                      )}
                    </span>
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                    <dt className="text-muted-foreground">
                      {t("closeDay.arrived")}
                    </dt>
                    <dd className="text-end">{close.arrived}</dd>
                    <dt className="text-muted-foreground">
                      {t("closeDay.departed")}
                    </dt>
                    <dd className="text-end">{close.departed}</dd>
                    <dt className="text-muted-foreground">
                      {t("closeDay.nights")}
                    </dt>
                    <dd className="text-end">{close.nightsOccupied}</dd>
                    <dt className="text-muted-foreground">
                      {t("closeDay.roomNightsColumn")}
                    </dt>
                    <dd className="text-end">
                      {close.roomNightsCharged}
                      {close.roomRevenueMinor !== null &&
                      close.roomRevenueCurrency
                        ? ` · ${formatMoney(
                            close.roomRevenueMinor,
                            close.roomRevenueCurrency,
                            locale,
                          )}`
                        : ""}
                      {close.roomNightsNotCharged > 0 ? (
                        <span className="block text-warning">
                          {t("closeDay.roomNightsNotCharged", {
                            n: close.roomNightsNotCharged,
                          })}
                        </span>
                      ) : null}
                    </dd>
                    <dt className="text-muted-foreground">
                      {t("closeDay.leftOpen")}
                    </dt>
                    <dd className="text-end">{close.leftOpen}</dd>
                    <dt className="text-muted-foreground">
                      {t("closeDay.foliosOpen")}
                    </dt>
                    <dd className="text-end">{close.foliosLeftOpen}</dd>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("closeDay.day")}</TableHead>
                    <TableHead>{t("closeDay.closedBy")}</TableHead>
                    <TableHead className="text-end">
                      {t("closeDay.arrived")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("closeDay.departed")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("closeDay.nights")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("closeDay.roomNightsColumn")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("closeDay.leftOpen")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("closeDay.foliosOpen")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {day.recent.map((close) => (
                    <TableRow key={close.closeId}>
                      <TableCell>
                        <time dateTime={close.businessDate}>
                          {shortDay(close.businessDate, locale)}
                        </time>
                      </TableCell>
                      <TableCell>
                        {close.automatic ? (
                          <span className="text-muted-foreground">
                            {t("closeDay.automatically")}
                          </span>
                        ) : (
                          <bdi>{close.closedBy}</bdi>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {close.arrived}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {close.departed}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {close.nightsOccupied}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        <span className="block">
                          {close.roomNightsCharged}
                          {close.roomRevenueMinor !== null &&
                          close.roomRevenueCurrency ? (
                            <span className="text-muted-foreground">
                              {" · "}
                              {formatMoney(
                                close.roomRevenueMinor,
                                close.roomRevenueCurrency,
                                locale,
                              )}
                            </span>
                          ) : null}
                        </span>
                        {close.roomNightsNotCharged > 0 ? (
                          <span className="block text-step--1 text-warning">
                            {t("closeDay.roomNightsNotCharged", {
                              n: close.roomNightsNotCharged,
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {close.leftOpen}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {close.foliosLeftOpen}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {day.recent.length > 0 ? (
          <p className="text-step--1 text-muted-foreground">
            {t("closeDay.nightsHint")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Who a Stay is, and where. A Stay that began without a Reservation has no
 * Guest recorded anywhere, and then the room is its name and is said once.
 */
function StayLine({
  detail,
  guestName,
  reference,
  unit,
}: {
  detail: string;
  guestName: string | null;
  reference?: string;
  unit: string;
}) {
  return (
    <div className="grid gap-0.5">
      <bdi className="font-medium tabular-nums">{guestName ?? unit}</bdi>
      <span className="text-step--1 text-muted-foreground">
        {reference ? (
          <>
            <bdi className="font-mono tabular-nums">{reference}</bdi>
            {" · "}
          </>
        ) : null}
        {guestName ? (
          <>
            <bdi className="tabular-nums">{unit}</bdi>
            {" · "}
          </>
        ) : null}
        {detail}
      </span>
    </div>
  );
}

/** One step of the checklist: its state, and its rows while any are open. */
function Step({
  children,
  help,
  open,
  title,
}: {
  children: ReactNode;
  help: string;
  open: number;
  title: string;
}) {
  const t = useTranslations();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{help}</CardDescription>
        <CardAction>
          {open === 0 ? (
            <StatusBadge
              icon={CheckCircle2}
              label={t("closeDay.stepDone")}
              tone="success"
            />
          ) : (
            <StatusBadge
              icon={CircleAlert}
              label={t("closeDay.stepOpen", { n: open })}
              tone="warning"
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {open === 0 ? (
          <p className="text-muted-foreground">{t("closeDay.nothingOpen")}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/** The nights not charged, in groups of one reason each, in the order given. */
function byReason(
  rows: CloseTheDay["nightsNotCharged"],
): [
  CloseTheDay["nightsNotCharged"][number]["reason"],
  CloseTheDay["nightsNotCharged"],
][] {
  const groups = new Map<
    CloseTheDay["nightsNotCharged"][number]["reason"],
    CloseTheDay["nightsNotCharged"]
  >();
  for (const row of rows) {
    groups.set(row.reason, [...(groups.get(row.reason) ?? []), row]);
  }
  return [...groups];
}

/**
 * A business date is a calendar day, not an instant: formatted in UTC so it is
 * the same day for a reader in any time zone.
 */
function longDay(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    weekday: "long",
    month: "long",
    timeZone: "UTC",
  });
}

/** Whole calendar days from one `YYYY-MM-DD` to a later one, counted in UTC. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

function shortDay(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Extend, beside a Guest past their departure, so the day can close with them
 * no longer overdue (AB-S2-05). The dialog is Change departure's, mounted
 * only while open so nothing it read carries over to the next row.
 */
function ExtendStay({
  locale,
  stay,
}: {
  locale: SupportedLocale;
  stay: ChangeableStay;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("extendStay")}
      </Button>
      {open ? (
        <ChangeDepartureDialog
          locale={locale}
          onOpenChange={setOpen}
          open
          stay={stay}
        />
      ) : null}
    </>
  );
}
