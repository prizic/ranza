"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlarmClock,
  CalendarClock,
  ExternalLink,
  History,
  MapPin,
} from "lucide-react";
import {
  DialogActions,
  DialogBody,
  DialogFacts,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  Sheet,
  SheetContent,
  StayRuler,
  StatusBadge,
  sheetFrameClassName,
} from "@ranza/ui";
import {
  formatDate,
  formatMoney,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import { expectedArrivalLabel } from "../expected-arrival";
import { daysBetween, didNotArrive } from "../reservation-tabs";
import { unitLabel } from "../unit-label";
import { CopyReferenceButton } from "./copy-reference-button";
import { CheckInAction } from "./check-in-action";
import { UndoCheckInDialog } from "./undo-check-in-dialog";
import {
  RESERVATION_ICON,
  RESERVATION_TONE,
  ReservationMenu,
  type ReservationListRow,
} from "./columns";

const LINK_CLASS =
  "inline-flex items-center gap-1.5 font-medium text-primary-text underline-offset-4 hover:underline";

function formatFullDate(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function nightsBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export function ReservationDetailSheet({
  locale,
  mayReadHistory,
  onOpenChange,
  open,
  propertyId,
  reservation,
  today,
}: {
  locale: SupportedLocale;
  /** Whether the viewer may open the Audit log here, where History leads. */
  mayReadHistory: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  propertyId: string;
  reservation: ReservationListRow | null;
  today?: string | null;
}) {
  const t = useTranslations();

  if (!reservation) return null;

  const {
    checkInBlocker,
    endsOn,
    expectedArrival,
    folioId,
    guestEmail,
    guestName,
    guestPhone,
    mayCheckIn,
    mayUndoCheckIn,
    nightlyRateMinor,
    rateCurrency,
    reference,
    roomName,
    startsOn,
    status,
    stayId,
    stayNights,
    stayStartsOn,
    stayType,
    totalMinor,
    unitId,
    unitName,
    unitType,
  } = reservation;

  const inHouse = status === "checked_in";
  const { overdueDays } = reservation;
  const isDueToday = inHouse && overdueDays === 0 && endsOn === today;
  const displayUnit = unitLabel(roomName, unitName);
  const effectiveStart = stayStartsOn ?? startsOn;
  const nightsCount =
    stayNights ?? (endsOn ? nightsBetween(effectiveStart, endsOn) : null);
  const priced = nightlyRateMinor !== null && rateCurrency !== null;
  const roomMapHref = `/${locale}/rooms?property=${encodeURIComponent(propertyId)}&unit=${encodeURIComponent(unitId)}`;
  const historyHref = `${localizeHref(locale, "audit-log")}?property=${encodeURIComponent(propertyId)}&subject=${encodeURIComponent(reservation.reservationId)}`;
  const folioHref = folioId
    ? `${localizeHref(locale, "finance")}?property=${encodeURIComponent(propertyId)}&folio=${encodeURIComponent(folioId)}`
    : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className={sheetFrameClassName}
        side="end"
      >
        <DialogMasthead
          art="/illustrations/dialogs/change-booking.svg"
          eyebrow={t("reservationDetails")}
          facts={`${t("unit")} ${displayUnit} · ${t(`unitType.${unitType}`)}`}
          heading={guestName}
        />

        <DialogBody>
          <DialogSection>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <StatusBadge
                icon={RESERVATION_ICON[status]}
                label={t(`reservationStatus.${status}`)}
                tone={RESERVATION_TONE[status]}
              />
              <span className="text-muted-foreground">
                {t(`stayType.${stayType}`)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                <bdi>{reference}</bdi>
                <CopyReferenceButton reference={reference} />
              </span>
            </div>
          </DialogSection>

          <DialogSection title={t("stayTimeline")}>
            {endsOn ? (
              <StayRuler
                end={endsOn}
                format={(iso) => formatShortDate(iso, locale)}
                label={t("changeDepartureRulerLabel", {
                  from: formatShortDate(effectiveStart, locale),
                  to: formatShortDate(endsOn, locale),
                })}
                start={effectiveStart}
                today={inHouse ? (today ?? null) : null}
                todayLabel={t("changeDepartureTodayMark")}
              />
            ) : null}
            <DialogFacts
              rows={[
                [t("arrival"), formatFullDate(effectiveStart, locale)],
                ...(expectedArrival && !inHouse
                  ? ([
                      [
                        t("expectedArrival"),
                        <bdi key="expected">
                          {expectedArrivalLabel(expectedArrival, locale)}
                        </bdi>,
                      ],
                    ] as const)
                  : []),
                [
                  t("departure"),
                  endsOn
                    ? nightsCount !== null
                      ? `${formatFullDate(endsOn, locale)} · ${t("stayNights", { count: nightsCount })}`
                      : formatFullDate(endsOn, locale)
                    : t("openEnded"),
                ],
              ]}
            />
            {isDueToday ? (
              <DialogNotice icon={CalendarClock}>{t("dueToday")}</DialogNotice>
            ) : today && didNotArrive(reservation, today) ? (
              <DialogNotice icon={AlarmClock}>
                {t("didNotArriveDays", {
                  count: daysBetween(startsOn, today),
                })}{" "}
                ·{" "}
                {t("wasDueToArriveOn", {
                  date: formatFullDate(startsOn, locale),
                })}
              </DialogNotice>
            ) : overdueDays > 0 && endsOn ? (
              <DialogNotice icon={AlarmClock}>
                {t("overdueDays", { count: overdueDays })} ·{" "}
                {t("wasDueOn", { date: formatFullDate(endsOn, locale) })}
              </DialogNotice>
            ) : null}
          </DialogSection>

          <DialogSection title={t("contactDetails")}>
            <DialogFacts
              rows={[
                [
                  t("guestEmail"),
                  guestEmail ? (
                    <a
                      className={LINK_CLASS}
                      href={`mailto:${guestEmail}`}
                      key="email"
                    >
                      <bdi>{guestEmail}</bdi>
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                [
                  t("guestPhone"),
                  guestPhone ? (
                    <a
                      className={LINK_CLASS}
                      href={`tel:${guestPhone}`}
                      key="phone"
                    >
                      <bdi>{guestPhone}</bdi>
                    </a>
                  ) : (
                    "—"
                  ),
                ],
              ]}
            />
          </DialogSection>

          <DialogSection title={t("financialDetails")}>
            <DialogFacts
              rows={[
                [
                  t("priceColumn"),
                  priced
                    ? formatMoney(nightlyRateMinor, rateCurrency, locale)
                    : t("bookedUnpriced"),
                ],
              ]}
              {...(totalMinor !== null && rateCurrency !== null
                ? {
                    total: [
                      t("stayNights", { count: nightsCount ?? 1 }),
                      formatMoney(totalMinor, rateCurrency, locale),
                    ] as const,
                  }
                : {})}
            />
            {folioHref ? (
              <p className="m-0 text-sm">
                <Link className={LINK_CLASS} href={folioHref}>
                  {t("openFolio")}
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3.5 rtl:-scale-x-100"
                  />
                </Link>
              </p>
            ) : null}
          </DialogSection>

          {checkInBlocker && !mayCheckIn ? (
            <DialogSection>
              <DialogNotice>
                {t(`checkInBlocked.${checkInBlocker}`)}
              </DialogNotice>
            </DialogSection>
          ) : null}
        </DialogBody>

        <DialogActions
          hint={
            <span className="flex flex-col gap-1.5">
              <Link className={LINK_CLASS} href={roomMapHref}>
                <MapPin aria-hidden="true" className="size-4" />
                {t("showOnRoomMap")}
              </Link>
              {mayReadHistory ? (
                <Link
                  className={LINK_CLASS}
                  href={historyHref}
                  prefetch={false}
                >
                  <History aria-hidden="true" className="size-4" />
                  {t("reservationHistory")}
                </Link>
              ) : null}
            </span>
          }
        >
          {/* Everything the row's menu does, where the booking is being read:
              change, no-show, cancel, the Folio and the room map. */}
          <ReservationMenu
            booking={reservation}
            locale={locale}
            propertyId={propertyId}
            today={today}
          />
          {mayCheckIn ? (
            <CheckInAction
              guestName={guestName}
              locale={locale}
              reservationId={reservation.reservationId}
            />
          ) : null}
          {mayUndoCheckIn && stayId ? (
            <UndoCheckInDialog
              guestName={guestName}
              locale={locale}
              reservationId={reservation.reservationId}
              stayId={stayId}
              unitName={displayUnit}
            />
          ) : null}
        </DialogActions>
      </SheetContent>
    </Sheet>
  );
}
