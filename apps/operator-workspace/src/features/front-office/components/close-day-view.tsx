"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
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
import { unitLabel } from "../unit-label";
import { CloseDayDialog } from "./close-day-dialog";
import { FrontDeskRowMenu } from "./row-menu";

/**
 * Close the day (blueprint 6.4, ADR 0034): the day waiting to be closed, what
 * still holds it up, and the recent closes.
 *
 * The steps are the mockup's, less the two it promises and nothing can keep.
 * Room nights are named and never block, because nothing has a rate; and
 * there is no "extend by a night" beside a Guest past their departure, because
 * no command changes a Stay's dates (CD-DEF-01). What is offered for an open
 * item is what resolves it today: a no-show or a cancellation here, and the
 * arrivals and departures screens for checking somebody in or out, which
 * already decide whether they can and say why not.
 *
 * Presentational. Whether the day may be closed, and by this viewer, is the
 * database's answer when the dialog asks; `mayClose` only decides whether the
 * control is offered.
 */
export function CloseDayView({
  day,
  locale,
}: {
  day: CloseTheDay;
  locale: SupportedLocale;
}) {
  const t = useTranslations();
  const open = day.notArrived.length + day.notDeparted.length;
  const arrivalsHref = `${localizeHref(locale, "arrivals")}?property=${day.propertyId}`;
  const departuresHref = `${localizeHref(locale, "departures")}?property=${day.propertyId}`;

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
          {day.waiting > 1 ? (
            <p className="text-step--1">
              {t("closeDay.waiting", { n: day.waiting })}
            </p>
          ) : null}
          <p className="text-step--1 text-muted-foreground">
            {t("closeDay.automatic")}
          </p>
          {day.dayToClose ? (
            day.mayClose ? (
              <div>
                <CloseDayDialog
                  businessDate={day.dayToClose}
                  dayLabel={longDay(day.dayToClose, locale)}
                  // A new day to close is a new form: a reason typed for the
                  // day before must not survive into this one.
                  key={day.dayToClose}
                  locale={locale}
                  openItems={open}
                  propertyId={day.propertyId}
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
                    mayMarkNoShow: row.mayMarkNoShow,
                  }}
                  folioId={null}
                  guestName={row.guestName}
                  locale={locale}
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
              <StayLine
                detail={t("closeDay.dueOutOn", {
                  date: shortDay(row.endsOn, locale),
                })}
                guestName={row.guestName}
                unit={unitLabel(row.roomName, row.unitName)}
              />
              <Button asChild size="sm" variant="outline">
                <Link href={departuresHref}>
                  {t("closeDay.openDepartures")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </Step>

      <Card>
        <CardHeader>
          <CardTitle>{t("closeDay.roomNightsTitle")}</CardTitle>
          <CardDescription>{t("closeDay.roomNightsHelp")}</CardDescription>
          <CardAction>
            <StatusBadge
              icon={Info}
              label={t("closeDay.notAvailable")}
              tone="neutral"
            />
          </CardAction>
        </CardHeader>
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
                        href={`${localizeHref(locale, "finance")}?folio=${row.folioId}`}
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
                    {close.leftOpen}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {close.foliosLeftOpen}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
  unit,
}: {
  detail: string;
  guestName: string | null;
  unit: string;
}) {
  return (
    <div className="grid gap-0.5">
      <bdi className="font-medium tabular-nums">{guestName ?? unit}</bdi>
      <span className="text-step--1 text-muted-foreground">
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

function shortDay(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}
