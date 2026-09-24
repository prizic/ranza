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
import { afterEach, describe, expect, it, vi } from "vitest";
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

function openForm() {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <NewReservationDialog
        locale="en"
        propertyId="d9000003-0000-4000-8000-000000000001"
        units={[
          { unitId: "u1", unitName: "101", roomName: null, unitType: "room" },
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
   * Native date inputs, which is the whole reason there is no picker component
   * here: the browser already knows the reader's calendar and submits
   * `YYYY-MM-DD`, which is what the module parses and the database stores.
   */
  it("asks for dates the module can read", () => {
    openForm();

    expect(screen.getByLabelText(messages.en.arrival)).toHaveAttribute(
      "type",
      "date",
    );
    expect(screen.getByLabelText(messages.en.departure)).toHaveAttribute(
      "type",
      "date",
    );
  });
});
