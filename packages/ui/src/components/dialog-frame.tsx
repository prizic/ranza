"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { ArrowRight, Check, Info, Search, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";

/**
 * The frame every dialog and side sheet is set in.
 *
 * A masthead says what is being done and to whom, in a drawing, a mono line
 * and the subject in large italic; the body is plain-titled sections, each a
 * question or the name of the thing, tagged Required or Optional; the footer
 * holds one arrow button and says what is missing while it cannot be pressed.
 * A dialog shows only what applies to its state, so the usual case is short.
 *
 * The pieces hold no state and decide nothing. Each dialog owns what it asks,
 * what it sends and when it may be pressed; these only draw it.
 */

const MONO =
  "font-mono text-[0.72rem] font-medium tracking-[0.12em] uppercase rtl:font-sans rtl:tracking-normal rtl:normal-case";

/** How wide a dialog is from tablet width; below that it is the screen's. */
const WIDTHS = {
  small: "sm:max-w-[35rem]",
  medium: "sm:max-w-[38.75rem]",
  large: "sm:max-w-[56rem]",
} as const;

export function dialogFrameClassName(
  width: keyof typeof WIDTHS = "medium",
): string {
  return cn(
    "gap-0 p-0 sm:rounded-[1.75rem] max-h-[calc(100dvh-2rem)]",
    WIDTHS[width],
    // The close control sits on the masthead, so it is the masthead's colour
    // and not the cream of the shared dialog.
    "[&>[data-slot=dialog-close]]:end-6 [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:bg-background/60 [&>[data-slot=dialog-close]]:hover:bg-background",
  );
}

/** What is typed into: a visible box, a plain example inside, a clear focus. */
export const fieldClassName =
  "h-12 rounded-2xl border-[1.5px] border-foreground/25 bg-background px-4 text-[0.95rem] shadow-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15";
export const textareaClassName =
  "min-h-24 rounded-2xl border-[1.5px] border-foreground/25 bg-background px-4 py-3.5 text-[0.95rem] shadow-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15";

export function DialogMasthead({
  art,
  eyebrow,
  facts,
  heading,
  large = false,
}: {
  /** A path to the drawing, cropped at the foot of the masthead. */
  art?: string | undefined;
  /** The action. It is the dialog's accessible name. */
  eyebrow: string;
  /** Mono line under the subject: a reference, a unit, a date. */
  facts?: string | undefined;
  /** What the action is done to, or the question a new thing answers. */
  heading: string;
  /** Long heading (a question) rather than a name. */
  large?: boolean;
}) {
  return (
    <header className="relative min-h-44 overflow-hidden bg-primary/15 px-8 pt-6 pb-7">
      <DialogTitle className={cn(MONO, "text-primary-text")}>
        {eyebrow}
      </DialogTitle>
      <p
        className={cn(
          "mt-9 max-w-[62%] font-display leading-none font-normal tracking-tight text-balance wrap-anywhere italic rtl:not-italic",
          large ? "text-step-3 leading-tight" : "text-5xl",
        )}
      >
        <bdi>{heading}</bdi>
      </p>
      {facts ? (
        <p className={cn(MONO, "mt-3 max-w-[62%] text-foreground/70")}>
          <bdi>{facts}</bdi>
        </p>
      ) : null}
      {art ? (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-7 end-8 size-36 -rotate-6 object-contain select-none rtl:rotate-6"
          draggable={false}
          src={art}
        />
      ) : null}
    </header>
  );
}

/** The body: sections divided by a hairline, or `simple` blocks with space. */
export function DialogBody({
  children,
  className,
  simple = false,
}: {
  children: ReactNode;
  className?: string;
  simple?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid content-start px-8",
        simple ? "gap-5 py-6.5" : "divide-y py-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface DialogTagProps {
  label: string;
  required?: boolean;
}

export function DialogTag({ label, required = false }: DialogTagProps) {
  return (
    <span
      className={cn(
        MONO,
        "ms-auto rounded-full px-2 py-0.5 text-[0.66rem]",
        required
          ? "bg-primary/15 text-primary-text"
          : "border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/**
 * One block of the body. The title is the question or the plain name of the
 * thing; `labelFor` makes it the label of the control beneath it, and the hint
 * under it is `${labelFor}-hint` for that control's `aria-describedby`.
 */
export function DialogSection({
  children,
  hint,
  labelFor,
  tag,
  title,
  titleId,
}: {
  children: ReactNode;
  hint?: ReactNode;
  labelFor?: string;
  tag?: DialogTagProps | undefined;
  title?: string;
  /** Names the heading, for a group of controls that `aria-labelledby` points at. */
  titleId?: string;
}) {
  const heading = title ? (
    <div className="flex items-center gap-3">
      {labelFor ? (
        <Label className="text-[0.94rem] font-semibold" htmlFor={labelFor}>
          {title}
        </Label>
      ) : (
        <h4 className="m-0 text-[0.94rem] font-semibold" id={titleId}>
          {title}
        </h4>
      )}
      {tag ? <DialogTag {...tag} /> : null}
    </div>
  ) : null;
  return (
    <section className="grid gap-3 py-5">
      {heading}
      {children}
      {hint ? (
        <p
          className="m-0 text-step--1 text-muted-foreground"
          id={labelFor ? `${labelFor}-hint` : undefined}
        >
          {hint}
        </p>
      ) : null}
    </section>
  );
}

/** Something else that is true, quietly, with an icon. Never a warning colour. */
export function DialogNotice({
  children,
  icon: Icon = Info,
}: {
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3.5">
      <span className="grid size-7 shrink-0 place-content-center rounded-full bg-primary/15 text-primary-text">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <p className="m-0 pt-0.5 text-sm">{children}</p>
    </div>
  );
}

/** A plain list of facts, with an optional ruled total. */
export function DialogFacts({
  rows,
  total,
}: {
  rows: readonly (readonly [label: string, value: ReactNode])[];
  total?: readonly [label: string, value: ReactNode];
}) {
  return (
    <dl className="m-0 grid">
      {rows.map(([label, value]) => (
        <div
          className="flex justify-between gap-4 border-b py-2.5 text-sm"
          key={label}
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 text-end font-medium tabular-nums">{value}</dd>
        </div>
      ))}
      {total ? (
        <div className="flex justify-between gap-4 border-t-2 border-foreground pt-3 text-sm font-semibold">
          <dt>{total[0]}</dt>
          <dd className="m-0 text-end tabular-nums">{total[1]}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Splits a formatted amount into its whole part and its fraction, if it has one. */
function splitFraction(amount: string): [string, string] {
  const match = /^(.*?)([.,٫]\d{2})$/.exec(amount);
  return match ? [match[1] ?? amount, match[2] ?? ""] : [amount, ""];
}

/** The one figure a dialog is about, as a single large light numeral. */
export function DialogFigure({
  amount,
  caption,
  label,
}: {
  /** The amount, already formatted for the locale and the currency. */
  amount: string;
  caption?: ReactNode;
  label: string;
}) {
  const [whole, fraction] = splitFraction(amount);
  return (
    <div className="grid gap-2.5">
      <span className={cn(MONO, "text-muted-foreground")}>{label}</span>
      <span className="font-display text-7xl leading-none font-light tracking-tight text-foreground tabular-nums">
        <bdi>
          {whole}
          {fraction ? (
            <small className="text-[0.42em] text-muted-foreground">
              {fraction}
            </small>
          ) : null}
        </bdi>
      </span>
      {caption ? (
        <p className="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/** The state where there is nothing to decide: a tick, what is true, one line. */
export function DialogSettled({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="grid size-12 shrink-0 place-content-center rounded-full bg-primary/15 text-primary-text">
        <Check aria-hidden="true" className="size-5.5" />
      </span>
      <div className="grid gap-0.5">
        <b className="text-lg font-semibold">{title}</b>
        <span className="text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

/** One tick to give: a bordered row, the box first. */
export function TickRow({
  checked,
  children,
  id,
  name,
  onCheckedChange,
  required = false,
}: {
  checked: boolean;
  children: ReactNode;
  id: string;
  name: string;
  onCheckedChange: (checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border-[1.5px] border-foreground/25 px-4 py-3.5">
      <Checkbox
        checked={checked}
        className="size-5.5 rounded-lg border-[1.5px] border-foreground/60 bg-background"
        id={id}
        name={name}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        required={required}
        value="yes"
      />
      <Label className="leading-snug font-normal" htmlFor={id}>
        <span>{children}</span>
      </Label>
    </div>
  );
}

/**
 * A few choices shown as buttons, one chosen: a native radio group, so it is
 * sent with the form and read by a screen reader as one.
 */
export function ChoiceGroup({
  labelledBy,
  name,
  onChange,
  options,
  required,
  value,
}: {
  labelledBy?: string;
  name: string;
  onChange?: (value: string) => void;
  options: readonly { label: string; value: string }[];
  required?: boolean;
  value: string;
}) {
  return (
    <div
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-2"
      role="radiogroup"
    >
      {options.map((option) => (
        <label
          className="group/choice relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-foreground/25 bg-background px-3.5 py-2 text-sm font-medium has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-4 has-focus-visible:ring-primary/20"
          key={option.value}
        >
          <input
            checked={value === option.value}
            className="sr-only"
            name={name}
            onChange={() => onChange?.(option.value)}
            required={required}
            type="radio"
            value={option.value}
          />
          <Check
            aria-hidden="true"
            className="hidden size-3.5 group-has-checked/choice:inline"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export interface OptionListItem {
  /** A short state in the row's end: Free, Booked. */
  chip?: string | undefined;
  /** Dims the chip, for an option that cannot be taken. */
  chipMuted?: boolean | undefined;
  /** The type or detail beside the title. */
  description?: string | undefined;
  /** Shown but not choosable: a unit somebody else already holds. */
  disabled?: boolean | undefined;
  title: string;
  value: string;
}

/**
 * Choices shown as rows, one chosen, with a search over them: for picking a
 * unit or a room, where a hidden dropdown makes the desk guess what exists.
 * Only the first few are drawn; the rest are said to be there and found by
 * typing. The chosen row always stays in view. A native radio group, so it is
 * sent with the form and read by a screen reader as one.
 */
export function OptionList({
  disabled,
  emptyLabel,
  items,
  limit = 4,
  moreLabel,
  name,
  onChange,
  required,
  searchLabel,
  value,
}: {
  disabled?: boolean;
  emptyLabel: string;
  items: readonly OptionListItem[];
  limit?: number;
  moreLabel: (count: number) => string;
  name: string;
  onChange: (value: string) => void;
  required?: boolean;
  searchLabel: string;
  value: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? items.filter((item) =>
        `${item.title} ${item.description ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : items;
  const shown = matches.slice(0, limit);
  const chosen = items.find((item) => item.value === value);
  if (chosen && !shown.includes(chosen)) shown.push(chosen);
  const hidden =
    matches.length - shown.filter((item) => matches.includes(item)).length;

  return (
    <div className="grid gap-2" role="radiogroup">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-s-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={searchLabel}
          className={cn(fieldClassName, "ps-11")}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder={searchLabel}
          type="search"
          value={query}
        />
      </div>
      {shown.map((item) => (
        <label
          className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border-[1.5px] border-foreground/15 px-4 py-3 has-checked:border-primary has-checked:bg-primary/10 has-checked:ring-4 has-checked:ring-primary/10 has-focus-visible:ring-4 has-focus-visible:ring-primary/20 has-disabled:cursor-not-allowed has-disabled:opacity-60"
          key={item.value}
        >
          <input
            checked={value === item.value}
            className="size-5 shrink-0 appearance-none rounded-full border-[1.5px] border-foreground/50 bg-background checked:border-[6px] checked:border-primary"
            disabled={disabled || item.disabled}
            name={name}
            onChange={() => onChange(item.value)}
            required={required}
            type="radio"
            value={item.value}
          />
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <b className="text-xl font-semibold tabular-nums">
              <bdi>{item.title}</bdi>
            </b>
            {item.description ? (
              <span className="text-muted-foreground">{item.description}</span>
            ) : null}
          </span>
          {item.chip ? (
            <span
              className={cn(
                MONO,
                "rounded-full px-2.5 py-1 text-[0.66rem]",
                item.chipMuted
                  ? "border text-muted-foreground"
                  : "bg-primary/15 text-primary-text",
              )}
            >
              {item.chip}
            </span>
          ) : null}
        </label>
      ))}
      {matches.length === 0 ? (
        <p className="m-0 text-step--1 text-muted-foreground">{emptyLabel}</p>
      ) : hidden > 0 ? (
        <p className="m-0 text-step--1 text-muted-foreground">
          {moreLabel(hidden)}
        </p>
      ) : null}
    </div>
  );
}

/** Tapping one fills the field above: wording the desk would otherwise type. */
export function SuggestionRow({
  items,
  label,
  onPick,
}: {
  items: readonly string[];
  label: string;
  onPick: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn(MONO, "me-0.5 text-muted-foreground")}>{label}</span>
      {items.map((item) => (
        <button
          className="rounded-full border-[1.5px] border-foreground/25 bg-background px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-foreground focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none"
          key={item}
          onClick={() => onPick(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

/**
 * A stay drawn as a ruler: one labelled tick per day, or about seven evenly
 * spaced when it is long, with five small ones between. It is solid up to today
 * and dotted after, so how far into the stay the Guest is reads before any
 * number does. Dates are `YYYY-MM-DD`; `format` writes a label in the viewer's
 * locale. It runs left to right in both directions, as a calendar bar does.
 */
export function StayRuler({
  end,
  format,
  label,
  start,
  today,
  todayLabel,
}: {
  end: string;
  format: (iso: string) => string;
  /** What the ruler says to a screen reader, as one sentence. */
  label: string;
  start: string;
  today: string | null;
  todayLabel: string;
}) {
  const first = dayNumber(start);
  const span = Math.max(dayNumber(end) - first, 1);
  const labelled = Math.min(span, 6);
  const width = 496;
  const perStep = 6;
  const steps = labelled * perStep;
  const progress =
    today === null
      ? 1
      : Math.min(Math.max((dayNumber(today) - first) / span, 0), 1);
  const nowX = progress * width;
  const iso = (day: number) =>
    new Date(day * DAY_MS).toISOString().slice(0, 10);

  return (
    <svg
      aria-label={label}
      className="block h-auto w-full overflow-visible"
      role="img"
      style={{ direction: "ltr" }}
      viewBox={`0 0 ${width} 66`}
    >
      <line
        className="stroke-foreground"
        strokeWidth="2"
        x1="0"
        x2={nowX}
        y1="38"
        y2="38"
      />
      {nowX < width ? (
        <line
          className="stroke-foreground/30"
          strokeDasharray="3 4"
          strokeWidth="1.5"
          x1={nowX}
          x2={width}
          y1="38"
          y2="38"
        />
      ) : null}
      {Array.from({ length: steps + 1 }, (_, step) => {
        const x = (step * width) / steps;
        const major = step % perStep === 0;
        return (
          <line
            className={x <= nowX ? "stroke-foreground" : "stroke-foreground/30"}
            key={step}
            strokeWidth={major ? 1.6 : 1}
            x1={x}
            x2={x}
            y1={major ? 12 : 24}
            y2="38"
          />
        );
      })}
      {Array.from({ length: labelled + 1 }, (_, mark) => (
        <text
          className="fill-muted-foreground font-mono text-[10px] tracking-widest uppercase"
          key={mark}
          textAnchor={
            mark === 0 ? "start" : mark === labelled ? "end" : "middle"
          }
          x={(mark * width) / labelled}
          y="60"
        >
          {format(iso(first + Math.round((mark * span) / labelled)))}
        </text>
      ))}
      {today !== null && progress > 0 && progress < 1 ? (
        <>
          <path className="fill-foreground" d={`M${nowX - 6} 2 h12 l-6 9 z`} />
          <text
            className="fill-foreground font-mono text-[10px] tracking-widest uppercase"
            x={nowX + 12}
            y="9"
          >
            {todayLabel}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/** The foot of a dialog: what is missing or a link on the start side, the actions on the end. */
export function DialogActions({
  children,
  hint,
}: {
  children: ReactNode;
  /** What is missing while the button cannot be pressed, or a link. */
  hint?: ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t bg-popover px-8 pt-5 pb-7"
      data-slot="dialog-footer"
    >
      <div className="min-w-0 text-step--1 text-muted-foreground">{hint}</div>
      <div className="ms-auto flex items-center gap-5">{children}</div>
    </div>
  );
}

/** The plain "not now" beside the main action. */
export function CancelButton(props: ComponentProps<typeof Button>) {
  return <Button className="font-medium" variant="ghost" {...props} />;
}

/**
 * The main action: a pill with the arrow in a disc at its end. `danger` is the
 * outlined red one, for what cannot be taken back. Pressed or not, it keeps its
 * shape; while it cannot be pressed it is muted, and the footer says why.
 */
export function ArrowButton({
  children,
  className,
  tone = "default",
  ...props
}: ComponentProps<typeof Button> & { tone?: "default" | "danger" }) {
  const danger = tone === "danger";
  return (
    <Button
      className={cn(
        "h-13 gap-3.5 rounded-full ps-6 pe-1.5 text-base font-semibold disabled:opacity-100",
        danger
          ? "bg-background text-destructive ring-[1.5px] ring-destructive/40 hover:bg-destructive/5 disabled:ring-foreground/15 disabled:text-muted-foreground"
          : "bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground/25",
        className,
      )}
      {...props}
    >
      {children}
      <span
        className={cn(
          "grid size-10 place-content-center rounded-full",
          danger
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/15 text-foreground",
        )}
      >
        <ArrowRight aria-hidden="true" className="size-4.5 rtl:-scale-x-100" />
      </span>
    </Button>
  );
}
