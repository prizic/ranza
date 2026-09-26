"use client";

import type { Column } from "@tanstack/react-table";
import { cn } from "../../lib/utils";
import type { FacetOption } from "./faceted-filter";

export interface DataTableFacetedChipsProps<TData, TValue> {
  /** Undefined when the named column is not in this table. */
  column: Column<TData, TValue> | undefined;
  options: readonly FacetOption[];
  title: string;
}

/**
 * A multi-select filter rendered as interactive chips in the toolbar.
 *
 * Tapping a chip toggles that value in the column's filter list. When none
 * are selected, the filter is cleared and all rows match.
 */
export function DataTableFacetedChips<TData, TValue>({
  column,
  options,
  title,
}: DataTableFacetedChipsProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues();
  const filterValue = column?.getFilterValue();
  const selectedValues = Array.isArray(filterValue)
    ? (filterValue as string[])
    : [];
  const selected = new Set(selectedValues);

  function toggleOption(value: string) {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    const values = Array.from(next);
    column?.setFilterValue(values.length > 0 ? values : undefined);
  }

  return (
    <div
      aria-label={title}
      className="flex flex-wrap items-center gap-1.5"
      role="group"
    >
      {options.map((option) => {
        const isSelected = selected.has(option.value);
        const Icon = option.icon;
        const count = facets?.get(option.value);

        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl border px-3.5 text-xs font-medium transition-all select-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
                : "border-slate-200/80 bg-white text-muted-foreground shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-foreground",
            )}
            key={option.value}
            onClick={() => toggleOption(option.value)}
            type="button"
          >
            {Icon ? (
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0",
                  isSelected
                    ? "text-primary-foreground"
                    : "text-muted-foreground",
                )}
              />
            ) : null}
            <span>{option.label}</span>
            {count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none",
                  isSelected
                    ? "bg-white/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
