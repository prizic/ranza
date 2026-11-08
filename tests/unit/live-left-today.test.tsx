/**
 * The table of Guests who have left today, and where each name leads (audit
 * 2026-11-07, A-09). The rows are prefetched into the query client; what is
 * asserted is what a viewer is offered for what they may open.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DepartedStay } from "../../packages/ranza/reservations/src";
import { messages } from "../../apps/operator-workspace/src/messages";
import { REACHES_EVERYTHING } from "../../apps/operator-workspace/src/features/front-office/reach";
import type { FrontDeskReach } from "../../apps/operator-workspace/src/features/front-office/reach";
import { frontOfficeKeys } from "../../apps/operator-workspace/src/features/front-office/query-keys";

vi.mock("../../apps/operator-workspace/node_modules/next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const { QueryProvider } =
  await import("../../apps/operator-workspace/src/app/providers/query-provider");
const { Hydrated, requestQueryClient } =
  await import("../../apps/operator-workspace/src/app/providers/hydrate");
const { LiveLeftToday } =
  await import("../../apps/operator-workspace/src/features/front-office/components/live-left-today");

afterEach(cleanup);

const SCOPE = { userId: "u1", organizationId: "o1", propertyId: "p1" };
const base: DepartedStay = {
  stayId: "s1",
  reservationId: "r1",
  reference: "RZ-1",
  guestName: "Ayşe Demir",
  stayType: "guest",
  startsOn: "2026-11-05",
  endsOn: "2026-11-08",
  unitName: "204",
  roomName: null,
  unitType: "room",
  departedAt: "2026-11-08T09:30:00Z",
  unitIsReady: false,
};

function show(rows: DepartedStay[], reach: FrontDeskReach) {
  const prefetched = requestQueryClient();
  prefetched.setQueryData(frontOfficeKeys.departedToday(SCOPE), rows);
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <QueryProvider scope={SCOPE.userId}>
        <Hydrated client={prefetched}>
          <LiveLeftToday
            locale="en"
            reach={reach}
            scope={SCOPE}
            timeZone="Europe/Istanbul"
          />
        </Hydrated>
      </QueryProvider>
    </NextIntlClientProvider>,
  );
}

describe("who has left today, and the way to each of them", () => {
  it("A-09: the name opens the booking and the cleaning badge opens Housekeeping", () => {
    show([base], REACHES_EVERYTHING);
    expect(screen.getByRole("link", { name: "Ayşe Demir" })).toHaveAttribute(
      "href",
      "/en/reservations?property=p1&open=r1",
    );
    expect(
      screen.getByRole("link", { name: messages.en.roomNeedsCleaning }),
    ).toHaveAttribute("href", "/en/housekeeping?property=p1");
  });

  it("A-09: a viewer who cannot open either page is offered neither", () => {
    show([base], {
      ...REACHES_EVERYTHING,
      reservations: false,
      housekeeping: false,
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(messages.en.roomNeedsCleaning)).toBeVisible();
  });

  it("A-09: a walk-in with no booking has no name link", () => {
    show([{ ...base, reservationId: null }], REACHES_EVERYTHING);
    expect(screen.queryByRole("link", { name: "Ayşe Demir" })).toBeNull();
  });
});
