/**
 * Today's Empty beds card, as the manager reads it (RB-S5-20).
 *
 * today-derive.test.ts proves the counts and when the card exists. This proves
 * the card's part: three figures in the reader's words, each a link to Rooms
 * narrowed to the places it counts, at the same Property.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";
import type { SupportedLocale } from "../../packages/i18n/src";

// The card's panel shares a file with the desk's check-in and check-out rows,
// whose server actions would drag in the composition root.
vi.mock("../../apps/operator-workspace/src/server/front-office", () => ({
  checkInReservation: vi.fn(),
  checkOutStay: vi.fn(),
}));

const { EmptyBedsCard } =
  await import("../../apps/operator-workspace/src/features/today/components/empty-beds-card");

afterEach(cleanup);

const PROPERTY = "dd000003-0000-4000-8000-000000000001";

function show(locale: SupportedLocale, byBed = true) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <EmptyBedsCard
        data={{ female: 3, male: 1, anyone: 0, byBed }}
        locale={locale}
        propertyId={PROPERTY}
      />
    </NextIntlClientProvider>,
  );
}

describe("the Empty beds card", () => {
  it("each_figure_opens_rooms_narrowed_to_the_free_places_it_counts", () => {
    show("en");
    const card = screen.getByRole("region", { name: "Empty beds tonight" });
    for (const [name, admits] of [
      ["3 free tonight in rooms for women only", "female"],
      ["1 free tonight in rooms for men only", "male"],
      ["0 free tonight in rooms for anyone", "anyone"],
    ] as const) {
      const link = within(card).getByRole("link", { name });
      expect(link).toHaveAttribute(
        "href",
        `/en/rooms?property=${PROPERTY}&show=free&admits=${admits}`,
      );
    }
  });

  it("says_rooms_where_nothing_is_let_by_the_bed_and_reads_in_arabic", () => {
    show("en", false);
    expect(
      screen.getByRole("region", { name: "Free rooms tonight" }),
    ).toBeVisible();
    cleanup();
    show("ar");
    expect(
      screen.getByRole("region", { name: "أسرّة فارغة الليلة" }),
    ).toBeVisible();
    expect(screen.getByText(messages.ar.roomAdmits.female)).toBeVisible();
  });
});
