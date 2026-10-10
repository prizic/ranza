import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import { FormError } from "@ranza/ui";

/** One end of a move: where, and when. */
export interface MoveEnd {
  place: string;
  /** Null where a move changes only the place. */
  period: string | null;
}

/**
 * `12 Oct – 14 Oct · 2 nights`, or `12 Oct – open-ended`. Dates are calendar
 * dates, formatted in UTC so they never move by a day.
 */
export function describePeriod(
  startsOn: string,
  endsOn: string | null,
  locale: SupportedLocale,
  words: { openEnded: string; nights: (count: number) => string },
): string {
  const day = (value: string) =>
    formatDate(new Date(`${value}T00:00:00Z`), locale, {
      month: "short",
      timeZone: "UTC",
    });
  if (endsOn === null) return `${day(startsOn)} – ${words.openEnded}`;
  const nights = Math.round(
    (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) /
      86_400_000,
  );
  return `${day(startsOn)} – ${day(endsOn)} · ${words.nights(nights)}`;
}

/**
 * A move from where it is to where it would go, and everything the calendar
 * already knows against it (RC-S3-04). Shown by the dialogs a drag or Move…
 * opens, above the database's own preview; the dialog keeps its save disabled
 * while any reason stands.
 */
export function MoveSummary({
  conflicts,
  from,
  to,
}: {
  conflicts: string[];
  from: MoveEnd;
  to: MoveEnd;
}) {
  const t = useTranslations("roomCalendar");
  return (
    <div className="grid gap-2">
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm"
        data-move-summary=""
      >
        <MoveEndText end={from} label={t("moveFrom")} />
        <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        <MoveEndText end={to} label={t("moveTo")} />
      </div>
      {conflicts.length > 0 ? (
        <ul className="grid gap-1" data-move-conflicts="">
          {conflicts.map((conflict) => (
            <li key={conflict}>
              <FormError>{conflict}</FormError>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MoveEndText({ end, label }: { end: MoveEnd; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate font-medium">
        <bdi>{end.place}</bdi>
      </p>
      {end.period ? (
        <p className="text-step--1 tabular-nums text-muted-foreground">
          <bdi>{end.period}</bdi>
        </p>
      ) : null}
    </div>
  );
}
