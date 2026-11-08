/**
 * Who taking a room out of order affects, and the way to each of them (audit
 * 2026-11-07, B-12). The notice sits inside a form that is not finished, so
 * every link opens in a new tab, and none is offered to a viewer who cannot
 * open Reservations.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import type { OutOfOrderImpact } from "../../packages/ranza/maintenance/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { ImpactNotice } from "../../apps/operator-workspace/src/features/maintenance/components/impact-notice";

afterEach(cleanup);

const RESERVATIONS = "/en/reservations?property=p1";
const IMPACT: OutOfOrderImpact = {
  inHouse: [
    {
      reservationId: "r-stay",
      unitName: "204",
      guestName: "Ayşe Demir",
      endsOn: "2026-11-12",
    },
    {
      reservationId: null,
      unitName: "205",
      guestName: "Walk In",
      endsOn: null,
    },
  ],
  reservations: [
    {
      reservationId: "r-next",
      mayAmend: true,
      unitName: "204",
      guestName: "Ada Lovelace",
      startsOn: "2026-11-14",
      endsOn: "2026-11-16",
    },
  ],
};

function show(reservationsHref: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ImpactNotice
        impact={IMPACT}
        locale="en"
        reservationsHref={reservationsHref}
      />
    </NextIntlClientProvider>,
  );
}

describe("the way to each person a room going out of order affects", () => {
  it("B-12: a Guest in house opens their booking, in a new tab", () => {
    show(RESERVATIONS);
    const link = screen.getByRole("link", { name: "Open booking" });
    expect(link).toHaveAttribute("href", `${RESERVATIONS}&open=r-stay`);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("B-12: a walk-in with no booking has nothing to open", () => {
    show(RESERVATIONS);
    expect(screen.getAllByRole("link", { name: "Open booking" })).toHaveLength(
      1,
    );
  });

  it("B-12: an upcoming booking still opens in Change booking", () => {
    show(RESERVATIONS);
    expect(
      screen.getByRole("link", { name: "Change booking" }),
    ).toHaveAttribute("href", `${RESERVATIONS}&change=r-next`);
  });

  it("B-12: a viewer who cannot open Reservations is offered no link at all", () => {
    show(null);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/Ayşe Demir/)).toBeVisible();
  });
});
