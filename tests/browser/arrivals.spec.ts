import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import { anArrivalToday, signIn, testProperty } from "./front-desk";

/**
 * Checking a Guest in, through the screen a front desk actually uses.
 *
 * The integration suites prove the module and the policies; this proves the
 * part neither of them can see — that the button is on the row, that pressing
 * it reaches the server action, and that the list afterwards says the Guest
 * arrived.
 *
 * Watched go red before it was believed: with the row's action named anything
 * other than "Check in", this fails at the click rather than passing on a
 * selector that matches nothing.
 */

test("a confirmed arrival is checked in from the arrivals screen", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);

  await signIn(page);
  // The Property is named rather than defaulted to: the workspace opens on the
  // demo one, and this Property exists so it can stay that way.
  await page.goto(`/en/arrivals?property=${propertyId}`);

  // Narrowed to this run's Guest, because every earlier run left its arrival on
  // the list and the table pages at ten rows.
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });

  await row.getByRole("button", { name: "Check in" }).click();

  // The row stays on the list for the rest of the Property's day and says so.
  await expect(row.getByText("Checked in")).toBeVisible();
});

/**
 * The loop issue #34 was about, in the screen a front desk actually uses.
 *
 * Checking in, taking it back, and checking in again is one story rather than
 * three assertions: the second check-in is the one that failed on a unique
 * index for as long as ADR 0022 described a door its own schema had bolted
 * shut. Proving it from the module is proving it where the index was already
 * fixed; proving it here is proving that a person can do it.
 */
test("a check-in is withdrawn with a reason, and the Reservation arrives again", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();

  // A regular expression, because the accessible name carries the Guest and the
  // Guest is wrapped in bidirectional isolates — the characters are in the name
  // and they are not whitespace.
  await row.getByRole("button", { name: /Undo check-in for/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(guestName)).toBeVisible();
  await dialog
    .getByLabel("Reason")
    .fill("checked in the wrong one of two Guests arriving together");
  await dialog.getByRole("button", { name: "Undo check-in" }).click();

  // Back to a Reservation somebody can arrive against — which is the dialog
  // closing as well, because the cell that held it renders a check-in instead.
  await expect(row.getByRole("button", { name: "Check in" })).toBeVisible();
  await expect(dialog).toBeHidden();

  // And focus went with it. The control that was pressed no longer exists, so
  // without this focus lands on the document and a keyboard is back at the top
  // of the page — on the screen whose whole point is doing the same thing again
  // for the Guest who should have been checked in.
  await expect(row.getByRole("button", { name: "Check in" })).toBeFocused();

  // And a second time, which is the half of ADR 0022 that did not work: the
  // withdrawn Stay went on holding the Reservation and the database refused.
  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
});

/**
 * Money against the Stay this Guest is in.
 *
 * Posted as the owner rather than through the Finance screen, which does not
 * exist yet — but through the same table and the same triggers, so the rule
 * being tested is the real one: `stays_withdrawal_is_free_of_charges` refuses
 * to cancel a Stay carrying a line, whoever wrote it.
 */
function chargeTheStayOf(guestName: string): void {
  const posted = psql(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id,
        line_type, description, amount_minor)
     select folio.organization_id, folio.property_id, folio.id,
            'charge', 'Minibar', 4500
     from public.folios as folio
     join public.stays as stay on stay.id = folio.stay_id
     join public.reservations as reservation
       on reservation.id = stay.reservation_id
     join public.guests as guest on guest.id = reservation.guest_id
     where guest.full_name = '${guestName}'
       and stay.status = 'in_house'
     returning id`,
  );

  expect(
    posted,
    "no open Folio to charge — has the test Property lost its finance capability?",
  ).not.toBe("");
}

/**
 * The refusal a front desk can do something about.
 *
 * Everything else a withdrawal fails on says "that cannot be withdrawn" and
 * means it. This one says money exists, which is a different situation with a
 * different remedy — and it is the sentence, not the refusal, that this test is
 * about: the error is raised by a trigger, carried by its own type, chosen by
 * the server action and read out of the catalogue, and every one of those hops
 * is somewhere it could quietly become the generic one.
 */
test("a Stay with charges refuses the withdrawal, and says so", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
  chargeTheStayOf(guestName);

  await row.getByRole("button", { name: /Undo check-in for/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("checked in the wrong Guest");
  await dialog.getByRole("button", { name: "Undo check-in" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "Charges have been posted to this Stay",
  );
  // Still open. The dialog goes away by being replaced — a withdrawal that
  // works leaves a check-in button where the trigger was — so a dialog that is
  // still here is the refusal being readable rather than flashing past.
  await expect(dialog).toBeVisible();

  // And nothing moved. Asserted after the dialog is dismissed rather than
  // around it: while a modal is open the rest of the page is `aria-hidden`, so
  // the row is not a row to anything reading by role — which is the dialog
  // being a real one.
  await dialog.getByRole("button", { name: "Keep check-in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();
});

/**
 * A reason the field accepted and the module did not.
 *
 * Three spaces pass `required` and `minLength` — they are three characters —
 * and the module measures what it stores, which is the trimmed string. So this
 * is the one refusal that arrives with the dialog's own field at fault rather
 * than the Stay, and the only one where what somebody typed is still worth
 * something: they are going to edit it, not abandon it.
 */
test("a reason of spaces is refused, and what was typed survives it", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId);

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row.getByText("Checked in")).toBeVisible();

  await row.getByRole("button", { name: /Undo check-in for/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill("   ");
  await dialog.getByRole("button", { name: "Undo check-in" }).click();

  await expect(dialog.getByRole("alert")).toContainText(
    "A reason of at least 3 characters is needed",
  );
  await expect(dialog.getByLabel("Reason")).toHaveValue("   ");
});

/**
 * The expected arrival on the arrivals row (FD-S6-18..20).
 *
 * The integration suite proves the list reads the Property's clock; this proves
 * a person sees it: the time on the row, "—" for a Guest nobody has a time for,
 * a word for one whose time has passed, and a time edited from Change booking
 * landing on the same row.
 */
test("an_arrival_shows_its_expected_time_and_says_so_when_it_has_passed", async ({
  page,
}) => {
  const propertyId = testProperty();
  // 00:01 has passed on whatever day this runs: the Property's day starts at
  // its midnight, and the business date never runs ahead of the calendar.
  const lateName = anArrivalToday(propertyId, "00:01");
  const unsaidName = anArrivalToday(propertyId);

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);

  await page.getByRole("searchbox").fill(lateName);
  const late = page.getByRole("row").filter({ hasText: lateName });
  await expect(late.getByText("00:01")).toBeVisible();
  await expect(late.getByText("Past the expected time")).toBeVisible();

  // Checking the Guest in takes the word away and leaves the time.
  await late.getByRole("button", { name: "Check in" }).click();
  await expect(late.getByText("Checked in")).toBeVisible();
  await expect(late.getByText("Past the expected time")).toBeHidden();
  await expect(late.getByText("00:01")).toBeVisible();

  await page.getByRole("searchbox").fill(unsaidName);
  const unsaid = page.getByRole("row").filter({ hasText: unsaidName });
  await expect(unsaid.getByLabel("No expected time")).toBeVisible();
  await expect(unsaid.getByText("Past the expected time")).toBeHidden();
});

test("an_expected_time_that_has_not_come_does_not_say_it_has_passed", async ({
  page,
}) => {
  const propertyId = testProperty();
  // Between 22:00 and 04:00 at the Property the arrival's own day is nearly
  // over, or the business date is still yesterday: 23:59 on it has passed, and
  // saying so is right. Outside that window it is still to come.
  const nearMidnight =
    psql(
      `select extract(hour from now() at time zone timezone) >= 22
           or extract(hour from now() at time zone timezone) < 4
         from public.properties where id = '${propertyId}'`,
    ) === "t";
  test.skip(
    nearMidnight,
    "23:59 has passed on the arrival's day at this hour; the integration suite covers it on a clock of its own",
  );
  const guestName = anArrivalToday(propertyId, "23:59");

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row.getByText("23:59")).toBeVisible();
  await expect(row.getByText("Past the expected time")).toBeHidden();
});

test("an_expected_time_is_changed_from_change_booking_and_the_row_follows", async ({
  page,
}) => {
  const propertyId = testProperty();
  const guestName = anArrivalToday(propertyId, "14:00");

  await signIn(page);
  await page.goto(`/en/arrivals?property=${propertyId}`);
  await page.getByRole("searchbox").fill(guestName);
  const row = page.getByRole("row").filter({ hasText: guestName });
  await expect(row.getByText("14:00")).toBeVisible();

  await row
    .getByRole("button", {
      name: new RegExp(`More actions for .?${guestName}`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Change booking" }).click();

  const dialog = page.getByRole("dialog", { name: "Change booking" });
  const time = dialog.getByLabel("Expected arrival");
  // Filled from the booking, and nothing to save until it differs. The first
  // preview fills the fields afresh, so typing waits for it to have arrived.
  await expect(time).toHaveValue("14:00");
  await expect(
    dialog.getByText("The dates and the Unit are the same"),
  ).toBeVisible();
  const save = dialog.getByRole("button", { name: "Save change" });
  await expect(save).toBeDisabled();

  await time.fill("18:30");
  await dialog.getByLabel("Note (optional)").fill("The Guest called ahead");
  await save.click();
  await expect(dialog).toBeHidden();

  await expect(row.getByText("18:30")).toBeVisible();
  await expect(row.getByText("14:00")).toBeHidden();
  expect(
    psql(
      `select change.kind || ' ' ||
              to_char(change.from_expected_arrival_time, 'HH24:MI') || ' ' ||
              to_char(change.to_expected_arrival_time, 'HH24:MI') || ' ' ||
              change.note
         from public.reservation_changes as change
         join public.reservations as reservation on reservation.id = change.reservation_id
         join public.guests as guest on guest.id = reservation.guest_id
        where guest.full_name = '${guestName}'`,
    ),
  ).toBe("arrival_time_changed 14:00 18:30 The Guest called ahead");

  // Cleared again, the row says it has no time.
  await row
    .getByRole("button", {
      name: new RegExp(`More actions for .?${guestName}`),
    })
    .click();
  await page.getByRole("menuitem", { name: "Change booking" }).click();
  const again = page.getByRole("dialog", { name: "Change booking" });
  await expect(again.getByLabel("Expected arrival")).toHaveValue("18:30");
  await expect(
    again.getByText("The dates and the Unit are the same"),
  ).toBeVisible();
  await again.getByLabel("Expected arrival").clear();
  await again.getByRole("button", { name: "Save change" }).click();
  await expect(again).toBeHidden();
  await expect(row.getByLabel("No expected time")).toBeVisible();
});
