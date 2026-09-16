"use client";

import type { Table } from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const PAGE_SIZES = [10, 20, 30, 50];

export interface PaginationLabels {
  /** "12 results" — given the count so the caller owns plurals and numerals. */
  results: (count: number) => string;
  /** "latest 100 of 4,312" — the honest disclosure for a capped list. */
  capped: (loaded: number, total: number) => string;
  cappedHint: string;
  perPage: string;
  page: (index: number, of: number) => string;
  first: string;
  previous: string;
  next: string;
  last: string;
}

/**
 * Chevrons are mirrored with `rtl:rotate-180` rather than swapped by hand. The
 * dashboard this came from is Arabic-only and hardcodes the reversal; this
 * product runs three locales in both directions from one build, so the
 * direction has to come from the document.
 */
export function DataTablePagination<TData>({
  labels,
  rowsInDatabase,
  table,
}: {
  labels: PaginationLabels;
  /**
   * How many rows the table actually has, when the page deliberately loaded
   * fewer. Sorting, search and the facets all run over what was loaded, so a
   * capped list has to say so — a silently truncated table looks exactly like a
   * complete one.
   */
  rowsInDatabase?: number;
  table: Table<TData>;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const loaded = table.getCoreRowModel().rows.length;
  const capped = rowsInDatabase !== undefined && rowsInDatabase > loaded;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
      <p className="text-step--1 text-muted-foreground">
        <span className="tabular-nums">{labels.results(total)}</span>
        {capped ? (
          <span className="ms-2 text-warning" title={labels.cappedHint}>
            {labels.capped(loaded, rowsInDatabase)}
          </span>
        ) : null}
      </p>

      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-step--1 text-muted-foreground">
            {labels.perPage}
          </span>
          <Select
            onValueChange={(value) => table.setPageSize(Number(value))}
            value={`${pageSize}`}
          >
            <SelectTrigger className="h-8 w-[70px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-step--1 text-muted-foreground">
          {labels.page(pageIndex + 1, Math.max(table.getPageCount(), 1))}
        </p>

        <div className="flex items-center gap-1">
          <Button
            aria-label={labels.first}
            className="hidden size-8 sm:inline-flex"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            size="icon"
            variant="outline"
          >
            <ChevronsLeft className="size-4 rtl:rotate-180" />
          </Button>
          <Button
            aria-label={labels.previous}
            className="size-8"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="icon"
            variant="outline"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
          <Button
            aria-label={labels.next}
            className="size-8"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="icon"
            variant="outline"
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
          <Button
            aria-label={labels.last}
            className="hidden size-8 sm:inline-flex"
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            size="icon"
            variant="outline"
          >
            <ChevronsRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
