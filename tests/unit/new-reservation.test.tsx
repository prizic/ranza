/**
 * The booking form's limits are the database's limits.
 *
 * `NewReservationDialog` restates `GUEST_DETAILS` rather than importing it,
 * because nothing outside `src/server/` may import a Ranza module and that rule
 * has a fixture proving it fires (ADR 0007). A restated constant is a constant
 * that drifts, so this is the thing that notices: the form's `maxLength` and
 * the check constraints' own bounds are asserted against each other.
 *
 * Only the lengths. Whether a name is acceptable is `guests_full_name_check`'s
 * answer and `identifyGuestWithin`'s, both of which have their own tests; what
 * a form can get wrong on its own is letting somebody type past a limit and
 * then telling them the booking was refused.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GUEST_DETAILS } from "../../packages/ranza/guests/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// The server action, which this component only calls. Reaching it would drag in
// the composition root and a database connection to assert something about a
// field.
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  createReservation: vi.fn(),
}));

const { NewReservationDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/new-reservation-dialog");

afterEach(cleanup);

beforeAll(() => {
  // jsdom has none of these; the Unit picker and the calendar reach for them.
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = () => {};
});

function openForm() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <NewReservationDialog
        locale="en"
        propertyId="d9000003-0000-4000-8000-000000000001"
        today="2026-09-25"
        units={[
          {
            unitId: "u1",
            unitName: "101",
            roomName: null,
            unitType: "room",
            nightlyRateMinor: 150000,
            rateCurrency: "TRY",
          },
          {
            unitId: "u2",
            unitName: "A",
            roomName: "102",
            unitType: "bed",
            nightlyRateMinor: null,
            rateCurrency: null,
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: messages.en.newReservation }),
  );
}

describe("the booking form", () => {
  it("stops at the lengths the Guest table will accept", () => {
    openForm();

    expect(screen.getByLabelText(messages.en.guest)).toHaveAttribute(
      "maxlength",
      String(GUEST_DETAILS.name.max),
    );
    expect(screen.getByLabelText(messages.en.guestEmail)).toHaveAttribute(
      "maxlength",
      String(GUEST_DETAILS.email.max),
    );
    expect(screen.getByLabelText(messages.en.guestPhone)).toHaveAttribute(
      "maxlength",
      String(GUEST_DETAILS.phone.max),
    );
  });

  /**
   * One field for both dates, submitting what the two date inputs it replaced
   * did: `startsOn` and `endsOn` as `YYYY-MM-DD`, which is what the module
   * parses and the database stores. The picking itself is
   * `date-range-field.test.tsx`'s.
   */
  it("asks for dates the module can read", () => {
    openForm();

    const form = screen
      .getByRole("button", { name: /^Arrival/ })
      .closest("form")!;
    const fields = new FormData(form);
    expect(fields.has("startsOn")).toBe(true);
    expect(fields.has("endsOn")).toBe(true);
  });
});

/** A day in the month it belongs to, not its echo in a neighbouring grid. */
function day(iso: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `td:not([data-outside]) [data-day="${iso}"]`,
  );
  if (!button) throw new Error(`${iso} is not on the calendar`);
  return button;
}

function chooseUnit(name: RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: messages.en.unit }));
  fireEvent.click(screen.getByRole("option", { name }));
}

describe("the quote (ADR 0038)", () => {
  it("the_booking_dialog_quotes_the_price_and_total", () => {
    openForm();
    expect(screen.queryByText(/a night/)).toBeNull();

    chooseUnit(/101/);
    expect(screen.getByText(/1,500\.00 a night$/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /^Arrival/ }));
    fireEvent.click(day("2026-10-01"));
    fireEvent.click(day("2026-10-04"));
    expect(
      screen.getByText(/1,500\.00 a night · 3 nights: .*4,500\.00 in total$/),
    ).toBeVisible();
  });

  it("an unpriced kind says its nights will not be charged, before it is taken", () => {
    openForm();
    chooseUnit(/102/);
    expect(
      screen.getByText(
        "No price is set for Bed here, so this booking is taken without one and its nights are not charged.",
      ),
    ).toBeVisible();
  });

  it("the quote is a quote: nothing about a price is submitted", () => {
    openForm();
    chooseUnit(/101/);
    const form = screen
      .getByRole("button", { name: /^Arrival/ })
      .closest("form")!;
    const sent = [...new FormData(form).keys()];
    expect(sent.some((key) => /price|rate|amount/i.test(key))).toBe(false);
  });
});
