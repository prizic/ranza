/**
 * Today's Empty beds card, as the manager reads it (RB-S5-20).
 *
 * today-derive.test.ts proves the counts and when the card exists. This proves
 * the card's part: three figures in the reader's words, each a link to Rooms
 * narrowed to the places it counts, at the same Property.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
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

type EmptyBeds = ComponentProps<typeof EmptyBedsCard>["data"];

const PROPERTY = "dd000003-0000-4000-8000-000000000001";

function show(
  locale: SupportedLocale,
  byBed = true,
  blocks: EmptyBeds["blocks"] = [],
) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <EmptyBedsCard
        data={{ female: 3, male: 1, anyone: 0, byBed, blocks }}
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

  describe("building by building (RANZ-108)", () => {
    const blocks = [
      { block: "Blok A", female: 3, male: 0, anyone: 0 },
      { block: "Blok B", female: 0, male: 1, anyone: 0 },
    ];

    it("each_block_figure_opens_rooms_narrowed_to_that_block_and_gender", () => {
      show("en", true, blocks);
      const card = screen.getByRole("region", { name: "Empty beds tonight" });
      const link = within(card).getByRole("link", {
        name: "3 free tonight in Blok A, in rooms for women only",
      });
      expect(link).toHaveAttribute(
        "href",
        `/en/rooms?property=${PROPERTY}&show=free&admits=female&block=Blok+A`,
      );
      expect(
        within(card).getByRole("rowheader", { name: "All blocks" }),
      ).toBeVisible();
      expect(
        within(card).getByRole("link", {
          name: "3 free tonight in rooms for women only",
        }),
      ).toHaveAttribute(
        "href",
        `/en/rooms?property=${PROPERTY}&show=free&admits=female`,
      );
    });

    it("opens_rooms_in_no_building_as_none_and_names_them_other_rooms", () => {
      show("en", true, [
        ...blocks,
        { block: null, female: 0, male: 0, anyone: 2 },
      ]);
      const card = screen.getByRole("region", { name: "Empty beds tonight" });
      expect(
        within(card).getByRole("link", {
          name: "2 free tonight in Other rooms, in rooms for anyone",
        }),
      ).toHaveAttribute(
        "href",
        `/en/rooms?property=${PROPERTY}&show=free&admits=anyone&block=none`,
      );
    });

    it("reads_in_arabic_and_turkish_with_the_block_named", () => {
      show("ar", true, blocks);
      expect(
        screen.getByRole("link", {
          name: "شاغر الليلة في Blok A، في غرف النساء فقط: 3",
        }),
      ).toBeVisible();
      cleanup();
      show("tr", true, blocks);
      expect(
        screen.getByRole("link", {
          name: "Blok A içinde yalnızca kadınlara ayrılan odalarda bu gece 3 boş yer",
        }),
      ).toBeVisible();
    });
  });
});
