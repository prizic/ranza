"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { cn } from "../lib/utils";

/**
 * The one table.
 *
 * Sorting, filtering and pagination are solved problems, and writing them again
 * per screen is how four implementations end up disagreeing about what an empty
 * result looks like. TanStack owns the state; this owns the markup.
 *
 * `caption` is not optional. A table needs an accessible name, and every
 * previous screen that rendered one without has been a screen reader reading
 * out a grid of numbers with no idea what they count.
 *
 * `empty` is not optional either, for the same reason the rest of this product
 * refuses bare empty tables: a header row with nothing under it looks like a
 * bug, and blueprint 18.x asks for a state that says what to do next.
 */
export interface DataTableProps<TRow> {
  /** Accessible name. Visually hidden, but always present. */
  caption: string;
  columns: ColumnDef<TRow, unknown>[];
  data: readonly TRow[];
  empty: ReactNode;
  /** Filters and actions above the table. */
  toolbar?: ReactNode;
  /** Rows before paging. Omit to show everything. */
  pageSize?: number;
  /** Localized "Previous" / "Next" for the pager. */
  labels: {
    next: string;
    previous: string;
    page: (n: number, of: number) => string;
  };
}

export function DataTable<TRow>({
  caption,
  columns,
  data,
  empty,
  labels,
  pageSize,
  toolbar,
}: DataTableProps<TRow>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    columns,
    data: data as TRow[],
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageIndex: 0, pageSize } },
        }
      : {}),
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <div className="rounded-lg bg-card shadow-low">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          {toolbar}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-8">{empty}</div>
      ) : (
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} scope="col">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pageSize && pageCount > 1 ? (
        <div className="flex items-center justify-between gap-4 border-t border-border p-4">
          <p className="text-step--1 text-muted-foreground">
            {labels.page(table.getState().pagination.pageIndex + 1, pageCount)}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="icon"
              variant="outline"
            >
              {/* Logical: the chevron has to point at the previous page, and in
                  Arabic that is the other way round. */}
              <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
              <span className="sr-only">{labels.previous}</span>
            </Button>
            <Button
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="icon"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
              <span className="sr-only">{labels.next}</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A sortable column heading. Sorting is a button, so it is reachable. */
export function SortableHeader({
  align,
  children,
  onToggle,
  sorted,
}: {
  align?: "start" | "end";
  children: ReactNode;
  onToggle: () => void;
  sorted: false | "asc" | "desc";
}) {
  return (
    <button
      aria-sort={
        sorted === "asc"
          ? "ascending"
          : sorted === "desc"
            ? "descending"
            : "none"
      }
      className={cn(
        "-mx-2 flex w-full items-center gap-1 rounded-sm px-2 py-1 text-start font-medium hover:text-foreground",
        align === "end" && "justify-end text-end",
      )}
      onClick={onToggle}
      type="button"
    >
      {children}
    </button>
  );
}
