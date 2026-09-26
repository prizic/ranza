import { useTranslations } from "next-intl";
import type { ColumnHeaderLabels, DataTableLabels } from "@ranza/ui";

/**
 * The listing kit's strings, built once from the message catalogue.
 *
 * `DataTable` takes every string as a prop because this product has three
 * locales and no fallback — an English word on a Turkish page is a defect. That
 * is a lot of props, and a table on a screen should not have to restate them,
 * so they are assembled here.
 *
 * Hooks rather than functions taking the catalogue, because the catalogue is no
 * longer passed: `useTranslations` reads it from the provider in the root
 * layout. Every caller is already a client component rendering a table, so this
 * costs nothing and removes a prop that was threaded through four of them.
 *
 * Counts go through ICU rather than `String.replace`. That was the thing the
 * old spelling could not do: `{n} results` is wrong in English at one, and
 * Arabic agrees with the number in six categories — zero, one, two, few, many,
 * other — which a single template with a hole in it cannot express whatever is
 * substituted into it. The number is formatted by `Intl` on the way in, so
 * Arabic gets its own digits and Turkish its own group separator.
 */
export function useTableLabels(): DataTableLabels {
  const t = useTranslations("table");
  return {
    capped: (loaded, total) => t("capped", { n: loaded, of: total }),
    cappedHint: t("cappedHint"),
    clearFilters: t("clearFilters"),
    clearSelection: t("clearSelection"),
    columns: t("columns"),
    facet: {
      clear: t("clearFilter"),
      noResults: t("noMatches"),
      selected: (n) => t("selectedCount", { n }),
    },
    first: t("first"),
    last: t("last"),
    next: t("next"),
    noMatches: t("noMatches"),
    noRows: t("noRows"),
    page: (index, of) => t("page", { n: index, of }),
    perPage: t("perPage"),
    previous: t("previous"),
    results: (n) => t("results", { n }),
    search: t("search"),
    // Joined before it crosses the boundary: a list separator is a locale's
    // business, but `Intl.ListFormat` reads as prose ("a, b and c") where this
    // is a column enumeration in a placeholder.
    searchBy: (columns) => t("searchBy", { columns: columns.join(" / ") }),
    selectAllRows: t("selectAllRows"),
    selectedCount: (n) => t("selectedCount", { n }),
    selectRow: t("selectRow"),
    visibleColumns: t("visibleColumns"),
  };
}

/**
 * A sortable column header's three strings.
 *
 * Here rather than in each feature folder because it was byte-identical in
 * two of them, and a column header does not belong to Front Office any more
 * than it belongs to Finance.
 */
export function useSortLabels(): ColumnHeaderLabels {
  const t = useTranslations("table");
  return {
    clearSort: t("clearFilter"),
    sortAscending: t("next"),
    sortDescending: t("previous"),
  };
}
