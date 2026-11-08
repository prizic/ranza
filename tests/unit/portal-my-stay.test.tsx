/**
 * My stay on a phone: the room and bed, the term, what is owed and the next
 * instalment (GP-S4-08 to GP-S4-10, GP-S4-18 to GP-S4-20).
 *
 * The page draws what the database returned and derives nothing but the way the
 * balance points, so the cases are the shapes the database can return: a bed in
 * a room, a room let whole, a balance owed, in credit and settled, no balance
 * at all, an instalment upcoming, due today and overdue, no plan, and no Stay
 * yet. Each runs in the three languages the Portal speaks, because the words
 * for owed, credit and overdue are the ones a student would otherwise have to
 * infer from a sign or a colour.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatMoney,
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import { messages } from "../../apps/guest-portal/src/messages";

const { language } = vi.hoisted(() => ({
  language: { current: "en" as SupportedLocale },
}));
const listOwnStays = vi.fn();

vi.mock("../../apps/guest-portal/node_modules/server-only", () => ({}));
vi.mock("../../apps/guest-portal/node_modules/next/headers", () => ({
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({
      locale: language.current,
      messages: messages[language.current] as never,
    }),
  setRequestLocale: vi.fn(),
}));
vi.mock("../../apps/guest-portal/src/server/composition", () => ({
  getComposition: () => ({
    auth: {
      api: {
        getSession: async () => ({
          user: { id: "subject", email: "resident@example.test" },
        }),
      },
    },
    linkRanzaUser: async () => "d9400001-0000-4000-8000-000000000001",
    stays: { listOwnStays },
    branding: { stayBrands: async () => [] },
  }),
}));

const BED_IN_A_ROOM = {
  stayId: "d9400002-0000-4000-8000-000000000001",
  stayType: "resident",
  status: "in_house",
  startsOn: "2026-09-01",
  endsOn: "2027-06-30",
  propertyId: "d9400003-0000-4000-8000-000000000001",
  propertyName: "Deniz Yurdu",
  operatingModel: "dormitory",
  timezone: "Europe/Istanbul",
  unitId: "d9400004-0000-4000-8000-000000000001",
  unitName: "B",
  unitType: "bed",
  unitCapacity: 1,
  roomName: "A-101",
  building: "Block B",
  floor: 3,
  balance: { currency: "TRY", amountMinor: "3000000", folioStatus: "open" },
  nextInstalment: null,
};

const UPCOMING_INSTALMENT = {
  currency: "TRY",
  number: 2,
  of: 4,
  dueOn: "2026-11-05",
  outstandingMinor: "1250000",
  state: "upcoming",
  overdueCount: 0,
  overdueMinor: "0",
};

function phraseWithADate(template: string) {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace("\\{date\\}", ".+")}$`);
}

function occurrencesOf(text: string, part: string) {
  return text.split(part).length - 1;
}

const { default: StayPage } =
  await import("../../apps/guest-portal/src/app/[locale]/(portal)/stay/page");

async function show(
  stay: Record<string, unknown> | null,
  locale: SupportedLocale = "en",
) {
  language.current = locale;
  listOwnStays.mockResolvedValue(stay ? [{ ...BED_IN_A_ROOM, ...stay }] : []);
  render(await StayPage({ params: Promise.resolve({ locale }) }));
  return messages[locale];
}

beforeEach(() => {
  listOwnStays.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("My stay", () => {
  for (const locale of supportedLocales) {
    it(`GP-S4-08: leads with the room, names the bed after it, and says where the room is in ${locale}`, async () => {
      const say = await show({}, locale);

      expect(
        screen.getByRole("heading", { name: "A-101" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(say.myStay.bed.replace("{name}", "B"))),
      ).toBeInTheDocument();
      expect(screen.getByText(/Block B/)).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(say.myStay.floor.replace("{floor}", "3"))),
      ).toBeInTheDocument();
    });

    it(`a dormitory's Resident is called a student, not a Resident, in ${locale}`, async () => {
      const say = await show({}, locale);

      expect(screen.getByText(say.stayTypeStudent)).toBeInTheDocument();
      expect(screen.queryByText(say.stayType.resident)).not.toBeInTheDocument();
    });

    it(`a dormitory's Guest is still a Guest, and a hotel's Resident still a Resident, in ${locale}`, async () => {
      let say = await show({ stayType: "guest" }, locale);
      expect(screen.getByText(say.stayType.guest)).toBeInTheDocument();
      expect(screen.queryByText(say.stayTypeStudent)).not.toBeInTheDocument();
      cleanup();

      say = await show({ operatingModel: "hotel" }, locale);
      expect(screen.getByText(say.stayType.resident)).toBeInTheDocument();
      expect(screen.queryByText(say.stayTypeStudent)).not.toBeInTheDocument();
    });

    it(`GP-S4-08: shows arrival and departure as dates, not an open end, in ${locale}`, async () => {
      const say = await show({}, locale);

      const arrival = screen.getByText(say.arrival).parentElement!;
      const departure = screen.getByText(say.departure).parentElement!;
      expect(within(arrival).getByText(/2026/).tagName).toBe("TIME");
      expect(within(arrival).getByText(/2026/)).toHaveAttribute(
        "datetime",
        "2026-09-01",
      );
      expect(within(departure).getByText(/2027/)).toHaveAttribute(
        "datetime",
        "2027-06-30",
      );
      expect(screen.queryByText(say.openEnded)).toBeNull();
    });

    it(`GP-S4-08: says there is no end date, rather than a date, for an open term in ${locale}`, async () => {
      const say = await show({ endsOn: null }, locale);

      expect(screen.getByText(say.openEnded)).toBeInTheDocument();
    });

    it(`GP-S4-08: draws what is owed as one figure with the words that say which way it points in ${locale}`, async () => {
      const say = await show({}, locale);

      expect(screen.getByTestId("stay-balance-figure").textContent).toBe(
        formatMoney(3_000_000, "TRY", locale),
      );
      const card = screen.getByTestId("stay-balance");
      expect(within(card).getByText(say.myStay.balance)).toBeInTheDocument();
      expect(within(card).getByText(say.myStay.owed)).toBeInTheDocument();
    });

    it(`GP-S4-03: draws a credit as a positive figure that says it is in their favour in ${locale}`, async () => {
      const say = await show(
        {
          balance: {
            currency: "TRY",
            amountMinor: "-250000",
            folioStatus: "open",
          },
        },
        locale,
      );

      // The sign is dropped from the figure and carried by the words, so a
      // student is not left to read a minus sign.
      expect(screen.getByTestId("stay-balance-figure").textContent).toBe(
        formatMoney(250_000, "TRY", locale),
      );
      expect(screen.getByTestId("stay-balance-figure").textContent).not.toMatch(
        /-|−/,
      );
      expect(screen.getByText(say.myStay.credit)).toBeInTheDocument();
      expect(screen.queryByText(say.myStay.owed)).toBeNull();
    });

    it(`GP-S4-03: draws a settled Folio as nothing to pay, not as a debt, in ${locale}`, async () => {
      const say = await show(
        { balance: { currency: "TRY", amountMinor: "0", folioStatus: "open" } },
        locale,
      );

      expect(screen.getByText(say.myStay.settled)).toBeInTheDocument();
      expect(screen.queryByText(say.myStay.owed)).toBeNull();
    });
  }

  it("GP-S4-08: a room let whole has no bed line and no parent is invented", async () => {
    const say = await show({
      unitName: "Room 12",
      unitType: "room",
      unitCapacity: 2,
      roomName: null,
      building: null,
      floor: null,
    });

    expect(
      screen.getByRole("heading", { name: "Room 12" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(say.myStay.bed.replace("{name}", "B")),
    ).toBeNull();
    expect(screen.queryByText(/Block B/)).toBeNull();
    expect(
      screen.queryByText(say.myStay.floor.replace("{floor}", "3")),
    ).toBeNull();
  });

  it("GP-S4-09: leaves the balance out when the database returned none, with no heading and no zero", async () => {
    const say = await show({ balance: null });

    // Nothing known is not nothing owed: no card, no heading, no figure.
    expect(screen.queryByTestId("stay-balance")).toBeNull();
    expect(screen.queryByText(say.myStay.balance)).toBeNull();
    expect(screen.queryByText(say.myStay.settled)).toBeNull();
    expect(screen.getByRole("heading", { name: "A-101" })).toBeInTheDocument();
  });

  for (const locale of supportedLocales) {
    it(`GP-S4-18: draws the next instalment as what is owed on it, its place in the plan and the day it falls due in ${locale}`, async () => {
      const say = await show({ nextInstalment: UPCOMING_INSTALMENT }, locale);

      const card = screen.getByTestId("stay-instalment");
      expect(card).toHaveAttribute("data-state", "upcoming");
      expect(
        within(card).getByText(say.myStay.instalment.heading),
      ).toBeInTheDocument();
      expect(screen.getByTestId("stay-instalment-amount").textContent).toBe(
        formatMoney(1_250_000, "TRY", locale),
      );
      expect(
        within(card).getByText(
          say.myStay.instalment.position
            .replace("{number}", "2")
            .replace("{total}", "4"),
        ),
      ).toBeInTheDocument();
      const due = card.querySelector("time")!;
      expect(due).toHaveAttribute("datetime", "2026-11-05");
      expect(due.textContent).toMatch(
        phraseWithADate(say.myStay.instalment.dueOn),
      );
      expect(due.textContent).toMatch(/2026/);
      expect(card.className).not.toContain("border-s-warning");
      expect(
        within(card).queryByText(say.myStay.instalment.overdueNote),
      ).toBeNull();
    });

    it(`GP-S4-19: says an instalment falling due today is due today, and not late, in ${locale}`, async () => {
      const say = await show(
        { nextInstalment: { ...UPCOMING_INSTALMENT, state: "due" } },
        locale,
      );

      const card = screen.getByTestId("stay-instalment");
      expect(card).toHaveAttribute("data-state", "due");
      expect(
        within(card).getByText(say.myStay.instalment.dueToday),
      ).toBeInTheDocument();
      expect(card.className).not.toContain("border-s-warning");
      expect(
        within(card).queryByText(say.myStay.instalment.overdueNote),
      ).toBeNull();
    });

    it(`GP-S4-19: says an overdue instalment plainly, once, with what to do about it in ${locale}`, async () => {
      const say = await show(
        {
          nextInstalment: {
            ...UPCOMING_INSTALMENT,
            dueOn: "2026-10-20",
            state: "overdue",
            overdueCount: 1,
            overdueMinor: "1250000",
          },
        },
        locale,
      );

      const card = screen.getByTestId("stay-instalment");
      expect(card).toHaveAttribute("data-state", "overdue");
      expect(card.className).toContain("border-s-warning");
      expect(
        within(card).getByText(say.myStay.instalment.overdueNote),
      ).toBeInTheDocument();
      const due = card.querySelector("time")!;
      expect(due).toHaveAttribute("datetime", "2026-10-20");
      expect(due.textContent).toMatch(
        phraseWithADate(say.myStay.instalment.wasDueOn),
      );
      // One late instalment is the card's own figure; it is not told again as
      // a total beside itself.
      expect(
        occurrencesOf(
          card.textContent ?? "",
          formatMoney(1_250_000, "TRY", locale),
        ),
      ).toBe(1);
    });

    it(`GP-S4-19: adds how many are late and how much in all when more than one is in ${locale}`, async () => {
      await show(
        {
          nextInstalment: {
            ...UPCOMING_INSTALMENT,
            dueOn: "2026-10-05",
            state: "overdue",
            overdueCount: 2,
            overdueMinor: "2500000",
          },
        },
        locale,
      );

      const card = screen.getByTestId("stay-instalment");
      expect(card.textContent).toContain(formatMoney(2_500_000, "TRY", locale));
      expect(card.textContent).toMatch(/[2٢]/);
    });
  }

  for (const [count, noun] of [
    [2, "قسطان متأخران"],
    [3, "أقساط متأخرة"],
    [11, "قسطًا متأخرًا"],
    [100, "قسط متأخر"],
  ] as const) {
    it(`GP-S4-19: the Arabic count of ${count} late instalments takes the form its number asks for`, async () => {
      await show(
        {
          nextInstalment: {
            ...UPCOMING_INSTALMENT,
            state: "overdue",
            overdueCount: count,
            overdueMinor: "9900000",
          },
        },
        "ar",
      );

      expect(screen.getByTestId("stay-instalment").textContent).toContain(noun);
    });
  }

  it("GP-S4-20: draws nothing for a plan that is not there, with no heading and no zero", async () => {
    const say = await show({ nextInstalment: null });

    expect(screen.queryByTestId("stay-instalment")).toBeNull();
    expect(screen.queryByText(say.myStay.instalment.heading)).toBeNull();
    expect(screen.getByTestId("stay-balance")).toBeInTheDocument();
  });

  it("GP-S4-20: an instalment is drawn without a balance beside it, and neither waits for the other", async () => {
    await show({ balance: null, nextInstalment: UPCOMING_INSTALMENT });

    expect(screen.queryByTestId("stay-balance")).toBeNull();
    expect(screen.getByTestId("stay-instalment")).toBeInTheDocument();
  });

  for (const locale of supportedLocales) {
    it(`GP-S4-10: reads as no stay yet, not as an error, for an account with no Stay in ${locale}`, async () => {
      const say = await show(null, locale);

      expect(screen.getByText(say.noStayTitle)).toBeInTheDocument();
      expect(screen.queryByTestId("stay-balance")).toBeNull();
      expect(screen.queryByTestId("stay-instalment")).toBeNull();
    });
  }
});
