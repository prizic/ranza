/**
 * What a table says about its search box and its ticks (HOUSEKEEPING-03,
 * HOUSEKEEPING-17, RESERVATIONS-16): each is named for a screen reader, and the
 * bar that acts on ticked rows takes the place of a line that was already there,
 * so the list does not move when the first row is ticked.
 */
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable, type DataTableLabels } from "../../packages/ui/src";
import { useTableLabels } from "../../apps/operator-workspace/src/lib/table-labels";
import { messages } from "../../apps/operator-workspace/src/messages";

afterEach(cleanup);

interface Room {
  id: string;
  name: string;
}

const COLUMNS: ColumnDef<Room>[] = [
  { accessorKey: "name", header: "Name", meta: { title: "Name" } },
];

const LABELS: DataTableLabels = {
  capped: () => "",
  cappedHint: "",
  clearFilters: "Clear",
  clearSelection: "Clear selection",
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
  selectAllInFilter: (count) => `Select all ${count} in this filter`,
  selectAllRows: "All",
  selectedCount: (count) => `${count} selected`,
  selectHint: "Tick rows to act on several at once.",
  selectRow: "Select row",
  selectRowNamed: (name) => `Select ${name}`,
  visibleColumns: "Visible",
};

const ROOMS: Room[] = [
  { id: "a", name: "101" },
  { id: "b", name: "102" },
];

function show(options: { ticking?: boolean; named?: boolean }) {
  render(
    <DataTable
      {...(options.ticking ? { bulkActions: () => <button>Mark</button> } : {})}
      {...(options.named ? { rowLabel: (room: Room) => room.name } : {})}
      caption="Rooms"
      columns={COLUMNS}
      data={ROOMS}
      getRowId={(room) => room.id}
      labels={LABELS}
      searchColumns={["name"]}
    />,
  );
}

describe("the names a table gives its controls", () => {
  it("HOUSEKEEPING-17: names each tick for its row, so no two read alike", () => {
    show({ named: true, ticking: true });
    expect(screen.getByRole("checkbox", { name: "Select 101" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Select 102" })).toBeDefined();
    expect(screen.queryByRole("checkbox", { name: "Select row" })).toBeNull();
  });

  it("falls back to the plain label where a screen names no row", () => {
    show({ ticking: true });
    expect(
      screen.getAllByRole("checkbox", { name: "Select row" }),
    ).toHaveLength(2);
  });

  it("RESERVATIONS-16: gives the search box a name of its own, not only a placeholder", () => {
    show({});
    expect(
      screen.getByRole("searchbox", { name: "Search names" }),
    ).toBeDefined();
  });
});

describe("the line the bulk bar replaces", () => {
  it("HOUSEKEEPING-03: holds the bar's place until a row is ticked, then gives way to it", () => {
    show({ named: true, ticking: true });
    expect(screen.getByText(LABELS.selectHint)).toBeDefined();
    expect(screen.queryByText("1 selected")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select 101" }));
    expect(screen.getByText("1 selected")).toBeDefined();
    expect(screen.queryByText(LABELS.selectHint)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText(LABELS.selectHint)).toBeDefined();
  });

  it("draws nothing for a table that cannot act on rows", () => {
    show({});
    expect(screen.queryByText(LABELS.selectHint)).toBeNull();
  });
});

describe("useTableLabels", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      {children}
    </NextIntlClientProvider>
  );

  it("HOUSEKEEPING-17: is the same object from one render to the next, so the select column is not rebuilt", () => {
    const { result, rerender } = renderHook(() => useTableLabels(), {
      wrapper,
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("says the row it is asked about", () => {
    const { result } = renderHook(() => useTableLabels(), { wrapper });
    expect(result.current.selectRowNamed("101")).toBe("Select 101");
  });
});
