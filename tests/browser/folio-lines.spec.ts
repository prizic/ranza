import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import { anArrivalToday, signIn, testProperty } from "./front-desk";

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-23");

/**
 * How a Folio's lines read: when they were posted, and what they came to.
 *
 * Two things the unit tests cannot see because they need a real layout engine.
 * A line is dated by the clock at the Property's own front desk, not the
 * reader's machine — a charge at 22:30 UTC is the next day in Istanbul. And an
 * amount in Arabic is one left-to-right unit: ICU marks a positive one
 * right-to-left and the sign of a negative one left-to-right, so two amounts in
 * one column used to read "TRY 740.00" and "-100.00 TRY".
 */

const LATE = "2026-09-26T22:30:00.000Z";

async function aFolioWithLines(page: Page): Promise<string> {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);
  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();

  const folioId = psql(
    `select folio.id from public.folios as folio
       join public.stays as stay on stay.id = folio.stay_id
       join public.reservations as reservation on reservation.id = stay.reservation_id
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${guestName}'`,
  );
  psql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, posted_at)
     select organization_id, property_id, id, 'charge', 'Late minibar', 74000,
            '${LATE}'
       from public.folios where id = '${folioId}'`,
  );
  psql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, payment_method)
     select organization_id, property_id, id, 'payment', 'Cash at the desk',
            -10000, 'cash'
       from public.folios where id = '${folioId}'`,
  );
  return `/finance?property=${propertyId}&folio=${folioId}`;
}

test("a charge posted at 22:30 UTC is dated the next day at an Istanbul Property", async ({
  page,
}) => {
  const href = await aFolioWithLines(page);
  await page.goto(`/en${href}`);
  await expect(page.locator(`time[datetime="${LATE}"]`)).toHaveText(
    "Sep 27, 2026, 01:30",
  );
});

test("an Arabic Folio reads every amount number first and currency after, positive or negative", async ({
  page,
}) => {
  const href = await aFolioWithLines(page);
  await page.goto(`/ar${href}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const amounts = page.locator("td.text-end.tabular-nums");
  await expect(amounts).toHaveCount(2, { timeout: 15_000 });
  const texts = await amounts.allTextContents();
  expect(texts.some((text) => text.includes("740.00"))).toBe(true);
  expect(texts.some((text) => text.includes("-100.00"))).toBe(true);

  // What a person sees, not what the string says: in each cell the digits
  // sit to the left of the currency code, the same for both signs.
  const readOrder = () =>
    amounts.evaluateAll((cells) =>
      cells.map((cell) => {
        const node = cell.firstChild;
        const text = node?.textContent ?? "";
        const left = (needle: RegExp): number => {
          const match = needle.exec(text);
          if (!node || !match) return Number.NaN;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rects = range.getClientRects();
          return rects.length > 0 ? rects[0]!.left : Number.NaN;
        };
        return { digits: left(/\d[\d.,]*\d/), code: left(/TRY/) };
      }),
    );
  // Laid out, then measured: a range has no box until its text is painted.
  await expect
    .poll(async () =>
      (await readOrder()).every(
        ({ digits, code }) => !Number.isNaN(digits) && !Number.isNaN(code),
      ),
    )
    .toBe(true);
  const order = await readOrder();
  expect(order).toHaveLength(2);
  for (const { digits, code } of order) {
    expect(digits).toBeLessThan(code);
  }

  await page.screenshot({
    path: path.join(EVIDENCE, "folio-lines-arabic-amounts.png"),
  });
});
