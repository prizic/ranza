/**
 * A Resident's instalments on the booking's sheet (PP-S3-01, PP-S3-02, PP-S3-06).
 *
 * The database decides who may see or make a plan and where each instalment
 * stands; the module's integration suite proves it. This proves the screen's
 * part: what each standing of a booking draws (many instalments, one, none, none
 * and nothing to offer), that adding a plan later opens prefilled from the
 * booking and sends what was shown, that every refusal is said in words, and
 * that a read which fails is said and reported rather than drawn as an empty
 * booking.
 */
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
import {
  supportedLocales,
  type SupportedLocale,
} from "../../packages/i18n/src";
import type {
  InstalmentStanding,
  PaymentPlan,
} from "../../packages/ranza/payment-plans/src";

const addPaymentPlan = vi.fn();
vi.mock(
  "../../apps/operator-workspace/src/server/payment-plan-actions",
  () => ({
    addPaymentPlan: (...args: unknown[]) => addPaymentPlan(...args),
  }),
);

const { PaymentPlanSection } =
  await import("../../apps/operator-workspace/src/features/front-office/components/payment-plan-section");

const RESERVATION = "f1000000-0000-4000-8000-000000000001";
const PROPERTY = "f1000000-0000-4000-8000-000000000002";
const UNIT = "f1000000-0000-4000-8000-000000000003";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  addPaymentPlan.mockReset();
});

function instalment(
  number: number,
  overrides: Partial<InstalmentStanding> = {},
): InstalmentStanding {
  return {
    instalmentId: `f1000001-0000-4000-8000-00000000000${number}`,
    number,
    dueOn: new Date(Date.UTC(2026, 9 + number, 5)).toISOString().slice(0, 10),
    amountMinor: 4_275_000,
    currency: "TRY",
    posted: false,
    paidMinor: 0,
    outstandingMinor: 4_275_000,
    state: "upcoming",
    ...overrides,
  };
}

function plan(instalments: InstalmentStanding[]): PaymentPlan {
  const total = instalments.reduce((sum, i) => sum + i.amountMinor, 0);
  const paid = instalments.reduce((sum, i) => sum + i.paidMinor, 0);
  return {
    planId: "f1000002-0000-4000-8000-000000000001",
    reservationId: RESERVATION,
    propertyId: PROPERTY,
    currency: "TRY",
    revision: 1,
    instalments,
    totalMinor: total,
    paidMinor: paid,
    outstandingMinor: total - paid,
  };
}

interface View {
  plan: PaymentPlan | null;
  offer: { currency: string } | null;
  nightlyRateMinor: number | null;
}

const OFFER = { currency: "TRY" };
const NO_PLAN: View = { plan: null, offer: OFFER, nightlyRateMinor: 150_000 };

function reads(...bodies: (View | null | "fails")[]) {
  const fetch = vi.fn((_url: string) => Promise.resolve({} as Response));
  for (const body of bodies) {
    fetch.mockImplementationOnce(() =>
      Promise.resolve(
        body === "fails"
          ? ({ ok: false, status: 500, json: async () => ({}) } as Response)
          : ({
              ok: true,
              status: 200,
              json: async () => ({ view: body }),
            } as Response),
      ),
    );
  }
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function show(
  options: {
    locale?: SupportedLocale;
    status?: string;
    startsOn?: string;
    endsOn?: string | null;
    today?: string | null;
  } = {},
) {
  const locale = options.locale ?? "en";
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <PaymentPlanSection
        endsOn={options.endsOn === undefined ? "2026-12-01" : options.endsOn}
        locale={locale}
        propertyId={PROPERTY}
        reservationId={RESERVATION}
        startsOn={options.startsOn ?? "2026-09-01"}
        status={options.status ?? "checked_in"}
        today={options.today === undefined ? "2026-10-05" : options.today}
        unitId={UNIT}
      />
    </NextIntlClientProvider>,
  );
}

describe("a booking's schedule (PP-S3-01, PP-S3-06)", () => {
  it("reads many: what is paid and still to pay as the large figures, then each instalment with where it stands", async () => {
    const fetch = reads({
      plan: plan([
        instalment(1, {
          state: "paid",
          posted: true,
          paidMinor: 4_275_000,
          outstandingMinor: 0,
        }),
        instalment(2, { state: "overdue", posted: true }),
        instalment(3, { state: "upcoming" }),
      ]),
      offer: OFFER,
      nightlyRateMinor: 150_000,
    });
    show();

    const section = (await screen.findByText("Payment plan")).closest(
      "section",
    )!;
    expect(within(section).getByText("3 instalments")).toBeTruthy();
    expect(within(section).getByText("Still to pay")).toBeTruthy();
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Paid")).toBeTruthy();
    expect(within(rows[1]!).getByText("Overdue")).toBeTruthy();
    expect(within(rows[2]!).getByText("Upcoming")).toBeTruthy();
    // Whether it has been charged is said beneath its date, for the ones that have.
    expect(within(rows[0]!).getByText("On the Folio")).toBeTruthy();
    expect(within(rows[2]!).queryByText("On the Folio")).toBeNull();

    const url = new URL(fetch.mock.calls[0]![0], "http://localhost");
    expect(url.pathname).toBe("/api/front-office/payment-plan");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      reservation: RESERVATION,
      property: PROPERTY,
      unit: UNIT,
    });
  });

  it("reads one, in the singular", async () => {
    reads({
      plan: plan([instalment(1)]),
      offer: OFFER,
      nightlyRateMinor: null,
    });
    show();
    expect(await screen.findByText("1 instalment")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("says Due today for the one that falls due today, in the reader's words", async () => {
    reads({
      plan: plan([instalment(1, { state: "due" })]),
      offer: OFFER,
      nightlyRateMinor: null,
    });
    show();
    expect(await screen.findByText("Due today")).toBeTruthy();
  });

  for (const locale of supportedLocales) {
    it(`names every standing in every locale: ${locale}`, async () => {
      reads({
        plan: plan([
          instalment(1, { state: "waived" }),
          instalment(2, { state: "paid" }),
          instalment(3, { state: "overdue" }),
          instalment(4, { state: "due" }),
          instalment(5, { state: "upcoming" }),
        ]),
        offer: OFFER,
        nightlyRateMinor: null,
      });
      show({ locale });
      const { state } = messages[locale].paymentPlan;
      for (const label of Object.values(state)) {
        expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
      }
    });
  }

  it("draws nothing for a viewer who sees no plan and is offered none, and for one who cannot be told apart from it", async () => {
    reads({ plan: null, offer: null, nightlyRateMinor: null });
    show();
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(screen.queryByText("Payment plan")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("draws nothing when the read answers none at all", async () => {
    reads(null);
    show();
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Payment plan")).toBeNull();
  });

  it("says the read failed, and reports it, rather than drawing an empty booking", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    reads("fails");
    show();
    expect(
      await screen.findByText(messages.en.paymentPlan.readFailed),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add a payment plan" }),
    ).toBeNull();
    expect(report).toHaveBeenCalledWith(
      "payment_plan.read_failed",
      expect.objectContaining({ reservationId: RESERVATION }),
    );
  });
});

describe("a booking with no plan (PP-S3-02)", () => {
  it("offers to add one where the desk is looking", async () => {
    reads(NO_PLAN);
    show();
    expect(await screen.findByText(/^No payment plan\./)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add a payment plan" }),
    ).toBeTruthy();
  });

  it("offers a booking waiting to start the same, from its own first night", async () => {
    reads(NO_PLAN);
    show({ status: "confirmed", startsOn: "2026-11-01", today: "2026-10-05" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a payment plan" }),
    );
    const first = await screen.findByLabelText("Instalment 1 · Due on");
    expect((first as HTMLInputElement).value).toBe("2026-11-01");
  });

  it("asks for a departure date instead of offering a plan to an open-ended booking", async () => {
    reads(NO_PLAN);
    show({ endsOn: null });
    expect(
      await screen.findByText(messages.en.paymentPlan.addNeedsDeparture),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add a payment plan" }),
    ).toBeNull();
  });

  it("offers nothing once the term has nothing left to schedule", async () => {
    reads(NO_PLAN);
    show({ today: "2026-12-01" });
    expect(await screen.findByText(/^No payment plan\./)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add a payment plan" }),
    ).toBeNull();
  });

  for (const status of ["cancelled", "no_show", "checked_out"]) {
    it(`offers nothing to a booking that has ended: ${status}`, async () => {
      reads(NO_PLAN);
      show({ status });
      await waitFor(() =>
        expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0),
      );
      expect(screen.queryByText("Payment plan")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    });
  }
});

describe("adding a plan from the booking (PP-S3-02)", () => {
  async function openDialog() {
    reads(NO_PLAN, {
      plan: plan([instalment(1), instalment(2)]),
      offer: OFFER,
      nightlyRateMinor: 150_000,
    });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a payment plan" }),
    );
    return screen.findByRole("dialog");
  }

  it("opens prefilled from the price list for what is left of the term, with no way to choose none", async () => {
    const dialog = await openDialog();
    // 5 October to 1 December is 57 nights at 1,500.00.
    expect(
      (within(dialog).getByLabelText("Total fees") as HTMLInputElement).value,
    ).toBe("85500");
    expect(
      (
        within(dialog).getByLabelText(
          "Instalment 1 · Due on",
        ) as HTMLInputElement
      ).value,
    ).toBe("2026-10-05");
    expect(
      (
        within(dialog).getByLabelText(
          "Instalment 2 · Due on",
        ) as HTMLInputElement
      ).value,
    ).toBe("2026-11-05");
    expect(
      within(dialog).queryByRole("button", { name: "No payment plan" }),
    ).toBeNull();
    expect(
      within(dialog).getByText(/Paid in 2 instalments, .*85,500\.00/),
    ).toBeTruthy();
  });

  it("sends what the dialog showed and shows the schedule it made", async () => {
    addPaymentPlan.mockResolvedValue("done");
    const dialog = await openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save the plan" }),
    );

    await waitFor(() => expect(addPaymentPlan).toHaveBeenCalledTimes(1));
    expect(addPaymentPlan).toHaveBeenCalledWith(
      "en",
      RESERVATION,
      [4_275_000, 4_275_000],
      ["2026-10-05", "2026-11-05"],
    );
    expect(await screen.findByText("2 instalments")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the dialog open and says what to change when the plan is refused", async () => {
    addPaymentPlan.mockResolvedValue("afterTerm");
    const dialog = await openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save the plan" }),
    );
    expect(
      await within(dialog).findByText(messages.en.paymentPlan.afterTerm),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says a booking that already has a plan has one, and does not make another", async () => {
    addPaymentPlan.mockResolvedValue("exists");
    const dialog = await openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save the plan" }),
    );
    expect(
      await within(dialog).findByText(messages.en.paymentPlan.alreadyPlanned),
    ).toBeTruthy();
  });

  it("will not save an amount that is not one", async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Instalment 1 · Amount"), {
      target: { value: "abc" },
    });
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Save the plan",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      within(dialog).getByText(messages.en.paymentPlan.invalidAmount),
    ).toBeTruthy();
    expect(addPaymentPlan).not.toHaveBeenCalled();
  });
});
