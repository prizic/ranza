"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BedDouble,
  Calendar,
  CalendarClock,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Receipt,
  User,
} from "lucide-react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import { unitLabel } from "../unit-label";
import { CopyReferenceButton } from "./copy-reference-button";
import { CheckInAction } from "./check-in-action";
import { UndoCheckInDialog } from "./undo-check-in-dialog";
import {
  RESERVATION_ICON,
  RESERVATION_TONE,
  type ReservationListRow,
} from "./columns";

function formatFullDate(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  onOpenChange,
  open,
  propertyId,
  reservation,
  today,
}: {
  locale: SupportedLocale;
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
  const isDueToday = inHouse && today && endsOn === today;
  const isOverdue = inHouse && today && endsOn && endsOn < today;
  const displayUnit = unitLabel(roomName, unitName);
  const effectiveStart = stayStartsOn ?? startsOn;
  const nightsCount =
    stayNights ?? (endsOn ? nightsBetween(effectiveStart, endsOn) : null);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-md p-6"
        side="end"
      >
        <SheetHeader className="space-y-2 border-b pb-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
              {reference}
              <CopyReferenceButton reference={reference} />
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge
                icon={RESERVATION_ICON[status]}
                label={t(`reservationStatus.${status}`)}
                tone={RESERVATION_TONE[status]}
              />
            </div>
          </div>
          <SheetTitle className="text-xl font-semibold tracking-tight">
            <bdi>{guestName}</bdi>
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {t(`stayType.${stayType}`)} · {t("reservationDetails")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Section 1: Stay Timeline */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <Calendar className="size-3.5" />
              <span>{t("stayTimeline")}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block text-step--2 text-muted-foreground">
                  {t("arrival")}
                </span>
                <span className="font-medium">
                  {formatFullDate(effectiveStart, locale)}
                </span>
              </div>
              <div>
                <span className="block text-step--2 text-muted-foreground">
                  {t("departure")}
                </span>
                <span className="font-medium">
                  {endsOn ? formatFullDate(endsOn, locale) : t("openEnded")}
                </span>
              </div>
            </div>
            {nightsCount !== null ? (
              <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5 text-xs text-muted-foreground">
                <Clock className="size-3" />
                <span>{t("stayNights", { count: nightsCount })}</span>
              </div>
            ) : null}
            {isDueToday ? (
              <div className="mt-2.5 inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-step--2 font-medium text-warning-foreground">
                <CalendarClock className="size-3.5" />
                <span>{t("dueToday")}</span>
              </div>
            ) : isOverdue && endsOn ? (
              <div className="mt-2.5 inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 text-step--2 font-medium text-destructive">
                <CalendarClock className="size-3.5" />
                <span>
                  {t("overdueSince", {
                    date: formatFullDate(endsOn, locale),
                  })}
                </span>
              </div>
            ) : null}
          </div>

          {/* Section 2: Unit & Room Map */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <BedDouble className="size-3.5" />
                <span>{t("unit")}</span>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link
                  className="flex items-center gap-1 text-xs"
                  href={`/${locale}/rooms?property=${encodeURIComponent(propertyId)}&unit=${encodeURIComponent(unitId)}`}
                >
                  <MapPin className="size-3 text-primary" />
                  <span>{t("showOnRoomMap")}</span>
                </Link>
              </Button>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  <bdi>{displayUnit}</bdi>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`unitType.${unitType}`)}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Contact Details */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <User className="size-3.5" />
              <span>{t("contactDetails")}</span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                {guestEmail ? (
                  <a
                    className="truncate text-primary underline-offset-4 hover:underline"
                    href={`mailto:${guestEmail}`}
                  >
                    <bdi>{guestEmail}</bdi>
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                {guestPhone ? (
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={`tel:${guestPhone}`}
                  >
                    <bdi>{guestPhone}</bdi>
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Billing & Folio */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <Receipt className="size-3.5" />
                <span>{t("financialDetails")}</span>
              </div>
              {folioId ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    className="flex items-center gap-1 text-xs"
                    href={`/${locale}/folios?property=${encodeURIComponent(propertyId)}&folio=${encodeURIComponent(folioId)}`}
                  >
                    <span>{t("openFolio")}</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block text-step--2 text-muted-foreground">
                  {t("priceColumn")}
                </span>
                <span className="font-medium">
                  {nightlyRateMinor !== null && rateCurrency !== null
                    ? formatMoney(nightlyRateMinor, rateCurrency, locale)
                    : t("bookedUnpriced")}
                </span>
              </div>
              <div>
                <span className="block text-step--2 text-muted-foreground">
                  {t("stayNights", { count: nightsCount ?? 1 })}
                </span>
                <span className="font-semibold text-primary">
                  {totalMinor !== null && rateCurrency !== null
                    ? formatMoney(totalMinor, rateCurrency, locale)
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {mayCheckIn ? (
              <CheckInAction
                locale={locale}
                reservationId={reservation.reservationId}
              />
            ) : checkInBlocker ? (
              <p className="text-center text-xs text-muted-foreground">
                {t(`checkInBlocked.${checkInBlocker}`)}
              </p>
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
