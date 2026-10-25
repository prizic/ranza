import { expect, type Page } from "@playwright/test";

import { psql } from "./local-database";

/**
 * What a front desk does to a Guest's Folio, through the screens it does it on.
 *
 * Shared by the specs that need money to exist because a person put it there
 * rather than because a fixture did — the audit log's corrections and the
 * ledger's postings. Each starts from an arrival of the run's own
 * (`anArrivalToday`), because checking somebody in is not an act that repeats.
 */

/** Checks the Guest in from the arrivals screen and waits for the row to say so. */
export async function checkIn(
  page: Page,
  propertyId: string,
  guestName: string,
): Promise<void> {
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
}

/** The Folio the check-in opened for this Guest. */
export function openFolioOf(guestName: string): string {
  const folioId = psql(
    `select folio.id
       from public.folios as folio
       join public.stays as stay on stay.id = folio.stay_id
       join public.reservations as reservation on reservation.id = stay.reservation_id
       join public.guests as guest on guest.id = reservation.guest_id
      where guest.full_name = '${guestName}' and folio.status = 'open'`,
  );
  expect(
    folioId,
    `no open Folio for ${guestName} — has the test Property lost its finance capability?`,
  ).toMatch(/^[0-9a-f-]{36}$/);
  return folioId;
}

/** Posts a charge from the Folio's own screen, in the Property's currency. */
export async function postCharge(
  page: Page,
  propertyId: string,
  folioId: string,
  description: string,
  amount: string,
): Promise<void> {
  await page.goto(`/en/finance?property=${propertyId}&folio=${folioId}`);
  const form = page
    .locator("form")
    .filter({ has: page.locator("#charge-description") });
  await form.locator("#charge-description").fill(description);
  await form.locator("#charge-amount").fill(amount);
  await form.getByRole("button", { name: "Post", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Post charge" })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: description }),
  ).toBeVisible();
}

/** Reverses the line with this description: opens the confirmation, says why, confirms. */
export async function reverseLine(
  page: Page,
  description: string,
  reason: string,
): Promise<void> {
  const row = page.getByRole("row").filter({ hasText: description }).first();
  await row.getByRole("button", { name: "Reverse" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: "Reverse" }).click();
  // The correction is a line of its own that names the original, so the
  // original is the row that is not the reversal.
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: description })
      .filter({ hasNotText: "Reversal of" })
      .getByText("reversed"),
  ).toBeVisible();
}
