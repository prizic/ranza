import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { psql } from "./local-database";
import { EMAIL, signIn, testProperty } from "./front-desk";

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
});
