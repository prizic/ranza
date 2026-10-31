/**
 * A Resident pays by instalments, against a real database (PP-S1, ADR 0059).
 *
 * The functions, triggers and policies are proved in
 * `tests/database/payment_plans.test.sql`. This proves the module that calls
 * them and the poster that runs them as the worker: that a plan is made, read
 * and revised by the people the database says may, that every refusal reaches
 * the caller as an error it can word, that each act is recorded, and that one
 * Property failing does not stop the next from being charged.
 *
 * A pass asks which Properties have an instalment ready across every
 * Organization, as the worker does, so it also charges whatever another suite
 * left due. Every assertion here is about this suite's own Properties, which
 * are new on every run.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  createInstalmentPoster,
  createPaymentPlansModule,
  InstalmentAfterTermError,
  PaymentPlanInputError,
  PaymentPlanNotAllowedError,
  PaymentPlanRefusedError,
  PlanExistsError,
} from "../../packages/ranza/payment-plans/src";
import { createReservationsModule } from "../../packages/ranza/reservations/src";
import { latestRecord } from "./audit-record";

const app = createPrismaClient(process.env.DATABASE_URL!);
const worker = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const plans = createPaymentPlansModule({ db: app });
const reservations = createReservationsModule({ db: app });
const poster = createInstalmentPoster({ db: worker });

const ORG = randomUUID();
const DESK = randomUUID();
const FINANCE = randomUUID();
const GUEST = randomUUID();

beforeAll(async () => {
  for (const [id, label] of [
    [DESK, "desk"],
    [FINANCE, "finance"],
  ] as const) {
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, 'plans-' || $2 || '-' || $1 || '@example.test')`,
      id,
      label,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, 'Payment Plans Organization', 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1::uuid, 'active')`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key)
     values ($1::uuid, 'platform_core'), ($1::uuid, 'front_office'),
            ($1::uuid, 'billing_folios')`,
    ORG,
  );
  for (const [id, role] of [
    [DESK, "front_desk"],
    [FINANCE, "finance"],
  ] as const) {
    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, access_scope)
       values ($1::uuid, $2::uuid, $3, 'organization_wide')`,
      ORG,
      id,
      role,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.guests (id, organization_id, full_name)
     values ($1::uuid, $2::uuid, 'Plan Resident')`,
    GUEST,
    ORG,
  );
});

afterAll(async () => {
  await Promise.all([
    app.$disconnect(),
    worker.$disconnect(),
    owner.$disconnect(),
  ]);
});

async function aProperty(): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1::uuid, $2::uuid, 'Payment Plans ' || $1::text)`,
    id,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1::uuid, $2::uuid, 'front_desk', true),
            ($1::uuid, $2::uuid, 'finance', true)`,
    id,
    ORG,
  );
  return id;
}

async function day(propertyId: string, offset: number): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select to_char(app.property_today($1::uuid) + $2::int, 'YYYY-MM-DD') as day`,
    propertyId,
    offset,
  );
  return row!.day;
}

interface Booking {
  reservationId: string;
  folioId: string | null;
}

/**
 * A booking of a Guest or a Resident at the Property, from 30 days ago to 120
 * days on (or open-ended), with a Stay and an open Folio when it is in house.
 */
async function booking(
  propertyId: string,
  options: {
    stayType?: "resident" | "guest";
    openEnded?: boolean;
    inHouse?: boolean;
  } = {},
): Promise<Booking> {
  const { stayType = "resident", openEnded = false, inHouse = true } = options;
  const unitId = randomUUID();
  const reservationId = randomUUID();
  const starts = await day(propertyId, inHouse ? -30 : 5);
  const ends = openEnded ? null : await day(propertyId, 120);

  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1::uuid, $2::uuid, $3::uuid, 'PP-' || left($1::text, 8), 'room', 1)`,
    unitId,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.reservations
       (id, organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7,
             $8::date, $9::date)`,
    reservationId,
    ORG,
    propertyId,
    unitId,
    GUEST,
    stayType,
    "confirmed",
    starts,
    ends,
  );
  if (!inHouse) return { reservationId, folioId: null };
  return { reservationId, folioId: await arrive(reservationId) };
}

async function threeInstalments(propertyId: string) {
  return [
    { amountMinor: 100_000, dueOn: await day(propertyId, -1) },
    { amountMinor: 100_000, dueOn: await day(propertyId, 0) },
    { amountMinor: 100_000, dueOn: await day(propertyId, 30) },
  ];
}

/**
 * The Resident turns up: a Stay, the booking checked in, and a Folio to charge.
 * One transaction, because a booking and its Stay may only disagree inside one.
 */
async function arrive(reservationId: string): Promise<string> {
  const stayId = randomUUID();
  const folioId = randomUUID();
  await owner.$transaction([
    owner.$executeRawUnsafe(
      `insert into public.stays
         (id, organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, organization_id, property_id, accommodation_unit_id, id,
              stay_type, 'in_house', starts_on, ends_on
         from public.reservations where id = $2::uuid`,
      stayId,
      reservationId,
    ),
    owner.$executeRawUnsafe(
      `update public.reservations set status = 'checked_in' where id = $1::uuid`,
      reservationId,
    ),
    owner.$executeRawUnsafe(
      `insert into public.folios (id, organization_id, property_id, stay_id, currency)
       select $1::uuid, organization_id, property_id, id, 'TRY'
         from public.stays where id = $2::uuid`,
      folioId,
      stayId,
    ),
  ]);
  return folioId;
}

async function chargedTo(folioId: string) {
  return owner.$queryRawUnsafe<
    { description: string; amount: string; businessDate: string }[]
  >(
    `select description, amount_minor::text as amount,
            to_char(business_date, 'YYYY-MM-DD') as "businessDate"
       from public.folio_lines
      where folio_id = $1::uuid and source = 'instalment'
      order by business_date`,
    folioId,
  );
}

describe("making a plan", () => {
  it("the desk makes one, it reads back with where each instalment stands, and it is recorded", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property);

    const { planId } = await plans.createPaymentPlan(
      DESK,
      reservationId,
      await threeInstalments(property),
    );

    const plan = await plans.readPaymentPlan(DESK, reservationId);
    expect(plan).toMatchObject({
      planId,
      reservationId,
      propertyId: property,
      currency: "TRY",
      revision: 1,
      totalMinor: 300_000,
      paidMinor: 0,
      outstandingMinor: 300_000,
    });
    expect(plan?.instalments.map((i) => [i.number, i.state, i.posted])).toEqual(
      [
        [1, "overdue", false],
        [2, "due", false],
        [3, "upcoming", false],
      ],
    );

    const record = await latestRecord(owner, "payment_plan.created", planId);
    expect(record).toMatchObject({
      locationId: property,
      context: {
        reservationId,
        instalments: 3,
        totalMinor: 300_000,
        currency: "TRY",
      },
    });
  });

  it("a booking with no plan reads as none", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property);

    expect(await plans.readPaymentPlan(DESK, reservationId)).toBeNull();
  });

  it("each refusal reaches the caller as an error it can word", async () => {
    const property = await aProperty();
    const one = [{ amountMinor: 1_000, dueOn: await day(property, 10) }];

    const guest = await booking(property, { stayType: "guest" });
    await expect(
      plans.createPaymentPlan(DESK, guest.reservationId, one),
    ).rejects.toMatchObject({
      reason: "not_a_resident",
      name: PaymentPlanNotAllowedError.name,
    });

    const open = await booking(property, { openEnded: true });
    await expect(
      plans.createPaymentPlan(DESK, open.reservationId, one),
    ).rejects.toMatchObject({ reason: "no_departure_date" });

    const resident = await booking(property);
    await expect(
      plans.createPaymentPlan(DESK, resident.reservationId, [
        { amountMinor: 1_000, dueOn: await day(property, 121) },
      ]),
    ).rejects.toBeInstanceOf(InstalmentAfterTermError);

    await plans.createPaymentPlan(DESK, resident.reservationId, one);
    await expect(
      plans.createPaymentPlan(DESK, resident.reservationId, one),
    ).rejects.toBeInstanceOf(PlanExistsError);
  });

  it("a schedule that is not one is refused before it reaches the database", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property);
    const due = await day(property, 10);

    await expect(
      plans.createPaymentPlan(DESK, reservationId, []),
    ).rejects.toMatchObject({ field: "instalments" });
    await expect(
      plans.createPaymentPlan(DESK, reservationId, [
        { amountMinor: 0, dueOn: due },
      ]),
    ).rejects.toMatchObject({ field: "amount" });
    await expect(
      plans.createPaymentPlan(DESK, reservationId, [
        { amountMinor: 10.5, dueOn: due },
      ]),
    ).rejects.toBeInstanceOf(PaymentPlanInputError);
    await expect(
      plans.createPaymentPlan(DESK, reservationId, [
        { amountMinor: 1_000, dueOn: "2026-02-30" },
      ]),
    ).rejects.toMatchObject({ field: "dueOn" });
  });

  it("finance holds no front_desk.book, so it makes no plan", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property);

    await expect(
      plans.createPaymentPlan(FINANCE, reservationId, [
        { amountMinor: 1_000, dueOn: await day(property, 10) },
      ]),
    ).rejects.toBeInstanceOf(PaymentPlanRefusedError);
    expect(await plans.readPaymentPlan(DESK, reservationId)).toBeNull();
  });

  it("a plan the database refuses rolls back with the transaction it was made in", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property, { openEnded: true });

    await expect(
      withOrganizationContext(app, { userId: DESK }, async (tx) => {
        await plans.createPaymentPlanWithin(tx, DESK, reservationId, [
          { amountMinor: 1_000, dueOn: await day(property, 10) },
        ]);
      }),
    ).rejects.toBeInstanceOf(PaymentPlanNotAllowedError);

    const [row] = await owner.$queryRawUnsafe<{ count: number }[]>(
      `select count(*)::int as count from public.payment_plans where reservation_id = $1::uuid`,
      reservationId,
    );
    expect(row?.count).toBe(0);
  });
});

/**
 * Registering a Resident for a term with the plan they pay it by (PP-S2-05).
 *
 * The dialog's act is one transaction: `createReservation` runs the plan in the
 * booking's own transaction through its `alongside` step, so a plan the
 * database refuses leaves no booking behind and nobody is told a registration
 * came with a plan it did not.
 */
describe("a booking and its plan are one act", () => {
  async function bookableUnit(propertyId: string): Promise<string> {
    const unitId = randomUUID();
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity)
       values ($1::uuid, $2::uuid, $3::uuid, 'PP-' || left($1::text, 8), 'room', 1)`,
      unitId,
      propertyId,
      ORG,
    );
    return unitId;
  }

  async function register(
    propertyId: string,
    unitId: string,
    schedule: { amountMinor: number; dueOn: string }[],
  ) {
    return reservations.createReservation(
      DESK,
      {
        propertyId,
        accommodationUnitId: unitId,
        guestName: "Registered With A Plan",
        guestEmail: null,
        guestPhone: null,
        stayType: "resident",
        startsOn: await day(propertyId, 5),
        endsOn: await day(propertyId, 95),
        quotedRateMinor: null,
        quotedCurrency: null,
      },
      (tx, { reservationId }) =>
        plans
          .createPaymentPlanWithin(tx, DESK, reservationId, schedule)
          .then(() => undefined),
    );
  }

  const bookingsOf = async (unitId: string) =>
    (
      await owner.$queryRawUnsafe<{ count: number }[]>(
        `select count(*)::int as count from public.reservations
          where accommodation_unit_id = $1::uuid`,
        unitId,
      )
    )[0]?.count;

  it("registering a Resident makes the booking and its plan together, and records both", async () => {
    const property = await aProperty();
    const unit = await bookableUnit(property);
    const schedule = [
      { amountMinor: 250_001, dueOn: await day(property, 5) },
      { amountMinor: 250_000, dueOn: await day(property, 35) },
    ];

    const { reservationId } = await register(property, unit, schedule);

    const plan = await plans.readPaymentPlan(DESK, reservationId);
    expect(
      plan?.instalments.map((i) => [i.number, i.amountMinor, i.dueOn]),
    ).toEqual(
      schedule.map((item, index) => [index + 1, item.amountMinor, item.dueOn]),
    );
    const made = await latestRecord(
      owner,
      "payment_plan.created",
      plan!.planId,
    );
    expect(made).toMatchObject({
      locationId: property,
      context: { reservationId, instalments: 2, totalMinor: 500_001 },
    });
    expect(
      await latestRecord(owner, "reservation.created", reservationId),
    ).toMatchObject({ locationId: property });
  });

  it("a plan the database refuses leaves no booking behind", async () => {
    const property = await aProperty();
    const unit = await bookableUnit(property);

    await expect(
      register(property, unit, [
        { amountMinor: 1_000, dueOn: await day(property, 96) },
      ]),
    ).rejects.toBeInstanceOf(InstalmentAfterTermError);

    expect(await bookingsOf(unit)).toBe(0);
  });

  it("a Property that keeps no Folios refuses the plan, and so the booking", async () => {
    const property = await aProperty();
    await owner.$executeRawUnsafe(
      `update public.property_capabilities set enabled = false
        where property_id = $1::uuid and capability_key = 'finance'`,
      property,
    );
    const unit = await bookableUnit(property);

    await expect(
      register(property, unit, [
        { amountMinor: 1_000, dueOn: await day(property, 10) },
      ]),
    ).rejects.toBeInstanceOf(PaymentPlanNotAllowedError);

    expect(await bookingsOf(unit)).toBe(0);
  });

  it("a Guest's booking takes no plan and is not made", async () => {
    const property = await aProperty();
    const unit = await bookableUnit(property);
    const due = await day(property, 10);

    await expect(
      reservations.createReservation(
        DESK,
        {
          propertyId: property,
          accommodationUnitId: unit,
          guestName: "A Summer Guest",
          guestEmail: null,
          guestPhone: null,
          stayType: "guest",
          startsOn: await day(property, 5),
          endsOn: await day(property, 15),
          quotedRateMinor: null,
          quotedCurrency: null,
        },
        (tx, { reservationId }) =>
          plans
            .createPaymentPlanWithin(tx, DESK, reservationId, [
              { amountMinor: 1_000, dueOn: due },
            ])
            .then(() => undefined),
      ),
    ).rejects.toBeInstanceOf(PaymentPlanNotAllowedError);

    expect(await bookingsOf(unit)).toBe(0);
  });
});

describe("whether a plan is offered", () => {
  it("the desk is offered one in the Property's currency; finance, which may not book, is not", async () => {
    const property = await aProperty();
    expect(await plans.planOffer(DESK, property)).toEqual({ currency: "TRY" });
    expect(await plans.planOffer(FINANCE, property)).toBeNull();
  });

  it("a Property that keeps no Folios, one with no front desk, and one nobody can reach, offer none", async () => {
    const noFolios = await aProperty();
    await owner.$executeRawUnsafe(
      `update public.property_capabilities set enabled = false
        where property_id = $1::uuid and capability_key = 'finance'`,
      noFolios,
    );
    expect(await plans.planOffer(DESK, noFolios)).toBeNull();

    // Reachable and billing, but nothing to book into: the desk is not offered
    // what its own booking could not be made with.
    const noDesk = await aProperty();
    await owner.$executeRawUnsafe(
      `update public.property_capabilities set enabled = false
        where property_id = $1::uuid and capability_key = 'front_desk'`,
      noDesk,
    );
    expect(await plans.planOffer(DESK, noDesk)).toBeNull();

    expect(await plans.planOffer(randomUUID(), await aProperty())).toBeNull();
  });
});

describe("revising a plan", () => {
  it("finance revises what was not charged, with a reason, and it is recorded", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property);
    const { planId } = await plans.createPaymentPlan(
      DESK,
      reservationId,
      await threeInstalments(property),
    );

    const outcome = await plans.revisePaymentPlan(
      FINANCE,
      reservationId,
      [
        { amountMinor: 150_000, dueOn: await day(property, 5) },
        { amountMinor: 150_000, dueOn: await day(property, 35) },
      ],
      "  The family asked for two payments instead of three.  ",
    );
    expect(outcome).toEqual({ revision: 2 });

    const plan = await plans.readPaymentPlan(DESK, reservationId);
    expect(plan?.revision).toBe(2);
    expect(plan?.instalments.map((i) => [i.number, i.amountMinor])).toEqual([
      [1, 150_000],
      [2, 150_000],
    ]);

    const record = await latestRecord(owner, "payment_plan.revised", planId);
    expect(record).toMatchObject({
      locationId: property,
      reason: "The family asked for two payments instead of three.",
      context: {
        revision: 2,
        instalmentsWithdrawn: 3,
        instalmentsAdded: 2,
        totalMinor: 300_000,
      },
    });
  });

  it("the desk, which holds no finance permission, revises nothing; a reason is required", async () => {
    const property = await aProperty();
    const { reservationId } = await booking(property);
    await plans.createPaymentPlan(
      DESK,
      reservationId,
      await threeInstalments(property),
    );
    const again = [{ amountMinor: 300_000, dueOn: await day(property, 5) }];

    await expect(
      plans.revisePaymentPlan(DESK, reservationId, again, "Asked for one go"),
    ).rejects.toBeInstanceOf(PaymentPlanRefusedError);
    await expect(
      plans.revisePaymentPlan(FINANCE, reservationId, again, "  "),
    ).rejects.toMatchObject({ field: "reason" });
    expect((await plans.readPaymentPlan(DESK, reservationId))?.revision).toBe(
      1,
    );
  });
});

describe("the overdue figure", () => {
  it("counts Residents, instalments and money overdue, and opens the rows it counts", async () => {
    const property = await aProperty();
    const first = await booking(property);
    const second = await booking(property);
    const third = await booking(property);
    for (const { reservationId } of [first, second]) {
      await plans.createPaymentPlan(
        DESK,
        reservationId,
        await threeInstalments(property),
      );
    }
    await plans.createPaymentPlan(DESK, third.reservationId, [
      { amountMinor: 50_000, dueOn: await day(property, 3) },
    ]);

    const figure = await plans.overdueFigure(DESK, property);
    const residents = await plans.overdueResidents(DESK, property);

    expect(figure).toEqual({
      students: 2,
      instalments: 2,
      overdueMinor: 200_000,
      currency: "TRY",
    });
    expect(residents).toHaveLength(figure.students);
    expect(residents.map((r) => r.residentName)).toEqual([
      "Plan Resident",
      "Plan Resident",
    ]);
    expect(residents.reduce((sum, r) => sum + r.overdueMinor, 0)).toBe(
      figure.overdueMinor,
    );
  });

  it("is zero, and still names the currency, where nobody is overdue", async () => {
    const property = await aProperty();

    expect(await plans.overdueFigure(DESK, property)).toEqual({
      students: 0,
      instalments: 0,
      overdueMinor: 0,
      currency: "TRY",
    });
    expect(await plans.overdueResidents(DESK, property)).toEqual([]);
  });
});

describe("the worker's pass", () => {
  it("charges what has fallen due to the Resident's Folio, once however often it runs", async () => {
    const property = await aProperty();
    const { reservationId, folioId } = await booking(property);
    await plans.createPaymentPlan(
      DESK,
      reservationId,
      await threeInstalments(property),
    );

    const first = await poster.postDueInstalments();
    expect(first.failures).toEqual([]);
    expect(await chargedTo(folioId!)).toMatchObject([
      { description: "Instalment 1 of 3", amount: "100000" },
      { description: "Instalment 2 of 3", amount: "100000" },
    ]);

    const second = await poster.postDueInstalments();
    expect(second.failures).toEqual([]);
    expect(await chargedTo(folioId!)).toHaveLength(2);

    const plan = await plans.readPaymentPlan(DESK, reservationId);
    expect(plan?.instalments.map((i) => i.posted)).toEqual([true, true, false]);
  });

  it("an instalment waits for a Resident who has not arrived and is charged, dated the day it fell due, once they have", async () => {
    const property = await aProperty();
    const late = await booking(property, { inHouse: false });
    const dueOn = await day(property, -5);
    await plans.createPaymentPlan(DESK, late.reservationId, [
      { amountMinor: 70_000, dueOn },
    ]);

    // It is overdue by its date, though the worker has nowhere to charge it.
    expect(
      (await plans.readPaymentPlan(DESK, late.reservationId))?.instalments[0],
    ).toMatchObject({ state: "overdue", posted: false });
    expect((await poster.postDueInstalments()).failures).toEqual([]);
    expect(
      (await plans.readPaymentPlan(DESK, late.reservationId))?.instalments[0]
        ?.posted,
    ).toBe(false);

    const folioId = await arrive(late.reservationId);
    expect((await poster.postDueInstalments()).failures).toEqual([]);
    expect(await chargedTo(folioId)).toEqual([
      {
        description: "Instalment 1 of 1",
        amount: "70000",
        businessDate: dueOn,
      },
    ]);
  });

  it("one Property failing does not stop the next from being charged", async () => {
    const failing = await aProperty();
    const healthy = await aProperty();
    const unlucky = await booking(failing);
    const fine = await booking(healthy);
    for (const [property, { reservationId }] of [
      [failing, unlucky],
      [healthy, fine],
    ] as const) {
      await plans.createPaymentPlan(DESK, reservationId, [
        { amountMinor: 25_000, dueOn: await day(property, 0) },
      ]);
    }

    // A failure the posting function does not catch, at one Property only.
    await owner.$executeRawUnsafe(
      `create function public.instalment_test_failure() returns trigger
       language plpgsql as $$
       begin
         if new.property_id = '${failing}'::uuid and new.source = 'instalment' then
           raise exception 'instalment_test_failure' using errcode = 'XX000';
         end if;
         return new;
       end $$`,
    );
    await owner.$executeRawUnsafe(
      `create trigger instalment_test_failure
         before insert on public.folio_lines
         for each row execute function public.instalment_test_failure()`,
    );
    try {
      const report = await poster.postDueInstalments();

      expect(report.failures.map((failure) => failure.propertyId)).toContain(
        failing,
      );
      expect(
        report.failures.filter((failure) => failure.propertyId === healthy),
      ).toEqual([]);
      expect(await chargedTo(fine.folioId!)).toMatchObject([
        { description: "Instalment 1 of 1", amount: "25000" },
      ]);
      expect(await chargedTo(unlucky.folioId!)).toEqual([]);
    } finally {
      await owner.$executeRawUnsafe(
        `drop trigger if exists instalment_test_failure on public.folio_lines`,
      );
      await owner.$executeRawUnsafe(
        `drop function if exists public.instalment_test_failure()`,
      );
    }

    // Once the fault is gone the same pass charges it: nothing was lost.
    const retry = await poster.postDueInstalments();
    expect(retry.failures.filter((f) => f.propertyId === failing)).toEqual([]);
    expect(await chargedTo(unlucky.folioId!)).toMatchObject([
      { description: "Instalment 1 of 1", amount: "25000" },
    ]);
  });
});
