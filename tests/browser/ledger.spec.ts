import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  anArrivalToday,
  aStaffMember,
  DESK_EMAIL,
  EMAIL,
  OWNER_EMAIL,
  signIn,
  testProperty,
} from "./front-desk";
import { checkIn, openFolioOf, postCharge, reverseLine } from "./folio-ui";
import { psql, psqlAs } from "./local-database";
import { startWorker, WORKER_BUDGET_MS, whileWorking } from "./worker";

/**
 * RANZ-41's done-when: "a Folio line reaches the ledger without being
 * re-entered anywhere."
 *
 * There is no ledger screen (ACC-S2-11), so the half of this that a person
 * sees is the Folio they post to and the half that is the books is read where
 * it can be: from the database, as the application's own runtime role speaking
 * for a Staff Member, which is exactly what a screen would be subject to. A
 * charge is posted and reversed on the Folio's own screen, the real worker is
 * run for as long as it takes to deliver those two lines, and the entries that
 * come out are read back as somebody who holds `finance.view_ledger` and as
 * somebody who does not.
 *
 * The worker is stopped as soon as both entries exist. It also closes every
 * Property's due business day once a minute, and a run that outlives that
 * would shut yesterday at the other Properties the browser tests share.
 *
 * Nothing in this file writes to the ledger: the application role holds SELECT
 * on it and the worker holds nothing on its tables, so an entry that exists
 * got there through `app.post_folio_line_to_ledger()` from the Folio line.
 */
const EVIDENCE = path.resolve(__dirname, "../../docs/evidence/m1/RANZ-41");

function userId(email: string): string {
  const id = psql(
    `select id from public.users where lower(email) = lower('${email}')`,
  );
  expect(id, `no Ranza user for ${email}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

/** The entries for these Folio lines, one row per leg, in the order posted. */
function legsFor(reader: string, lineIds: string[]): string[] {
  const listed = lineIds.map((id) => `'${id}'`).join(", ");
  const out = psqlAs(
    reader,
    `select entry.source_type || '|' || entry.source_id || '|' || entry.currency
            || '|' || entry.description || '|' || line.direction || '|' || account.code
            || '|' || line.amount_minor
       from finance.journal_entries as entry
       join finance.journal_lines as line on line.journal_entry_id = entry.id
       join finance.accounts as account on account.id = line.account_id
      where entry.source_type = 'folio_line' and entry.source_id in (${listed})
      order by entry.entry_number, line.direction desc`,
  );
  return out === "" ? [] : out.split("\n");
}

test("a Folio line reaches the ledger without being re-entered anywhere", async ({
  page,
  request,
  baseURL,
}) => {
  const propertyId = testProperty();
  const description = `Spa treatment ${randomUUID().slice(0, 8)}`;
  const reason = "booked for the wrong Guest";
  const guestName = anArrivalToday(propertyId);

  // A person posts a charge, and takes it back, on the Folio's screen.
  await signIn(page, EMAIL);
  await checkIn(page, propertyId, guestName);
  const folioId = openFolioOf(guestName);
  await postCharge(page, propertyId, folioId, description, "250.00");
  await reverseLine(page, description, reason);
  await page.screenshot({
    path: path.join(EVIDENCE, "charge-and-its-reversal-on-the-folio.png"),
  });

  const chargeId = psql(
    `select id from public.folio_lines
      where folio_id = '${folioId}' and line_type = 'charge' and description = '${description}'`,
  );
  const reversalId = psql(
    `select id from public.folio_lines
      where folio_id = '${folioId}' and reverses_line_id = '${chargeId}'`,
  );
  expect(chargeId).toMatch(/^[0-9a-f-]{36}$/);
  expect(reversalId).toMatch(/^[0-9a-f-]{36}$/);
  const lines = [chargeId, reversalId];
  const reader = userId(OWNER_EMAIL);

  // Posting a line writes the line and an outbox event, and nothing in the
  // books: the ledger is not touched in the Folio's own transaction.
  expect(legsFor(reader, lines)).toEqual([]);
  expect(
    psql(
      `select count(*) from outbox.events
        where event_type = 'folio.line_posted' and published_at is null
          and payload ->> 'lineId' in ('${chargeId}', '${reversalId}')`,
    ),
  ).toBe("2");

  // The worker, as a deployment runs it, for as long as these two lines take.
  const worker = startWorker();
  await whileWorking(
    worker,
    expect
      .poll(() => legsFor(reader, lines).length, { timeout: WORKER_BUDGET_MS })
      .toBe(4),
  );

  // A balanced posting for each line, from the line itself: the charge debits
  // Receivables and credits Other Revenue, and its reversal is the mirror.
  // Compared as a set: the worker delivers events in the order it claims them,
  // and a reversal's entry does not wait for the entry of the line it reverses.
  expect(legsFor(reader, lines).sort()).toEqual(
    [
      `folio_line|${chargeId}|TRY|${description}|debit|1200|25000`,
      `folio_line|${chargeId}|TRY|${description}|credit|4100|25000`,
      `folio_line|${reversalId}|TRY|${reason}|debit|4100|25000`,
      `folio_line|${reversalId}|TRY|${reason}|credit|1200|25000`,
    ].sort(),
  );
  // Taken together they cancel: nothing is owed on a charge that was reversed.
  expect(
    psqlAs(
      reader,
      `select coalesce(sum(case line.direction when 'debit' then line.amount_minor
                                               else -line.amount_minor end), 0)
         from finance.journal_lines as line
         join finance.journal_entries as entry on entry.id = line.journal_entry_id
         join finance.accounts as account on account.id = line.account_id
        where account.code = '1200' and entry.source_id in ('${chargeId}', '${reversalId}')`,
    ),
  ).toBe("0");

  // One entry per line, and not one more.
  expect(
    psqlAs(
      reader,
      `select count(*) from finance.journal_entries
        where source_type = 'folio_line' and source_id in ('${chargeId}', '${reversalId}')`,
    ),
  ).toBe("2");

  // Somebody who holds the permission across the Organization reads the books
  // (the Owner, above). Nobody else reads a leg, for one of two reasons that
  // must each be shown on its own, because either would hide the other:
  //  - reach: the Manager who posted the line and the Front desk colleague are
  //    assigned to this Property, and an entry carries no Property to narrow
  //    to, so the only honest reach is the whole Organization (ACC-S2-05);
  //  - the permission: a Front desk member with the whole Organization's reach
  //    is admitted by reach, by the Subscription and by the capability, and
  //    still reads nothing, because the shipped role does not hold
  //    finance.view_ledger (ACC-S2-04).
  const everythingTheyCanSee = `select (select count(*) from finance.journal_entries) || '|'
              || (select count(*) from finance.journal_lines) || '|'
              || (select count(*) from finance.accounts)`;
  const wholeOrganizationDesk = await aStaffMember(
    request,
    baseURL!,
    propertyId,
    "front_desk",
  );
  psql(
    `update public.organization_memberships set access_scope = 'organization_wide'
      where user_id = '${wholeOrganizationDesk.userId}'`,
  );
  for (const person of [
    userId(EMAIL),
    userId(DESK_EMAIL),
    wholeOrganizationDesk.userId,
  ]) {
    expect(legsFor(person, lines), person).toEqual([]);
    expect(psqlAs(person, everythingTheyCanSee), person).toBe("0|0|0");
  }
});
