"use client";

import {
  startTransition,
  useActionState,
  useMemo,
  useOptimistic,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, CircleCheck, Undo2 } from "lucide-react";
import type { StayoverBoard, StayoverRoom } from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import { Button, cn, EmptyState, StatusBadge } from "@ranza/ui";
import {
  markStayoverCleaned,
  undoStayoverCleaned,
  type StayoverOutcome,
} from "../../../server/housekeeping";
import { dayName } from "../stayover";
import { cadenceLabel } from "./cadence";
import { Tally } from "./tally";

const ALL = "all";
const NO_BLOCK = "none";
const IDLE: StayoverOutcome = { status: "idle" };

/**
 * The rooms somebody is staying in that are due a clean (RANZ-83, ADR 0063).
 *
 * The press happens on the card: one press marks the room cleaned and the card
 * answers at once, with Undo in the place the button was. Nothing here asks
 * for a reason or a date, because there is nothing a housekeeper could say
 * that the day does not already: the database stamps the date and who pressed.
 * Rooms keep their place when they are done, so a run of presses down a
 * corridor never moves the card under the thumb.
 *
 * Filtered by block and floor on the client: a Property's whole list is a few
 * dozen rooms, and the housekeeper walks one block and one floor at a time.
 */
export function StayoverList({
  board,
  locale,
}: {
  board: StayoverBoard;
  locale: SupportedLocale;
}) {
  const t = useTranslations("housekeeping");
  const [block, setBlock] = useState(ALL);
  const [floor, setFloor] = useState(ALL);

  const placed = useMemo(
    () =>
      [...board.rooms].sort(
        (a, b) =>
          compareBuildings(a.building, b.building) ||
          (a.floor ?? Number.POSITIVE_INFINITY) -
            (b.floor ?? Number.POSITIVE_INFINITY) ||
          a.name.localeCompare(b.name, locale, { numeric: true }),
      ),
    [board.rooms, locale],
  );

  const blocks = unique(placed.map((room) => room.building ?? NO_BLOCK));
  const inBlock = placed.filter(
    (room) => block === ALL || (room.building ?? NO_BLOCK) === block,
  );
  const floors = unique(inBlock.map((room) => floorKey(room.floor)));
  const shown = inBlock.filter(
    (room) => floor === ALL || floorKey(room.floor) === floor,
  );
  const groups = groupByPlace(shown);

  function chooseBlock(next: string) {
    setBlock(next);
    setFloor(ALL);
  }

  const schedule = cadenceLabel(t, locale, board.cadence);

  if (board.rooms.length === 0) {
    return (
      <EmptyState
        description={t("stayoverEmptyDescription", { schedule })}
        title={t("stayoverEmptyTitle")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <Tally label={t("stayoverDue")} value={board.counts.due} />
        <Tally label={t("stayoverDone")} value={board.counts.done} />
        <Tally
          className="col-span-2 sm:col-span-1"
          label={t("stayoverSchedule")}
          value={schedule}
        />
      </div>

      {board.counts.due === 0 ? (
        <p className="flex items-center gap-2 text-step--1 text-success">
          <CircleCheck aria-hidden="true" className="size-4" />
          {t("stayoverAllDone")}
        </p>
      ) : null}

      {!board.mayMark ? (
        <p className="text-step--1 text-muted-foreground">
          {t("stayoverReadOnly")}
        </p>
      ) : null}

      {blocks.length > 1 ? (
        <Chips
          label={t("stayoverBlockFilter")}
          onChoose={chooseBlock}
          options={[
            { value: ALL, label: t("stayoverAllBlocks"), count: placed.length },
            ...blocks.map((value) => ({
              value,
              label: value === NO_BLOCK ? t("noBlock") : value,
              count: placed.filter(
                (room) => (room.building ?? NO_BLOCK) === value,
              ).length,
            })),
          ]}
          selected={block}
        />
      ) : null}

      {floors.length > 1 ? (
        <Chips
          label={t("floorFilter")}
          onChoose={setFloor}
          options={[
            {
              value: ALL,
              label: t("stayoverAllFloors"),
              count: inBlock.length,
            },
            ...floors.map((value) => ({
              value,
              label:
                value === NO_FLOOR
                  ? t("noFloor")
                  : t("floorNumber", { floor: Number(value) }),
              count: inBlock.filter((room) => floorKey(room.floor) === value)
                .length,
            })),
          ]}
          selected={floor}
        />
      ) : null}

      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <section
            aria-label={placeLabel(t, group)}
            className="flex flex-col gap-3"
            key={group.key}
          >
            <div className="flex items-baseline justify-between gap-3 border-b pb-2">
              <h3 className="text-step-0 font-semibold">
                {placeLabel(t, group)}
              </h3>
              <p className="text-step--1 text-muted-foreground tabular-nums">
                {t("stayoverGroupProgress", {
                  done: group.rooms.filter((room) => room.doneToday).length,
                  total: group.rooms.length,
                })}
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.rooms.map((room) => (
                <RoomCard
                  key={room.unitId}
                  locale={locale}
                  mayMark={board.mayMark}
                  room={room}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function RoomCard({
  locale,
  mayMark,
  room,
}: {
  locale: SupportedLocale;
  mayMark: boolean;
  room: StayoverRoom;
}) {
  const t = useTranslations("housekeeping");
  const [markOutcome, mark] = useActionState(markStayoverCleaned, IDLE);
  const [undoOutcome, undo] = useActionState(undoStayoverCleaned, IDLE);
  const [done, setDone] = useOptimistic(room.doneToday);

  function press(action: typeof mark, next: boolean) {
    const form = new FormData();
    form.set("locale", locale);
    form.set("unitId", room.unitId);
    startTransition(() => {
      setDone(next);
      action(form);
    });
  }

  const refused = [markOutcome, undoOutcome].some(
    (outcome) => outcome.status === "refused" || outcome.status === "invalid",
  );

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4",
        done && "bg-muted/40",
      )}
      data-testid="stayover-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-step-1 font-semibold">{room.name}</h4>
          <p className="text-step--1 text-muted-foreground">
            {t("stayoverPeople", { count: room.occupants })}
            {room.bedCount > 0
              ? ` · ${t("beds", { count: room.bedCount })}`
              : ""}
          </p>
        </div>
        <div aria-live="polite">
          {done ? (
            <StatusBadge
              icon={CircleCheck}
              label={t("stayoverCleanedToday")}
              tone="success"
            />
          ) : room.overdueDays > 0 ? (
            <StatusBadge
              icon={CalendarClock}
              label={t("stayoverOverdue", { count: room.overdueDays })}
              tone="warning"
            />
          ) : (
            <StatusBadge
              icon={CalendarClock}
              label={t("stayoverDueToday")}
              tone="info"
            />
          )}
        </div>
      </div>

      <p className="text-step--1 text-muted-foreground">
        {room.lastCleanedOn
          ? t("stayoverLastCleaned", {
              date: dayName(room.lastCleanedOn, locale),
            })
          : t("stayoverSince", { date: dayName(room.arrivedOn, locale) })}
      </p>

      {mayMark ? (
        done ? (
          <Button
            aria-label={t("stayoverUndoRoom", { room: room.name })}
            className="min-h-11 justify-self-start md:min-h-9"
            onClick={() => press(undo, false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Undo2 aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            {t("stayoverUndo")}
          </Button>
        ) : (
          <Button
            aria-label={t("stayoverMarkRoom", { room: room.name })}
            className="min-h-11 w-full md:min-h-9"
            onClick={() => press(mark, true)}
            type="button"
            variant="outline"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {t("stayoverMark")}
          </Button>
        )
      ) : null}

      {refused ? (
        <p className="text-step--1 text-destructive" role="alert">
          {t("stayoverRefused")}
        </p>
      ) : null}
    </li>
  );
}

function Chips({
  label,
  onChoose,
  options,
  selected,
}: {
  label: string;
  onChoose: (value: string) => void;
  options: readonly { value: string; label: string; count: number }[];
  selected: string;
}) {
  return (
    <div
      aria-label={label}
      className="flex flex-wrap items-center gap-2"
      role="group"
    >
      <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {options.map((option) => (
        <Button
          aria-pressed={selected === option.value}
          className="min-h-11 md:min-h-8"
          key={option.value}
          onClick={() => onChoose(option.value)}
          size="sm"
          type="button"
          variant={selected === option.value ? "default" : "outline"}
        >
          {option.label}
          <span className="tabular-nums opacity-70">{option.count}</span>
        </Button>
      ))}
    </div>
  );
}

const NO_FLOOR = "none";
const floorKey = (floor: number | null) =>
  floor === null ? NO_FLOOR : String(floor);

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

/** Rooms with no block last, as the board orders them. */
function compareBuildings(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

interface Group {
  key: string;
  building: string | null;
  floor: number | null;
  rooms: StayoverRoom[];
}

function groupByPlace(rooms: readonly StayoverRoom[]): Group[] {
  const groups = new Map<string, Group>();
  for (const room of rooms) {
    const key = `${room.building ?? NO_BLOCK}|${floorKey(room.floor)}`;
    const group = groups.get(key) ?? {
      key,
      building: room.building,
      floor: room.floor,
      rooms: [],
    };
    group.rooms.push(room);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function placeLabel(
  t: ReturnType<typeof useTranslations<"housekeeping">>,
  group: Group,
): string {
  const parts = [
    group.building,
    group.floor === null ? null : t("floorNumber", { floor: group.floor }),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : t("statRooms");
}
