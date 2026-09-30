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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DirectionProvider } from "../../packages/ui/src";
import { directionFor } from "../../packages/i18n/src";
import { GUEST_DETAILS } from "../../packages/ranza/guests/src";
import { messages } from "../../apps/operator-workspace/src/messages";

// The server action, which this component only calls. Reaching it would drag in
// the composition root and a database connection to assert something about a
// field.
const createReservation = vi.fn();
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  createReservation: (...args: unknown[]) => createReservation(...args),
}));

const { NewReservationDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/new-reservation-dialog");

afterEach(cleanup);

// The dialog asks which Units are taken each time the dates change. Nothing
// is taken unless a test says so; without this every date pick would reach
// for Node's fetch with a relative URL.
const availability = vi.fn();
beforeEach(() => {
  availability.mockReset();
  availability.mockResolvedValue({ kind: "ready", unavailable: [] });
  vi.stubGlobal("fetch", (url: string) =>
    availability(url).then((body: unknown) => ({
      ok: true,
      json: async () => body,
    })),
  );
});

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
  // Radix Select asks for these when an option is picked with a pointer.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const UNITS = [
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
] as const;

function openForm() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <NewReservationDialog
        locale="en"
        propertyId="d9000003-0000-4000-8000-000000000001"
        today="2026-09-25"
        units={UNITS}
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

  it("the_booking_calendar_does_not_offer_days_before_today", () => {
    openForm();
    fireEvent.click(screen.getByRole("button", { name: /^Arrival/ }));

    expect(day("2026-09-24")).toBeDisabled();
    expect(day("2026-09-25")).toBeEnabled();

    // A click on a past day does nothing: the arrival stays empty.
    fireEvent.click(day("2026-09-24"));
    const form = screen
      .getByRole("button", { name: /^Arrival/ })
      .closest("form")!;
    expect(new FormData(form).get("startsOn")).toBe("");
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

  it("the quote travels back so a changed price refuses the booking (RT-S2-12)", () => {
    openForm();
    const form = () =>
      new FormData(
        screen.getByRole("button", { name: /^Arrival/ }).closest("form")!,
      );
    chooseUnit(/101/);
    expect(form().get("quotedRateMinor")).toBe("150000");
    expect(form().get("quotedCurrency")).toBe("TRY");
    // An unpriced kind is quoted as no price at all.
    chooseUnit(/102/);
    expect(form().get("quotedRateMinor")).toBe("");
    expect(form().get("quotedCurrency")).toBe("");
  });
});

const takeBooking = () =>
  screen.getByRole("button", { name: messages.en.takeBooking });

function chooseStayType(name: string) {
  fireEvent.click(
    screen.getByRole("combobox", { name: messages.en.stayTypeLabel }),
  );
  fireEvent.click(screen.getByRole("option", { name }));
}

function chooseDates(from: string, to?: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Arrival/ }));
  fireEvent.click(day(from));
  if (to) fireEvent.click(day(to));
}

describe("a departure (RG-S1-11, RG-S3-11)", () => {
  it("a_guest_booking_is_not_taken_without_a_departure", () => {
    openForm();
    expect(screen.getByText(messages.en.departureRequiredHint)).toBeVisible();
    chooseUnit(/101/);
    fireEvent.change(screen.getByLabelText(messages.en.guest), {
      target: { value: "Nezihe Muhiddin" },
    });
    chooseDates("2026-10-01");

    // Asked for the way every other missing field is asked for: the submit
    // is stopped and the calendar opens at the departure, with the Guest's
    // prompt rather than an offer to leave it open.
    takeBooking().closest("form")!.requestSubmit();
    expect(createReservation).not.toHaveBeenCalled();
    expect(
      screen.getByText(messages.en.bookingPickDepartureRequired),
    ).toBeVisible();
    expect(screen.queryByText(messages.en.bookingPickDeparture)).toBeNull();
  });

  it("a_residents_booking_may_be_left_open_ended", async () => {
    createReservation.mockResolvedValue("done");
    openForm();
    chooseUnit(/101/);
    chooseStayType(messages.en.stayType.resident);
    expect(screen.getByText(messages.en.departureHint)).toBeVisible();
    expect(screen.queryByText(messages.en.departureRequiredHint)).toBeNull();
    fireEvent.change(screen.getByLabelText(messages.en.guest), {
      target: { value: "Nezihe Muhiddin" },
    });
    chooseDates("2026-10-01");
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    takeBooking().closest("form")!.requestSubmit();
    await vi.waitFor(() => expect(createReservation).toHaveBeenCalled());
  });

  /**
   * A refusal keeps the dialog open, and the desk's choice of stay type has to
   * survive it: React resets a form after its `action`, and Radix's Select
   * answers a reset by going back to Guest — which would then demand a
   * departure the Resident never needed.
   */
  it("a_refusal_keeps_the_stay_type_the_desk_chose", async () => {
    createReservation.mockResolvedValue("refused");
    openForm();
    chooseUnit(/101/);
    chooseStayType(messages.en.stayType.resident);
    chooseDates("2026-10-01");
    fireEvent.change(screen.getByLabelText(messages.en.guest), {
      target: { value: "Nezihe Muhiddin" },
    });
    fireEvent.submit(takeBooking().closest("form")!);

    expect(await screen.findByText(messages.en.bookingRefused)).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: messages.en.stayTypeLabel }),
    ).toHaveTextContent(messages.en.stayType.resident);
    await waitFor(() => expect(takeBooking()).toBeEnabled());
  });
});

describe("the booking form in Arabic (RG-S3-12)", () => {
  it("the_booking_form_reads_in_arabic_and_mirrors", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={messages.ar}>
        <DirectionProvider dir={directionFor("ar")}>
          <NewReservationDialog
            locale="ar"
            propertyId="d9000003-0000-4000-8000-000000000001"
            today="2026-09-25"
            units={UNITS}
          />
        </DirectionProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: messages.ar.newReservation }),
    );

    expect(
      screen.getByRole("heading", { name: messages.ar.newReservation }),
    ).toBeVisible();
    for (const label of [
      messages.ar.guest,
      messages.ar.guestEmail,
      messages.ar.guestPhone,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: messages.ar.takeBooking }),
    ).toBeTruthy();
    expect(screen.getByText(messages.ar.departureRequiredHint)).toBeVisible();
    // Nothing fell back to English.
    expect(document.body.textContent).not.toContain(messages.en.takeBooking);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^${messages.ar.arrival}`),
      }),
    );
    // The calendar and the stay-type picker each mirror: one by its own
    // locale, the other through the direction the layout provides.
    expect(
      document.querySelector('[data-slot="calendar"]')?.getAttribute("dir"),
    ).toBe("rtl");
    expect(
      screen
        .getByRole("combobox", { name: messages.ar.stayTypeLabel })
        .getAttribute("dir"),
    ).toBe("rtl");
  });
});

describe("which Units are taken for the nights chosen (RG-S4-06, RG-S4-07)", () => {
  function chooseNights() {
    fireEvent.click(screen.getByRole("button", { name: /^Arrival/ }));
    fireEvent.click(day("2026-10-05"));
    fireEvent.click(day("2026-10-07"));
  }

  it("a_unit_booked_for_the_chosen_nights_is_marked_in_the_picker", async () => {
    availability.mockResolvedValue({
      kind: "ready",
      unavailable: [{ unitId: "u1", blocker: "booked" }],
    });
    openForm();
    chooseNights();

    await waitFor(() =>
      expect(availability).toHaveBeenCalledWith(
        expect.stringContaining("from=2026-10-05"),
      ),
    );
    expect(availability).toHaveBeenCalledWith(
      expect.stringContaining("to=2026-10-07"),
    );

    fireEvent.click(screen.getByRole("combobox", { name: messages.en.unit }));
    const taken = await screen.findByRole("option", { name: /101/ });
    await waitFor(() => expect(taken).toHaveAttribute("aria-disabled", "true"));
    expect(taken).toHaveTextContent(messages.en.unitBookedThoseNights);
    // Marked, never hidden: the other Unit is still there and choosable.
    expect(screen.getByRole("option", { name: /102/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("a_unit_booked_for_the_chosen_nights_is_marked_in_the_picker: a Unit already chosen says so when the nights make it taken", async () => {
    availability.mockResolvedValue({
      kind: "ready",
      unavailable: [{ unitId: "u1", blocker: "occupied" }],
    });
    openForm();
    chooseUnit(/101/);
    chooseNights();

    expect(
      await screen.findByText(messages.en.chosenUnitTakenThoseNights),
    ).toBeVisible();
  });

  it("a_unit_booked_for_the_chosen_nights_is_marked_in_the_picker: marks for earlier dates are cleared while the next read is out", async () => {
    availability.mockResolvedValueOnce({
      kind: "ready",
      unavailable: [{ unitId: "u1", blocker: "booked" }],
    });
    // The second read never answers: nothing may stay greyed in the meantime.
    availability.mockReturnValueOnce(new Promise(() => {}));
    openForm();
    chooseNights();
    fireEvent.click(screen.getByRole("combobox", { name: messages.en.unit }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /101/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    // New dates, new read (which hangs): 101 is no longer marked.
    fireEvent.click(screen.getByRole("button", { name: /^Departure/ }));
    fireEvent.click(day("2026-10-09"));
    await waitFor(() => expect(availability).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("combobox", { name: messages.en.unit }));
    expect(screen.getByRole("option", { name: /101/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("a_unit_booked_for_the_chosen_nights_is_marked_in_the_picker: a refused save reads the marks again, so a Unit taken in between is shown as taken", async () => {
    // Free when the dates were chosen; a colleague books it before the press.
    availability.mockResolvedValueOnce({ kind: "ready", unavailable: [] });
    availability.mockResolvedValueOnce({
      kind: "ready",
      unavailable: [{ unitId: "u1", blocker: "booked" }],
    });
    createReservation.mockResolvedValue("unavailable");
    openForm();
    chooseUnit(/101/);
    chooseNights();
    await waitFor(() => expect(availability).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(messages.en.guest), {
      target: { value: "Nezihe Muhiddin" },
    });
    fireEvent.submit(takeBooking().closest("form")!);

    expect(
      await screen.findByText(messages.en.bookingUnavailable),
    ).toBeVisible();
    await waitFor(() => expect(availability).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(messages.en.chosenUnitTakenThoseNights),
    ).toBeVisible();
  });

  it("a_failed_availability_read_leaves_every_unit_choosable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    openForm();
    chooseNights();

    expect(
      await screen.findByText(messages.en.bookingAvailabilityUnknown),
    ).toBeVisible();
    // Reported, not swallowed.
    expect(logged).toHaveBeenCalledWith(
      "booking_availability.read_failed",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("combobox", { name: messages.en.unit }));
    for (const name of [/101/, /102/]) {
      expect(screen.getByRole("option", { name })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    logged.mockRestore();
  });

  it("asks nothing for a Guest until there is a departure, and asks for a Resident once there is an arrival", async () => {
    openForm();
    fireEvent.click(screen.getByRole("button", { name: /^Arrival/ }));
    fireEvent.click(day("2026-10-05"));
    expect(availability).not.toHaveBeenCalled();

    // A Resident's booking may be open-ended, so an arrival is enough.
    fireEvent.click(
      screen.getByRole("combobox", { name: messages.en.stayTypeLabel }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: messages.en.stayType.resident }),
    );
    await waitFor(() =>
      expect(availability).toHaveBeenCalledWith(
        expect.stringContaining("from=2026-10-05"),
      ),
    );
    expect(availability).toHaveBeenCalledWith(
      expect.not.stringContaining("to="),
    );
  });
});
