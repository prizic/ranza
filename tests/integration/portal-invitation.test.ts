/**
 * A student gets the Portal by a link, through the module (RANZ-87, GP-S2-*,
 * GP-S3-*, GP-S4-*).
 *
 * tests/database/guest_portal_invitation.test.sql proves every boundary one
 * statement at a time. This proves what only the module adds: the token is made
 * here and only its digest reaches the table, the desk's answers arrive as the
 * words the screen says, a refusal on the student's side arrives as an outcome
 * and not an exception, and the Portal's own read comes back with the room and
 * the balance a student sees.
 *
 * An Organization of this file's own; its people and rooms are idempotent.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  PortalInvitationRefusedError,
  createStaysModule,
} from "../../packages/ranza/stays/src";

const ORG = "d8700002-0000-4000-8000-000000000001";
const NO_PORTAL_ORG = "d8700002-0000-4000-8000-000000000002";
const DESK = "d8700001-0000-4000-8000-000000000001";
const HOUSEKEEPER = "d8700001-0000-4000-8000-000000000002";
// Accounts of each run's own: an account belongs to one Guest of an
// Organization, so a fixed one would be refused on the second run.
const STUDENT = randomUUID();
const OTHER_STUDENT = randomUUID();
const INSTALMENT_STUDENT = randomUUID();
const NO_PORTAL_MANAGER = "d8700001-0000-4000-8000-000000000005";
const PROPERTY = randomUUID();
const NO_PORTAL_PROPERTY = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const stays = createStaysModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** A booking, with the Stay on a bed and a Folio, for one new Guest. */
async function registerStudent(
  property: string,
  organization: string,
  roomName: string,
  withFolio: boolean,
) {
  const room = randomUUID();
  const bed = randomUUID();
  const guest = randomUUID();
  const booking = randomUUID();
  const stay = randomUUID();
  const email = `zeynep-${guest}@example.test`;
  // A checked-in booking and its in-house Stay are one fact, checked at commit.
  await owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity, building, floor)
       values ($1::uuid, $2::uuid, $3::uuid, $4, 'room', 2, 'Block B', 3)`,
      room,
      property,
      organization,
      roomName,
    );
    await tx.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, parent_id, parent_unit_type, name, unit_type, capacity)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'room', 'B', 'bed', 1)`,
      bed,
      property,
      organization,
      room,
    );
    await tx.$executeRawUnsafe(
      `insert into public.guests (id, organization_id, full_name, email)
       values ($1::uuid, $2::uuid, 'Zeynep Öğrenci', $3)`,
      guest,
      organization,
      email,
    );
    await tx.$executeRawUnsafe(
      `insert into public.reservations
         (id, organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'resident',
              'checked_in', app.property_today($3::uuid), app.property_today($3::uuid) + 270`,
      booking,
      organization,
      property,
      bed,
      guest,
    );
    await tx.$executeRawUnsafe(
      `insert into public.stays
         (id, organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'resident',
              'in_house', app.property_today($3::uuid), app.property_today($3::uuid) + 270`,
      stay,
      organization,
      property,
      bed,
      booking,
    );
    if (withFolio) {
      const folio = randomUUID();
      await tx.$executeRawUnsafe(
        `insert into public.folios (id, organization_id, property_id, stay_id, currency)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'TRY')`,
        folio,
        organization,
        property,
        stay,
      );
      await tx.$executeRawUnsafe(
        `insert into public.folio_lines
           (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
         values ($1::uuid, $2::uuid, $3::uuid, 'charge', 'Term fee', 4500000, null),
                ($1::uuid, $2::uuid, $3::uuid, 'payment', 'First instalment', -1500000, 'bank_transfer')`,
        organization,
        property,
        folio,
      );
    }
  });
  return { guest, booking, stay, email };
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'portal-invite-desk@example.test'),
       ($2, 'portal-invite-housekeeper@example.test'),
       ($3, 'portal-invite-no-portal@example.test')
     on conflict (id) do nothing`,
    DESK,
    HOUSEKEEPER,
    NO_PORTAL_MANAGER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1::uuid, 'portal-invite-student-' || $1 || '@example.test'),
       ($2::uuid, 'portal-invite-other-student-' || $2 || '@example.test'),
       ($3::uuid, 'portal-invite-instalment-student-' || $3 || '@example.test')`,
    STUDENT,
    OTHER_STUDENT,
    INSTALMENT_STUDENT,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1, 'Portal Invitation Organization', 'active'),
       ($2, 'Portal Invitation Without Portal', 'active')
     on conflict (id) do nothing`,
    ORG,
    NO_PORTAL_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active'), ($2, 'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
    NO_PORTAL_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'front_office', 'active'), ($1, 'billing_folios', 'active'),
            ($2, 'front_office', 'active')
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
    NO_PORTAL_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'front_desk', 'organization_wide'),
            ($1, $3, 'housekeeping', 'organization_wide'),
            ($4, $5, 'manager', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    DESK,
    HOUSEKEEPER,
    NO_PORTAL_ORG,
    NO_PORTAL_MANAGER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, operating_model)
     values ($1, $2, $3, 'dormitory'), ($4, $5, $6, 'dormitory')`,
    PROPERTY,
    ORG,
    `Portal Invitation ${PROPERTY.slice(0, 8)}`,
    NO_PORTAL_PROPERTY,
    NO_PORTAL_ORG,
    `No Portal ${NO_PORTAL_PROPERTY.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true), ($1, $2, 'portal_stay_overview', true),
            ($1, $2, 'finance', true), ($3, $4, 'front_desk', true)`,
    PROPERTY,
    ORG,
    NO_PORTAL_PROPERTY,
    NO_PORTAL_ORG,
  );
});

afterAll(async () => {
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("the desk invites a student from their booking", () => {
  it("makes a token that is kept nowhere, and a link that names whose it is", async () => {
    const { booking, guest, email } = await registerStudent(
      PROPERTY,
      ORG,
      "Room 201",
      true,
    );

    const before = await stays.overview(DESK, booking);
    expect(before).toMatchObject({
      guestId: guest,
      availability: "available",
      standing: "none",
    });

    const issued = await stays.invite(DESK, booking);
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.replacedEarlier).toBe(false);
    const days =
      (Date.parse(issued.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);

    const stored = await owner.$queryRawUnsafe<{ token_hash: string }[]>(
      `select token_hash from public.guest_portal_invitations where guest_id = $1::uuid`,
      guest,
    );
    expect(stored.map((row) => row.token_hash)).toEqual([sha256(issued.token)]);
    expect(stored.map((row) => row.token_hash)).not.toContain(issued.token);

    expect(await stays.overview(DESK, booking)).toMatchObject({
      standing: "waiting",
      expiresAt: issued.expiresAt,
    });
    expect(await stays.link(issued.token)).toEqual({
      state: "pending",
      organizationName: "Portal Invitation Organization",
      guestName: "Zeynep Öğrenci",
      guestEmail: email,
    });
  });

  it("withdraws the earlier link when it makes another", async () => {
    const { booking } = await registerStudent(PROPERTY, ORG, "Room 202", false);
    const first = await stays.invite(DESK, booking);
    const second = await stays.invite(DESK, booking);

    expect(second.replacedEarlier).toBe(true);
    expect((await stays.link(first.token))?.state).toBe("revoked");
    expect((await stays.link(second.token))?.state).toBe("pending");
    expect((await stays.overview(DESK, booking))?.standing).toBe("waiting");
  });

  it("withdraws the live link by hand, and says when there was none", async () => {
    const { booking } = await registerStudent(PROPERTY, ORG, "Room 203", false);
    const issued = await stays.invite(DESK, booking);

    expect(await stays.withdraw(DESK, booking)).toBe(true);
    expect((await stays.link(issued.token))?.state).toBe("revoked");
    expect((await stays.overview(DESK, booking))?.standing).toBe("withdrawn");
    expect(await stays.withdraw(DESK, booking)).toBe(false);
  });

  it("refuses whoever may not, and says nothing is offered to them", async () => {
    const { booking } = await registerStudent(PROPERTY, ORG, "Room 204", false);

    await expect(stays.invite(HOUSEKEEPER, booking)).rejects.toMatchObject({
      name: "PortalInvitationRefusedError",
      reason: "not_allowed",
    });
    await expect(stays.withdraw(HOUSEKEEPER, booking)).rejects.toBeInstanceOf(
      PortalInvitationRefusedError,
    );
    expect(await stays.overview(HOUSEKEEPER, booking)).toMatchObject({
      availability: "not_permitted",
      standing: "none",
    });
  });

  it("says the Portal is off to a Staff Member who could otherwise invite", async () => {
    const { booking } = await registerStudent(
      NO_PORTAL_PROPERTY,
      NO_PORTAL_ORG,
      "Room 1",
      false,
    );

    expect(await stays.overview(NO_PORTAL_MANAGER, booking)).toMatchObject({
      availability: "portal_off",
    });
    await expect(
      stays.invite(NO_PORTAL_MANAGER, booking),
    ).rejects.toMatchObject({ reason: "not_allowed" });
  });
});

describe("the student opens the link", () => {
  it("is given the Guest's own Stay, and then sees the room, the term and the balance", async () => {
    const { booking, stay } = await registerStudent(
      PROPERTY,
      ORG,
      "Room 205",
      true,
    );
    const issued = await stays.invite(DESK, booking);

    expect(await stays.listOwnStays(STUDENT)).toEqual([]);

    const accepted = await stays.accept(STUDENT, issued.token);
    expect(accepted).toEqual({ outcome: "accepted", linkedStays: 1 });

    const own = await stays.listOwnStays(STUDENT);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      stayId: stay,
      status: "in_house",
      unitName: "B",
      roomName: "Room 205",
      building: "Block B",
      floor: 3,
      balance: { currency: "TRY", amountMinor: "3000000", folioStatus: "open" },
      nextInstalment: null,
    });
    expect(own[0]!.endsOn).not.toBeNull();

    expect((await stays.overview(DESK, booking))?.standing).toBe("connected");
    await expect(stays.invite(DESK, booking)).rejects.toMatchObject({
      reason: "already_connected",
    });
  });

  it("is told the next instalment of their own plan, late as the standing says, and the neighbour's is not theirs", async () => {
    const mine = await registerStudent(PROPERTY, ORG, "Room 207", true);
    const neighbours = await registerStudent(PROPERTY, ORG, "Room 208", true);
    // A term that began two months ago, so an instalment can have fallen due.
    for (const student of [mine, neighbours]) {
      await owner.$executeRawUnsafe(
        `update public.reservations set starts_on = app.property_today(property_id) - 60
          where id = $1::uuid`,
        student.booking,
      );
      await owner.$executeRawUnsafe(
        `update public.stays set starts_on = app.property_today(property_id) - 60
          where id = $1::uuid`,
        student.stay,
      );
      await owner.$executeRawUnsafe(
        `insert into public.payment_plans
           (organization_id, property_id, reservation_id, currency, created_by)
         values ($1::uuid, $2::uuid, $3::uuid, 'TRY', $4::uuid)`,
        ORG,
        PROPERTY,
        student.booking,
        DESK,
      );
    }
    // The first fell due forty days ago and the 1 500 000 paid covers it, the
    // second ten days ago and is not paid, the third is still to come. The
    // neighbour's single instalment is later and larger.
    for (const [booking, ordinal, amount, days] of [
      [mine.booking, 1, 1500000, -40],
      [mine.booking, 2, 1500000, -10],
      [mine.booking, 3, 1500000, 30],
      [neighbours.booking, 1, 9900000, 40],
    ] as const) {
      await owner.$executeRawUnsafe(
        `insert into public.plan_instalments
           (organization_id, property_id, plan_id, ordinal, amount_minor, due_on, revision)
         select $1::uuid, $2::uuid, plan.id, $4::int, $5::bigint,
                app.property_today($2::uuid) + $6::int, 1
           from public.payment_plans as plan
          where plan.reservation_id = $3::uuid`,
        ORG,
        PROPERTY,
        booking,
        ordinal,
        amount,
        days,
      );
    }
    const dueOn = (
      await owner.$queryRawUnsafe<{ day: string }[]>(
        `select to_char(app.property_today($1::uuid) - 10, 'YYYY-MM-DD') as day`,
        PROPERTY,
      )
    )[0]!.day;

    const issued = await stays.invite(DESK, mine.booking);
    expect((await stays.accept(INSTALMENT_STUDENT, issued.token)).outcome).toBe(
      "accepted",
    );
    const own = await stays.listOwnStays(INSTALMENT_STUDENT);

    expect(own).toHaveLength(1);
    expect(own[0]!.nextInstalment).toEqual({
      currency: "TRY",
      number: 2,
      of: 3,
      dueOn,
      outstandingMinor: "1500000",
      state: "overdue",
      overdueCount: 1,
      overdueMinor: "1500000",
    });
    // The balance and the instalment are two reads of one Folio: the term fee
    // less the payment, and the plan's own standing.
    expect(own[0]!.balance?.amountMinor).toBe("3000000");
  });

  it("tells a used, withdrawn, unknown or malformed link apart", async () => {
    const { booking } = await registerStudent(PROPERTY, ORG, "Room 206", false);
    const first = await stays.invite(DESK, booking);
    const second = await stays.invite(DESK, booking);

    expect(await stays.accept(OTHER_STUDENT, first.token)).toEqual({
      outcome: "revoked",
      linkedStays: 0,
    });
    await stays.accept(OTHER_STUDENT, second.token);
    expect((await stays.accept(STUDENT, second.token)).outcome).toBe("used");
    expect(
      (
        await stays.accept(
          STUDENT,
          randomUUID().replaceAll("-", "").padEnd(43, "x"),
        )
      ).outcome,
    ).toBe("unknown");
    expect((await stays.accept(STUDENT, "short")).outcome).toBe("unknown");
    expect(await stays.link("short")).toBeNull();
  });

  it("refuses an account that already belongs to another Guest of the Organization", async () => {
    const { booking: first } = await registerStudent(
      PROPERTY,
      ORG,
      "Room 217",
      false,
    );
    const { booking: second } = await registerStudent(
      PROPERTY,
      ORG,
      "Room 218",
      false,
    );
    const earlier = await stays.invite(DESK, first);
    const later = await stays.invite(DESK, second);

    const claimant = randomUUID();
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, $2)`,
      claimant,
      `portal-claimant-${claimant}@example.test`,
    );
    expect((await stays.accept(claimant, earlier.token)).outcome).toBe(
      "accepted",
    );
    expect((await stays.accept(claimant, later.token)).outcome).toBe(
      "another_guest",
    );
    expect((await stays.listOwnStays(claimant)).length).toBe(1);
  });

  it("reads an expired link as expired, with nothing having run", async () => {
    const { booking, guest } = await registerStudent(
      PROPERTY,
      ORG,
      "Room 209",
      false,
    );
    const issued = await stays.invite(DESK, booking);
    await owner.$executeRawUnsafe(
      `update public.guest_portal_invitations
          set created_at = now() - interval '15 days',
              expires_at = now() - interval '1 day'
        where guest_id = $1::uuid`,
      guest,
    );

    expect((await stays.link(issued.token))?.state).toBe("expired");
    expect((await stays.overview(DESK, booking))?.standing).toBe("expired");
    expect((await stays.accept(OTHER_STUDENT, issued.token)).outcome).toBe(
      "expired",
    );
  });
});
