/**
 * What a desk types in a listing's search box, and how many rows a listing opens
 * on (RES-04, ARR-15, DEP-08).
 *
 * The matching is asserted on the strings a Turkish desk really types: a number
 * with its spaces and plus sign, two words from different columns, an accent left
 * off, a slipped letter. The page size is asserted through the table itself, so
 * a screen that sets it is told apart from one that does not.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { afterEach, describe, expect, it } from "vitest";
import {
  DataTable,
  rowMatches,
  type DataTableLabels,
} from "../../packages/ui/src";

afterEach(cleanup);

describe("rowMatches", () => {
  const row = [
    "Ayşe Yılmaz",
    "ayse@otel.example",
    "+90 532 123 45 67",
    "5321234567 05321234567 905321234567",
    "RJY1FR2",
    "Confirmed",
  ];

  it.each([
    ["a phone typed with a plus and spaces", "+90 532 123 45 67"],
    ["a phone typed with a leading zero and spaces", "0532 123 45 67"],
    ["a phone typed in brackets and dashes", "(532) 123-45-67"],
    ["part of a phone typed with a space", "532 123"],
    ["two words from different columns", "yilmaz otel.example"],
    ["a name without its accents", "ayse yilmaz"],
    ["a name with the Turkish dotted capital", "AYŞE"],
    ["a reference in any case", "rjy1fr2"],
    ["a name with one letter slipped", "yilmas"],
    ["a name with two letters swapped", "yimlaz"],
    ["a status word", "confirmed"],
    ["an empty query", "   "],
  ])("finds %s", (_label, query) => {
    expect(rowMatches(row, query)).toBe(true);
  });

  it.each([
    ["a phone that is not there", "+90 555 999"],
    ["a word that is nowhere in the row", "balcony"],
    ["one found word and one not", "yilmaz balcony"],
    ["two slipped letters", "yilmxs"],
    ["a short word with a slipped letter", "ayze"],
    ["a reference with a slipped digit", "rjy1fr3"],
  ])("does not find %s", (_label, query) => {
    expect(rowMatches(row, query)).toBe(false);
  });
});

interface Person {
  id: string;
  name: string;
}

const COLUMNS: ColumnDef<Person>[] = [
  { accessorKey: "name", header: "Name", meta: { title: "Name" } },
];

const LABELS: DataTableLabels = {
  capped: () => "",
  cappedHint: "",
  clearFilters: "Clear",
  clearSelection: "Clear",
  columns: "Columns",
  facet: { clear: "Clear", noResults: "None", selected: () => "" },
  first: "First",
  last: "Last",
  next: "Next",
  noMatches: "No matches",
  noRows: "No rows",
  page: (index, of) => `Page ${index} of ${of}`,
  perPage: "Per page",
  previous: "Previous",
  results: (count) => `${count} results`,
  search: "Search",
  searchBy: () => "Search names",
  selectAllRows: "All",
  selectedCount: () => "",
  selectRow: "Row",
  visibleColumns: "Visible",
};

const PEOPLE: Person[] = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index}`,
  name: `Guest ${index + 1}`,
}));

function table(pageSize?: number) {
  render(
    <DataTable
      caption="People"
      columns={COLUMNS}
      data={PEOPLE}
      getRowId={(row) => row.id}
      labels={LABELS}
      {...(pageSize === undefined ? {} : { pageSize })}
      searchColumns={["name"]}
    />,
  );
}

describe("a table's page size", () => {
  it("a_table_opens_on_ten_rows_unless_the_screen_says_otherwise", () => {
    table();
    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("a_screen_that_sets_a_page_size_opens_on_that_many_rows", () => {
    table(50);
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("the_search_box_reads_every_word_and_forgives_a_slipped_letter", () => {
    table(50);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "guest 12" },
    });
    expect(screen.getByText("1 results")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "gest" },
    });
    expect(screen.getByText("No matches")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "guset 3" },
    });
    expect(screen.getByText("1 results")).toBeInTheDocument();
  });
});
