/**
 * What one import's page offers in each of its states (IMP-S1-11, IMP-S1-12,
 * IMP-S1-23, IMP-S1-25, IMP-S1-28 in docs/features/guided-import/edge-cases.csv).
 *
 * The database decides who may move an import; what is proved here is that the
 * page offers each person only the moves that are theirs, asks for batch after
 * batch until the import is done, and says what it cannot show.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportDetail } from "@ranza/imports";
import { messages } from "../../apps/operator-workspace/src/messages";

const actions = {
  startImport: vi.fn(),
  continueImport: vi.fn(),
  stopImport: vi.fn(),
  discardImport: vi.fn(),
};
vi.mock("../../apps/operator-workspace/src/server/imports", () => actions);

const { ImportDetailView } =
  await import("../../apps/operator-workspace/src/features/imports/components/import-detail");

const COLUMNS = [
  { key: "room", label: "Room", required: true },
  { key: "sleeps", label: "Sleeps", required: true },
];

function detail(overrides: Partial<ImportDetail>): ImportDetail {
  return {
    id: "1a000001-0000-4000-8000-000000000001",
    propertyId: "1a000002-0000-4000-8000-000000000001",
    kind: "rooms",
    status: "staged",
    fileName: "rooms.xlsx",
    uploadedBy: "1a000003-0000-4000-8000-000000000001",
    uploaderEmail: "selin.kaya@example.test",
    mine: true,
    createdAt: new Date("2026-11-14T09:00:00Z"),
    closedAt: null,
    rowsForgotten: false,
    counts: {
      ready: 2,
      wrong: 1,
      skipped: 0,
      imported: 0,
      refused: 0,
      left: 0,
    },
    rows: [
      {
        rowNumber: 2,
        state: "ready",
        cells: { room: "101", sleeps: "2" },
        problems: [],
        outcome: null,
      },
      {
        rowNumber: 3,
        state: "ready",
        cells: { room: "102", sleeps: "2" },
        problems: [],
        outcome: null,
      },
      {
        rowNumber: 4,
        state: "wrong",
        cells: { room: "10B", sleeps: "0" },
        problems: [
          { column: "room", code: "not_digits" },
          { column: "sleeps", code: "out_of_range" },
        ],
        outcome: null,
      },
    ],
    ...overrides,
  };
}

function page(
  shown: ImportDetail,
  roomsHref: string | null = "/en/rooms?property=p",
) {
  return (
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ImportDetailView
        columns={COLUMNS}
        detail={shown}
        locale="en"
        roomsHref={roomsHref}
        sheetsIgnored={0}
      />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("one import's page", () => {
  it("IMP-S1-23: a preview puts the rows to fix first, each reason on its own line, and names how many rooms the button adds", () => {
    render(page(detail({})));

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("10B");
    expect(rows[1]).toHaveTextContent(
      "Room: A room number is one to eight digits.",
    );
    expect(rows[1]).toHaveTextContent(
      "Sleeps: This number is outside what a room allows.",
    );
    expect(
      screen.getByRole("button", { name: "Import 2 rooms" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "Download the rows to fix" }),
    ).toHaveAttribute(
      "href",
      "/api/import/1a000001-0000-4000-8000-000000000001/result?file=fix&locale=en",
    );
    // Nothing has an outcome to report yet.
    expect(
      screen.queryByRole("link", { name: "Download the result" }),
    ).toBeNull();
  });

  it("IMP-S1-23: with no row ready there is no button to press, and the page says what to do", () => {
    render(
      page(
        detail({
          counts: {
            ready: 0,
            wrong: 1,
            skipped: 2,
            imported: 0,
            refused: 0,
            left: 0,
          },
        }),
      ),
    );
    expect(screen.queryByRole("button", { name: /^Import / })).toBeNull();
    expect(screen.getByText(/No row is ready to import\./)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Discard this preview" }),
    ).toBeEnabled();
  });

  it("IMP-S1-11: pressing Import asks for batch after batch until the import is no longer importing", async () => {
    // Held until the test lets it go, so the page is seen while it works.
    let firstBatch!: (outcome: { status: "importing" }) => void;
    actions.startImport.mockReturnValue(
      new Promise((resolve) => {
        firstBatch = resolve;
      }),
    );
    actions.continueImport
      .mockResolvedValueOnce({ status: "importing" })
      .mockResolvedValueOnce({ status: "finished" });
    render(page(detail({})));

    fireEvent.click(screen.getByRole("button", { name: "Import 2 rooms" }));
    expect(
      await screen.findByText(/Keep this page open\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 2 rooms" }),
    ).toBeDisabled();

    firstBatch({ status: "importing" });
    await waitFor(() =>
      expect(actions.continueImport).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(screen.queryByText(/Keep this page open\./)).toBeNull(),
    );
    expect(actions.startImport).toHaveBeenCalledTimes(1);
    expect(actions.stopImport).not.toHaveBeenCalled();
  });

  it("IMP-S1-11: an import a closed page paused offers to carry on, and to stop", () => {
    render(
      page(
        detail({
          status: "importing",
          counts: {
            ready: 1,
            wrong: 1,
            skipped: 0,
            imported: 1,
            refused: 0,
            left: 0,
          },
        }),
      ),
    );
    expect(
      screen.getByText("This import was paused with 1 row still to do."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carry on" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Stop and leave the rest" }),
    ).toBeEnabled();
  });

  it("IMP-S1-12: somebody else's running import offers Stop and never Carry on, and shows none of its rows", () => {
    render(
      page(
        detail({
          status: "importing",
          mine: false,
          rows: [],
          counts: {
            ready: 5,
            wrong: 0,
            skipped: 0,
            imported: 3,
            refused: 0,
            left: 0,
          },
        }),
      ),
    );
    expect(
      screen.getByText(/Selin Kaya is importing here now\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Carry on" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();

    actions.stopImport.mockResolvedValue({ status: "finished" });
    fireEvent.click(
      screen.getByRole("button", { name: "Stop and leave the rest" }),
    );
    expect(actions.stopImport).toHaveBeenCalledWith(
      "1a000001-0000-4000-8000-000000000001",
      "en",
    );
  });

  it("IMP-S1-07: a start refused because another import is running says so and says what to do", async () => {
    actions.startImport.mockResolvedValue({ status: "alreadyRunning" });
    render(page(detail({})));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 rooms" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Another import is running at this Property.",
    );
  });

  it("IMP-S1-25: a finished import offers both files and the way to Rooms, and only a way the viewer may take", () => {
    const finished = detail({
      status: "finished",
      counts: {
        ready: 0,
        wrong: 1,
        skipped: 0,
        imported: 2,
        refused: 0,
        left: 0,
      },
    });
    render(page(finished));
    expect(
      screen.getByRole("link", { name: "Download the result" }),
    ).toHaveAttribute(
      "href",
      "/api/import/1a000001-0000-4000-8000-000000000001/result?file=result&locale=en",
    );
    expect(
      screen.getByRole("link", { name: "Download the rows to fix" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Rooms" })).toHaveAttribute(
      "href",
      "/en/rooms?property=p",
    );

    cleanup();
    render(page(finished, null));
    expect(screen.queryByRole("link", { name: "Open Rooms" })).toBeNull();
  });

  it("IMP-S1-25: once the rows are forgotten the page says so and offers no file", () => {
    render(
      page(
        detail({
          status: "finished",
          rowsForgotten: true,
          rows: [],
          counts: {
            ready: 0,
            wrong: 1,
            skipped: 0,
            imported: 2,
            refused: 0,
            left: 0,
          },
        }),
      ),
    );
    expect(
      screen.getByText(
        /were forgotten after 7 days\. The counts above are kept\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("2 imported")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });
});
