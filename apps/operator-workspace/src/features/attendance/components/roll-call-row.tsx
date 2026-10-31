"use client";

import { useTranslations } from "next-intl";
import { Check, Plane, X } from "lucide-react";
import { cn, Button } from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import type { Mark, RollCallRow } from "@ranza/attendance";

/** A night as a short date, read in UTC because it is a calendar day and not an instant. */
export function nightLabel(night: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${night}T00:00:00Z`), locale, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: undefined,
  });
}

export function placeOf(row: RollCallRow): string {
  return row.bedName ? `${row.roomName} · ${row.bedName}` : row.roomName;
}

/**
 * One Resident on the roll (LA-S2-02, LA-S2-03).
 *
 * The row itself is the target: a tap anywhere on an uncalled row marks it
 * present, which is the answer nine times in ten, and the buttons at its end
 * say absent. A row already answered ignores a tap on its body, so a stray
 * touch cannot turn a present into anything else; the buttons change it. The
 * same two answers are the keys P and A on the focused row.
 *
 * A Resident on leave is not markable at all: the row says until when, and
 * offers the way back for someone who may close the leave.
 */
export function RollCallRowView({
  active,
  begun,
  locale,
  mayGrant,
  mayTake,
  onFocusRow,
  onGiveLeave,
  onLeaveBack,
  onMark,
  row,
}: {
  active: boolean;
  /** The leave on this row has begun, so closing it is "back" and not "cancel". */
  begun: boolean;
  locale: SupportedLocale;
  mayGrant: boolean;
  mayTake: boolean;
  onFocusRow: (stayId: string) => void;
  onGiveLeave: (stayId: string) => void;
  onLeaveBack: (leaveId: string, how: "back" | "cancel") => void;
  onMark: (stayId: string, mark: Mark) => void;
  row: RollCallRow;
}) {
  const t = useTranslations("attendance");
  const name = row.residentName ?? placeOf(row);
  const leave = row.status === "on_leave" ? row.leave : null;
  const canTap = mayTake && row.status === "not_called";

  return (
    <li
      aria-label={name}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-2.5 last:border-b-0",
        "focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
        canTap && "cursor-pointer hover:bg-muted/60",
        row.status === "absent" && "bg-danger-soft/40",
      )}
      data-roll-row={row.stayId}
      data-status={row.status}
      onClick={(event) => {
        if (!canTap) return;
        if ((event.target as HTMLElement).closest("button")) return;
        onMark(row.stayId, "present");
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusRow(row.stayId);
      }}
      tabIndex={active ? 0 : -1}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {row.residentName ? placeOf(row) : null}
          {leave ? (
            <>
              {row.residentName ? " · " : null}
              {t("leaveUntil", {
                date: nightLabel(leave.toNight, locale),
              })}
              {leave.reason ? ` · ${leave.reason}` : null}
            </>
          ) : null}
        </p>
      </div>

      {leave ? (
        mayGrant ? (
          <Button
            aria-label={
              begun
                ? t("backFromLeaveFor", { name })
                : t("cancelLeaveFor", { name })
            }
            className="min-h-11 sm:min-h-9"
            onClick={() =>
              onLeaveBack(leave.leaveId, begun ? "back" : "cancel")
            }
            type="button"
            variant="outline"
          >
            {begun ? t("backFromLeave") : t("cancelLeave")}
          </Button>
        ) : null
      ) : (
        <div className="flex items-center gap-2">
          {mayTake ? (
            <>
              <Button
                aria-label={t("presentFor", { name })}
                aria-pressed={row.status === "present"}
                className={cn(
                  "min-h-11 min-w-24 gap-1.5 sm:min-h-9",
                  row.status === "present" &&
                    "border-success/40 bg-success-soft text-success hover:bg-success-soft",
                )}
                onClick={() => onMark(row.stayId, "present")}
                type="button"
                variant="outline"
              >
                <Check aria-hidden="true" />
                {t("present")}
              </Button>
              <Button
                aria-label={t("absentFor", { name })}
                aria-pressed={row.status === "absent"}
                className={cn(
                  "min-h-11 min-w-24 gap-1.5 sm:min-h-9",
                  row.status === "absent" &&
                    "border-danger/40 bg-danger-soft text-danger hover:bg-danger-soft",
                )}
                onClick={() => onMark(row.stayId, "absent")}
                type="button"
                variant="outline"
              >
                <X aria-hidden="true" />
                {t("absent")}
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              {row.status === "present"
                ? t("present")
                : row.status === "absent"
                  ? t("absent")
                  : t("notCalled")}
            </span>
          )}
          {mayGrant ? (
            <Button
              aria-label={t("giveLeaveFor", { name })}
              className="min-h-11 gap-1.5 sm:min-h-9"
              onClick={() => onGiveLeave(row.stayId)}
              title={t("giveLeave")}
              type="button"
              variant="ghost"
            >
              <Plane aria-hidden="true" className="rtl:-scale-x-100" />
              <span className="hidden lg:inline">{t("giveLeave")}</span>
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
