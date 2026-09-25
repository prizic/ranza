"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

/**
 * Sorting is a toggle on the header itself, cycling unsorted → ascending →
 * descending. It was a dropdown in the dashboard this came from, which cost two
 * clicks and a read to do the one thing anybody wants from a column header; the
 * arrow now says which of the three states the column is in without opening
 * anything.
 *
 * Hiding a column lives in the toolbar's column menu, which is where you go when
 * you are thinking about the table rather than about this column.
 */
export interface ColumnHeaderLabels {
  /** Announced as the next action, so a reader knows what a click will do. */
  sortAscending: string;
  sortDescending: string;
  clearSort: string;
}

export function DataTableColumnHeader<TData, TValue>({
  className,
  column,
  labels,
  title,
}: {
  className?: string;
  column: Column<TData, TValue>;
  labels: ColumnHeaderLabels;
  title: string;
}) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();
  const next =
    sorted === false
      ? labels.sortAscending
      : sorted === "asc"
        ? labels.sortDescending
        : labels.clearSort;

  return (
    <div className={cn("flex items-center", className)}>
      <Button
        // Cycles through all three: toggleSorting alone never returns to
        // unsorted, so the reader could not undo a sort once applied.
        aria-label={`${title} — ${next}`}
        className={cn(
          "-mx-2 h-8 text-[11px] tracking-[0.14em] uppercase",
          sorted && "text-foreground",
        )}
        onClick={() =>
          sorted === false
            ? column.toggleSorting(false)
            : sorted === "asc"
              ? column.toggleSorting(true)
              : column.clearSorting()
        }
        size="sm"
        title={next}
        variant="ghost"
      >
        <span>{title}</span>
        {sorted === "desc" ? (
          <ArrowDown className="size-3.5" />
        ) : sorted === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-50" />
        )}
      </Button>
    </div>
  );
}
