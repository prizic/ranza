import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

import { test } from "./hydration";
import { aFreshProperty } from "./fresh-property";
import { DESK_EMAIL, OWNER_EMAIL, signIn, whenHydrated } from "./front-desk";
import { psql } from "./local-database";

/**
 * The nightly roll call and leave, as a front desk does them (RANZ-101,
 * docs/features/leave-and-attendance).
 *
 * A yurt of the spec's own for every test: a mark and a leave are never
 * deleted, so a reused Property would carry the last run's answers into this
 * run's figures. Its timezone is chosen so that it is midday there whatever
 * time the suite runs, which makes "the curfew has passed" a thing the spec can
 * set up rather than wait for.
 */

/**
 * The Owner signs in once for the file: six sign-ins in a minute is what the
 * auth module's rate limit refuses, and the screen under test is not the form.
 */
const OWNER_STATE = path.join(tmpdir(), `roll-call-owner-${process.pid}.json`);

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL: baseURL ?? "",
    storageState: { cookies: [], origins: [] },
  });
  await signIn(await context.newPage(), OWNER_EMAIL);
  await context.storageState({ path: OWNER_STATE });
  await context.close();
});

test.use({ storageState: OWNER_STATE });

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/leave-and-attendance",
);

/** A zone where it is midday now, so a curfew of 11:00 has passed and 13:00 has not. */
function middayZone(): string {
  const offset = 12 - new Date().getUTCHours();
  if (offset === 0) return "Etc/UTC";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

function room(
  propertyId: string,
  name: string,
  building: string,
  floor: number,
  beds: string[],
): void {
  psql(
    `with room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, building, floor)
       select id, organization_id, '${name}', 'room', ${beds.length},
              '${building}', ${floor}
         from public.properties where id = '${propertyId}'
       returning id, property_id, organization_id
     )
     insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, parent_id)
     select property_id, organization_id, bed, 'bed', 1, room.id
       from room cross join unnest(array['${beds.join("','")}']) as bed`,
  );
}

function aStudent(
  propertyId: string,
  roomName: string,
  bed: string,
  name: string,
): void {
  psql(
    `with bed as (
       select bed.id, bed.property_id, bed.organization_id
         from public.accommodation_units as bed
         join public.accommodation_units as room on room.id = bed.parent_id
        where room.property_id = '${propertyId}'
          and room.name = '${roomName}' and bed.name = '${bed}'
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${name}' from bed
       returning id
     ), booked as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select bed.organization_id, bed.property_id, bed.id, guest.id,
              'resident', 'checked_in',
              app.property_today(bed.property_id) - 10,
              app.property_today(bed.property_id) + 200
         from bed, guest
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select organization_id, property_id, accommodation_unit_id, id,
            'resident', 'in_house', starts_on, ends_on
       from booked`,
  );
}

/** A dormitory with four students on three floors of two blocks. */
function aYurt(label: string): { propertyId: string; name: string } {
  const yurt = aFreshProperty(label, {
    timezone: middayZone(),
    capabilities: ["front_desk", "attendance"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${yurt.propertyId}'`,
  );
  room(yurt.propertyId, "A-101", "Blok A", 1, ["A", "B"]);
  room(yurt.propertyId, "A-201", "Blok A", 2, ["A"]);
  room(yurt.propertyId, "B-101", "Blok B", 1, ["A"]);
  aStudent(yurt.propertyId, "A-101", "A", "Elif Yılmaz");
  aStudent(yurt.propertyId, "A-101", "B", "Zeynep Kaya");
  aStudent(yurt.propertyId, "A-201", "A", "Ayşe Demir");
  aStudent(yurt.propertyId, "B-101", "A", "Emre Şahin");
  return yurt;
}

function figure(page: Page, label: string): Locator {
  return page
    .getByRole("region", { name: "Tonight's figures" })
    .getByRole("button")
    .filter({ hasText: label })
    .locator("span")
    .first();
}

function row(page: Page, name: string): Locator {
  return page.locator("[data-roll-row]").filter({ hasText: name });
}

async function openRollCall(page: Page, propertyId: string): Promise<void> {
  await page.goto(`/en/roll-call?property=${propertyId}`);
  await expect(figure(page, "In house")).toBeVisible();
  await whenHydrated(page.getByRole("button", { name: /is present$/ }).first());
}

function marksOf(propertyId: string, name: string): string {
  return psql(
    `select string_agg(mark.status, ',' order by mark.id)
       from public.attendance_marks as mark
       join public.stays as stay on stay.id = mark.stay_id
       join public.reservations as booking on booking.id = stay.reservation_id
       join public.guests as guest on guest.id = booking.guest_id
      where stay.property_id = '${propertyId}' and guest.full_name = '${name}'`,
  );
}

function calledCount(propertyId: string): string {
  return psql(
    `select count(distinct stay_id) from public.attendance_marks
      where property_id = '${propertyId}'`,
  );
}

test("the desk takes tonight's roll in a few taps, and the figures follow", async ({
  page,
}) => {
  const yurt = aYurt("roll call");
  await openRollCall(page, yurt.propertyId);

  await expect(figure(page, "In house")).toHaveText("4");
  await expect(figure(page, "Not yet called")).toHaveText("4");
  await expect(figure(page, "Missing")).toHaveText("0");
  // The common outcome is one tap on the row itself.
  await row(page, "Elif Yılmaz").getByText("A-101 · A").click();
  await expect(figure(page, "Present")).toHaveText("1");
  await expect(figure(page, "Not yet called")).toHaveText("3");

  // Absent is a button, and absent is what the desk acts on.
  await row(page, "Zeynep Kaya")
    .getByRole("button", { name: "Zeynep Kaya is absent" })
    .click();
  await expect(figure(page, "Missing")).toHaveText("1");
  await expect(figure(page, "Not yet called")).toHaveText("2");

  // A floor at once: the other one on Floor 2, and the rest of Blok B.
  await page
    .getByRole("button", { name: "Mark the other one present" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mark the other one present" })
    .first()
    .click();
  await expect(figure(page, "Present")).toHaveText("3");
  await expect(figure(page, "Not yet called")).toHaveText("0");
  await expect(
    page.getByRole("button", { name: /Mark the other/ }),
  ).toHaveCount(0);

  // What was said is kept, and a correction is another answer above it. The
  // screen answers before the server has, so the reload waits for the server.
  await expect
    .poll(() => calledCount(yurt.propertyId), { timeout: 60_000 })
    .toBe("4");
  await page.reload();
  await expect(figure(page, "Present")).toHaveText("3");
  await expect(figure(page, "Missing")).toHaveText("1");
  await whenHydrated(page.getByRole("button", { name: /is present$/ }).first());
  await row(page, "Zeynep Kaya")
    .getByRole("button", { name: "Zeynep Kaya is present" })
    .click();
  await expect(figure(page, "Missing")).toHaveText("0");
  await expect(figure(page, "Present")).toHaveText("4");
  await expect
    .poll(() => marksOf(yurt.propertyId, "Zeynep Kaya"))
    .toBe("absent,present");

  // A figure opens the rows it counts.
  await figure(page, "Present").click();
  await expect(page.locator("[data-roll-row]")).toHaveCount(4);
  await figure(page, "Missing").click();
  await expect(page.locator("[data-roll-row]")).toHaveCount(0);
  await expect(page.getByText("Nobody matches.")).toBeVisible();
});

test("the keyboard walks the rows: P and A answer and move on", async ({
  page,
}) => {
  const yurt = aYurt("roll call keys");
  await openRollCall(page, yurt.propertyId);

  await page.locator("[data-roll-row]").first().focus();
  await page.keyboard.press("p");
  await expect(page.locator("[data-roll-row]").first()).toHaveAttribute(
    "data-status",
    "present",
  );
  // Focus has moved to the next row, which A marks absent.
  await page.keyboard.press("a");
  await expect(page.locator("[data-roll-row]").nth(1)).toHaveAttribute(
    "data-status",
    "absent",
  );
  // Focus is on the third row now; one step back is the second, corrected.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("p");
  await expect(page.locator("[data-roll-row]").nth(1)).toHaveAttribute(
    "data-status",
    "present",
  );
  await expect(figure(page, "Present")).toHaveText("2");
});

test("leave is given from the row, keeps the person off the roll, and is cancelled in one press", async ({
  page,
}) => {
  const yurt = aYurt("leave");
  await openRollCall(page, yurt.propertyId);

  await row(page, "Zeynep Kaya")
    .getByRole("button", { name: "Give Zeynep Kaya leave" })
    .click();
  const dialog = page.getByRole("dialog");
  // Opened on the row's person and on tonight alone: only a reason is missing.
  await expect(dialog.getByText("Zeynep Kaya").first()).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Give leave" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Why?").fill("Weekend with family");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toBeHidden();

  const zeynep = row(page, "Zeynep Kaya");
  await expect(zeynep).toHaveAttribute("data-status", "on_leave");
  await expect(zeynep).toContainText("On leave through");
  await expect(zeynep).toContainText("Weekend with family");
  // Not markable: there is nothing to press for present or absent.
  await expect(
    zeynep.getByRole("button", { name: /is (present|absent)$/ }),
  ).toHaveCount(0);
  await expect(figure(page, "On leave")).toHaveText("1");
  await expect(figure(page, "Not yet called")).toHaveText("3");
  await expect(
    page.getByRole("heading", { name: "Leave", exact: true }),
  ).toBeVisible();

  // A leave that begins tonight is cancelled; one that has begun is ended.
  await zeynep
    .getByRole("button", { name: "Cancel leave for Zeynep Kaya" })
    .click();
  await expect(zeynep).toHaveAttribute("data-status", "not_called");
  await expect(figure(page, "On leave")).toHaveText("0");
  expect(
    psql(
      `select status from public.attendance_leaves
        where property_id = '${yurt.propertyId}'`,
    ),
  ).toBe("cancelled");

  // From the toolbar it asks who first.
  await page.getByRole("button", { name: "Give leave", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Who is going?").first(),
  ).toBeVisible();
});

test("the curfew is said, changed by whoever configures, and decides what 'not yet called' means", async ({
  page,
}) => {
  const yurt = aYurt("curfew");
  await openRollCall(page, yurt.propertyId);

  // A dormitory starts with the application's default, said to be one.
  await expect(page.getByText("Curfew 23:00 · default")).toBeVisible();
  await expect(page.getByText("after curfew")).toHaveCount(0);

  await page.getByRole("button", { name: /Curfew 23:00/ }).click();
  await page.getByLabel("Time").fill("11:00");
  await page.getByRole("button", { name: "Save" }).click();
  // It is midday at this Property, so 11:00 has passed: whoever is not yet
  // called is now the number to chase.
  await expect(
    page.getByText("Curfew 11:00 · Curfew has passed"),
  ).toBeVisible();
  await expect(page.getByText("after curfew")).toBeVisible();

  await page.getByRole("button", { name: /Curfew 11:00/ }).click();
  await page.getByRole("button", { name: "No curfew" }).click();
  await expect(page.getByText("No curfew").first()).toBeVisible();
  await expect(page.getByText("after curfew")).toHaveCount(0);
});

test("a Property without the capability offers no roll call, and a front desk that has it is offered one", async ({
  page,
}) => {
  const without = aFreshProperty("no roll call", {
    capabilities: ["front_desk"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${without.propertyId}'`,
  );
  const withIt = aYurt("desk");

  await page.goto(`/en/close-day?property=${without.propertyId}`);
  await expect(
    page.getByRole("link", { name: "Roll call", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/en/roll-call?property=${without.propertyId}`);
  await expect(page.getByText("Tonight,")).toHaveCount(0);

  await page.goto(`/en/close-day?property=${withIt.propertyId}`);
  await expect(
    page.getByRole("link", { name: "Roll call", exact: true }).first(),
  ).toBeVisible();

  // The shipped front desk role holds both permissions.
  psql(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     select '${withIt.propertyId}', property.organization_id, member.id
       from public.properties as property, public.users as member
      where property.id = '${withIt.propertyId}'
        and lower(member.email) = lower('${DESK_EMAIL}')
     on conflict do nothing`,
  );
  await page.context().clearCookies();
  await signIn(page, DESK_EMAIL);
  await openRollCall(page, withIt.propertyId);
  await expect(figure(page, "In house")).toHaveText("4");
});

test("the roll call in Turkish, English and Arabic, at desktop and tablet width", async ({
  page,
}) => {
  const yurt = aYurt("roll call languages");
  psql(
    `insert into public.attendance_settings (property_id, organization_id, curfew_time)
     select id, organization_id, '11:00' from public.properties
      where id = '${yurt.propertyId}'`,
  );
  await openRollCall(page, yurt.propertyId);
  await row(page, "Elif Yılmaz").getByText("A-101 · A").click();
  await row(page, "Zeynep Kaya")
    .getByRole("button", { name: "Zeynep Kaya is absent" })
    .click();
  await expect(figure(page, "Missing")).toHaveText("1");

  for (const locale of ["tr", "en", "ar"] as const) {
    for (const [name, size] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["tablet", { width: 820, height: 1180 }],
    ] as const) {
      await page.setViewportSize(size);
      await page.goto(`/${locale}/roll-call?property=${yurt.propertyId}`);
      await expect(page.locator("[data-roll-row]").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await page.screenshot({
        path: path.join(EVIDENCE, `${locale}-${name}-roll-call.png`),
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/${locale}/roll-call?property=${yurt.propertyId}`);
    await whenHydrated(page.locator("[data-roll-row] button").first());
    await page.locator("[data-roll-row] button[title]").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE, `${locale}-desktop-give-leave.png`),
    });
    await page.keyboard.press("Escape");
  }
});
