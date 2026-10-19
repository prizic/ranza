"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type {
  HousekeepingBoard as Board,
  HousekeepingRoom,
  HousekeepingStatus,
} from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import { Button, cn, DataTable, EmptyState } from "@ranza/ui";
import { useTableLabels } from "../../../lib/table-labels";
import {
  ListFilterNotice,
  type ListFilterKey,
} from "../../today/components/list-filter-notice";
import { markRooms, type MarkOutcome } from "../../../server/housekeeping";
import type { RoomDay } from "../../../server/housekeeping-day";
import { inRoomFilter } from "../../today/views";
import {
  floorValue,
  MARK_LABEL,
  MARKS,
  NO_FLOOR,
  useHousekeepingColumns,
} from "./columns";
import { STATUS_LOOK } from "./status";

/**
 * The Housekeeping board (RANZ-28): every room at a Property, whether it needs
 * cleaning, and marking one room or many.
 *
 * Presentational apart from the mark: the board arrives through the server
 * funnel, and the mark goes back through a server action whose write the
 * policies bound. One action state for the whole board, so every mark control
 * is disabled while one is in flight and a double press cannot send two
 * (HK-S2-06).
 *
 * A selection is cleared when a mark lands. A refusal is followed by the board
 * the page revalidates to, which is read-only when the refusal was the viewer's
 * permission going, and then shows no selection control at all (HK-S2-13,
 * decided by the product owner, 2026-09-24).
 */
export function HousekeepingBoard({
  allHref,
  board,
  days,
  locale,
  markLimit,
  narrowed,
  propertyName,
  reportHref,
  timeZone,
}: {
  /** The board unnarrowed, for the way back from a figure on Today. */
  allHref: string;
  /** Rooms most urgent first, so the list opens on what to clean next. */
  board: Board;
  /** What the day asks of each room, by Unit id: an arrival, a departure. */
  days: Readonly<Record<string, RoomDay>>;
  /**
   * The rooms a figure on Today counted, when the reader came from one
   * (TD-S5-01). The tiles above still count the whole board.
   */
  narrowed: {
    detail?: string;
    filter: ListFilterKey;
    floor?: string;
    rooms: readonly HousekeepingRoom[];
  } | null;
  locale: SupportedLocale;
  /** The most rooms one mark may name; the module refuses more. */
  markLimit: number;
  propertyName: string;
  /**
   * The Maintenance report form up to the room's id, for somebody who may
   * report; a string because a function cannot cross to the browser.
   */
  reportHref: string | null;
  timeZone: string;
}) {
  const t = useTranslations("housekeeping");
  const labels = useTableLabels();
  const [outcome, dispatch, pending] = useActionState<MarkOutcome, FormData>(
    markRooms,
    { status: "idle" },
  );
  const clearSelection = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (outcome.status === "done") {
      clearSelection.current?.();
      clearSelection.current = null;
    }
  }, [outcome]);

  function mark(unitIds: string[], status: HousekeepingStatus) {
    const form = new FormData();
    form.set("locale", locale);
    form.set("status", status);
    for (const unitId of unitIds) form.append("unitId", unitId);
    startTransition(() => dispatch(form));
  }

  const columns = useHousekeepingColumns({
    locale,
    timeZone,
    days,
    mayMark: board.mayMark,
    pending,
    reportHref,
    onMark: mark,
  });

  // "Ready to let" is the one definition Today uses: a room a Guest can be put
  // in tonight, so a clean room somebody is still in is not counted (RANZ-57).
  const readyToLet = board.rooms.filter((room) =>
    inRoomFilter("ready", room),
  ).length;
  const floors = Array.from(
    new Set(board.rooms.map((room) => floorValue(room.floor))),
  ).sort((a, b) => floorOrder(a) - floorOrder(b));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-4">
        <Tally label={t("statRooms")} value={board.counts.rooms} />
        <Tally label={t("statDirty")} value={board.counts.dirty} />
        <Tally label={t("statClean")} value={board.counts.clean} />
        <Tally label={t("statInspected")} value={board.counts.inspected} />
        <Tally label={t("statReady")} value={readyToLet} />
      </div>

      {narrowed ? (
        <ListFilterNotice
          allHref={allHref}
          count={narrowed.rooms.length}
          detail={narrowed.detail}
          filter={narrowed.filter}
          floor={narrowed.floor}
        />
      ) : null}

      {/* Only over rooms: on an empty board the notice would claim a
          restriction about nothing, beside a Property that has no rooms yet. */}
      {board.mayMark || board.rooms.length === 0 ? null : (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-step--1 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("readOnly")}
        </p>
      )}

      <ResultNotice outcome={outcome} t={t} />

      <DataTable<HousekeepingRoom, unknown>
        {...(board.mayMark
          ? {
              bulkActions: (selected, clear) => {
                // Selection spans pages, so it can outgrow one mark before
                // anything is sent; saying so here beats a refusal after it.
                const tooMany = selected.length > markLimit;
                return (
                  <>
                    {MARKS.map((status) => {
                      const Icon = STATUS_LOOK[status].icon;
                      return (
                        <Button
                          className={cn(
                            "min-h-11 md:min-h-0",
                            // A room marked dirty is the mark to undo what the
                            // other two did: kept apart so a thumb aiming at
                            // Mark clean cannot land on it.
                            status === "dirty" && "ms-4 border-dashed",
                          )}
                          disabled={pending || tooMany}
                          key={status}
                          onClick={() => {
                            clearSelection.current = clear;
                            mark(
                              selected.map((room) => room.unitId),
                              status,
                            );
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <Icon aria-hidden="true" className="size-4" />
                          {pending ? t("saving") : t(MARK_LABEL[status])}
                        </Button>
                      );
                    })}
                    {tooMany ? (
                      <span className="text-step--1 text-destructive">
                        {t("invalid")}
                      </span>
                    ) : null}
                  </>
                );
              },
            }
          : {})}
        caption={t("subtitle", { property: propertyName })}
        columns={columns}
        data={narrowed ? narrowed.rooms : board.rooms}
        empty={
          <EmptyState
            description={t("noRoomsDescription")}
            title={t("noRoomsTitle")}
          />
        }
        getRowId={(room) => room.unitId}
        facets={[
          {
            columnId: "status",
            title: t("status"),
            variant: "chips",
            options: MARKS.map((status) => ({
              label: t(status),
              value: status,
              icon: STATUS_LOOK[status].icon,
            })),
          },
          // A Property on one floor, or on none, has nothing to narrow by.
          ...(floors.length > 1
            ? [
                {
                  columnId: "floor",
                  title: t("floorFilter"),
                  options: floors.map((floor) => ({
                    label:
                      floor === NO_FLOOR
                        ? t("noFloor")
                        : t("floorNumber", { floor: Number(floor) }),
                    value: floor,
                  })),
                },
              ]
            : []),
        ]}
        initialHidden={{ floor: false }}
        labels={{
          ...labels,
          selectAllInFilter: (count) => t("selectAllRooms", { count }),
        }}
        pageSize={50}
        searchColumns={["name", "building"]}
      />
    </div>
  );
}

function floorOrder(floor: string): number {
  return floor === NO_FLOOR ? Number.POSITIVE_INFINITY : Number(floor);
}

/**
 * One count above the board. Small on a phone, where five of the larger
 * tiles once took the whole first screen before the first room (HK-03).
 */
function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-3 sm:p-4">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:mt-2 sm:text-2xl">
        {value}
      </p>
    </div>
  );
}

/** How long a "rooms updated" confirmation stays up before it clears itself. */
const CONFIRMATION_MS = 6000;

/**
 * What a mark came to. On a phone it rides at the foot of the window, because
 * the rooms ticked may be a screen below the line that would otherwise say so
 * (HK-08); from `md` it sits in the page where it always did. A refusal
 * stays until the next mark: it names something the person has to act on.
 */
function ResultNotice({
  outcome,
  t,
}: {
  outcome: MarkOutcome;
  t: ReturnType<typeof useTranslations<"housekeeping">>;
}) {
  const [clearedOutcome, setClearedOutcome] = useState<MarkOutcome | null>(
    null,
  );

  useEffect(() => {
    if (outcome.status !== "done") return;
    const timer = setTimeout(() => setClearedOutcome(outcome), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  const shown =
    outcome.status === "done" && outcome.marked !== undefined
      ? clearedOutcome === outcome
        ? null
        : {
            tone: "text-success",
            text: t("marked", { count: outcome.marked }),
            alert: false,
          }
      : outcome.status === "refused"
        ? { tone: "text-destructive", text: t("refused"), alert: true }
        : outcome.status === "invalid"
          ? { tone: "text-destructive", text: t("invalid"), alert: true }
          : null;

  // The region is always in the page, so a screen reader hears it change, and
  // takes no room while it says nothing. On a phone it rides above the dock at
  // the foot of the window, because the rooms ticked may be a screen below the
  // line that would otherwise say so (HK-08); from `md` it sits in the page.
  return (
    <div
      aria-live="polite"
      className={cn(
        !shown && "sr-only",
        shown &&
          "fixed inset-x-4 bottom-24 z-40 rounded-2xl border bg-card px-4 py-3 shadow-lg md:static md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none",
      )}
    >
      {shown ? (
        <p
          className={cn("text-step--1", shown.tone)}
          role={shown.alert ? "alert" : undefined}
        >
          {shown.text}
        </p>
      ) : null}
    </div>
  );
}
