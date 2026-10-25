import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./hydration";
import { psql } from "./local-database";
import { aStaffMember, signIn } from "./front-desk";
import {
  aBacklog,
  aBooking,
  aDeskProperty,
  anOverdueGuest,
  archiveMadeProperties,
} from "./ux-fixtures";

/**
 * Arrivals, Departures and Close the day, walked as the desk does it, in
 * English and in Arabic: the 2026-10-24 audit's ARRIVALS findings.
 *
 * Each test brings a Property of its own, so what it sees is what it made.
 */

test.afterAll(archiveMadeProperties);

/** A Guest with a name no column was drawn for, in house and overdue. */
function aGuestWithALongName(propertyId: string): string {
  const guest = anOverdueGuest(propertyId, {
    daysOverdue: 6,
    nightlyRateMinor: 500_000,
    withFolio: true,
  });
  const name =
    "Alexandria Wolfeschlegelsteinhausenbergerdorff Montgomery-Featherstonehaugh III Esquire";
  psql(
    `update public.guests set full_name = '${name}' where full_name = '${guest.guestName}'`,
  );
  return name;
}

/** Whether the table asks for more room than the box it is drawn in has. */
async function tableOverflows(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const table = document.querySelector("table");
    const box = table?.parentElement;
    if (!table || !box) throw new Error("no table on the page");
    return table.getBoundingClientRect().width > box.clientWidth + 2;
  });
}

async function rowOf(page: Page, text: string): Promise<Locator> {
  const row = page.getByRole("row").filter({ hasText: text });
  await expect(row).toBeVisible();
  return row;
}

test.describe("Departures, in English", () => {
  test("a name longer than the column cannot push the money off the screen", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    aGuestWithALongName(propertyId);
    await signIn(page);

    for (const width of [1440, 1200, 768, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/en/departures?property=${propertyId}`);
      await expect(page.getByRole("table")).toBeVisible();
      await expect(
        page.getByText(/TRY\s?45,000/).first(),
        `the balance is on screen at ${width}px`,
      ).toBeVisible();
      await expect
        .poll(() => tableOverflows(page), {
          message: `the list slides sideways at ${width}px`,
        })
        .toBe(false);
    }
  });

  test("one row of filters, and a search that says where else to look", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    anOverdueGuest(propertyId, { daysOverdue: 2, withFolio: true });
    await signIn(page);
    await page.goto(`/en/departures?property=${propertyId}`);

    const filters = page.getByRole("navigation", {
      name: "Departure filters",
    });
    await expect(filters.getByRole("link")).toHaveCount(4);
    await expect(
      filters.getByRole("link", { name: "Due and overdue" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Due and overdue" }),
    ).toHaveCount(1);

    await page.getByRole("searchbox").fill("nobody by this name");
    await expect(
      page.getByText(
        "Nobody due matches. A Guest who is in house but not leaving today is under “Everybody in house”.",
      ),
    ).toBeVisible();

    await filters.getByRole("link", { name: "Everybody in house" }).click();
    await expect(page).toHaveURL(/view=in_house/);
    await expect(
      page
        .getByRole("navigation", { name: "Departure filters" })
        .getByRole("link", { name: "Everybody in house" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("an overdue booking with no price reads once, and says it is final", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 3,
      withFolio: true,
    });
    await signIn(page);
    await page.goto(`/en/departures?property=${propertyId}`);
    const row = await rowOf(page, guest.guestName);
    await row.getByRole("button", { name: /^Check .* out$/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("A check-out cannot be taken back."),
    ).toBeVisible();
    await expect(
      dialog.getByText(/This Guest is 3 days overdue/),
    ).toBeVisible();
    // One notice about the missing price, not that and a second saying the
    // Folio is settled in so many words.
    await expect(dialog.getByText(/no price/)).toHaveCount(1);
    await expect(dialog.getByText("Their Folio is settled.")).toHaveCount(0);
    await expect(
      dialog.getByText("Room", { exact: false }).first(),
    ).toBeVisible();
    await expect(dialog.getByText(/\bUnit\b/)).toHaveCount(0);
  });

  test("the confirm button keeps its arrow readable while it can be pressed", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 1,
      withFolio: true,
    });
    await signIn(page);
    await page.goto(`/en/departures?property=${propertyId}`);
    const row = await rowOf(page, guest.guestName);
    await row.getByRole("button", { name: /^Check .* out$/ }).click();

    const confirm = page
      .getByRole("dialog")
      .getByRole("button", { name: "Check out", exact: true });
    await expect(confirm).toBeEnabled();
    const [pill, chip] = await confirm.evaluate((button) => {
      const lightness = (color: string): number => {
        const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(
          Number,
        );
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };
      const arrow = button.querySelector("span");
      if (!arrow) throw new Error("no arrow chip in the button");
      return [
        lightness(getComputedStyle(button).backgroundColor),
        lightness(getComputedStyle(arrow).backgroundColor),
      ] as const;
    });
    expect(pill, "the pill is dark").toBeLessThan(0.4);
    expect(chip, "the chip is light on it").toBeGreaterThan(0.8);
  });

  test("focus goes to the next Guest's check-out after one is done", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const first = anOverdueGuest(propertyId, {
      daysOverdue: 5,
      withFolio: true,
    });
    const second = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      withFolio: true,
    });
    await signIn(page);
    await page.goto(`/en/departures?property=${propertyId}`);
    const row = await rowOf(page, first.guestName);
    await row.getByRole("button", { name: /^Check .* out$/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Check out", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    const next = (await rowOf(page, second.guestName)).getByRole("button", {
      name: /^Check .* out$/,
    });
    await expect(next).toBeFocused();
  });

  test("Finance sees the balance link and no link to a page it cannot open", async ({
    page,
    request,
    baseURL,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 2,
      nightlyRateMinor: 300_000,
      withFolio: true,
    });
    const finance = await aStaffMember(
      request,
      baseURL ?? "http://localhost:3000",
      propertyId,
      "finance",
    );
    await signIn(page, finance.email);
    await page.goto(`/en/departures?property=${propertyId}&view=in_house`);
    const row = await rowOf(page, guest.guestName);
    await expect(
      row.locator('a[href*="/finance?"][href*="folio="]'),
    ).toHaveCount(1);
    await row.getByRole("button", { name: /More actions for/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Open folio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Show on the room map" }),
    ).toHaveCount(0);
  });
});

test.describe("Arrivals, in English", () => {
  test("a booking whose nights have all passed is on the list, and cannot be checked in", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const missed = aBooking(propertyId, {
      startsIn: -13,
      nights: 1,
      label: "Missed",
    });
    await signIn(page);
    await page.goto(`/en/arrivals?property=${propertyId}`);
    const row = await rowOf(page, missed.guestName);
    await expect(row.getByText(/Did not arrive · 13 days/)).toHaveCount(1);
    await expect(row.getByText(/Was due to arrive/)).toBeVisible();
    await expect(row.getByRole("button", { name: "Check in" })).toHaveCount(0);

    await row.getByRole("button", { name: /More actions for/ }).click();
    await expect(
      page.getByRole("menuitem", { name: "Mark as no-show" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Open reservation" }),
    ).toBeVisible();
  });

  test("Open reservation leads to the booking's own sheet", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const booking = aBooking(propertyId, { startsIn: 0, nights: 2 });
    await signIn(page);
    await page.goto(`/en/arrivals?property=${propertyId}`);
    const row = await rowOf(page, booking.guestName);
    await row.getByRole("button", { name: /More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Open reservation" }).click();
    await expect(page).toHaveURL(/\/reservations\?.*open=/);
    await expect(
      page.getByRole("dialog").getByText(booking.reference),
    ).toBeVisible();
  });
});

test.describe("Close the day, in English", () => {
  test("says a close cannot be undone first, and in a line of its own", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    aBacklog(propertyId, 3);
    await signIn(page);
    await page.goto(`/en/close-day?property=${propertyId}`);
    await page
      .getByRole("button", { name: /^Close/ })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    const final = dialog.getByText(
      "Reopening a closed day is not available yet, so check the date before you close it.",
    );
    const charges = dialog.getByText(
      /The close charges the night of every Guest/,
    );
    await expect(final).toBeVisible();
    await expect(charges).toBeVisible();
    const finalBox = await final.boundingBox();
    const chargesBox = await charges.boundingBox();
    expect(finalBox && chargesBox && finalBox.y < chargesBox.y).toBe(true);
    // Not one paragraph run together.
    expect(await final.evaluate((node) => node.textContent)).not.toContain(
      "charges",
    );
  });

  test("the oldest day is 'only' when Close all is offered beside it", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    aBacklog(propertyId, 4);
    await signIn(page);
    await page.goto(`/en/close-day?property=${propertyId}`);
    await expect(page.getByRole("button", { name: /^Close all/ })).toHaveCount(
      1,
    );
    await expect(page.getByRole("button", { name: /^Close only/ })).toHaveCount(
      1,
    );
  });

  test("a button is not 'only' unless there is a Close all beside it", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    // The bookings are written first: a booking cannot be written into a day
    // that is already closed.
    anOverdueGuest(propertyId, { daysOverdue: 5, withFolio: true });
    anOverdueGuest(propertyId, { daysOverdue: 1, withFolio: true });
    aBacklog(propertyId, 6);
    await signIn(page);
    await page.goto(`/en/close-day?property=${propertyId}`);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    // Different things hold different days open, so there is no Close all and
    // nothing for "only" to be an alternative to.
    await expect(page.getByRole("button", { name: /^Close all/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^Close only/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^Close / })).toHaveCount(1);
    // Every waiting day is listed, not seven and "and 4 more".
    await expect(page.getByText(/more days?$/)).toHaveCount(0);
  });
});

test.describe("In Arabic", () => {
  test("Departures: the check-out dialog is final, in Arabic, laid out right to left", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const guest = anOverdueGuest(propertyId, {
      daysOverdue: 3,
      withFolio: true,
    });
    await signIn(page);
    await page.goto(`/ar/departures?property=${propertyId}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const filters = page.getByRole("navigation", { name: "مرشحات المغادرة" });
    await expect(filters.getByRole("link")).toHaveCount(4);
    const row = await rowOf(page, guest.guestName);
    await expect.poll(() => tableOverflows(page)).toBe(false);
    await row.getByRole("button", { name: /^تسجيل مغادرة / }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("لا يمكن التراجع عن المغادرة."),
    ).toBeVisible();
    await expect(dialog.getByText(/الحجز بلا سعر/)).toHaveCount(1);
  });

  test("Arrivals: a missed booking says so in Arabic and offers no check-in", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    const missed = aBooking(propertyId, {
      startsIn: -4,
      nights: 1,
      label: "Missed",
    });
    await signIn(page);
    await page.goto(`/ar/arrivals?property=${propertyId}`);
    const row = await rowOf(page, missed.guestName);
    await expect(row.getByText(/لم يصل/)).toHaveCount(1);
    await expect(row.getByRole("button", { name: /تسجيل الوصول/ })).toHaveCount(
      0,
    );
  });

  test("Close the day: the warning is first, and in Arabic", async ({
    page,
  }) => {
    const propertyId = aDeskProperty();
    aBacklog(propertyId, 2);
    await signIn(page);
    await page.goto(`/ar/close-day?property=${propertyId}`);
    await page
      .getByRole("button", { name: /^إغلاق/ })
      .first()
      .click();
    await expect(
      page.getByRole("dialog").getByText(/إعادة فتح يوم مغلق غير متاحة بعد/),
    ).toBeVisible();
  });
});
