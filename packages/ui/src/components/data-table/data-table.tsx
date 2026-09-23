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
import { DataTableFacetedFilter, type FacetOption } from "./faceted-filter";
import { DataTablePagination, type PaginationLabels } from "./pagination";
import { DataTableViewOptions } from "./view-options";
import { overlayJustClosed } from "../../lib/menu-guard";
import { fieldMatches } from "../../lib/search";

export interface Facet {
  columnId: string;
  title: string;
  options: readonly FacetOption[];
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
  initialFilters = [],
  initialHidden = {},
  labels,
  onRowClick,
  rowId,
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
  /** Filters applied on first render, for a link that arrives already narrowed. */
  initialFilters?: ColumnFiltersState;
  initialHidden?: VisibilityState;
  labels: DataTableLabels;
  /** Makes rows openable. Clicks on a control inside a cell are left alone. */
  onRowClick?: (row: TData) => void;
  /**
   * A row's identity. Without it a row is its index, and on a list that is
   * refreshed while somebody works in it — a poll, a colleague's change — the
   * row that left hands its index, and whatever state its cells held, to the
   * row below: an open dialog stays open on a different record.
   */
  rowId?: (row: TData) => string;
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
    columns: tableColumns,
    data: data as TData[],
    ...(rowId ? { getRowId: (row: TData) => rowId(row) } : {}),
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
            <Search className="pointer-events-none absolute end-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="h-9 w-full pe-8 sm:w-[220px] lg:w-[280px]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={search}
            />
          </div>
        ) : null}

        {facets.map((facet) =>
          table.getColumn(facet.columnId) ? (
            <DataTableFacetedFilter
              column={table.getColumn(facet.columnId)}
              key={facet.columnId}
              labels={labels.facet}
              options={facet.options}
              title={facet.title}
            />
          ) : null,
        )}

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
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
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

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="bg-secondary/60">
            {table.getHeaderGroups().map((group) => (
              <TableRow className="hover:bg-transparent" key={group.id}>
                {group.headers.map((header) => (
                  <TableHead className="text-start" key={header.id} scope="col">
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
                  key={row.id}
                  {...(onRowClick && {
                    tabIndex: 0,
                    className: "cursor-pointer",
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
              <TableRow>
                <TableCell className="p-0" colSpan={tableColumns.length}>
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
