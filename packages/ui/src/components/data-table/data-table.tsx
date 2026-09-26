"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { DataTableFacetedChips } from "./faceted-chips";
import { DataTableFacetedFilter, type FacetOption } from "./faceted-filter";
import { DataTablePagination, type PaginationLabels } from "./pagination";
import { DataTableViewOptions } from "./view-options";
import { overlayJustClosed } from "../../lib/menu-guard";
import { fieldMatches } from "../../lib/search";
import { cn } from "../../lib/utils";

/**
 * A row drawn as a card: the cells carry the fill and the hairline, and the
 * outer two carry the rounding, because a table row cannot be rounded itself.
 */
const ROW_CARD = cn(
  "border-0 hover:bg-transparent",
  "[&>td]:border-y [&>td]:border-black/5 [&>td]:bg-card [&>td]:py-4 [&>td]:transition-colors md:[&>td]:py-5",
  "[&>td:first-child]:rounded-s-[2rem] [&>td:first-child]:border-s [&>td:first-child]:ps-5 md:[&>td:first-child]:ps-6",
  "[&>td:last-child]:rounded-e-[2rem] [&>td:last-child]:border-e [&>td:last-child]:pe-4 md:[&>td:last-child]:pe-6",
  "[&:hover>td]:border-black/10 [&:hover>td]:bg-secondary/40 data-[state=selected]:[&>td]:bg-secondary",
);

export interface Facet {
  columnId: string;
  title: string;
  options: readonly FacetOption[];
  variant?: "dropdown" | "chips";
}

/**
 * Every string, because this product has three locales and no fallback — an
 * English word on a Turkish page is a defect rather than a default. The
 * dashboard this was ported from is Arabic-only and hardcodes them.
 */
export interface DataTableLabels extends PaginationLabels {
  clearFilters: string;
  columns: string;
  visibleColumns: string;
  /** Placeholder when no searchable column supplied a title. */
  search: string;
  /** "Search by name or reference" — given the column titles it actually reads. */
  searchBy: (columns: string[]) => string;
  selectAllRows: string;
  selectRow: string;
  selectedCount: (n: number) => string;
  clearSelection: string;
  noMatches: string;
  noRows: string;
  facet: { clear: string; noResults: string; selected: (n: number) => string };
}

/**
 * One table shell for every listing: sorting, faceted filters, a free-text
 * search, column visibility, selection and pagination. Screens supply columns
 * and facets and nothing else, so behaviour stays identical across the product.
 *
 * Ported from ryadh/mirhaal/apps/dashboard, where this arrangement has already
 * survived twenty features. What changed on the way: the strings became props,
 * and the CSV toolbar was left behind until a screen asks for it.
 */
export function DataTable<TData, TValue>({
  bulkActions,
  caption,
  columns,
  data,
  empty,
  facets = [],
  getRowId,
  initialFilters = [],
  initialHidden = {},
  labels,
  onRowClick,
  rowsInDatabase,
  searchColumns,
  toolbarExtra,
}: {
  /**
   * Rendered above the table while rows are ticked. Given the rows themselves,
   * and a `clear` to drop the selection once the work is done.
   */
  bulkActions?: (selected: TData[], clear: () => void) => ReactNode;
  /**
   * Accessible name. Visually hidden, but not optional — a grid of numbers with
   * no name is what a screen reader gets otherwise, and the visible heading is
   * often a tab trigger the table is not associated with.
   *
   * Added here rather than carried over: the dashboard this came from has no
   * caption, and docs/design/visual-reference.md requires one.
   */
  caption: string;
  columns: ColumnDef<TData, TValue>[];
  data: readonly TData[];
  /** Shown when the table has no rows at all, as opposed to no matches. */
  empty?: ReactNode;
  facets?: readonly Facet[];
  /**
   * A stable id for a row. Selection is keyed by it, so a table whose data is
   * refreshed while rows are ticked keeps the same rows ticked rather than the
   * same positions — without it, a room added above the selection would move
   * the tick onto its neighbour. A row's cells keep their state the same way:
   * on a polled list, a row that left would otherwise hand an open dialog, and
   * whatever was typed in it, to the row that took its place.
   */
  getRowId?: (row: TData) => string;
  /** Filters applied on first render, for a link that arrives already narrowed. */
  initialFilters?: ColumnFiltersState;
  initialHidden?: VisibilityState;
  labels: DataTableLabels;
  /** Makes rows openable. Clicks on a control inside a cell are left alone. */
  onRowClick?: (row: TData) => void;
  rowsInDatabase?: number;
  /**
   * Row fields the toolbar search looks in. These are keys on the data, not
   * column ids: a value is often rendered inside another column's cell rather
   * than having one of its own.
   */
  searchColumns?: readonly string[];
  toolbarExtra?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(initialFilters);
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(initialHidden);
  const [search, setSearch] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Named after whatever columns it actually searches, instead of a caller
  // repeating that list by hand in a string that drifts from it.
  const searchPlaceholder = useMemo(() => {
    const titles = (searchColumns ?? []).flatMap((key) => {
      const column = columns.find(
        (c) => "accessorKey" in c && c.accessorKey === key,
      );
      const title = (column?.meta as { title?: string } | undefined)?.title;
      return title ? [title] : [];
    });
    const unique = Array.from(new Set(titles));
    return unique.length > 0 ? labels.searchBy(unique) : labels.search;
  }, [columns, labels, searchColumns]);

  const selectable = Boolean(bulkActions);

  const tableColumns = useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={labels.selectAllRows}
            // Indeterminate when the page is partly ticked, so "select all"
            // never claims more than it did.
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={labels.selectRow}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      },
      ...columns,
    ];
  }, [columns, labels, selectable]);

  const table = useReactTable({
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    columns: tableColumns,
    data: data as TData[],
    state: {
      columnFilters,
      columnVisibility,
      globalFilter: search,
      rowSelection,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setSearch,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    // Ignores the column it is handed and tests every searchable column, so one
    // box covers the Guest's name and the Reservation reference at once.
    globalFilterFn: (row, _columnId, value: string) =>
      (searchColumns ?? []).some((key) =>
        fieldMatches(
          String((row.original as Record<string, unknown>)[key] ?? ""),
          value,
        ),
      ),
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const isFiltered = table.getState().columnFilters.length > 0 || search !== "";
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchColumns?.length ? (
          <div className="relative min-w-[120px] flex-1 sm:flex-none">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3.5 top-3 size-4 text-muted-foreground"
            />
            <Input
              className="h-10 w-full rounded-2xl border-slate-200/80 bg-white ps-10 pe-4 shadow-2xs hover:border-slate-300 sm:w-[240px] lg:w-[320px] [&::-webkit-search-cancel-button]:appearance-none"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={search}
            />
          </div>
        ) : null}

        {facets.map((facet) => {
          const column = table.getColumn(facet.columnId);
          if (!column) return null;
          const variant = facet.variant ?? "dropdown";
          if (variant === "chips") {
            return (
              <DataTableFacetedChips
                column={column}
                key={facet.columnId}
                options={facet.options}
                title={facet.title}
              />
            );
          }
          return (
            <DataTableFacetedFilter
              column={column}
              key={facet.columnId}
              labels={labels.facet}
              options={facet.options}
              title={facet.title}
            />
          );
        })}

        {isFiltered ? (
          <Button
            className="h-9"
            onClick={() => {
              table.resetColumnFilters();
              setSearch("");
            }}
            size="sm"
            variant="ghost"
          >
            {labels.clearFilters}
            <X className="size-4" />
          </Button>
        ) : null}

        <div className="ms-auto flex items-center gap-2">
          {toolbarExtra}
          <DataTableViewOptions labels={labels} table={table} />
        </div>
      </div>

      {bulkActions && selectedRows.length > 0 ? (
        // Above the table rather than floating over it: staff are reading rows
        // while deciding, and a bar that covers them is a bar in the way.
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-secondary px-4 py-2.5">
          <span className="text-sm font-medium tabular-nums">
            {labels.selectedCount(selectedRows.length)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions(selectedRows, () => setRowSelection({}))}
          </div>
          <Button
            className="ms-auto"
            onClick={() => setRowSelection({})}
            size="sm"
            variant="ghost"
          >
            {labels.clearSelection}
          </Button>
        </div>
      ) : null}

      {/* Each row is its own white card, as in the Leaders lists. Separate
          borders rather than a wrapper, so the table stays a table to a screen
          reader and a row still means a row. */}
      <div>
        <Table className="-mt-2 border-separate border-spacing-y-2">
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="[&_tr]:border-0">
            {table.getHeaderGroups().map((group) => (
              <TableRow className="hover:bg-transparent" key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    className="h-9 text-start text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase"
                    key={header.id}
                    scope="col"
                  >
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className={ROW_CARD}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  key={row.id}
                  {...(onRowClick && {
                    tabIndex: 0,
                    className: cn(ROW_CARD, "cursor-pointer"),
                    // A cell holds links and the row menu; opening the row on
                    // top of those would fire two things at once.
                    onClick: (event: MouseEvent) => {
                      // An overlay that just closed over this row sends its
                      // click here — see lib/menu-guard.
                      if (overlayJustClosed()) return;
                      if (
                        !(event.target as HTMLElement).closest(
                          "button, a, input, [role=checkbox]",
                        )
                      ) {
                        onRowClick(row.original);
                      }
                    },
                    onKeyDown: (event: KeyboardEvent) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row.original);
                      }
                    },
                  })}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className={ROW_CARD}>
                <TableCell className="px-5" colSpan={tableColumns.length}>
                  {data.length === 0 && empty ? (
                    empty
                  ) : (
                    // "Nothing here yet" and "nothing matched" are different
                    // situations, and a reader who cannot tell them apart will
                    // clear filters that were never applied.
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {data.length === 0 ? labels.noRows : labels.noMatches}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        labels={labels}
        table={table}
        {...(rowsInDatabase === undefined ? {} : { rowsInDatabase })}
      />
    </div>
  );
}
