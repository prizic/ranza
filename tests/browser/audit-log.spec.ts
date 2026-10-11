import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { psql } from "./local-database";
import {
  anArrivalToday,
  DESK_EMAIL,
  EMAIL,
  OWNER_EMAIL,
  signIn,
  testProperty,
} from "./front-desk";
import { checkIn, openFolioOf, postCharge, reverseLine } from "./folio-ui";

const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-45");

/**
 * The audit log's filters, through the form a manager actually submits.
 *
 * The integration suite proves the read and the pgTAP suite proves the
 * policies. This proves the part neither can see: what the form sends and what
 * the route makes of it. It exists because of a defect that passed both — the
 * "any action" sentinel was imported by the route from a `"use client"`
 * module, arrived as a client reference rather than the string, and every
 * submitted search therefore filtered on an action literally called "any" and
 * found nothing. Only a real request across the server/client boundary shows
 * that.
 *
 * Watched go red before it was believed: with the sentinel moved back into the
 * client module, this test fails.
 *
 * The record is written as the table owner — the runtime role may not choose
 * a record's columns wholesale — at the tests' own Property, in the seeded
 * Staff Member's name, with a reason no other run can have written.
 */
test("a submitted search finds a record by its reason, and the defaults narrow nothing", async ({
  page,
}) => {
  const propertyId = testProperty();
  const reason = `e2e audit ${randomUUID().slice(0, 8)} charged in error`;

  psql(
    `insert into audit.records
       (organization_id, location_id, actor_id, action, subject_type, subject_id, reason)
     select property.organization_id, property.id, member.id,
            'folio.line_reversed', 'folio', gen_random_uuid(), '${reason}'
       from public.properties as property,
            public.users as member
      where property.id = '${propertyId}'
        and lower(member.email) = lower('${EMAIL}')`,
  );

  await signIn(page);
  await page.goto(`/en/audit-log?property=${propertyId}`);
  await expect(page.getByRole("row").filter({ hasText: reason })).toBeVisible();

  // Apply with nothing chosen: every select submits its "any" value, and the
  // list must be the list it was.
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/action=any/);
  await expect(page.getByRole("row").filter({ hasText: reason })).toBeVisible();

  // A search for the reason finds it, and only records that match.
  await page.getByRole("searchbox", { name: "Search" }).fill(reason);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByText("1 record", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: reason })).toBeVisible();

  // And the record opens by its link, whole.
  await page
    .getByRole("row")
    .filter({ hasText: reason })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/record=/);
  await expect(page.getByText(reason)).toBeVisible();

  // Its way up is the list it was opened from: the filters kept, the record
  // dropped (ADR 0035).
  const opened = new URL(page.url());
  const list = new URLSearchParams(opened.search);
  list.delete("record");
  const listHref = `${opened.pathname}?${list.toString()}`;
  expect(list.get("q")).toBe(reason);
  const back = page.locator('header a[aria-label="Back"]');
  await expect(back).toHaveAttribute("href", listHref);
  await back.click();
  await expect(page).toHaveURL(listHref);
  await expect(page.getByText("1 record", { exact: true })).toBeVisible();
});

/**
 * The period is one field and one calendar. Two things only a browser shows:
 * pressing elsewhere closes the calendar without pulling focus back to the
 * dates — which sent the reader's typing nowhere — and a preset reaches the
 * server as the `from` and `to` the table is filtered by.
 *
 * Watched go red before it was believed: with the focus return made
 * unconditional, the search box is not focused.
 */
test("the period closes where the reader pressed, and a preset filters by it", async ({
  page,
}) => {
  const propertyId = testProperty();

  await signIn(page);
  await page.goto(`/en/audit-log?property=${propertyId}`);

  const search = page.getByRole("searchbox", { name: "Search" });
  await page.getByRole("button", { name: /^From/ }).click();
  await expect(page.getByText("Choose the first day")).toBeVisible();
  await search.click();
  await expect(page.getByText("Choose the first day")).toBeHidden();
  await expect(search).toBeFocused();

  await page.getByRole("button", { name: /^From/ }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  // Both ends survive the reload: the field shows what the table applies.
  await expect(page.getByRole("button", { name: /^From/ })).not.toHaveText(
    "Earliest",
  );
  await expect(page.getByRole("button", { name: /^To/ })).not.toHaveText(
    "Latest",
  );
});

/**
 * A record by the reason it was given, as the owner of the database reads it.
 * The reason carries this run's tag, so no other run's record can answer.
 */
function recordIdFor(reason: string): string {
  const id = psql(`select id from audit.records where reason = '${reason}'`);
  expect(id, `no audit record with the reason "${reason}"`).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  return id;
}

/** A record written as the table owner, in the seeded Staff Member's name. */
function writeRecord(propertyId: string, reason: string): void {
  psql(
    `insert into audit.records
       (organization_id, location_id, actor_id, action, subject_type, subject_id, reason)
     select property.organization_id, property.id, member.id,
            'folio.line_reversed', 'folio', gen_random_uuid(), '${reason}'
       from public.properties as property, public.users as member
      where property.id = '${propertyId}' and lower(member.email) = lower('${EMAIL}')`,
  );
}

async function filterByAction(page: Page, action: string): Promise<void> {
  await page.getByRole("combobox", { name: "Action" }).click();
  await page.getByRole("option", { name: action, exact: true }).click();
  await page.getByRole("button", { name: "Apply" }).click();
}

/**
 * RANZ-45's done-when: "a correction can be traced to the person who made it
 * and the reason they gave."
 *
 * One Staff Member makes the three corrections a desk makes, each on the screen
 * a desk makes it on — a charge reversed on the Folio, a mistaken check-in
 * withdrawn on the arrivals row, a booking cancelled from its menu — and a
 * different person, an Owner, reads them back from the audit log. Nothing is
 * written to the log by the test: if the log names the actor and the reason,
 * it is because the modules recorded them when the buttons were pressed.
 *
 * The reader is not the actor on purpose. The log says "You" for the viewer's
 * own records, which would prove the wording and not that the person is named.
 */
test("a correction is traced to the person who made it and the reason they gave", async ({
  browser,
  baseURL,
}) => {
  const propertyId = testProperty();
  const tag = randomUUID().slice(0, 8);
  const reasons = {
    reversal: `evid3 ${tag} the fee was added to the wrong room`,
    withdrawal: `evid3 ${tag} checked in the wrong one of two Guests`,
    cancellation: `evid3 ${tag} the Guest phoned to cancel`,
  };
  const reversedGuest = anArrivalToday(propertyId);
  const withdrawnGuest = anArrivalToday(propertyId);
  const cancelledGuest = anArrivalToday(propertyId);

  const actorContext = await browser.newContext({ baseURL: baseURL! });
  const actor = await actorContext.newPage();
  try {
    await signIn(actor, EMAIL);

    await checkIn(actor, propertyId, reversedGuest);
    await postCharge(
      actor,
      propertyId,
      openFolioOf(reversedGuest),
      "Late checkout fee",
      "123.45",
    );
    await reverseLine(actor, "Late checkout fee", reasons.reversal);

    await checkIn(actor, propertyId, withdrawnGuest);
    const withdrawnRow = actor
      .getByRole("row")
      .filter({ hasText: withdrawnGuest });
    await withdrawnRow
      .getByRole("button", { name: /Undo check-in for/ })
      .click();
    const withdrawal = actor.getByRole("dialog");
    await withdrawal.getByLabel("Reason").fill(reasons.withdrawal);
    await withdrawal.getByRole("button", { name: "Undo check-in" }).click();
    await expect(
      withdrawnRow.getByRole("button", { name: "Check in" }),
    ).toBeVisible();

    await actor.goto(`/en/arrivals?property=${propertyId}`);
    await actor.getByRole("searchbox").fill(cancelledGuest);
    const cancelledRow = actor
      .getByRole("row")
      .filter({ hasText: cancelledGuest });
    await cancelledRow
      .getByRole("button", { name: /More actions for/ })
      .click();
    await actor.getByRole("menuitem", { name: "Cancel booking" }).click();
    const cancellation = actor.getByRole("dialog");
    await cancellation.getByLabel("Reason").fill(reasons.cancellation);
    await cancellation.getByRole("button", { name: "Cancel booking" }).click();
    await expect(cancellation).toBeHidden();
    await expect(cancelledRow).toHaveCount(0);
  } finally {
    await actorContext.close();
  }

  const readerContext = await browser.newContext({ baseURL: baseURL! });
  const reader = await readerContext.newPage();
  // Wide enough for the Why column, so the evidence shows the reasons whole.
  await reader.setViewportSize({ width: 1680, height: 760 });
  try {
    await signIn(reader, OWNER_EMAIL);
    await reader.goto(`/en/audit-log?property=${propertyId}`);
    await reader
      .getByRole("searchbox", { name: "Search" })
      .fill(`evid3 ${tag}`);
    await reader.getByRole("button", { name: "Apply" }).click();
    await expect(reader.getByText("3 records", { exact: true })).toBeVisible();
    await reader.screenshot({
      path: path.join(EVIDENCE, "three-corrections-by-actor-and-reason.png"),
    });

    // The Property's wall clock must differ from UTC, or "shows the
    // Property's time" would pass on a server that ignored it.
    const timeZone = psql(
      `select timezone from public.properties where id = '${propertyId}'`,
    );
    expect(timeZone).toBe("Europe/Istanbul");

    const cases = [
      { action: "Line reversed", reason: reasons.reversal },
      { action: "Check-in withdrawn", reason: reasons.withdrawal },
      { action: "Booking cancelled", reason: reasons.cancellation },
    ];
    for (const { action, reason } of cases) {
      await filterByAction(reader, action);
      await expect(reader.getByText("1 record", { exact: true })).toBeVisible();
      const row = reader.getByRole("row").filter({ hasText: reason });
      await expect(row).toHaveCount(1);
      // Who: the address of the person who did it, not the reader's "You".
      await expect(row).toContainText(EMAIL);
      await expect(row).not.toContainText("You");
      // Why: the words they typed.
      await expect(row).toContainText(reason);
      // When: the Property's wall clock, not the server's and not UTC.
      const id = recordIdFor(reason);
      const wallClock = psql(
        `select to_char(occurred_at at time zone '${timeZone}', 'Mon FMDD, YYYY, HH24:MI')
           from audit.records where id = '${id}'`,
      );
      const utcClock = psql(
        `select to_char(occurred_at at time zone 'UTC', 'Mon FMDD, YYYY, HH24:MI')
           from audit.records where id = '${id}'`,
      );
      expect(wallClock).not.toBe(utcClock);
      await expect(row.locator("time")).toHaveText(wallClock);
    }

    // The reversal opens by its link, whole: the amount reversed, the
    // address, the reason verbatim.
    await filterByAction(reader, "Line reversed");
    await reader
      .getByRole("row")
      .filter({ hasText: reasons.reversal })
      .getByRole("link")
      .click();
    await expect(reader).toHaveURL(/record=/);
    await expect(reader.getByText(reasons.reversal)).toBeVisible();
    await expect(reader.getByText(EMAIL)).toBeVisible();
    await expect(reader.getByText(/123[.,]45/)).toBeVisible();
    await reader.screenshot({
      path: path.join(EVIDENCE, "reversal-opened-by-its-link.png"),
    });
  } finally {
    await readerContext.close();
  }
});

/**
 * "A viewer without audit.read has no destination and a direct URL reads
 * nothing." A Front desk colleague reaches the Property and everything else the
 * desk does, is not offered the log, and an address typed in by hand answers
 * with a refusal that carries neither the record nor its reason.
 */
test("a viewer without audit.read has no destination and a direct URL reads nothing", async ({
  page,
}) => {
  const propertyId = testProperty();
  const reason = `evid3 ${randomUUID().slice(0, 8)} reversed in error`;
  writeRecord(propertyId, reason);
  const recordId = recordIdFor(reason);

  await signIn(page, DESK_EMAIL);
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);

  await page.goto(`/en/audit-log?property=${propertyId}&record=${recordId}`);
  await expect(page.getByText("You can't read the audit log")).toBeVisible();
  await expect(page.getByText(reason)).toHaveCount(0);

  await page.goto(
    `/en/audit-log?property=${propertyId}&q=${encodeURIComponent(reason)}`,
  );
  await expect(page.getByText("You can't read the audit log")).toBeVisible();
  await expect(page.getByText(reason)).toHaveCount(0);
  await page.screenshot({
    path: path.join(EVIDENCE, "front-desk-reads-nothing.png"),
  });
});

/** AL-S1-14: with no session the log is asked for and nothing comes back. */
test("without a session the log is not served and the record is not read", async ({
  page,
}) => {
  const propertyId = testProperty();
  const reason = `evid3 ${randomUUID().slice(0, 8)} no session`;
  writeRecord(propertyId, reason);
  const recordId = recordIdFor(reason);

  await page.goto(`/en/audit-log?property=${propertyId}&record=${recordId}`);
  await expect(page).toHaveURL(/\/en\/sign-in/);
  await expect(page.getByText(reason)).toHaveCount(0);
});

/**
 * AL-S1-13: the screen is not live. A record written after the list loaded is
 * not on it until the page is loaded again.
 */
test("a record written while the page is open is not there until it is loaded again", async ({
  page,
}) => {
  const propertyId = testProperty();
  const reason = `evid3 ${randomUUID().slice(0, 8)} written while open`;

  await signIn(page, OWNER_EMAIL);
  await page.goto(
    `/en/audit-log?property=${propertyId}&q=${encodeURIComponent(reason)}`,
  );
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();

  writeRecord(propertyId, reason);

  // Time passes on the open page and nothing on it changes.
  await page.waitForTimeout(3_000);
  await expect(page.getByText(reason)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: reason })).toBeVisible();
});

/** AL-S1-24: one character is not searched, and the screen says why. */
test("a one-character search is not run and the screen says why", async ({
  page,
}) => {
  const propertyId = testProperty();

  await signIn(page, OWNER_EMAIL);
  await page.goto(`/en/audit-log?property=${propertyId}`);
  await page.getByRole("searchbox", { name: "Search" }).fill("a");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=a/);
  await expect(
    page.getByText("Type at least two characters to search."),
  ).toBeVisible();
});

/**
 * The same record in Arabic: the action in the reader's language, the actor's
 * address and the reason exactly as typed, the page laid out from the right.
 */
test("a correction reads in Arabic with its actor and its reason as they were written", async ({
  page,
}) => {
  const propertyId = testProperty();
  const reason = `evid3 ${randomUUID().slice(0, 8)} charged in error`;
  writeRecord(propertyId, reason);

  await signIn(page, OWNER_EMAIL);
  await page.goto(
    `/ar/audit-log?property=${propertyId}&q=${encodeURIComponent(reason)}`,
  );
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const row = page.getByRole("row").filter({ hasText: reason });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("تم عكس بند");
  await expect(row).toContainText(EMAIL);
  await page.screenshot({
    path: path.join(EVIDENCE, "correction-in-arabic.png"),
  });

  await row.getByRole("link").click();
  await expect(page).toHaveURL(/record=/);
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText(EMAIL)).toBeVisible();
});
