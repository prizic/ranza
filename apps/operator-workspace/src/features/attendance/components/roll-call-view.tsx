"use client";

import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { Plane, Search } from "lucide-react";
import { Button, EmptyState, FormError, Input } from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import type { Mark, RollCall, RollCallRow } from "@ranza/attendance";
import {
  closeLeave,
  markAttendance,
  markFloorPresent,
  type AttendanceOutcome,
} from "../../../server/attendance";
import {
  figuresOfRows,
  groupRows,
  stillToCall,
  visibleRows,
  type RollFilter,
} from "../grouping";
import { CurfewControl } from "./curfew-control";
import { FiguresStrip } from "./figures-strip";
import { GiveLeaveDialog } from "./give-leave-dialog";
import { nightLabel, RollCallRowView } from "./roll-call-row";

interface Change {
  stayIds: readonly string[];
  mark: Mark;
}

/** An answer shown at once, before the server has confirmed it. */
function applyChange(
  rows: readonly RollCallRow[],
  change: Change,
): RollCallRow[] {
  const named = new Set(change.stayIds);
  return rows.map((row) =>
    named.has(row.stayId) && row.status !== "on_leave"
      ? { ...row, status: change.mark }
      : row,
  );
}

/**
 * Tonight's roll call (LA-S2-01 to LA-S2-13): the figures, then the people in
 * the order a warden walks them.
 *
 * An answer is shown the moment it is pressed and confirmed behind it; if the
 * server refuses it the row goes back and the reason is said above the list,
 * so a tap is never silently lost. The database decides who may call, who may
 * give leave and whether a night may be called at all; the `may…` flags only
 * decide which controls are offered.
 */
export function RollCallView({
  initialFilter = "all",
  locale,
  rollCall,
}: {
  /** The figure a link opened the list narrowed to, until the desk presses another. */
  initialFilter?: RollFilter;
  locale: SupportedLocale;
  rollCall: RollCall;
}) {
  const t = useTranslations("attendance");
  const [rows, applyOptimistic] = useOptimistic(rollCall.rows, applyChange);
  const [filter, setFilter] = useState<RollFilter>(initialFilter);
  const [needle, setNeedle] = useState("");
  const [problem, setProblem] = useState<AttendanceOutcome | null>(null);
  const [activeStay, setActiveStay] = useState<string | null>(null);
  const [leaveFor, setLeaveFor] = useState<string | null | undefined>(
    undefined,
  );
  const [saving, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const figures = useMemo(() => figuresOfRows(rows), [rows]);
  const shown = useMemo(
    () => visibleRows(rows, filter, needle),
    [rows, filter, needle],
  );
  const groups = useMemo(() => groupRows(shown), [shown]);
  const hasBuildings = groups.some((group) => group.building !== null);
  const firstShown = shown[0]?.stayId;
  const focusable =
    activeStay && shown.some((row) => row.stayId === activeStay)
      ? activeStay
      : firstShown;

  function report(outcome: AttendanceOutcome) {
    setProblem(outcome === "done" ? null : outcome);
  }

  function mark(stayIds: readonly string[], answer: Mark) {
    if (stayIds.length === 0) return;
    startTransition(async () => {
      applyOptimistic({ stayIds, mark: answer });
      report(
        await markAttendance({
          locale,
          propertyId: rollCall.propertyId,
          night: rollCall.night,
          answers: stayIds.map((stayId) => ({ stayId, mark: answer })),
        }),
      );
    });
  }

  function markRest(stayIds: readonly string[]) {
    if (stayIds.length === 0) return;
    startTransition(async () => {
      applyOptimistic({ stayIds, mark: "present" });
      report(
        await markFloorPresent({
          locale,
          propertyId: rollCall.propertyId,
          stayIds,
        }),
      );
    });
  }

  function closeOne(leaveId: string, how: "back" | "cancel") {
    startTransition(async () => {
      report(await closeLeave({ locale, leaveId, how }));
    });
  }

  function rowElements(): HTMLElement[] {
    return Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-roll-row]") ?? [],
    );
  }

  function focusRow(element: HTMLElement | undefined) {
    element?.focus();
  }

  /** The keyboard path: arrows walk the rows, P and A answer and move on. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-roll-row]",
    );
    if (!row || event.target !== row) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const all = rowElements();
    const at = all.indexOf(row);
    const key = event.key.toLowerCase();

    if (key === "arrowdown" || key === "arrowup") {
      event.preventDefault();
      focusRow(all[at + (key === "arrowdown" ? 1 : -1)]);
    } else if (key === "home" || key === "end") {
      event.preventDefault();
      focusRow(key === "home" ? all[0] : all.at(-1));
    } else if ((key === "p" || key === "a") && rollCall.mayTake) {
      event.preventDefault();
      const stayId = row.dataset.rollRow;
      if (!stayId || row.dataset.status === "on_leave") return;
      mark([stayId], key === "p" ? "present" : "absent");
      focusRow(all[at + 1]);
    }
  }

  const tonightLabel = formatDate(
    new Date(`${rollCall.night}T00:00:00Z`),
    locale,
    { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" },
  );
  const problemText =
    problem === null
      ? null
      : problem === "refused"
        ? t("problem.refused")
        : problem === "closed"
          ? t("problem.closed")
          : t("problem.failed");

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-step-2 font-normal">
          {t("tonight", { date: tonightLabel })}
        </h2>
        <CurfewControl
          curfew={rollCall.curfew}
          isDefault={rollCall.curfewIsDefault}
          locale={locale}
          mayChange={rollCall.mayConfigure}
          passed={rollCall.curfewPassed}
          propertyId={rollCall.propertyId}
        />
      </header>

      <FiguresStrip
        curfewPassed={rollCall.curfewPassed}
        figures={figures}
        filter={filter}
        onFilter={setFilter}
      />

      {problemText ? <FormError>{problemText}</FormError> : null}
      <p
        aria-live="polite"
        className="-mt-3 min-h-4 text-xs text-muted-foreground"
      >
        {saving ? t("saving") : null}
      </p>

      {rows.length === 0 ? (
        <EmptyState description={t("emptyHint")} title={t("emptyTitle")} />
      ) : (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("search")}
                className="ps-9"
                onChange={(event) => setNeedle(event.target.value)}
                placeholder={t("search")}
                type="search"
                value={needle}
              />
            </div>
            {filter !== "all" || needle !== "" ? (
              <Button
                onClick={() => {
                  setFilter("all");
                  setNeedle("");
                }}
                type="button"
                variant="ghost"
              >
                {t("showEveryone")}
              </Button>
            ) : null}
            {rollCall.mayGrant ? (
              <Button
                className="ms-auto min-h-11 gap-2 sm:min-h-9"
                onClick={() => setLeaveFor(null)}
                type="button"
                variant="outline"
              >
                <Plane aria-hidden="true" className="rtl:-scale-x-100" />
                {t("giveLeave")}
              </Button>
            ) : null}
          </div>

          {rollCall.mayTake ? (
            <p className="text-xs text-muted-foreground">{t("keyboardHint")}</p>
          ) : null}

          <div
            className="grid gap-6"
            onKeyDown={onKeyDown}
            ref={listRef}
            role="presentation"
          >
            {groups.length === 0 ? (
              <p className="text-muted-foreground">{t("noMatches")}</p>
            ) : null}
            {groups.map((building) => (
              <div className="grid gap-4" key={building.key}>
                {hasBuildings ? (
                  <h3 className="font-mono text-xs tracking-widest text-muted-foreground uppercase rtl:font-sans rtl:tracking-normal rtl:normal-case">
                    {building.building ?? t("otherRooms")}
                  </h3>
                ) : null}
                {building.floors.map((floor) => {
                  const rest = stillToCall(floor.rows);
                  return (
                    <section
                      aria-labelledby={`floor-${floor.key}`}
                      className="overflow-hidden rounded-2xl border bg-card"
                      key={floor.key}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
                        <h4
                          className="text-sm font-semibold"
                          id={`floor-${floor.key}`}
                        >
                          {floor.floor === null
                            ? t("noFloor")
                            : t("floor", { n: floor.floor })}
                        </h4>
                        {rollCall.mayTake && rest.length > 0 ? (
                          <Button
                            className="min-h-11 sm:min-h-8"
                            onClick={() => markRest(rest)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {t("markRest", { count: rest.length })}
                          </Button>
                        ) : null}
                      </div>
                      <ul>
                        {floor.rows.map((row) => (
                          <RollCallRowView
                            active={row.stayId === focusable}
                            begun={
                              row.leave !== null &&
                              row.leave.fromNight < rollCall.night
                            }
                            key={row.stayId}
                            locale={locale}
                            mayGrant={rollCall.mayGrant}
                            mayTake={rollCall.mayTake}
                            onFocusRow={setActiveStay}
                            onGiveLeave={setLeaveFor}
                            onLeaveBack={closeOne}
                            onMark={(stayId, answer) => mark([stayId], answer)}
                            row={row}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3">
        <h3 className="text-step-1 font-normal">{t("leavesTitle")}</h3>
        {rollCall.leaves.length === 0 ? (
          <p className="text-muted-foreground">{t("leavesEmpty")}</p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border bg-card">
            {rollCall.leaves.map((leave) => (
              <li
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-2.5 last:border-b-0"
                key={leave.leaveId}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {leave.residentName ?? leave.stayId}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {leave.fromNight === leave.toNight
                      ? nightLabel(leave.fromNight, locale)
                      : t("leaveRange", {
                          from: nightLabel(leave.fromNight, locale),
                          to: nightLabel(leave.toNight, locale),
                        })}
                    {leave.reason ? ` · ${leave.reason}` : null}
                  </p>
                </div>
                {leave.mayClose ? (
                  <Button
                    className="min-h-11 sm:min-h-9"
                    onClick={() =>
                      closeOne(leave.leaveId, leave.begun ? "back" : "cancel")
                    }
                    type="button"
                    variant="outline"
                  >
                    {leave.begun ? t("backFromLeave") : t("cancelLeave")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {rollCall.mayGrant ? (
        <GiveLeaveDialog
          locale={locale}
          night={rollCall.night}
          onOpenChange={(open) => {
            if (!open) setLeaveFor(undefined);
          }}
          open={leaveFor !== undefined}
          rows={rows}
          stayId={leaveFor ?? null}
        />
      ) : null}
    </div>
  );
}
