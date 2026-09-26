"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { ar, enGB, tr } from "react-day-picker/locale";
import {
  directionFor,
  formatDate,
  isolate,
  type SupportedLocale,
} from "@ranza/i18n";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

export interface DateRangeLabels {
  /** The start half's name, read out with its value: "Arrival", "From". */
  from: string;
  to: string;
  /** What an empty half says: "Add date", "Earliest", "Open-ended". */
  emptyFrom: string;
  emptyTo: string;
  /** The footer's prompt while the start, then the end, is being chosen. */
  pickFrom: string;
  pickTo: string;
  clear: string;
  done: string;
  /** The length of a chosen range, given the days between its ends. */
  span?: (days: number) => string;
}

export interface DateRangePreset {
  label: string;
  /** `YYYY-MM-DD`, as the field submits it. */
  from: string;
  to: string;
}

type Edge = "from" | "to";

const calendarLocales = { ar, en: enGB, tr } as const;

const WIDE = "(min-width: 768px)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A calendar date as the form submits it. Read from the local components of a
 * local-midnight Date, never through `toISOString()`, which converts to UTC
 * first and hands a reader east of the meridian yesterday.
 */
function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIso(iso: string | undefined): Date | undefined {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  // 2026-02-31 rolls over into March rather than failing; a URL can carry it.
  return date.getDate() === day ? date : undefined;
}

function daysBetween(start: Date, end: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(end) - utc(start)) / 86_400_000);
}

/**
 * Two dates chosen as one thing, the way a flight search asks for them: a
 * single field split into its two ends, and one calendar that picks both.
 *
 * The ends are chosen in order — the start, then the end — and whichever half
 * was pressed is the one the next click sets, so a reader who only wants to
 * move the departure presses that half and is not made to re-pick the arrival.
 * A click before the start while choosing the end is read as a new start,
 * because that is what somebody doing it means.
 *
 * It submits `names.from` and `names.to` as `YYYY-MM-DD`, exactly what the two
 * `<input type="date">` it replaces submitted, so no server contract moves.
 * `minSpan` is the fewest days between the ends: one for a booking, where the
 * departure is a later night, and none for a filter, where a single day is a
 * range. When `required` is set a missing start stops the submit and opens the
 * calendar at the start; when it is not, either end may be left open, so a
 * filter can say "up to the 1st" as the two inputs it replaced could.
 *
 * `today` is the Property's own day as `YYYY-MM-DD`. It marks today on the
 * calendar and decides when a year is worth printing; the reader's clock is
 * the wrong day for part of every day at a Property in another timezone.
 */
export function DateRangeField({
  defaultValue,
  id,
  labels,
  locale,
  minSpan = 0,
  names,
  presets,
  required = false,
  today,
}: {
  defaultValue?: { from?: string | undefined; to?: string | undefined };
  /** The start half's id, which the field's `<label>` points at. */
  id: string;
  labels: DateRangeLabels;
  locale: SupportedLocale;
  minSpan?: number;
  names: { from: string; to: string };
  presets?: readonly DateRangePreset[];
  required?: boolean;
  today?: string | undefined;
}) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = fromIso(defaultValue?.from);
    const to = fromIso(defaultValue?.to);
    return from || to ? { from, to } : undefined;
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Edge>("from");
  const [hovered, setHovered] = useState<Date>();
  const anchor = useRef<HTMLDivElement>(null);
  // Set when the calendar closed because somebody pressed or focused something
  // else, which is where their focus belongs; see onCloseAutoFocus.
  const dismissedElsewhere = useRef(false);
  const halves = {
    from: useRef<HTMLButtonElement>(null),
    to: useRef<HTMLButtonElement>(null),
  };
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );

  const from = range?.from;
  const to = range?.to;
  const todayDate = fromIso(today) ?? new Date();

  const describe = (date: Date | undefined) => {
    if (!date) return undefined;
    return formatDate(new Date(`${toIso(date)}T00:00:00Z`), locale, {
      timeZone: "UTC",
      weekday: "short",
      year:
        date.getFullYear() === todayDate.getFullYear() ? undefined : "numeric",
    });
  };

  function openAt(edge: Edge) {
    // Where a start is required, asking for the end before there is one is
    // asking for the start.
    setEditing(edge === "to" && !from && required ? "from" : edge);
    setOpen(true);
  }

  function pick(day: Date) {
    const endsRange =
      editing === "to" &&
      (from ? daysBetween(from, day) >= minSpan : !required);
    if (endsRange) {
      // `editing` stays on the end, so focus returns to the half just set.
      setRange({ from, to: day });
      setOpen(false);
      return;
    }
    const keepEnd = to && daysBetween(day, to) >= minSpan;
    setRange({ from: day, to: keepEnd ? to : undefined });
    setEditing("to");
  }

  // While the end is being chosen, the band follows the pointer so the reader
  // sees the stay before committing to it.
  const previewing =
    open &&
    editing === "to" &&
    from &&
    hovered &&
    daysBetween(from, hovered) >= minSpan;
  const shown: DateRange | undefined = previewing
    ? { from, to: hovered }
    : range;

  const span =
    from && shown?.to && labels.span
      ? labels.span(daysBetween(from, shown.to))
      : null;

  const half = (edge: Edge, value: Date | undefined, empty: string) => (
    <button
      aria-expanded={open && editing === edge}
      aria-haspopup="dialog"
      aria-label={`${labels[edge]}: ${value ? isolate(describe(value) ?? "") : empty}`}
      className={cn(
        "flex h-full min-w-0 flex-1 items-center rounded-xl px-2 text-start outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/20",
        open &&
          editing === edge &&
          "bg-primary/10 text-primary hover:bg-primary/10",
      )}
      id={edge === "from" ? id : `${id}-to`}
      onClick={() => openAt(edge)}
      ref={halves[edge]}
      type="button"
    >
      <span className={cn("truncate", !value && "text-muted-foreground")}>
        {describe(value) ?? empty}
      </span>
    </button>
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverAnchor asChild>
        {/* Leaders' date-picker trigger, ported: a rounded-2xl field that
            outlines in green while open and tints once it holds a date. One
            deviation — h-9, not Leaders' h-10 — because it sits in rows of
            h-9 inputs and selects, and 4px taller lifts its label out of
            line with theirs. */}
        <div
          className={cn(
            "group relative flex h-9 w-full min-w-0 items-center gap-1 rounded-2xl border border-input/80 bg-background/90 p-1 ps-2 text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/50 hover:bg-background hover:shadow-xs",
            open && "border-primary shadow-xs ring-2 ring-primary/20",
            (from || to) && "border-primary/40 bg-primary/5",
          )}
          ref={anchor}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-xl transition-colors",
              from || to
                ? "bg-primary/10 text-primary"
                : "bg-muted/80 text-muted-foreground group-hover:text-foreground",
            )}
          >
            <CalendarDays className="size-3.5" />
          </span>
          {half("from", from, labels.emptyFrom)}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180"
          />
          {half("to", to, labels.emptyTo)}
        </div>
      </PopoverAnchor>

      <input name={names.from} type="hidden" value={from ? toIso(from) : ""} />
      <input name={names.to} type="hidden" value={to ? toIso(to) : ""} />
      {required ? (
        // Hidden inputs are never validated, so a required start is carried by
        // one out of sight and out of the tab order. Its bubble would point at
        // nothing, so a blocked submit opens the calendar at the start instead
        // — but only when this is the form's first problem; an empty name
        // before it keeps the browser's own message.
        <input
          aria-hidden="true"
          className="sr-only"
          onChange={() => undefined}
          onInvalid={(event) => {
            const input = event.currentTarget;
            if (input.form?.querySelector(":invalid") !== input) return;
            event.preventDefault();
            halves.from.current?.focus();
            openAt("from");
          }}
          required
          tabIndex={-1}
          value={from ? toIso(from) : ""}
        />
      ) : null}

      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[1.75rem] border border-border/80 bg-popover/95 p-0 shadow-[0_20px_50px_rgba(0,0,0,0.12)] backdrop-blur-xl"
        sideOffset={6}
        onCloseAutoFocus={(event) => {
          // Closed by a press elsewhere — the Guest's name, the search box —
          // focus stays where that press put it. There is no trigger for
          // Radix to return to, so letting the event through does nothing.
          if (dismissedElsewhere.current) {
            dismissedElsewhere.current = false;
            return;
          }
          event.preventDefault();
          halves[editing].current?.focus();
        }}
        onInteractOutside={(event) => {
          // Pressing the other half moves the edge being chosen; it is not a
          // dismissal, and closing then reopening would flash the calendar.
          if (anchor.current?.contains(event.target as Node)) {
            event.preventDefault();
            return;
          }
          dismissedElsewhere.current = true;
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col md:flex-row">
          {presets?.length ? (
            <div className="flex gap-1 overflow-x-auto border-b border-border/50 p-3 md:w-36 md:flex-col md:overflow-visible md:border-e md:border-b-0">
              {presets.map((preset) => {
                const active =
                  from &&
                  to &&
                  toIso(from) === preset.from &&
                  toIso(to) === preset.to;
                return (
                  <button
                    className={cn(
                      "shrink-0 rounded-lg px-2.5 py-1.5 text-start text-[11px] font-semibold transition-colors hover:bg-primary/10 hover:text-primary",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                    key={preset.label}
                    onClick={() => {
                      setRange({
                        from: fromIso(preset.from),
                        to: fromIso(preset.to),
                      });
                      setEditing("from");
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div onMouseLeave={() => setHovered(undefined)}>
            <Calendar
              autoFocus
              className="p-4"
              defaultMonth={from ?? to ?? todayDate}
              dir={directionFor(locale)}
              locale={calendarLocales[locale]}
              mode="range"
              numberOfMonths={wide ? 2 : 1}
              onDayMouseEnter={setHovered}
              onSelect={(_, day) => pick(day)}
              selected={shown}
              today={todayDate}
              // Monday in every language: the Property is in Türkiye, and the
              // week its staff work does not change with the screen's language.
              weekStartsOn={1}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3">
          <p
            aria-live="polite"
            className="font-mono text-[10px] text-muted-foreground"
          >
            {span ?? (editing === "from" ? labels.pickFrom : labels.pickTo)}
          </p>
          <div className="flex gap-2">
            {/* Either end alone is a range worth clearing: a filter can be
                "up to the 1st" with no start at all. */}
            <button
              className="rounded-md px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
              disabled={!from && !to}
              onClick={() => {
                setRange(undefined);
                setEditing("from");
              }}
              type="button"
            >
              {labels.clear}
            </button>
            <Button onClick={() => setOpen(false)} size="sm" type="button">
              {labels.done}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
