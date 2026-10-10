/**
 * What the check-out dialog says about a balance nobody can settle yet
 * (RT-S3-16, ADR 0030).
 *
 * Nothing can take a payment (check-out PRE-01), so every priced check-out
 * leaves its balance on the Folio. The dialog has to say so before the desk
 * presses the button, and has to ask why the balance stays open: the reason is
 * what the module records, and a check-out that could be sent without one
 * would leave money open with no explanation on file.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Departure } from "../../packages/ranza/reservations/src";
import { formatMoney } from "../../packages/i18n/src";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  checkOutStay: vi.fn(),
}));

const { CheckOutDialog } =
  await import("../../apps/operator-workspace/src/features/front-office/components/check-out-dialog");

const PRICED: Departure = {
  stayId: "d9000005-0000-4000-8000-000000000001",
  reservationId: "d9000006-0000-4000-8000-000000000001",
  reference: "RZ-BAL",
  guestName: "Ada Lovelace",
  stayType: "guest",
  startsOn: "2030-01-10",
  endsOn: "2030-01-12",
  unitId: "u1",
  unitName: "101",
  roomName: null,
  unitType: "room",
  unitStatus: "occupied",
  overdue: false,
  early: false,
  folioId: "d9000007-0000-4000-8000-000000000001",
  folioVersion: 2,
  balanceMinor: 25_000,
  currency: "TRY",
  pendingNights: 0,
  pendingMinor: 0,
  nightlyRateMinor: 12_500,
  mayCheckOut: true,
  mayAmend: false,
};

function open(departure: Departure) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <CheckOutDialog departure={departure} locale="en" propertyId="p1" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^Check .*Ada Lovelace.* out$/ }),
  );
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

afterEach(cleanup);

describe("checking out a Guest who owes", () => {
  it("RT-S3-16: says the Folio stays open and asks why the balance stays open", () => {
    open(PRICED);

    const hint = messages.en.checkOutBalanceHint.replace(
      "{balance}",
      formatMoney(25_000, "TRY", "en"),
    );
    expect(screen.getByText(collapse(hint))).toBeVisible();
    expect(hint).toMatch(/The Folio stays open with/);
    expect(hint).not.toMatch(/cannot be taken/);

    const reason = screen.getByLabelText(messages.en.checkOutBalanceReason);
    expect(reason).toBeRequired();
    // BALANCE_REASON.min, restated: importing the value pulls Prisma in.
    expect(reason).toHaveAttribute("minlength", "3");

    // Submit is blocked by the form itself until a reason is given.
    const form = reason.closest("form") as HTMLFormElement;
    expect(form.checkValidity()).toBe(false);
    fireEvent.change(reason, {
      target: { value: "Guest will settle by transfer" },
    });
    expect(form.checkValidity()).toBe(true);
    fireEvent.change(reason, { target: { value: "" } });
    expect(form.checkValidity()).toBe(false);
  });

  it("RT-S3-16: a Guest who owes nothing is not asked for a reason", () => {
    open({ ...PRICED, balanceMinor: 0 });

    expect(
      screen.queryByLabelText(messages.en.checkOutBalanceReason),
    ).toBeNull();
    expect(screen.queryByText(/The Folio stays open with/)).toBeNull();
  });
});
