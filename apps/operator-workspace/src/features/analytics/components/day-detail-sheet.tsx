"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  cn,
} from "@ranza/ui";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import type { DayDetail, DayDetailStay } from "../../../server/analytics";
import { formatMinorMoney, formatShortDate } from "../format";
import { analyticsHref } from "../href";
import { REASON } from "./uncharged-section";

/**
 * One day of the month table, opened: the Stays that held a unit that night,
 * each with its unit and its night's charge or the reason there was none, and
 * the corrections to the night. The day is the address (`?day=`), so it can be
 * linked to; the server reads it and this only draws it (AN-S3-04).
 *
 * It belongs to its day: another day is this sheet with that day's rows, never
 * a second sheet beside it, and a month link carries no day, so the sheet is
 * gone with the month (AN-S3-06). Closing it takes the day off the address and
 * puts focus back on the day's row, found again by its date because a refresh
 * may have redrawn the table.
 *
 * `chargeMinor`, `corrections` and `currency` are absent from the response of a
 * viewer who may not read money, so there is nothing here to hide.
 */
export function DayDetailSheet({
  detail,
  locale,
  nextDay,
  previousDay,
}: {
  detail: DayDetail;
  locale: SupportedLocale;
  /** The day after, when it is in the month and has happened. */
  nextDay: string | null;
  previousDay: string | null;
}) {
  const t = useTranslations("analytics.month");
  const root = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staysId = useId();
  const correctionsId = useId();
  const [open, setOpen] = useState(true);
  const month = detail.date.slice(0, 7);

  const close = (next: boolean) => {
    if (next) return;
    setOpen(false);
    router.replace(analyticsHref(pathname, searchParams, { month }), {
      scroll: false,
    });
  };

  const step = (Icon: LucideIcon, name: string, day: string | null) => {
    const icon = <Icon aria-hidden="true" className="size-4 rtl:rotate-180" />;
    if (day === null) {
      return (
        <Button
          aria-label={name}
          className="rounded-full"
          disabled
          size="icon-sm"
          type="button"
          variant="outline"
        >
          {icon}
        </Button>
      );
    }
    return (
      <Button asChild className="rounded-full" size="icon-sm" variant="outline">
        <Link
          aria-label={`${name}: ${formatShortDate(day, locale)}`}
          href={analyticsHref(pathname, searchParams, { month, day })}
          prefetch={false}
          replace
          scroll={false}
        >
          {icon}
        </Link>
      </Button>
    );
  };

  const money = (minor: number) =>
    formatMinorMoney(minor, detail.currency ?? "", locale);

  const place = (stay: { unitName: string; roomName: string | null }) =>
    stay.roomName === null
      ? stay.unitName
      : `${stay.roomName} · ${stay.unitName}`;

  const outcome = (stay: DayDetailStay) =>
    stay.night === "charged"
      ? t("nightCharged")
      : t(REASON[stay.night].labelKey);

  return (
    <Sheet onOpenChange={close} open={open}>
      <SheetContent
        className="gap-0 overflow-y-auto data-[side=end]:w-full data-[side=end]:sm:w-3/4"
        data-day-detail={detail.date}
        onCloseAutoFocus={(event) => {
          const link = document.querySelector<HTMLElement>(
            `[data-date="${CSS.escape(detail.date)}"] [data-day-link]`,
          );
          if (!link) return;
          event.preventDefault();
          link.focus();
        }}
        side="end"
      >
        <SheetHeader className="pe-14">
          <SheetTitle>{formatShortDate(detail.date, locale)}</SheetTitle>
          <SheetDescription>{t("dayDescription")}</SheetDescription>
          <nav
            aria-label={t("dayNavigation")}
            className="flex items-center gap-2 pt-2"
          >
            {step(ChevronLeft, t("previousDay"), previousDay)}
            {step(ChevronRight, t("nextDay"), nextDay)}
          </nav>
        </SheetHeader>

        <div className="grid gap-6 px-6 pb-6">
          {detail.state === "open" ? (
            <p
              className="border-s-2 border-border ps-4 text-sm text-muted-foreground"
              role="status"
            >
              {t("dayOpenNote")}
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-6">
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("occupiedNights")}
              </dt>
              <dd
                className="mt-1 text-3xl leading-none font-light tabular-nums"
                data-day-count="occupied"
              >
                {formatNumber(detail.occupiedNights, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("dayCharged")}
              </dt>
              <dd
                className="mt-1 text-3xl leading-none font-light tabular-nums"
                data-day-count="charged"
              >
                {formatNumber(detail.chargedNights, locale)}
              </dd>
            </div>
          </dl>

          <section aria-labelledby={staysId}>
            <h3
              className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase"
              id={staysId}
            >
              {t("dayStays")}
            </h3>
            {detail.stays.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dayNoStays")}</p>
            ) : (
              <ul>
                {detail.stays.map((stay) => (
                  <li
                    className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0"
                    data-stay={stay.stayId}
                    key={stay.stayId}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        <bdi>{place(stay)}</bdi>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {root(`unitType.${stay.unitType}`)} ·{" "}
                        {root(`stayType.${stay.stayType}`)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <bdi>
                          {stay.displayName ??
                            (stay.stayType === "guest"
                              ? t("noGuestName")
                              : "—")}
                        </bdi>
                      </p>
                    </div>
                    <div className="text-end">
                      <p
                        className={cn(
                          "text-sm",
                          stay.night !== "charged" && "text-muted-foreground",
                        )}
                      >
                        {outcome(stay)}
                      </p>
                      {stay.chargeMinor === undefined ? null : (
                        <p className="tabular-nums">
                          <bdi>{money(stay.chargeMinor)}</bdi>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.corrections && detail.corrections.length > 0 ? (
            <section aria-labelledby={correctionsId}>
              <h3
                className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase"
                id={correctionsId}
              >
                {t("dayCorrections")}
              </h3>
              <ul>
                {detail.corrections.map((correction, index) => (
                  <li
                    className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-border py-3 last:border-b-0"
                    data-correction
                    key={`${correction.stayId}-${index}`}
                  >
                    <div>
                      <p className="font-medium">
                        <bdi>{place(correction)}</bdi>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("correctionPosted", {
                          date: formatShortDate(correction.postedOn, locale),
                        })}
                      </p>
                    </div>
                    <p className="text-end tabular-nums">
                      <bdi>{money(correction.amountMinor)}</bdi>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
