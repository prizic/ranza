"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn } from "../../lib/utils";
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "lucide-react";

/**
 * Declared once, outside the render. Written inline, as the generator writes
 * them, every render of the calendar made new component types, and React
 * remounted every day button — between a press and its release, whenever the
 * range field re-rendered for its hover preview, so the click never landed.
 */
const calendarComponents: React.ComponentProps<typeof DayPicker>["components"] =
  {
    Root: ({ className, rootRef, ...props }) => {
      return (
        <div
          data-slot="calendar"
          ref={rootRef}
          className={cn(className)}
          {...props}
        />
      );
    },
    Chevron: ({ className, orientation, ...props }) => {
      if (orientation === "left") {
        return (
          <ChevronLeftIcon className={cn("size-4", className)} {...props} />
        );
      }

      if (orientation === "right") {
        return (
          <ChevronRightIcon className={cn("size-4", className)} {...props} />
        );
      }

      return <ChevronDownIcon className={cn("size-4", className)} {...props} />;
    },
    DayButton: CalendarDayButton,
    WeekNumber: ({ children, ...props }) => {
      return (
        <td {...props}>
          <div className="flex size-(--cell-size) items-center justify-center text-center">
            {children}
          </div>
        </td>
      );
    },
  };

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-background p-3 [--cell-radius:var(--radius-xl)] [--cell-size:--spacing(9)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex h-(--cell-size) w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          "flex size-8 items-center justify-center rounded-xl border border-border/60 bg-muted/30 p-0 text-muted-foreground transition-colors select-none hover:bg-muted hover:text-foreground aria-disabled:opacity-50",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          "flex size-8 items-center justify-center rounded-xl border border-border/60 bg-muted/30 p-0 text-muted-foreground transition-colors select-none hover:bg-muted hover:text-foreground aria-disabled:opacity-50",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-(--cell-radius)",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          "font-bold tracking-wide select-none",
          captionLayout === "label"
            ? "text-xs"
            : "flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 py-1 font-mono text-[10px] font-bold text-muted-foreground/80 uppercase select-none",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          "text-[0.8rem] text-muted-foreground select-none",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-e-(--cell-radius)",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-s-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-s-(--cell-radius)",
          defaultClassNames.day,
        ),
        range_start: cn(
          "relative isolate z-0 rounded-s-(--cell-radius) bg-primary/10 after:absolute after:inset-y-0 after:end-0 after:w-4 after:bg-primary/10",
          defaultClassNames.range_start,
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "relative isolate z-0 rounded-e-(--cell-radius) bg-primary/10 after:absolute after:inset-y-0 after:start-0 after:w-4 after:bg-primary/10",
          defaultClassNames.range_end,
        ),
        today: defaultClassNames.today,
        outside: cn(
          "text-muted-foreground/30 aria-selected:text-muted-foreground",
          defaultClassNames.outside,
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        ...calendarComponents,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      // The calendar date as a form submits it: stable across languages, so
      // a test can ask for a day without knowing how it is spelled.
      data-day={format(day.date, "yyyy-MM-dd")}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-today={modifiers.today && !modifiers.selected}
      className={cn(
        // Leaders' day cell, ported: a rounded-xl tile in the brand's green,
        // today outlined and dotted, a chosen end solid with a soft lift. The
        // band between two ends is Ranza's; Leaders' picker takes one date.
        "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) items-center justify-center rounded-(--cell-radius) border border-transparent text-xs leading-none font-medium text-foreground transition-all duration-150 hover:bg-primary/10 hover:text-primary group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-primary/30 group-data-[outside=true]/day:text-muted-foreground/30",
        "data-[today=true]:border-primary/40 data-[today=true]:bg-primary/5 data-[today=true]:font-bold data-[today=true]:text-primary data-[today=true]:after:absolute data-[today=true]:after:bottom-1 data-[today=true]:after:size-1 data-[today=true]:after:rounded-full data-[today=true]:after:bg-primary",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-primary/10 data-[range-middle=true]:text-primary",
        "data-[range-end=true]:bg-primary data-[range-end=true]:font-bold data-[range-end=true]:text-primary-foreground data-[range-end=true]:shadow-md data-[range-end=true]:shadow-primary/25 data-[range-end=true]:hover:bg-primary/95 data-[range-end=true]:hover:text-primary-foreground",
        "data-[range-start=true]:bg-primary data-[range-start=true]:font-bold data-[range-start=true]:text-primary-foreground data-[range-start=true]:shadow-md data-[range-start=true]:shadow-primary/25 data-[range-start=true]:hover:bg-primary/95 data-[range-start=true]:hover:text-primary-foreground",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:font-bold data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:shadow-md data-[selected-single=true]:shadow-primary/25 data-[selected-single=true]:hover:bg-primary/95 data-[selected-single=true]:hover:text-primary-foreground",

        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
