import type { DataTableLabels } from "@ranza/ui";
import type { Messages } from "../messages";

/**
 * The listing kit's strings, built once from the message catalogue.
 *
 * `DataTable` takes every string as a prop because this product has three
 * locales and no fallback — an English word on a Turkish page is a defect. That
 * is a lot of props, and a table on a screen should not have to restate them,
 * so they are assembled here.
 *
 * Counts are interpolated into `{n}` rather than concatenated, because the
 * number does not sit in the same place in all three languages.
 */
const count = (template: string, n: number) =>
  template.replace("{n}", String(n));

export function tableLabels(copy: Messages): DataTableLabels {
  return {
    capped: (loaded, total) =>
      copy.table.capped
        .replace("{n}", String(loaded))
        .replace("{of}", String(total)),
    cappedHint: copy.table.cappedHint,
    clearFilters: copy.table.clearFilters,
    clearSelection: copy.table.clearSelection,
    columns: copy.table.columns,
    facet: {
      clear: copy.table.clearFilter,
      noResults: copy.table.noMatches,
      selected: (n) => count(copy.table.selectedCount, n),
    },
    first: copy.table.first,
    last: copy.table.last,
    next: copy.table.next,
    noMatches: copy.table.noMatches,
    noRows: copy.table.noRows,
    page: (index, of) =>
      copy.table.page.replace("{n}", String(index)).replace("{of}", String(of)),
    perPage: copy.table.perPage,
    previous: copy.table.previous,
    results: (n) => count(copy.table.results, n),
    search: copy.table.search,
    searchBy: (columns) =>
      copy.table.searchBy.replace("{columns}", columns.join(" / ")),
    selectAllRows: copy.table.selectAllRows,
    selectedCount: (n) => count(copy.table.selectedCount, n),
    selectRow: copy.table.selectRow,
    visibleColumns: copy.table.visibleColumns,
  };
}
