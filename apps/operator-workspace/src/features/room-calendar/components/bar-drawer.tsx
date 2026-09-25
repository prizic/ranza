"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  directionFor,
  formatDate,
  formatMoney,
  localizeHref,
  type SupportedLocale,
} from "@ranza/i18n";
import {
  Button,
  cn,
  Fact,
  FactList,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
  type StatusTone,
} from "@ranza/ui";
import type { RoomCalendarBar } from "../../../server/viewer";
import { daysBetween, type PlacedEntry } from "../layout";
import { BAR_ICON, barLook, type BarLook } from "./bar-style";

const TONE: Record<BarLook, StatusTone> = {
  requested: "neutral",
  confirmed: "info",
  inHouse: "success",
  overdue: "warning",
  departed: "neutral",
};

function date(day: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${day}T00:00:00Z`), locale, {
    month: "short",
    timeZone: "UTC",
  });
}

/** Where the command for this bar lives (RC-S1-64). */
function onward(
  bar: RoomCalendarBar,
  today: string,
): "arrivals" | "departures" | "reservations" {
  if (bar.kind === "stay" && bar.status === "in_house") return "departures";
  // Arrivals lists a booking only while it can still be checked in: begun,
  // and with a night still ahead.
  if (
    bar.kind === "reservation" &&
    bar.startsOn <= today &&
    (bar.endsOn === null || bar.endsOn > today)
  ) {
    return "arrivals";
  }
  return "reservations";
}

function Notice({
  children,
  tone,
}: {
  children: string;
  tone: "danger" | "warning" | "info";
}) {
  const classes = {
    danger: "border-danger/40 bg-danger-soft text-danger",
    warning: "border-warning/40 bg-warning-soft text-warning",
    info: "border-info/40 bg-info-soft text-info",
  } as const;
  return (
    <p className={cn("rounded-lg border px-3 py-2 text-sm", classes[tone])}>
      {children}
    </p>
  );
}

/**
 * One booking or Stay, opened from its bar.
 *
 * It follows the bar by key across refreshes, so a booking changed or removed
 * elsewhere while it is open says so rather than showing what it used to be
 * (RC-S1-65). It opens from the end the reader's text starts at — `Sheet`'s
 * sides are physical, so the side is chosen by direction (RC-S1-55).
 */
export function BarDrawer({
  barKey,
  changed,
  entry,
  locale,
  onClose,
  open,
  propertyId,
  today,
}: {
  /** The bar that opened it, which gets focus back when it closes (RC-S1-58). */
  barKey: string | null;
  changed: boolean;
  entry: PlacedEntry | null;
  locale: SupportedLocale;
  onClose: () => void;
  open: boolean;
  propertyId: string;
  today: string;
}) {
  const t = useTranslations("roomCalendar");
  const side = directionFor(locale) === "rtl" ? "left" : "right";

  return (
    <Sheet onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <SheetContent
        className="gap-0 overflow-y-auto"
        onCloseAutoFocus={(event) => {
          // Opened from a bar rather than a trigger, so Radix has nothing to
          // return focus to. The bar is found again by its key, because a
          // refresh while the drawer was open may have redrawn it.
          const bar =
            barKey === null
              ? null
              : document.querySelector<HTMLElement>(
                  `[data-bar-key="${CSS.escape(barKey)}"]`,
                );
          if (bar) {
            event.preventDefault();
            bar.focus();
          }
        }}
        side={side}
      >
        {entry === null ? (
          <SheetHeader>
            <SheetTitle>{t("goneTitle")}</SheetTitle>
            <SheetDescription>{t("goneNote")}</SheetDescription>
          </SheetHeader>
        ) : (
          <DrawerBody
            changed={changed}
            entry={entry}
            locale={locale}
            propertyId={propertyId}
            today={today}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  changed,
  entry: { bar, unit, room },
  locale,
  propertyId,
  today,
}: {
  changed: boolean;
  entry: PlacedEntry;
  locale: SupportedLocale;
  propertyId: string;
  today: string;
}) {
  const t = useTranslations("roomCalendar");
  const look = barLook(bar);
  const place = room ? `${room.name} · ${unit.name}` : unit.name;
  const target = onward(bar, today);
  const nights =
    bar.endsOn === null ? null : daysBetween(bar.startsOn, bar.endsOn);

  return (
    <>
      <SheetHeader className="pe-12">
        <SheetTitle>{bar.guestName ?? t("noGuestRecorded")}</SheetTitle>
        <SheetDescription>{place}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        <StatusBadge icon={BAR_ICON[look]} label={t(look)} tone={TONE[look]} />

        {changed ? <Notice tone="info">{t("changedNote")}</Notice> : null}
        {bar.overlaps ? (
          <Notice tone="danger">{t("overlapNote")}</Notice>
        ) : null}
        {bar.clashesWith === "booking" ? (
          <Notice tone="danger">{t("clashNote")}</Notice>
        ) : null}
        {bar.clashesWith === "stay" ? (
          <Notice tone="danger">{t("clashStayNote")}</Notice>
        ) : null}
        {bar.bookedWhileBlocked ? (
          <Notice tone="warning">
            {t("blockedNote", {
              reason:
                unit.statusReason ??
                t(unit.status === "blocked" ? "blocked" : "outOfService"),
            })}
          </Notice>
        ) : null}
        {bar.overdue && bar.endsOn ? (
          <Notice tone="warning">
            {t("overdueNote", { date: date(bar.endsOn, locale) })}
          </Notice>
        ) : null}

        <FactList className="grid-cols-2 gap-5 pt-2">
          <Fact label={bar.kind === "stay" ? t("arrived") : t("arrives")}>
            {date(bar.startsOn, locale)}
          </Fact>
          <Fact
            label={
              bar.kind === "stay" && bar.status === "departed"
                ? t("left")
                : t("leaves")
            }
          >
            {bar.endsOn ? date(bar.endsOn, locale) : t("noEndDate")}
          </Fact>
          {bar.kind === "stay" &&
          bar.bookedStartsOn &&
          (bar.bookedStartsOn !== bar.startsOn ||
            bar.bookedEndsOn !== bar.endsOn) ? (
            <Fact label={t("booked")}>
              {`${date(bar.bookedStartsOn, locale)} – ${
                bar.bookedEndsOn
                  ? date(bar.bookedEndsOn, locale)
                  : t("noEndDate")
              }`}
            </Fact>
          ) : null}
          {nights !== null ? (
            <Fact label={t("nightsLabel")}>
              {t("nights", { count: nights })}
            </Fact>
          ) : null}
          <Fact label={t("stayType")}>
            {bar.stayType === "resident" ? t("resident") : t("guest")}
          </Fact>
          {bar.kind === "stay" && bar.balance ? (
            <Fact label={t("balance")}>
              {formatMoney(
                bar.balance.balanceMinor,
                bar.balance.currency,
                locale,
              )}
              {bar.balance.closed ? (
                <span className="block text-xs text-muted-foreground">
                  {t("folioClosed")}
                </span>
              ) : null}
            </Fact>
          ) : null}
        </FactList>

        <Button asChild className="w-full">
          {/* Not prefetched: one bar is one link, read on the click. */}
          <Link
            href={`${localizeHref(locale, target)}?property=${propertyId}`}
            prefetch={false}
          >
            {t(`open.${target}`)}
          </Link>
        </Button>
      </div>
    </>
  );
}
