/**
 * The roll call, rendered (LA-S2-05, LA-S2-11, LA-S2-12): what it offers a
 * Resident on leave, what it does when the server refuses an answer, and that
 * every string exists in every language.
 *
 * The browser suite presses the same buttons against a real database; these are
 * the rows it would take a second account, or a server that fails on purpose,
 * to reach there.
 */
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { RollCall } from "../../packages/ranza/attendance/src";
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";

const actions = vi.hoisted(() => ({
  markAttendance: vi.fn(),
  markFloorPresent: vi.fn(),
  giveLeave: vi.fn(),
  closeLeave: vi.fn(),
  changeCurfew: vi.fn(),
}));
vi.mock("../../apps/operator-workspace/src/server/attendance", () => actions);
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const { RollCallView } =
  await import("../../apps/operator-workspace/src/features/attendance/components/roll-call-view");
const { rollFilterFrom } =
  await import("../../apps/operator-workspace/src/features/attendance/grouping");
import type { RollFilter } from "../../apps/operator-workspace/src/features/attendance/grouping";

const NIGHT = "2026-10-31";

const TONIGHT: RollCall = {
  propertyId: "d9000005-0000-4000-8000-000000000001",
  night: NIGHT,
  curfew: "23:00",
  curfewIsDefault: true,
  curfewPassed: false,
  figures: { inHouse: 3, onLeave: 1, present: 0, absent: 0, notCalled: 2 },
  rows: [
    {
      stayId: "s1",
      residentName: "Elif Yılmaz",
      building: "Blok A",
      floor: 1,
      roomName: "A-101",
      bedName: "A",
      status: "not_called",
      markedAt: null,
      leave: null,
    },
    {
      stayId: "s2",
      residentName: "Zeynep Kaya",
      building: "Blok A",
      floor: 1,
      roomName: "A-101",
      bedName: "B",
      status: "on_leave",
      markedAt: null,
      leave: {
        leaveId: "l1",
        fromNight: "2026-10-30",
        toNight: "2026-11-01",
        reason: "Weekend with family",
      },
    },
    {
      stayId: "s3",
      residentName: "Ayşe Demir",
      building: "Blok A",
      floor: 1,
      roomName: "A-102",
      bedName: "A",
      status: "not_called",
      markedAt: null,
      leave: null,
    },
  ],
  leaves: [],
  mayTake: true,
  mayGrant: true,
  mayConfigure: false,
};

function show(
  rollCall: RollCall,
  locale: SupportedLocale = "en",
  initialFilter?: RollFilter,
) {
  cleanup();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <RollCallView
        initialFilter={initialFilter}
        locale={locale}
        rollCall={rollCall}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a Resident on leave", () => {
  it("LA-S2-05: is not markable, and the figures count them as away", () => {
    show(TONIGHT);
    const row = screen.getByText("Zeynep Kaya").closest("li")!;
    expect(
      within(row).queryByRole("button", { name: /is (present|absent)$/ }),
    ).toBeNull();
    expect(within(row).getByText(/On leave through/)).toBeVisible();
    expect(within(row).getByText(/Weekend with family/)).toBeVisible();
    // A leave that began last night is ended, not cancelled: "Back".
    expect(
      within(row).getByRole("button", { name: "Zeynep Kaya is back" }),
    ).toBeVisible();
    const figures = screen.getByRole("region", { name: "Tonight's figures" });
    expect(
      within(figures).getByText("On leave").previousSibling,
    ).toHaveTextContent("1");
  });

  it("LA-S2-05: says no reason to a desk that may not read it, and offers no way back", () => {
    show({
      ...TONIGHT,
      mayGrant: false,
      rows: TONIGHT.rows.map((row) =>
        row.leave ? { ...row, leave: { ...row.leave, reason: null } } : row,
      ),
    });
    const row = screen.getByText("Zeynep Kaya").closest("li")!;
    expect(within(row).queryByText(/Weekend with family/)).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

describe("an answer the server refuses", () => {
  it("LA-S2-11: goes back, and the screen says so", async () => {
    actions.markAttendance.mockResolvedValue("refused");
    show(TONIGHT);
    const figures = screen.getByRole("region", { name: "Tonight's figures" });
    fireEvent.click(
      screen.getByRole("button", { name: "Elif Yılmaz is absent" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/The page may be out of date/)).toBeVisible(),
    );
    // The row is as it was: nothing is shown kept that was not.
    await waitFor(() =>
      expect(screen.getByText("Elif Yılmaz").closest("li")).toHaveAttribute(
        "data-status",
        "not_called",
      ),
    );
    expect(
      within(figures).getByText("Missing").previousSibling,
    ).toHaveTextContent("0");
  });

  it("LA-S2-11: a fault says nothing changed, in words and not a code", async () => {
    actions.markAttendance.mockResolvedValue("failed");
    show(TONIGHT);
    fireEvent.click(
      screen.getByRole("button", { name: "Elif Yılmaz is absent" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Nothing changed/)).toBeVisible(),
    );
  });
});

describe("what is offered to whom", () => {
  it("offers no answer buttons to somebody who may not call the roll", () => {
    show({ ...TONIGHT, mayTake: false });
    expect(
      screen.queryByRole("button", { name: /is (present|absent)$/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark the other/ })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /^Give .* leave$/ }).length,
    ).toBeGreaterThan(0);
  });

  it("LA-S2-11: an empty house says nobody is in house", () => {
    show({
      ...TONIGHT,
      rows: [],
      figures: { inHouse: 0, onLeave: 0, present: 0, absent: 0, notCalled: 0 },
    });
    expect(screen.getByText("Nobody is in house tonight")).toBeVisible();
  });
});

describe("every language", () => {
  it.each(supportedLocales)(
    "LA-S2-12: renders its own words in %s",
    (locale) => {
      show(TONIGHT, locale);
      const figures = screen.getByRole("region", {
        name: messages[locale].attendance.figuresLabel,
      });
      for (const label of Object.values(messages[locale].attendance.figures)) {
        expect(within(figures).getByText(label)).toBeVisible();
      }
      expect(
        screen.getByText(
          messages[locale].attendance.curfew.replace("{time}", "23:00"),
          { exact: false },
        ),
      ).toBeVisible();
    },
  );
});

describe("a roll call opened from a figure elsewhere (B-06)", () => {
  it("B-06: opens narrowed to the people the figure counted, with that figure pressed", () => {
    show(TONIGHT, "en", "on_leave");
    expect(screen.getByText("Zeynep Kaya")).toBeVisible();
    expect(screen.queryByText("Elif Yılmaz")).toBeNull();
    const pressed = screen
      .getAllByRole("button", { pressed: true })
      .map((button) => button.textContent);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain("On leave");
  });

  it("B-06: opens whole when no figure was named", () => {
    show(TONIGHT);
    expect(screen.getByText("Zeynep Kaya")).toBeVisible();
    expect(screen.getByText("Elif Yılmaz")).toBeVisible();
  });

  it("B-06: reads only the narrowings the screen has, and everyone for the rest", () => {
    expect(rollFilterFrom("absent")).toBe("absent");
    expect(rollFilterFrom("on_leave")).toBe("on_leave");
    expect(rollFilterFrom("not_called")).toBe("not_called");
    expect(rollFilterFrom("present")).toBe("all");
    expect(rollFilterFrom("<script>")).toBe("all");
    expect(rollFilterFrom(undefined)).toBe("all");
  });
});

describe("a leave whose Resident the viewer may not name (B-15)", () => {
  const unnamed = (leaveRow: RollCall["leaves"][number]): RollCall => ({
    ...TONIGHT,
    rows: TONIGHT.rows.map((row) => ({ ...row, residentName: null })),
    leaves: [leaveRow],
  });
  const LEAVE = {
    leaveId: "l9",
    stayId: "s2",
    residentName: null,
    fromNight: "2026-10-30",
    toNight: "2026-11-01",
    reason: null,
  } as unknown as RollCall["leaves"][number];

  it("B-15: says the room and bed, never the stay's id", () => {
    show(unnamed(LEAVE));
    const list = screen.getByRole("heading", { name: "Leave" }).parentElement!;
    expect(within(list).getByText("A-101 · B")).toBeVisible();
    expect(within(list).queryByText("s2")).toBeNull();
  });

  it("B-15: a Resident not on tonight's roll is only a Resident", () => {
    show(unnamed({ ...LEAVE, stayId: "s-gone" } as typeof LEAVE));
    const list = screen.getByRole("heading", { name: "Leave" }).parentElement!;
    expect(within(list).getByText("A Resident")).toBeVisible();
    expect(within(list).queryByText("s-gone")).toBeNull();
  });
});
