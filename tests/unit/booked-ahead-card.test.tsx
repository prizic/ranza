/**
 * The booked-ahead card on Today (TD-S3-04), across a refresh.
 *
 * The card refetches every minute. A Property can go from no units in use to
 * some between two renders, and the card must keep the same hooks through it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import { BookedAheadCard } from "../../apps/operator-workspace/src/features/today/components/booked-ahead-card";
import type {
  BookedAheadCard as BookedAhead,
  Section,
} from "../../apps/operator-workspace/src/server/today-derive";

afterEach(cleanup);

const ahead = (inUse: number): Section<BookedAhead> => ({
  status: "ok",
  stale: false,
  data: {
    nights: [
      { day: "2030-01-10", booked: Math.min(inUse, 1), inUse },
      { day: "2030-01-11", booked: 0, inUse },
    ],
  },
});

const card = (booked: Section<BookedAhead>) => (
  <NextIntlClientProvider locale="en" messages={messages.en}>
    <BookedAheadCard
      booked={booked}
      locale="en"
      onRetry={vi.fn()}
      propertyId="p1"
    />
  </NextIntlClientProvider>
);

describe("the booked-ahead card", () => {
  it("survives a Property going from no units in use to some, and back", () => {
    const { rerender } = render(card(ahead(0)));
    expect(screen.getByText(messages.en.dashboard.noUnits)).toBeVisible();

    rerender(card(ahead(4)));
    expect(screen.queryByText(messages.en.dashboard.noUnits)).toBeNull();

    rerender(card(ahead(0)));
    expect(screen.getByText(messages.en.dashboard.noUnits)).toBeVisible();
  });
});
