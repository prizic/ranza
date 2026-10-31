import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { devices, expect, type Browser, type Page } from "@playwright/test";
import { test } from "./hydration";

import { formatMoney } from "../../packages/i18n/src";
import { messages as portalMessages } from "../../apps/guest-portal/src/messages";
import { messages as workspaceMessages } from "../../apps/operator-workspace/src/messages";
import { dormitoryWords } from "../../apps/operator-workspace/src/words/dormitory";
import { withOverlay } from "../../apps/operator-workspace/src/words/overlay";
import { aFreshProperty } from "./fresh-property";
import { OWNER_EMAIL, PASSWORD } from "./front-desk";
import { psql } from "./local-database";
import { PORTAL_URL, signInToThePortal } from "./portal";

/**
 * A desk gives a student the Portal, and the student takes it (RANZ-87,
 * GP-S2-*, GP-S3-*, GP-S4-*).
 *
 * pgTAP proves each boundary of the link; the integration suite proves the
 * module around it; the unit suites prove each state of the booking sheet. This
 * proves the journey only two running applications have: the desk presses one
 * button on a registration and gets a link and a QR code, the student opens it
 * on a phone, makes an account, and lands on My stay with the bed, the term and
 * what they owe, in all three languages, the Arabic mirrored. When the booking
 * is then put on a payment plan with an instalment unpaid, the page tells them
 * so in words, and the warning edge sits on the side the language reads from.
 */

const EVIDENCE = path.resolve(
  __dirname,
  "../../docs/evidence/yurt-portal-access",
);

const PHONE = {
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
};

type Locale = "en" | "tr" | "ar";

const deskWords = (locale: Locale) =>
  withOverlay(workspaceMessages[locale], dormitoryWords[locale]);

/** A dormitory with the Portal on, finance on, and nothing in it yet. */
function aYurt(label: string) {
  const yurt = aFreshProperty(label, {
    capabilities: ["front_desk", "finance", "portal_stay_overview"],
  });
  psql(
    `update public.properties set operating_model = 'dormitory'
      where id = '${yurt.propertyId}'`,
  );
  // The Portal and the balance are each a module of the Subscription.
  psql(
    `insert into public.entitlements (organization_id, module_key)
     select organization_id, module_key
       from public.properties
       cross join (values ('front_office'), ('billing_folios')) as modules (module_key)
      where id = '${yurt.propertyId}'
     on conflict (organization_id, module_key) do update set status = 'active'`,
  );
  return yurt;
}

interface Student {
  name: string;
  email: string;
  room: string;
  bed: string;
  booking: string;
  guest: string;
}

/**
 * A student registered for the term and not yet in the building: a Guest, and a
 * confirmed booking on a bed of a room, which is how a dormitory's move-in week
 * begins. They have no Stay, so there is nothing yet for the Portal to show.
 */
function aRegisteredStudent(propertyId: string, name: string): Student {
  const tag = randomUUID().slice(0, 6);
  const room = `R-${tag}`;
  const email = `student-${tag}@example.test`;
  const [guest, booking] = psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, building, floor)
       select id, organization_id, '${room}', 'room', 2, 'Block B', 3 from target
       returning id
     ), bed as (
       insert into public.accommodation_units
         (property_id, organization_id, parent_id, parent_unit_type, name, unit_type, capacity)
       select target.id, target.organization_id, room.id, 'room', 'B', 'bed', 1
         from target, room
       returning id
     ), guest as (
       insert into public.guests (organization_id, full_name, email)
       select organization_id, '${name} ${tag}', '${email}' from target
       returning id
     ), booking as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select target.organization_id, target.id, bed.id, guest.id, 'resident',
              'confirmed', app.property_today(target.id),
              app.property_today(target.id) + 270
         from target, bed, guest
       returning id
     )
     select guest.id || ' ' || booking.id from guest, booking`,
  ).split(" ");
  return {
    name: `${name} ${tag}`,
    email,
    room,
    bed: "B",
    booking,
    guest,
  };
}

/**
 * The desk checks the student in: the booking is checked in and its Stay exists,
 * which is one fact, with the Folio the Property's finance opens and a term fee
 * and a part-payment on it.
 */
function checkedIn(propertyId: string, student: Student): void {
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), booking as (
       update public.reservations set status = 'checked_in'
        where id = '${student.booking}'
       returning id, organization_id, property_id, accommodation_unit_id,
                 starts_on, ends_on
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'resident', 'in_house', starts_on, ends_on
         from booking
       returning id, organization_id, property_id
     ), folio as (
       insert into public.folios (organization_id, property_id, stay_id, currency)
       select organization_id, property_id, id, 'TRY' from stay
       returning id, organization_id, property_id
     )
     insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, payment_method)
     select organization_id, property_id, id, 'charge', 'Term fee', 4500000, null
       from folio
     union all
     select organization_id, property_id, id, 'payment', 'First instalment',
            -1500000, 'bank_transfer'
       from folio`,
  );
}

async function openTheRegistration(
  page: Page,
  propertyId: string,
  student: Student,
  locale: Locale,
): Promise<ReturnType<Page["getByRole"]>> {
  await page.goto(`/${locale}/reservations?property=${propertyId}`);
  await page.getByRole("searchbox").fill(student.name);
  const row = page.getByRole("row").filter({ hasText: student.name });
  await row.getByText(student.room).click();
  const sheet = page.getByRole("dialog", {
    name: deskWords(locale).reservationDetails,
  });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * The desk signs in through the auth route and not through the sign-in page:
 * the page lands on Today, whose first read is slow against a database as full
 * as a developer's, and nothing this spec asserts is about Today.
 */
async function signInAsTheDesk(page: Page): Promise<void> {
  const origin = test.info().project.use.baseURL;
  const response = await page
    .context()
    .request.post("/api/auth/sign-in/email", {
      data: { email: OWNER_EMAIL, password: PASSWORD },
      headers: { origin: origin ?? "" },
    });
  expect(
    response.ok(),
    `the desk could not sign in: ${response.status()}`,
  ).toBe(true);
}

/**
 * The booking is put on a payment plan of three instalments of 1 500 000, the
 * term having begun two months ago so that one can have fallen due. The
 * 1 500 000 paid at check-in covers the first (payments settle the oldest
 * first), so the next is the second. Instalments are never edited once
 * written, so the plan is made with its dates in place: `dueDays` is each one's
 * distance from today, and by default the second fell due ten days ago and is
 * unpaid.
 */
function onAPaymentPlan(
  student: Student,
  dueDays: readonly [number, number, number] = [-40, -10, 30],
): void {
  psql(
    `update public.reservations
        set starts_on = app.property_today(property_id) - 60
      where id = '${student.booking}'`,
  );
  psql(
    `update public.stays
        set starts_on = app.property_today(property_id) - 60
      where reservation_id = '${student.booking}'`,
  );
  psql(
    `with plan as (
       insert into public.payment_plans
         (organization_id, property_id, reservation_id, currency, created_by)
       select reservation.organization_id, reservation.property_id, reservation.id,
              'TRY', staff.id
         from public.reservations as reservation, public.users as staff
        where reservation.id = '${student.booking}'
          and staff.email = '${OWNER_EMAIL}'
       returning id, organization_id, property_id
     )
     insert into public.plan_instalments
       (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
     select plan.organization_id, plan.property_id, plan.id, due.ordinal, 1500000,
            app.property_today(plan.property_id) + due.days, 1
       from plan
      cross join (values (1, ${dueDays[0]}), (2, ${dueDays[1]}), (3, ${dueDays[2]})) as due (ordinal, days)`,
  );
}

/**
 * A student who already has a login of their own, made through the Portal's
 * sign-up route as the invitation would, and whose Stay is theirs. The
 * invitation journey is proved above; this is the shortest road to a student
 * the Portal knows, for the screens that only need one.
 */
async function aStudentWhoHasTheirLogin(
  browser: Browser,
  propertyId: string,
  name: string,
): Promise<Student> {
  const student = aRegisteredStudent(propertyId, name);
  // A context of its own, so the session the sign-up makes is nobody's cookie.
  const maker = await browser.newContext();
  const signedUp = await maker.request.post(
    `${PORTAL_URL}/api/auth/sign-up/email`,
    {
      headers: { origin: PORTAL_URL },
      data: { email: student.email, password: PASSWORD, name: student.name },
    },
  );
  expect(
    signedUp.ok(),
    `could not sign up ${student.email}: ${signedUp.status()}`,
  ).toBe(true);
  // The first authenticated request is what maps the login onto a Ranza user.
  await expect
    .poll(
      async () => {
        await maker.request.get(`${PORTAL_URL}/en/stay`);
        return psql(
          `select count(*) from public.users where lower(email) = lower('${student.email}')`,
        );
      },
      { timeout: 60_000 },
    )
    .toBe("1");
  await maker.close();
  checkedIn(propertyId, student);
  psql(
    `update public.stays
        set user_id = (select id from public.users where lower(email) = lower('${student.email}'))
      where reservation_id = '${student.booking}'`,
  );
  return student;
}

async function aPhone(browser: Browser, locale: Locale) {
  const context = await browser.newContext({
    ...PHONE,
    locale: { ar: "ar", en: "en-GB", tr: "tr-TR" }[locale],
  });
  return { context, page: await context.newPage() };
}

/** Next's development badge is drawn over a screenshot's corner and is not the product. */
const WITHOUT_DEV_BADGE = {
  style: "nextjs-portal { display: none !important }",
};

const LANGUAGES: readonly Locale[] = ["en", "tr", "ar"];

for (const locale of LANGUAGES) {
  test(`a desk invites a student from the registration, and the student takes the Portal on a phone, in ${locale}`, async ({
    browser,
    page,
  }) => {
    const words = deskWords(locale).portalInvite;
    const portal = portalMessages[locale];
    const yurt = aYurt(`portal invite ${locale}`);
    const student = aRegisteredStudent(yurt.propertyId, "Zeynep");

    await signInAsTheDesk(page);
    const sheet = await openTheRegistration(
      page,
      yurt.propertyId,
      student,
      locale,
    );

    // One press, where the desk is already looking.
    await expect(sheet.getByText(words.title)).toBeVisible();
    await sheet.getByRole("button", { name: words.invite }).click();
    const link = await sheet.getByTestId("portal-invitation-link").inputValue();
    expect(link).toMatch(
      new RegExp(`^${PORTAL_URL}/invite/[A-Za-z0-9_-]{43}$`),
    );
    await expect(sheet.getByTestId("portal-invitation-qr")).toBeVisible();
    await expect(sheet.getByRole("button", { name: words.copy })).toBeVisible();
    // The new link is brought into view without the desk scrolling to it.
    await expect(sheet.getByTestId("portal-invitation-qr")).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({
      path: path.join(EVIDENCE, `${locale}-desk-invite.png`),
      ...WITHOUT_DEV_BADGE,
    });
    if (locale === "ar") {
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }

    // The token is the credential: the database holds its digest and nothing else.
    const token = link.split("/invite/")[1]!;
    const digest = createHash("sha256").update(token).digest("hex");
    expect(
      psql(
        `select count(*) from public.guest_portal_invitations
          where guest_id = '${student.guest}' and token_hash = '${digest}'`,
      ),
    ).toBe("1");
    expect(
      psql(
        `select count(*) from public.guest_portal_invitations
          where guest_id = '${student.guest}' and token_hash = '${token}'`,
      ),
    ).toBe("0");

    // The student opens it on a phone and makes an account in one step. The
    // link names no language, so the Portal asks the phone for one.
    const phone = await aPhone(browser, locale);
    await phone.page.goto(link);
    await expect(phone.page).toHaveURL(new RegExp(`/${locale}/invite/`));
    await expect(
      phone.page.getByRole("heading", {
        name: portal.invite.welcome.replace("{name}", student.name),
      }),
    ).toBeVisible();
    // The address the desk has is a suggestion, filled in and theirs to change.
    await expect(phone.page.getByLabel(portal.email)).toHaveValue(
      student.email,
    );
    await phone.page.screenshot({
      path: path.join(EVIDENCE, `${locale}-invite-phone.png`),
      ...WITHOUT_DEV_BADGE,
    });
    if (locale === "ar") {
      await expect(phone.page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    // Every control the student presses is a touch target (GP-S4-08).
    for (const name of [
      portal.invite.createSubmit,
      portal.invite.haveAccount,
      portal.showPassword,
    ]) {
      const box = await phone.page.getByRole("button", { name }).boundingBox();
      expect(Math.round(box!.height), name).toBeGreaterThanOrEqual(44);
    }
    await phone.page
      .getByLabel(portal.password, { exact: true })
      .fill(PASSWORD);
    await phone.page
      .getByRole("button", { name: portal.invite.createSubmit })
      .click();

    // Registered but not yet in the building: nothing is wrong, and nothing is
    // shown. A cold development server compiles the sign-up, the acceptance
    // and the stay page in turn, each the first time it is asked.
    await expect(phone.page).toHaveURL(new RegExp(`/${locale}/stay$`), {
      timeout: 90_000,
    });
    await expect(phone.page.getByText(portal.noStayTitle)).toBeVisible();
    // The token stayed in the address from the first view to the last: nothing
    // kept it, so no cookie can carry it past the visit (GP-S3-12).
    for (const cookie of await phone.context.cookies()) {
      expect(`${cookie.name}=${cookie.value}`).not.toContain(token);
    }

    // The desk checks them in; the Stay is theirs from the moment it exists.
    checkedIn(yurt.propertyId, student);
    await phone.page.reload();
    await expect(phone.page.getByTestId("stay-balance-figure")).toBeVisible();
    await expect(
      phone.page.getByRole("heading", { name: student.room }),
    ).toBeVisible();
    await expect(
      phone.page.getByText(portal.myStay.bed.replace("{name}", "B")),
    ).toBeVisible();
    await expect(phone.page.getByText(/Block B/)).toBeVisible();
    await expect(
      phone.page.getByText(portal.myStay.floor.replace("{floor}", "3")),
    ).toBeVisible();
    await expect(phone.page.getByTestId("stay-balance-figure")).toHaveText(
      formatMoney(3_000_000, "TRY", locale),
    );
    await expect(phone.page.getByTestId("stay-balance")).toContainText(
      portal.myStay.owed,
    );
    // No plan, so no instalment: nothing is drawn in its place (GP-S4-20).
    await expect(phone.page.getByTestId("stay-instalment")).toHaveCount(0);
    if (locale === "ar") {
      await expect(phone.page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    await phone.page.screenshot({
      path: path.join(EVIDENCE, `${locale}-stay-phone.png`),
      fullPage: true,
      ...WITHOUT_DEV_BADGE,
    });

    // The booking goes onto a payment plan with the second instalment unpaid
    // and late: the card says so, in words, and tells them what to do.
    onAPaymentPlan(student);
    await phone.page.reload();
    const instalment = phone.page.getByTestId("stay-instalment");
    await expect(instalment).toBeVisible();
    await expect(instalment).toHaveAttribute("data-state", "overdue");
    await expect(instalment).toContainText(portal.myStay.instalment.heading);
    await expect(instalment).toContainText(
      portal.myStay.instalment.position
        .replace("{number}", "2")
        .replace("{total}", "3"),
    );
    await expect(phone.page.getByTestId("stay-instalment-amount")).toHaveText(
      formatMoney(1_500_000, "TRY", locale),
    );
    await expect(instalment).toContainText(
      portal.myStay.instalment.overdueNote,
    );
    // The edge that marks it late is on the side the language starts from.
    const edge = await instalment.evaluate((card) => {
      const style = getComputedStyle(card);
      return {
        start: style.getPropertyValue(
          document.documentElement.dir === "rtl"
            ? "border-right-width"
            : "border-left-width",
        ),
        end: style.getPropertyValue(
          document.documentElement.dir === "rtl"
            ? "border-left-width"
            : "border-right-width",
        ),
      };
    });
    expect(edge.start).toBe("4px");
    expect(edge.end).toBe("1px");
    // The card is a block of the page and does not push it sideways on a phone.
    const box = await instalment.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.viewport.width);
    // The dates of Arrival and of Departure start on one line, whichever of
    // them wrapped.
    const [arrival, departure] = await Promise.all(
      [0, 1].map((index) =>
        phone.page.locator("dl time").nth(index).boundingBox(),
      ),
    );
    expect(Math.round(arrival!.y)).toBe(Math.round(departure!.y));
    // Scrolled to the end of the page, nothing of the card is left under the
    // navigation bar that floats over the bottom of a phone's screen.
    await phone.page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const bar = phone.page.getByRole("navigation", {
      name: portal.mainNavigation,
    });
    await expect(bar).toBeVisible();
    const [card, nav] = await Promise.all([
      instalment.boundingBox(),
      bar.boundingBox(),
    ]);
    expect(card!.y + card!.height).toBeLessThanOrEqual(nav!.y);
    await phone.page.screenshot({
      path: path.join(EVIDENCE, `${locale}-stay-instalment-phone.png`),
      ...WITHOUT_DEV_BADGE,
    });
    if (locale === "en") {
      // A link works once.
      const stranger = await aPhone(browser, locale);
      await stranger.page.goto(link);
      await expect(
        stranger.page.getByText(portal.invite.refused.used.title),
      ).toBeVisible();
      await stranger.context.close();

      // And the desk now reads that they are connected.
      await page.keyboard.press("Escape");
      const again = await openTheRegistration(
        page,
        yurt.propertyId,
        student,
        locale,
      );
      await expect(again.getByTestId("portal-invitation-state")).toContainText(
        words.connected.split("{date}")[0]!,
      );
      await expect(
        again.getByRole("button", { name: words.invite }),
      ).toHaveCount(0);
    }
    await phone.context.close();
  });
}

/** The day an instalment falls due, as the page writes it in `datetime`. */
function dayFromToday(propertyId: string, days: number): string {
  return psql(
    `select to_char(app.property_today('${propertyId}') + ${days}, 'YYYY-MM-DD')`,
  );
}

for (const locale of LANGUAGES) {
  test(`a student on a payment plan reads the next instalment as upcoming, and as due today, on a phone, in ${locale}`, async ({
    browser,
  }) => {
    const portal = portalMessages[locale];
    const yurt = aYurt(`portal instalment ${locale}`);

    for (const [state, dueDays, dueIn] of [
      ["upcoming", [-40, 20, 50], 20],
      ["due", [-40, 0, 30], 0],
    ] as const) {
      const student = await aStudentWhoHasTheirLogin(
        browser,
        yurt.propertyId,
        state,
      );
      onAPaymentPlan(student, dueDays);

      const phone = await aPhone(browser, locale);
      await signInToThePortal(phone.page, student.email, "en");
      await phone.page.goto(`${PORTAL_URL}/${locale}/stay`);

      const instalment = phone.page.getByTestId("stay-instalment");
      await expect(instalment).toBeVisible();
      await expect(instalment).toHaveAttribute("data-state", state);
      await expect(instalment).toContainText(portal.myStay.instalment.heading);
      await expect(instalment).toContainText(
        portal.myStay.instalment.position
          .replace("{number}", "2")
          .replace("{total}", "3"),
      );
      await expect(phone.page.getByTestId("stay-instalment-amount")).toHaveText(
        formatMoney(1_500_000, "TRY", locale),
      );
      await expect(instalment.locator("time")).toHaveAttribute(
        "datetime",
        dayFromToday(yurt.propertyId, dueIn),
      );
      if (state === "due") {
        await expect(instalment).toContainText(
          portal.myStay.instalment.dueToday,
        );
      }
      // Neither is late: no warning, in words or in the edge.
      await expect(instalment).not.toContainText(
        portal.myStay.instalment.overdueNote,
      );
      const edges = await instalment.evaluate((card) => {
        const style = getComputedStyle(card);
        return [
          style.borderLeftWidth,
          style.borderRightWidth,
          style.borderLeftColor,
        ];
      });
      expect(edges.slice(0, 2)).toEqual(["1px", "1px"]);
      if (locale === "ar") {
        await expect(phone.page.locator("html")).toHaveAttribute("dir", "rtl");
      }
      await phone.page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      await phone.page.screenshot({
        path: path.join(
          EVIDENCE,
          `${locale}-stay-instalment-${state}-phone.png`,
        ),
        ...WITHOUT_DEV_BADGE,
      });
      await phone.context.close();
    }
  });
}

/** The same link in English, for a phone that has since been shown another language. */
const inEnglish = (link: string) => link.replace("/invite/", "/en/invite/");

/** A link the desk made for a student, read off the sheet. */
async function linkFor(
  page: Page,
  propertyId: string,
  student: Student,
  button: string,
): Promise<string> {
  const sheet = await openTheRegistration(page, propertyId, student, "en");
  await sheet.getByRole("button", { name: button }).click();
  return sheet.getByTestId("portal-invitation-link").inputValue();
}

test("a link that does not work says why, in the student's language, and an account belongs to one student", async ({
  browser,
  page,
}) => {
  const words = deskWords("en").portalInvite;
  const yurt = aYurt("portal refusals");
  const first = aRegisteredStudent(yurt.propertyId, "Ada");
  const second = aRegisteredStudent(yurt.propertyId, "Bora");
  await signInAsTheDesk(page);

  // A link nobody made.
  const phone = await aPhone(browser, "en");
  await phone.page.goto(`${PORTAL_URL}/en/invite/${"x".repeat(43)}`);
  await expect(
    phone.page.getByRole("heading", {
      name: portalMessages.en.invite.refused.unknown.title,
    }),
  ).toBeVisible();

  // A link the desk replaced: the earlier one is said to be replaced, and the
  // sheet says the same of it.
  const earlier = await linkFor(page, yurt.propertyId, first, words.invite);
  await page.keyboard.press("Escape");
  const replaced = await linkFor(page, yurt.propertyId, first, words.newLink);
  await expect(page.getByText(words.replaced, { exact: false })).toBeVisible();
  expect(replaced).not.toBe(earlier);
  await phone.page.goto(earlier);
  await expect(
    phone.page.getByText(portalMessages.en.invite.refused.revoked.title),
  ).toBeVisible();
  for (const [locale, text] of [
    ["tr", portalMessages.tr.invite.refused.revoked.title],
    ["ar", portalMessages.ar.invite.refused.revoked.title],
  ] as const) {
    await phone.page.goto(earlier.replace("/invite/", `/${locale}/invite/`));
    await expect(phone.page.getByText(text)).toBeVisible();
    await phone.page.screenshot({
      path: path.join(EVIDENCE, `${locale}-link-replaced-phone.png`),
      ...WITHOUT_DEV_BADGE,
    });
  }
  await expect(phone.page.locator("html")).toHaveAttribute("dir", "rtl");

  // A link whose time has run out: all of the Guest's links are moved back
  // together, so the one that was replaced is still the older of the two.
  psql(
    `update public.guest_portal_invitations
        set created_at = created_at - interval '20 days',
            expires_at = expires_at - interval '20 days'
      where guest_id = '${first.guest}'`,
  );
  await phone.page.goto(inEnglish(replaced));
  await expect(
    phone.page.getByText(portalMessages.en.invite.refused.expired.title),
  ).toBeVisible();

  // The desk reads it as expired and offers a new one.
  await page.keyboard.press("Escape");
  const sheet = await openTheRegistration(page, yurt.propertyId, first, "en");
  await expect(sheet.getByTestId("portal-invitation-state")).toContainText(
    words.expired.split("{date}")[0]!,
  );
  await sheet.getByRole("button", { name: words.newLink }).click();
  const fresh = await sheet.getByTestId("portal-invitation-link").inputValue();

  // The first student takes it with a new account...
  await phone.page.goto(inEnglish(fresh));
  await phone.page
    .getByLabel(portalMessages.en.password, { exact: true })
    .fill(PASSWORD);
  await phone.page
    .getByRole("button", { name: portalMessages.en.invite.createSubmit })
    .click();
  await expect(phone.page).toHaveURL(/\/en\/stay$/, { timeout: 90_000 });

  // ...and that account is then offered a second student's link. It is shown
  // whose stay the link opens and which account is about to be connected, and
  // an account belongs to one person, so it is refused in words.
  await page.keyboard.press("Escape");
  const secondLink = await linkFor(page, yurt.propertyId, second, words.invite);
  await phone.page.goto(inEnglish(secondLink));
  await expect(
    phone.page.getByRole("heading", {
      name: portalMessages.en.invite.connectTitle,
    }),
  ).toBeVisible();
  await expect(phone.page.getByText(second.name)).toBeVisible();
  await expect(phone.page.getByText(first.email)).toBeVisible();
  await phone.page
    .getByRole("button", { name: portalMessages.en.invite.connect })
    .click();
  await expect(
    phone.page.getByText(portalMessages.en.invite.refused.another_guest.title),
  ).toBeVisible();
  // Nothing was given to the wrong account.
  expect(
    psql(
      `select count(*) from public.guest_portal_invitations
        where guest_id = '${second.guest}' and status = 'accepted'`,
    ),
  ).toBe("0");
  await phone.context.close();
});
