/**
 * The Residents Today's overdue figure counts (audit 2026-11-07, C-05): a name
 * opens its booking where the viewer may open it, and is plain text where not.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const { OverdueResidents } =
  await import("../../apps/operator-workspace/src/features/finance/components/overdue-residents");

const RESIDENTS = [
  {
    reservationId: "r1",
    residentName: "Elif Yılmaz",
    instalments: 2,
    overdueMinor: 500000,
    oldestDueOn: "2026-10-01",
  },
  {
    reservationId: "r2",
    residentName: "Zeynep Kaya",
    instalments: 1,
    overdueMinor: 250000,
    oldestDueOn: "2026-10-15",
  },
];

function show(bookingHrefs: Record<string, string>) {
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <OverdueResidents
        allHref="/en/finance?property=p1"
        bookingHrefs={bookingHrefs}
        currency="TRY"
        locale="en"
        residents={RESIDENTS as never}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("who to chase opens their booking", () => {
  it("C-05: a Resident whose booking the viewer may open is a link to it", () => {
    show({ r1: "/en/reservations?property=p1&open=r1" });
    expect(
      screen.getByRole("link", { name: "Elif Yılmaz" }).getAttribute("href"),
    ).toBe("/en/reservations?property=p1&open=r1");
    // The other is on no list the viewer reaches: text, not a link to nothing.
    expect(screen.getByText("Zeynep Kaya")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Zeynep Kaya" })).toBeNull();
  });

  it("C-05: with no Reservations at all, nobody is a link", () => {
    show({});
    expect(screen.queryByRole("link", { name: "Elif Yılmaz" })).toBeNull();
    expect(screen.getByText("Elif Yılmaz")).toBeTruthy();
  });
});
