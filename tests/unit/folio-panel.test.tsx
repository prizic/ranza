/**
 * A room night on a Folio, as the Finance screen shows it (ADR 0038, RT-S3-14).
 *
 * The database writes "Room night" as a room night's description, in English,
 * because a description is data and a Folio is read in three languages. The
 * panel names the line in the reader's language for the night it is for — and
 * names a reversal of one the same way, because a reversal copies the
 * description of the line it cancels.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolioDetail } from "../../packages/ranza/folios/src";
import { supportedLocales } from "../../packages/i18n/src";
import { parseAmount } from "../../apps/operator-workspace/src/lib/amount";
import { messages } from "../../apps/operator-workspace/src/messages";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("../../apps/operator-workspace/node_modules/next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
const postCharge = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/finance", () => ({
  closeFolio: vi.fn(),
  postCharge: (...args: unknown[]) => postCharge(...args),
  postPayment: vi.fn(),
  reverseLine: vi.fn(),
}));

const { FolioPanel } =
  await import("../../apps/operator-workspace/src/features/finance/components/folio-panel");

/** The text of an element without the isolates that keep a name from reordering, and with plain spaces. */
const plain = (element: HTMLElement): string =>
  (element.textContent ?? "")
    .replace(/[\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ");

afterEach(() => {
  cleanup();
  postCharge.mockReset();
});

const FOLIO: FolioDetail = {
  folioId: "d9000007-0000-4000-8000-000000000001",
  propertyId: "d9000007-0000-4000-8000-000000000003",
  stayId: "d9000007-0000-4000-8000-000000000002",
  reservationId: "d9000007-0000-4000-8000-000000000004",
  reference: "R96J74P",
  stayType: "guest",
  status: "open",
  currency: "TRY",
  guestName: "Ada Lovelace",
  unitName: "101",
  startsOn: "2026-09-24",
  endsOn: "2026-09-28",
  chargedMinor: 25000,
  paidMinor: 0,
  balanceMinor: 25000,
  lineCount: 4,
  lastPostedAt: new Date("2026-09-27T09:00:00Z"),
  roomNightLines: 2,
  stayInHouse: true,
  today: "2026-09-27",
  lastClosedOn: "2026-09-26",
  nightlyRateMinor: 10000,
  pendingNights: 0,
  pendingMinor: 0,
  lines: [
    {
      lineId: "d9000007-0000-4000-8000-000000000013",
      lineType: "reversal",
      description: "Room night",
      amountMinor: -10000,
      reversesLineId: "d9000007-0000-4000-8000-000000000011",
      reversed: false,
      postedAt: new Date("2026-09-27T09:00:00Z"),
      roomNightOf: null,
    },
    {
      lineId: "d9000007-0000-4000-8000-000000000012",
      lineType: "charge",
      description: "Minibar",
      amountMinor: 15000,
      reversesLineId: null,
      reversed: false,
      postedAt: new Date("2026-09-26T20:00:00Z"),
      roomNightOf: null,
    },
    {
      lineId: "d9000007-0000-4000-8000-000000000011",
      lineType: "charge",
      description: "Room night",
      amountMinor: 10000,
      reversesLineId: null,
      reversed: true,
      postedAt: new Date("2026-09-26T01:05:00Z"),
      roomNightOf: "2026-09-25",
    },
    {
      lineId: "d9000007-0000-4000-8000-000000000010",
      lineType: "charge",
      description: "Room night",
      amountMinor: 10000,
      reversesLineId: null,
      reversed: false,
      postedAt: new Date("2026-09-25T01:05:00Z"),
      roomNightOf: "2026-09-24",
    },
  ],
};

describe("a room night on a Folio", () => {
  it("a_room_night_reads_as_the_night_it_is_for", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel
          timeZone="Europe/Istanbul"
          folio={FOLIO}
          locale="en"
          mayReverse
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Room night · Sep 24, 2026")).toBeTruthy();
    // The charge and the reversal that cancels it both name the night.
    expect(screen.getByText("Room night · Sep 25, 2026")).toBeTruthy();
    expect(
      screen.getByText("Reversal of Room night · Sep 25, 2026"),
    ).toBeTruthy();
    // Anything else keeps what somebody wrote.
    expect(screen.getByText("Minibar")).toBeTruthy();
    expect(screen.queryByText("Room night")).toBeNull();
  });

  for (const locale of supportedLocales) {
    it(`a_room_night_reads_in_every_locale: ${locale}`, () => {
      render(
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <FolioPanel
            timeZone="Europe/Istanbul"
            folio={FOLIO}
            locale={locale}
            mayReverse
          />
        </NextIntlClientProvider>,
      );
      const word = messages[locale].roomNightLine.split(" · ")[0]!;
      expect(screen.getAllByText(new RegExp(`${word} · `))).toHaveLength(3);
    });
  }
});

describe("closing a Folio (FO-S5-01)", () => {
  it("a Folio whose Guest is in house offers no close, and says why", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel
          timeZone="Europe/Istanbul"
          folio={FOLIO}
          locale="en"
          mayReverse
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("button", { name: "Close folio" })).toBeNull();
    expect(screen.getByText(/The Guest is still in house/)).toBeTruthy();
  });

  it("after check-out it can be closed", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel
          timeZone="Europe/Istanbul"
          folio={{ ...FOLIO, stayInHouse: false }}
          locale="en"
          mayReverse
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Close folio" })).toBeTruthy();
    expect(screen.queryByText(/The Guest is still in house/)).toBeNull();
  });
});

function panel(
  folio: FolioDetail,
  {
    locale = "en",
    mayReverse = true,
    mayPostCharge = true,
    mayPostPayment = false,
    mayReverseCharge,
    mayReversePayment = false,
  } = {} as {
    locale?: (typeof supportedLocales)[number];
    mayReverse?: boolean;
    mayPostCharge?: boolean;
    mayPostPayment?: boolean;
    mayReverseCharge?: boolean;
    mayReversePayment?: boolean;
  },
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <FolioPanel
          timeZone="Europe/Istanbul"
          folio={folio}
          locale={locale}
          mayPostCharge={mayPostCharge}
          mayPostPayment={mayPostPayment}
          mayReverse={mayReverse}
          mayReverseCharge={mayReverseCharge}
          mayReversePayment={mayReversePayment}
        />
      </div>
    </NextIntlClientProvider>,
  );
}

const FOLIO_WITH_PAYMENT: FolioDetail = {
  ...FOLIO,
  lines: [
    ...FOLIO.lines,
    {
      lineId: "d9000007-0000-4000-8000-000000000014",
      lineType: "payment",
      description: "Payment",
      amountMinor: -15000,
      paymentMethod: "card",
      reversesLineId: null,
      reversed: false,
      postedAt: new Date("2026-09-27T10:00:00Z"),
      roomNightOf: null,
    },
  ],
};

describe("what one Folio offers (FO-S9-03)", () => {
  it("offers reverse only on a charge nothing has cancelled", () => {
    panel(FOLIO);
    // Minibar and the 24th's night. Not the reversal, not the night it cancels.
    expect(screen.getAllByRole("button", { name: "Reverse" })).toHaveLength(2);
    // The cancelled charge says so in words, not only by its strike-through.
    expect(screen.getByText("reversed")).toBeTruthy();
  });

  it("offers no reverse to somebody without finance.reverse_charge (ADR 0041)", () => {
    panel(FOLIO, { mayReverse: false });
    expect(screen.queryByRole("button", { name: "Reverse" })).toBeNull();
    // Posting is a different permission, and still offered.
    expect(screen.getByRole("button", { name: "Post" })).toBeTruthy();
  });

  it("renders_record_payment_action_on_folio_drawer", () => {
    panel(FOLIO, { mayPostPayment: true });
    expect(
      screen.getByRole("button", { name: messages.en.addPayment }),
    ).toBeTruthy();
  });

  it("offers no payment to somebody without finance.post_payment", () => {
    panel(FOLIO, { mayPostPayment: false });
    expect(
      screen.queryByRole("button", { name: messages.en.addPayment }),
    ).toBeNull();
  });

  it("shows payment method badge on payment lines", () => {
    panel(FOLIO_WITH_PAYMENT);
    expect(screen.getByText(messages.en.paymentMethods.card)).toBeTruthy();
  });

  it("offers reverse on a payment line only when mayReversePayment is true", () => {
    // When mayReverseCharge is true (via mayReverse) but mayReversePayment is false:
    panel(FOLIO_WITH_PAYMENT, { mayReverse: true, mayReversePayment: false });
    // Still only 2 reverse buttons (the 2 charges, not the payment).
    expect(screen.getAllByRole("button", { name: "Reverse" })).toHaveLength(2);

    cleanup();

    // When mayReversePayment is true:
    panel(FOLIO_WITH_PAYMENT, { mayReverse: true, mayReversePayment: true });
    // Now 3 reverse buttons (2 charges + 1 payment).
    expect(screen.getAllByRole("button", { name: "Reverse" })).toHaveLength(3);
  });

  it("offers nothing on a closed Folio, and says so rather than a disabled reopen", () => {
    panel({ ...FOLIO, status: "closed", stayInHouse: false });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(messages.en.folioClosedNote)).toBeTruthy();
  });
});

describe("money and direction at display (FO-S9-06)", () => {
  it("mirrors through logical utilities only", () => {
    const { container } = panel(FOLIO, { locale: "ar" });
    const classes = [...container.querySelectorAll("[class]")].flatMap(
      (element) => element.getAttribute("class")!.split(/\s+/),
    );
    // A physical side does not mirror; `text-end`, `ms-`, `pe-` do.
    expect(
      classes.filter((name) =>
        /^(?:text-(?:left|right)|[mp][lr]-|(?:left|right)-|border-[lr](?:-|$)|rounded-[lr](?:-|$))/.test(
          name,
        ),
      ),
    ).toEqual([]);
    expect(container.querySelectorAll("td.text-end.tabular-nums")).toHaveLength(
      FOLIO.lines.length,
    );
  });

  it("shows posting times on the 24-hour clock", () => {
    const { container } = panel(FOLIO);
    const times = [...container.querySelectorAll("time")].map(
      (time) => time.textContent ?? "",
    );
    expect(times).toHaveLength(FOLIO.lines.length);
    expect(times.join(" ")).not.toMatch(/AM|PM/);
  });
});

describe("a line is dated by the Property's own clock", () => {
  const LATE = new Date("2026-09-26T22:30:00Z");
  const late: FolioDetail["lines"][number] = {
    lineId: "d9000007-0000-4000-8000-000000000020",
    lineType: "charge",
    description: "Late minibar",
    amountMinor: 5000,
    paymentMethod: null,
    reversesLineId: null,
    reversed: false,
    postedAt: LATE,
    roomNightOf: null,
  };
  const stamp = (container: HTMLElement): string =>
    container.querySelector(`time[datetime="${LATE.toISOString()}"]`)
      ?.textContent ?? "";

  it("a_line_posted_at_22_30_utc_is_the_next_day_in_istanbul", () => {
    const { container } = panel({ ...FOLIO, lines: [late] });
    expect(stamp(container)).toBe("Sep 27, 2026, 01:30");
  });

  it("a_line_is_dated_by_the_clock_it_is_given_not_the_machines", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel
          folio={{ ...FOLIO, lines: [late] }}
          locale="en"
          mayReverse
          timeZone="America/New_York"
        />
      </NextIntlClientProvider>,
    );
    expect(stamp(container)).toBe("Sep 26, 2026, 18:30");
  });

  for (const locale of supportedLocales) {
    it(`a_payment_line_is_dated_by_the_property_clock_in_every_locale: ${locale}`, () => {
      const payment = {
        ...late,
        lineType: "payment" as const,
        paymentMethod: "cash" as const,
        description: "Cash at the desk",
        amountMinor: -5000,
      };
      const { container } = panel({ ...FOLIO, lines: [payment] }, { locale });
      // Digits only: the month is a word, and the digits may be Arabic-Indic.
      const latin = stamp(container).replace(/[^\d]/g, "");
      expect(latin).toMatch(/27/);
      expect(latin).toMatch(/0130$/);
    });
  }
});

describe("who the Folio is, and what it has come to (FIN-03, FIN-13)", () => {
  it("names the Guest and the room in a heading, with the booking and the stay", () => {
    panel(FOLIO);
    expect(
      screen.getByRole("heading", { level: 2, name: /Ada Lovelace/ }),
    ).toHaveTextContent("Ada Lovelace · 101");
    expect(screen.getByText(/R96J74P/)).toBeTruthy();
    expect(screen.getByText("Sep 24, 2026 – Sep 28, 2026")).toBeTruthy();
  });

  it("states what was charged, what was paid and what is left", () => {
    panel(FOLIO_WITH_PAYMENT_TOTALS);
    const facts = screen.getByText(messages.en.finance.charged).closest("div")!;
    expect(facts).toHaveTextContent("TRY 250.00");
    expect(
      screen.getByText(messages.en.finance.paid).closest("div")!,
    ).toHaveTextContent("TRY 150.00");
    expect(
      screen.getByText(messages.en.balance).closest("div")!,
    ).toHaveTextContent("TRY 100.00");
  });

  it("links the booking only to somebody who reaches Reservations", () => {
    const { container } = panel(FOLIO);
    expect(container.querySelector("a[href*='open=']")).toBeNull();
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel
          folio={FOLIO}
          locale="en"
          mayOpenReservation
          propertyId={FOLIO.propertyId}
          timeZone="Europe/Istanbul"
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Booking R96J74P" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining(`open=${FOLIO.reservationId}`),
    );
  });

  it("links the folio's own history only when it is given where to", () => {
    const { container } = panel(FOLIO);
    expect(container.querySelector("[data-history-link]")).toBeNull();
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <FolioPanel
          auditHref="/en/audit-log?property=p&subject=f"
          folio={FOLIO}
          locale="en"
          timeZone="Europe/Istanbul"
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/en/audit-log?property=p&subject=f",
    );
  });

  it("says an in-house Guest is overdue, in days on the Property's clock", () => {
    panel({ ...FOLIO, endsOn: "2026-09-24", today: "2026-09-27" });
    expect(screen.getByText("Overdue · 3 days")).toBeTruthy();
  });

  it("does not call a Guest who has not yet left overdue", () => {
    panel(FOLIO);
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });
});

const FOLIO_WITH_PAYMENT_TOTALS: FolioDetail = {
  ...FOLIO,
  chargedMinor: 25000,
  paidMinor: 15000,
  balanceMinor: 10000,
};

describe("a zero balance is not always a settled one (FIN-09)", () => {
  const NONE: Partial<FolioDetail> = {
    lines: [],
    lineCount: 0,
    chargedMinor: 0,
    paidMinor: 0,
    balanceMinor: 0,
    roomNightLines: 0,
    lastPostedAt: null,
  };

  it("says no nights have been charged yet, and when they will be, with the last closed day", () => {
    panel({ ...FOLIO, ...NONE });
    const note = screen.getByTestId("nights-note");
    expect(note).toHaveTextContent("No nights charged yet");
    expect(note).toHaveTextContent("when each day is closed, and at check-out");
    expect(note).toHaveTextContent("The last day closed was Sep 26, 2026");
  });

  it("says so when no day has closed", () => {
    panel({ ...FOLIO, ...NONE, lastClosedOn: null });
    expect(screen.getByTestId("nights-note")).toHaveTextContent(
      "No day has been closed at this Property yet",
    );
  });

  it("says a booking with no price will never charge a night", () => {
    panel({ ...FOLIO, ...NONE, nightlyRateMinor: null });
    expect(screen.getByTestId("nights-note")).toHaveTextContent(
      "no price, so no nights are charged",
    );
  });

  it("says what has been charged so far, and that later nights post at the close or check-out", () => {
    panel(FOLIO);
    expect(screen.getByTestId("nights-note")).toHaveTextContent(
      "TRY 250.00 charged so far. Later nights are charged when each day is closed, and at check-out.",
    );
  });

  it("has nothing to say about a closed Folio or a Resident billed monthly", () => {
    panel({ ...FOLIO, ...NONE, status: "closed", stayInHouse: false });
    expect(screen.queryByTestId("nights-note")).toBeNull();
    cleanup();
    panel({ ...FOLIO, ...NONE, stayType: "resident" });
    expect(screen.queryByTestId("nights-note")).toBeNull();
  });

  it("shows what check-out will still charge, and what the Guest owes with it", () => {
    panel({
      ...FOLIO,
      ...NONE,
      pendingNights: 2,
      pendingMinor: 24000,
    });
    expect(
      screen.getByText(messages.en.finance.stillToCharge).closest("div")!,
    ).toHaveTextContent("2 nights · TRY 240.00");
    expect(
      screen.getByText(messages.en.finance.owesAtCheckOut).closest("div")!,
    ).toHaveTextContent("TRY 240.00");
  });
});

describe("a correction reads as one (FIN-07)", () => {
  const CHARGE = FOLIO.lines.find((line) => line.description === "Minibar")!;
  const WITH_REVERSAL: FolioDetail = {
    ...FOLIO,
    lines: [
      {
        lineId: "d9000007-0000-4000-8000-000000000030",
        lineType: "reversal",
        description: "Charged twice by mistake",
        amountMinor: -CHARGE.amountMinor,
        paymentMethod: null,
        reversesLineId: CHARGE.lineId,
        reversed: false,
        postedAt: new Date("2026-09-27T10:00:00Z"),
        roomNightOf: null,
      },
      { ...CHARGE, reversed: true },
    ],
  };

  it("labels the reversal with what it cancels and the reason that was typed", () => {
    panel(WITH_REVERSAL);
    expect(screen.getByText("Reversal of Minibar")).toBeTruthy();
    expect(plain(screen.getByText(/^Reason: /))).toBe(
      "Reason: Charged twice by mistake",
    );
  });

  it("says once, under the lines, that a correction never removes one", () => {
    panel(WITH_REVERSAL);
    expect(screen.getByText(/A correction never removes a line/)).toBeTruthy();
  });
});

describe("recording a payment states what it records (FIN-05, FIN-06)", () => {
  const open = (folio: FolioDetail = FOLIO) => {
    panel(folio, { mayPostPayment: true });
    fireEvent.click(
      screen.getByRole("button", { name: messages.en.addPayment }),
    );
    return screen.getByRole("dialog");
  };

  it("prefills_payment_amount_to_unsettled_balance", () => {
    const dialog = open({ ...FOLIO, balanceMinor: 45_000 });
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue("450.00");
  });

  it("starts from what the Guest owes, with no payment method chosen", () => {
    const dialog = open();
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue("250.00");
    expect(
      within(dialog).queryAllByRole("radio", { checked: true }),
    ).toHaveLength(0);
    expect(within(dialog).getByTestId("payment-summary")).toHaveTextContent(
      "Type the amount and choose the method",
    );
  });

  it("counts the nights check-out will still charge in what is owed", () => {
    const dialog = open({ ...FOLIO, pendingNights: 1, pendingMinor: 10000 });
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue("350.00");
    expect(dialog).toHaveTextContent(
      "owes TRY 350.00 now, counting the nights check-out will still charge",
    );
  });

  it("starts empty when nothing is owed", () => {
    const dialog = open({ ...FOLIO, balanceMinor: 0, chargedMinor: 0 });
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue("");
    expect(dialog).toHaveTextContent("Nothing is owed on this folio now");
  });

  it("asks the clerk to confirm an amount above what is owed before it can be sent", () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole("radio", {
        name: messages.en.paymentMethods.cash,
      }),
    );
    fireEvent.change(within(dialog).getByLabelText(/Amount/), {
      target: { value: "1,000.00" },
    });
    const submit = within(dialog).getByRole("button", {
      name: messages.en.addPayment,
    });
    expect(submit).toBeDisabled();
    expect(dialog).toHaveTextContent(
      "This is TRY 750.00 more than the TRY 250.00 owed",
    );
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(submit).toBeEnabled();
  });

  it("does not ask when the amount is no more than is owed", () => {
    const dialog = open();
    fireEvent.click(
      within(dialog).getByRole("radio", {
        name: messages.en.paymentMethods.cash,
      }),
    );
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: messages.en.addPayment }),
    ).toBeEnabled();
  });

  for (const locale of supportedLocales) {
    it(`reads the amount it prefilled back in the language of the screen: ${locale}`, () => {
      panel(FOLIO, { locale, mayPostPayment: true });
      fireEvent.click(
        screen.getByRole("button", { name: messages[locale].addPayment }),
      );
      const amount = within(screen.getByRole("dialog")).getByRole("textbox", {
        name: /\(TRY\)/,
      }) as HTMLInputElement;
      expect(parseAmount(amount.value, "TRY", locale)).toEqual({
        ok: true,
        minor: 25000,
      });
    });
  }
});

describe("reversing and closing say what they do first (FIN-05)", () => {
  it("a reversal names the line, the amount and that the original stays", () => {
    panel(FOLIO);
    fireEvent.click(screen.getAllByRole("button", { name: "Reverse" })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Reverse this charge?");
    expect(plain(dialog)).toContain("Minibar");
    expect(plain(dialog)).toContain("TRY 150.00");
    expect(plain(dialog)).toContain("stays on the folio, marked reversed");
    expect(plain(dialog)).toContain("This cannot be undone");
    expect(within(dialog).getByLabelText("Reason")).toBeRequired();
  });

  it("a reversal of a payment says the balance goes up", () => {
    panel(FOLIO_WITH_PAYMENT, { mayReverse: true, mayReversePayment: true });
    const buttons = screen.getAllByRole("button", { name: "Reverse" });
    fireEvent.click(buttons[2]!);
    const dialog = screen.getByRole("dialog");
    expect(plain(dialog)).toContain("Reverse this payment?");
    expect(plain(dialog)).toContain("the balance goes up by TRY 150.00");
  });

  it("closing says what the folio is closed on when money is still owed", () => {
    panel({ ...FOLIO, stayInHouse: false });
    fireEvent.click(screen.getByRole("button", { name: "Close folio" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "TRY 250.00 is still owed, and closing does not settle it",
    );
    expect(dialog).toHaveTextContent("cannot be reopened");
  });

  it("closing a settled folio says the balance is zero", () => {
    panel({ ...FOLIO, stayInHouse: false, balanceMinor: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Close folio" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("The balance is zero");
  });
});

describe("a charge that is refused keeps what was typed (FIN-04)", () => {
  it("leaves the description and the amount in the fields and says what to change", async () => {
    postCharge.mockResolvedValue("amountDecimals");
    panel(FOLIO);
    const description = screen.getByLabelText("Description");
    const amount = screen.getByLabelText(/Amount/);
    fireEvent.change(description, { target: { value: "Minibar" } });
    fireEvent.change(amount, { target: { value: "12.505" } });
    fireEvent.submit(description.closest("form")!);

    expect(
      await screen.findByText("A TRY amount has at most 2 decimal places."),
    ).toBeTruthy();
    expect(description).toHaveValue("Minibar");
    expect(amount).toHaveValue("12.505");
  });

  it("says a refusal it cannot explain did not record anything, and offers to reload", async () => {
    postCharge.mockResolvedValue("refused");
    panel(FOLIO);
    const description = screen.getByLabelText("Description");
    fireEvent.change(description, { target: { value: "Minibar" } });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "5" },
    });
    fireEvent.submit(description.closest("form")!);

    expect(await screen.findByText(/nothing was recorded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(refresh).toHaveBeenCalled();
    expect(description).toHaveValue("Minibar");
  });
});

describe("what a form posts and when it clears (FIN-04, FIN-06)", () => {
  it("the payment dialog posts every field the server reads, under the name it reads", () => {
    panel(FOLIO, { mayPostPayment: true });
    fireEvent.click(
      screen.getByRole("button", { name: messages.en.addPayment }),
    );
    const dialog = screen.getByRole("dialog");
    const form = dialog.querySelector("form")!;
    const posted = Object.fromEntries(new FormData(form));
    expect(Object.keys(posted).sort()).toEqual([
      "amount",
      "currency",
      "description",
      "folio",
      "locale",
      "paymentMethod",
    ]);
    expect(posted).toMatchObject({
      amount: "250.00",
      currency: "TRY",
      folio: FOLIO.folioId,
      locale: "en",
      paymentMethod: "",
      description: messages.en.finance.paymentDefaultDescription,
    });
  });

  it("the charge form posts its amount and description under the names the server reads", () => {
    panel(FOLIO);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Minibar" },
    });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "5" },
    });
    const form = screen.getByLabelText("Description").closest("form")!;
    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      amount: "5",
      description: "Minibar",
      currency: "TRY",
      folio: FOLIO.folioId,
    });
  });

  it("an answer goes away when the person starts to change what they typed", async () => {
    postCharge.mockResolvedValue("amountFormat");
    panel(FOLIO);
    const description = screen.getByLabelText("Description");
    fireEvent.change(description, { target: { value: "Minibar" } });
    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "abc" },
    });
    fireEvent.submit(description.closest("form")!);
    expect(await screen.findByText(/That is not an amount/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Amount/), {
      target: { value: "12" },
    });
    expect(screen.queryByText(/That is not an amount/)).toBeNull();
  });

  it("clears the fields after each posting that goes through, not only the first", async () => {
    postCharge.mockResolvedValue("done");
    panel(FOLIO);
    const description = screen.getByLabelText("Description");
    const amount = screen.getByLabelText(/Amount/);
    for (const typed of ["Minibar", "Spa"]) {
      fireEvent.change(description, { target: { value: typed } });
      fireEvent.change(amount, { target: { value: "5" } });
      fireEvent.submit(description.closest("form")!);
      await vi.waitFor(() => expect(description).toHaveValue(""));
      expect(amount).toHaveValue("");
    }
    expect(postCharge).toHaveBeenCalledTimes(2);
  });
});
