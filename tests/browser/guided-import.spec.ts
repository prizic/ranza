import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

import { PASSWORD, signIn } from "./front-desk";
import { test } from "./hydration";
import { psql } from "./local-database";

/**
 * Guided import of rooms and of the people in them, through the screen an
 * owner uses on their first day (blueprint 19.1, ADR 0065).
 *
 * The pgTAP suite proves who may stage, start and settle an import, and the
 * integration suite proves each room is added by accommodation's own command.
 * This proves what neither can see: that a file chosen in a browser reaches
 * the preview, that the preview says what will happen before anything is
 * written, that pressing Import adds the rooms and says so, that the file of
 * rows to fix goes back in as it came out, and what somebody who may not
 * import, or may import and not book, finds.
 *
 * Each run brings its own Organization, so it needs nothing the seed makes.
 * An import is a record and is never deleted, so these accumulate, as every
 * other suite's rows do.
 */
const SUFFIX = randomUUID().slice(0, 8);
const OWNER_EMAIL = `e2e-import-owner-${SUFFIX}@example.test`;
const DESK_EMAIL = `e2e-import-desk-${SUFFIX}@example.test`;
const IMPORT_ONLY_EMAIL = `e2e-import-only-${SUFFIX}@example.test`;
const ORGANIZATION = randomUUID();
const PROPERTY = randomUUID();
const SECOND_PROPERTY = randomUUID();
const PEOPLE_PROPERTY = randomUUID();

const HEADINGS = "Building,Floor,Room,Type,Sleeps,Let by the bed,Admits";

function csv(name: string, lines: string[]) {
  return {
    name,
    mimeType: "text/csv",
    buffer: Buffer.from([...lines, ""].join("\n"), "utf8"),
  };
}

function roomsAt(propertyId: string): string {
  return psql(
    `select coalesce(string_agg(building || '/' || name, ',' order by name), '')
       from public.accommodation_units
      where property_id = '${propertyId}' and parent_id is null`,
  );
}

async function upload(
  page: Page,
  propertyId: string,
  file: ReturnType<typeof csv> | string,
): Promise<void> {
  await page.goto(`/en/import?property=${propertyId}`);
  await page.getByLabel("File").setInputFiles(file);
  await page.getByRole("button", { name: "Preview" }).click();
}

test.beforeAll(async ({ playwright, baseURL }) => {
  // Made the way `db:seed:dev` makes a Staff Member: through the application's
  // own sign-up route, because the provider-subject mapping belongs to it
  // (ADR 0005).
  for (const email of [OWNER_EMAIL, DESK_EMAIL, IMPORT_ONLY_EMAIL]) {
    const request = await playwright.request.newContext({ baseURL });
    const signedUp = await request.post("/api/auth/sign-up/email", {
      headers: { origin: new URL("/", baseURL).origin },
      data: { email, password: PASSWORD, name: email },
    });
    expect(signedUp.ok(), `could not sign up ${email}`).toBe(true);
    await request.get("/en/today");
    await request.dispose();
  }

  psql(
    `with org as (
       insert into public.organizations (id, name, status)
       values ('${ORGANIZATION}', 'E2E Import ${SUFFIX}', 'active') returning id
     ), sub as (
       insert into public.subscriptions (organization_id, status)
       select id, 'active' from org
     ), ent as (
       insert into public.entitlements (organization_id, module_key)
       select id, 'front_office' from org
     ), prop as (
       insert into public.properties (id, organization_id, name)
       select property.id, org.id, property.name
         from org, (values
           ('${PROPERTY}'::uuid, 'E2E Import Property ${SUFFIX}'),
           ('${SECOND_PROPERTY}'::uuid, 'E2E Import Empty ${SUFFIX}')
         ) as property (id, name)
     ), caps as (
       insert into public.property_capabilities (property_id, organization_id, capability_key, enabled)
       select property.id, org.id, 'front_desk', true
         from org, (values ('${PROPERTY}'::uuid), ('${SECOND_PROPERTY}'::uuid)) as property (id)
     ), made_role as (
       insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
       select org.id, role.key, org.id, role.name, role.permissions
         from org, (values
           ('desk_only', 'Desk only',
            array['front_desk.book', 'accommodation.configure']),
           ('import_only', 'Import only', array['import.run'])
         ) as role (key, name, permissions)
     )
     insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     select org.id, person.id,
            case person.email when '${OWNER_EMAIL}' then 'owner'
                              when '${DESK_EMAIL}' then 'desk_only'
                              else 'import_only' end,
            case when person.email = '${OWNER_EMAIL}'
                 then '00000000-0000-0000-0000-000000000000'::uuid else org.id end,
            'organization_wide'
       from org, public.users as person
      where person.email in ('${OWNER_EMAIL}', '${DESK_EMAIL}', '${IMPORT_ONLY_EMAIL}')`,
  );
  // A dormitory whose rooms are already in: a women's room let by the bed
  // and a room let whole, the way the rooms import leaves them.
  psql(
    `with prop as (
       insert into public.properties (id, organization_id, name, operating_model)
       values ('${PEOPLE_PROPERTY}', '${ORGANIZATION}',
               'E2E Import People ${SUFFIX}', 'dormitory')
       returning id, organization_id
     ), caps as (
       insert into public.property_capabilities (property_id, organization_id, capability_key, enabled)
       select id, organization_id, 'front_desk', true from prop
     ), room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, admits)
       select id, organization_id, '101', 'room', 2, 'female' from prop
       returning id, property_id, organization_id
     ), whole as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '102', 'room', 2 from prop
     )
     insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, parent_id)
     select property_id, organization_id, bed, 'bed', 1, room.id
       from room cross join unnest(array['A', 'B']) as bed`,
  );
});

test("IMP-S1-23: a manager uploads rooms, sees every row before anything is written, and imports the ready ones", async ({
  page,
}, testInfo) => {
  await signIn(page, OWNER_EMAIL, null);
  await page.goto(`/en/import?property=${PROPERTY}`);

  // IMP-S1-28: nothing imported yet says so and says what to do.
  await expect(
    page.getByRole("heading", { name: "Nothing has been imported here yet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download the template" }),
  ).toBeVisible();

  await upload(
    page,
    PROPERTY,
    csv(`rooms-${SUFFIX}.csv`, [
      HEADINGS,
      "A,1,101,Room,2,No,",
      "A,1,102,Room,4,Yes,Women",
      "A,2,201,Suite,2,,",
      "A,2,20B,Room,2,,",
      "A,1,101,Room,2,,",
    ]),
  );

  // The preview: the address names the import, and nothing is written yet.
  await expect(page).toHaveURL(/record=[0-9a-f-]{36}/);
  await expect(page.getByText("Previewed, not imported")).toBeVisible();
  await expect(page.getByText("3 rows ready")).toBeVisible();
  await expect(page.getByText("2 rows to fix")).toBeVisible();
  expect(roomsAt(PROPERTY), "a preview added a room").toBe("");

  // The rows to fix come first, each with the cell and the reason.
  const rows = page.getByRole("row");
  await expect(rows.nth(1)).toContainText("20B");
  await expect(rows.nth(1)).toContainText(
    "Room: A room number is one to eight digits.",
  );
  await expect(rows.nth(2)).toContainText(
    "Room: This room is already on an earlier row of the file.",
  );

  // The button names how many rooms it adds.
  await page.getByRole("button", { name: "Import 3 rooms" }).click();
  await expect(page.getByText("This import is finished.")).toBeVisible();
  await expect(page.getByText("3 imported")).toBeVisible();
  expect(roomsAt(PROPERTY)).toBe("A/101,A/102,A/201");

  // IMP-S1-25: the result is a file, and the rows to fix go back in as they
  // came out.
  const resultDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the result" }).click();
  const result = await resultDownload;
  expect(result.suggestedFilename()).toBe("import-result.xlsx");
  expect((await readFile(await result.path())).byteLength).toBeGreaterThan(0);

  const fixDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the rows to fix" }).click();
  const fix = await fixDownload;
  expect(fix.suggestedFilename()).toBe("rows-to-fix.xlsx");

  // Saved under its own name, as a person's browser saves it: the reader
  // goes by the extension.
  const saved = testInfo.outputPath(fix.suggestedFilename());
  await fix.saveAs(saved);
  await upload(page, PROPERTY, saved);
  await expect(page.getByText("1 row to fix")).toBeVisible();
  await expect(page.getByText("1 already here")).toBeVisible();
  await expect(
    page.getByText("No row is ready to import.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import \d/ })).toHaveCount(0);

  // The way up from an import is the list of them, and the list names both.
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/import\\?property=${PROPERTY}$`),
  );
  await expect(page.getByText("Past imports")).toBeVisible();
  const first = page
    .getByRole("row")
    .filter({ hasText: `rooms-${SUFFIX}.csv` });
  await expect(first).toContainText("You");
  await expect(first).toContainText("Finished");
  await expect(first).toContainText("3 imported");
});

test("IMP-S1-17: a heading nobody recognises is asked about, and answered once", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL, null);
  await upload(
    page,
    PROPERTY,
    csv(`doors-${SUFFIX}.csv`, ["Door,Sleeps", "301,2", "302,3"]),
  );

  await expect(
    page.getByRole("group", { name: "Which column is which?" }),
  ).toBeVisible();
  // What the headings did say is already filled in.
  await expect(page.getByRole("combobox", { name: /Sleeps/ })).toContainText(
    "Sleeps",
  );
  await page.getByRole("combobox", { name: /Room/ }).click();
  await page.getByRole("option", { name: "Door" }).click();
  await page
    .getByRole("button", { name: "Preview with these columns" })
    .click();

  await expect(page.getByText("2 rows ready")).toBeVisible();
  await page.getByRole("button", { name: "Discard this preview" }).click();
  await expect(
    page.getByText("This preview was discarded. Nothing was added."),
  ).toBeVisible();
  expect(roomsAt(PROPERTY)).not.toContain("301");
});

test("IMP-S1-18: a file that cannot be an import is refused with its own reason", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL, null);

  await page.goto(`/en/import?property=${PROPERTY}`);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Choose a file first.")).toBeVisible();

  await upload(page, PROPERTY, {
    name: "rooms.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "That is not an Excel or CSV file.",
  );

  await upload(page, PROPERTY, csv("headings-only.csv", [HEADINGS]));
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "That file has headings and no rows under them.",
  );

  // Said by the browser before the file travels: over the action's own limit
  // it would fail in transit with an error nobody can read.
  await upload(page, PROPERTY, {
    name: "huge.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, "a"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "That file is over 2 MB.",
  );
});

test("IMP-S1-24: Rooms offers the import, and somebody who may not import finds no way in", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL, null);
  // An empty Property offers it in the empty state, beside Add rooms.
  await page.goto(`/en/rooms?property=${SECOND_PROPERTY}`);
  await page.getByRole("link", { name: "Import from a file" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/import\\?property=${SECOND_PROPERTY}`),
  );
  await expect(
    page.getByRole("heading", { name: "Import", exact: true }),
  ).toBeVisible();

  // A link that names no import of this Property says so.
  await page.goto(
    `/en/import?property=${SECOND_PROPERTY}&record=${randomUUID()}`,
  );
  await expect(
    page.getByRole("heading", { name: "That import is not here" }),
  ).toBeVisible();

  // The desk may add rooms by hand and may not import them.
  await page.context().clearCookies();
  await signIn(page, DESK_EMAIL, null);
  await page.goto(`/en/rooms?property=${SECOND_PROPERTY}`);
  await expect(
    page.getByRole("button", { name: "Add rooms" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Import from a file" }),
  ).toHaveCount(0);
  await page.goto(`/en/import?property=${SECOND_PROPERTY}`);
  await expect(page.getByLabel("File")).toHaveCount(0);
  // The refusal names the permission in words and offers a way on.
  await expect(page.getByRole("main")).toContainText(
    "Import needs “Import from a file”, and your role doesn't include it.",
  );
  await expect(
    page.getByRole("main").getByRole("link", { name: /^Go to / }),
  ).toBeVisible();
});

test("IMP-S1-27: the import page reads in Arabic and mirrors, and in Turkish", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL, null);
  await page.goto(`/ar/import?property=${PROPERTY}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "الاستيراد", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(
    /Upload a file|Preview/,
  );

  await page.goto(`/tr/import?property=${PROPERTY}`);
  await expect(
    page.getByRole("heading", { name: "İçe aktarma", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(
    /Upload a file|Preview/,
  );
});

/** The People Property's today moved by `days`, as a person types it. */
function typedDay(days: number): string {
  return psql(
    `select to_char(app.property_today('${PEOPLE_PROPERTY}') + ${days}, 'DD.MM.YYYY')`,
  );
}

function bookingsOn(room: string, bed: string | null): string {
  return psql(
    `select count(*)::text
       from public.reservations as reservation
       join public.accommodation_units as unit
         on unit.id = reservation.accommodation_unit_id
       left join public.accommodation_units as room on room.id = unit.parent_id
      where unit.property_id = '${PEOPLE_PROPERTY}'
        and coalesce(room.name, unit.name) = '${room}'
        and ${bed === null ? "unit.parent_id is null" : `unit.name = '${bed}'`}`,
  );
}

test("IMP-S2-01: an owner imports people into the rooms already there, and is led to Registrations", async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL, null);
  await page.goto(`/en/import?property=${PEOPLE_PROPERTY}&kind=people`);

  // The kind named in the link is the one open, and says what it will do.
  await expect(page.getByRole("tab", { name: "People" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByText("Each row registers one person into a room or bed."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download the template" }),
  ).toHaveAttribute("href", /kind=people/);

  await page
    .getByLabel("File")
    .setInputFiles(
      csv(`people-${SUFFIX}.csv`, [
        "Full name,Gender,Room,Bed,First night,Leaving",
        `Elif Yılmaz,Woman,101,A,${typedDay(1)},`,
        `Ali Demir,Man,101,B,${typedDay(1)},`,
      ]),
    );
  await page.getByRole("button", { name: "Preview" }).click();

  await expect(page).toHaveURL(/record=[0-9a-f-]{36}/);
  await expect(page.getByText("1 row ready")).toBeVisible();
  await expect(page.getByText("1 row to fix")).toBeVisible();
  // IMP-S2-04: the reason names the cell and what to do.
  await expect(page.getByRole("row").nth(1)).toContainText(
    "Gender: This room admits the other gender. Choose another room or bed.",
  );
  expect(bookingsOn("101", "A"), "a preview booked somebody").toBe("0");

  // On a phone the cells scroll sideways; why a row is wrong stays in view.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("Gender: This room admits the other gender."),
  ).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("button", { name: "Import 1 person" }).click();
  await expect(page.getByText("This import is finished.")).toBeVisible();
  await expect(page.getByText("1 imported")).toBeVisible();
  expect(bookingsOn("101", "A")).toBe("1");
  expect(bookingsOn("101", "B")).toBe("0");

  // What an import of people made lives in Reservations, which a dormitory
  // calls Registrations, as its rail does (ADR 0057).
  await page.getByRole("link", { name: "Open Registrations" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/reservations\\?property=${PEOPLE_PROPERTY}`),
  );
});

test("IMP-S2-07: somebody who may import and may not book finds why, and rooms still open", async ({
  page,
}) => {
  await signIn(page, IMPORT_ONLY_EMAIL, null);
  await page.goto(`/en/import?property=${PEOPLE_PROPERTY}&kind=people`);
  await expect(page.getByRole("main")).toContainText(
    "Importing people registers them, so it needs the permission to take registrations at this Property.",
  );
  await expect(page.getByLabel("File")).toHaveCount(0);

  await page.getByRole("tab", { name: "Rooms and beds" }).click();
  await expect(page.getByLabel("File")).toBeVisible();
});
