/**
 * Prices against a real database (ADR 0038, docs/features/rates).
 *
 * The pgTAP suite proves the policies, grants and triggers one statement at a
 * time. This proves the module on top of them: a save names the list it was
 * read at, a save that changes nothing says so, a stale price is restated, and
 * the audit record carries every type's price before and after.
 *
 * Each run makes a Property of its own, so a re-run starts from an empty list.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  RatesInputError,
  RatesRefusedError,
  RatesStaleError,
  createRatesModule,
} from "../../packages/ranza/rates/src";
import {
  FolioChangedError,
  PriceChangedError,
  createReservationsModule,
} from "../../packages/ranza/reservations/src";
import { createBusinessDayModule } from "../../packages/ranza/business-day/src";
import { PERMISSION_CATALOGUE } from "../../apps/operator-workspace/src/features/staff/labels";
import { latestRecord } from "./audit-record";

const ORG = "a7000002-0000-4000-8000-000000000001";
const MANAGER = "a7000001-0000-4000-8000-000000000001";
const DESK = "a7000001-0000-4000-8000-000000000002";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const rates = createRatesModule({ db: prisma });
const reservations = createReservationsModule({ db: prisma });
const businessDay = createBusinessDayModule({ db: prisma });
// A second Staff connection, for the race: one client would serialise the two.
const rival = createPrismaClient(process.env.DATABASE_URL!);
const rivalReservations = createReservationsModule({ db: rival });
const worker = createPrismaClient(process.env.WORKER_DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;

let property: string;

async function seed() {
  property = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'rates-manager@example.test'), ($2, 'rates-desk@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Rates Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, currency)
     values ($1, $2, 'Rates Property', 'TRY')`,
    property,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1, $2, 'manager', 'organization_wide'),
       ($1, $3, 'front_desk', 'organization_wide')
     on conflict do nothing`,
    ORG,
    MANAGER,
    DESK,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key)
     values ($1, 'platform_core'), ($1, 'front_office'), ($1, 'billing_folios')
     on conflict do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'configuration', true)`,
    property,
    ORG,
  );
  // Three rooms, one of them let by the bed: two sellable rooms and two beds.
  await owner.$executeRawUnsafe(
    `with room as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       values ($1, $2, 'R-1', 'room', 2), ($1, $2, 'R-2', 'room', 2),
              ($1, $2, 'R-3', 'room', 2)
       returning id, name)
     insert into public.accommodation_units
       (property_id, organization_id, parent_id, parent_unit_type, name,
        unit_type, capacity)
     select $1, $2, room.id, 'room', bed.name, 'bed', 1
       from room, (values ('A'), ('B')) as bed(name)
      where room.name = 'R-3'`,
    property,
    ORG,
  );
}

async function list(userId = MANAGER) {
  const read = await rates.getPriceList(userId, property);
  if (!read) throw new Error("the price list should be readable");
  return read;
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await rival.$disconnect();
  await worker.$disconnect();
  await owner.$disconnect();
});

describe("the permission the price list needs", () => {
  it(
    "the_workspace_catalogue_names_every_permission_the_database_has",
    async () => {
      // The People screen offers, and the audit log names, only what this list
      // holds; a permission the database has and the list lacks — rates.manage
      // was one — cannot be put in a role from the screen (RT-S1-08).
      const rows = await owner.$queryRawUnsafe<{ key: string }[]>(
        "select key from public.staff_permissions order by key",
      );
      expect([...PERMISSION_CATALOGUE].sort()).toEqual(rows.map((r) => r.key));
    },
    DATABASE_BUDGET_MS,
  );
});

describe("the price list", () => {
  it(
    "an_empty_list_names_every_kind_and_its_sellable_units",
    async () => {
      const read = await list();
      expect(read.currency).toBe("TRY");
      expect(read.mayManage).toBe(true);
      expect(
        read.entries.map((e) => [
          e.unitType,
          e.roomCapacity,
          e.amountMinor,
          e.sellableUnits,
        ]),
      ).toEqual([
        ["room", null, null, 2],
        ["bed", null, null, 2],
        // The one room let by the bed has two, so the beds have a size to be
        // priced by whether or not anybody has priced it (RT-S4-13).
        ["bed", 2, null, 2],
        ["apartment", null, null, 0],
        ["suite", null, null, 0],
      ]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "prices_are_set_and_audited_before_and_after",
    async () => {
      const before = await list();
      const saved = await rates.setPrices(MANAGER, property, {
        version: before.version,
        prices: [
          { unitType: "room", roomCapacity: null, amountMinor: 150000 },
          { unitType: "bed", roomCapacity: null, amountMinor: 45000 },
        ],
      });
      expect(saved.status).toBe("saved");
      expect(saved.version).not.toBe(before.version);

      const after = await list();
      expect(after.entries[0]).toMatchObject({
        amountMinor: 150000,
        currency: "TRY",
        stale: false,
      });

      const record = await latestRecord(owner, "price_list.changed", property);
      expect(record?.locationId).toBe(property);
      expect(record?.context).toEqual({
        changes: [
          {
            unitType: "room",
            roomCapacity: null,
            from: null,
            to: { amountMinor: 150000, currency: "TRY" },
          },
          {
            unitType: "bed",
            roomCapacity: null,
            from: null,
            to: { amountMinor: 45000, currency: "TRY" },
          },
        ],
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_save_that_changes_nothing_says_so",
    async () => {
      const current = await list();
      const saved = await rates.setPrices(MANAGER, property, {
        version: current.version,
        prices: [
          { unitType: "room", roomCapacity: null, amountMinor: 150000 },
          { unitType: "suite", roomCapacity: null, amountMinor: null },
        ],
      });
      expect(saved).toEqual({ status: "unchanged", version: current.version });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_save_from_a_list_that_changed_since_is_stale",
    async () => {
      const read = await list();
      await rates.setPrices(MANAGER, property, {
        version: read.version,
        prices: [{ unitType: "room", roomCapacity: null, amountMinor: 160000 }],
      });
      const refused = rates.setPrices(MANAGER, property, {
        version: read.version,
        prices: [{ unitType: "bed", roomCapacity: null, amountMinor: 1 }],
      });
      await expect(refused).rejects.toBeInstanceOf(RatesStaleError);
      expect((await list()).entries[1]?.amountMinor).toBe(45000);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_price_is_cleared",
    async () => {
      const read = await list();
      await rates.setPrices(MANAGER, property, {
        version: read.version,
        prices: [{ unitType: "bed", roomCapacity: null, amountMinor: null }],
      });
      expect((await list()).entries[1]?.amountMinor).toBeNull();
      const record = await latestRecord(owner, "price_list.changed", property);
      expect(record?.context).toEqual({
        changes: [
          {
            unitType: "bed",
            roomCapacity: null,
            from: { amountMinor: 45000, currency: "TRY" },
            to: null,
          },
        ],
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_currency_change_makes_the_list_stale_and_saving_restates_it",
    async () => {
      const before = await list();
      await owner.$executeRawUnsafe(
        `update public.properties set currency = 'EUR' where id = $1`,
        property,
      );
      const read = await list();
      // The form converts typed amounts in the currency it was read in.
      expect(read.version).not.toBe(before.version);
      expect(read.entries[0]).toMatchObject({ currency: "TRY", stale: true });

      const saved = await rates.setPrices(MANAGER, property, {
        version: read.version,
        prices: [{ unitType: "room", roomCapacity: null, amountMinor: 160000 }],
      });
      expect(saved.status).toBe("saved");
      expect((await list()).entries[0]).toMatchObject({
        amountMinor: 160000,
        currency: "EUR",
        stale: false,
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_save_that_a_currency_change_overtakes_is_stale",
    async () => {
      // A currency change takes the Property's lock and a price save takes the
      // list's, so one can commit between the save's read and its write. That
      // window is forced here: a trigger of the test's own changes the
      // currency inside the save, just before the price is stamped. DDL
      // commits, so the trigger fires for this test's Property alone — a run
      // killed before the finally leaves it inert for every other one.
      const { propertyId } = await pricedProperty();
      const read = await rates.getPriceList(MANAGER, propertyId);
      await owner.$executeRawUnsafe(`
        create or replace function public.test_currency_changes_mid_save()
        returns trigger language plpgsql as $$
        begin
          update public.properties set currency = 'JPY' where id = new.property_id;
          return new;
        end $$`);
      await owner.$executeRawUnsafe(`
        drop trigger if exists a_test_currency_changes_mid_save
          on public.property_rates`);
      await owner.$executeRawUnsafe(`
        create trigger a_test_currency_changes_mid_save
          before insert or update on public.property_rates
          for each row when (new.property_id = '${propertyId}'::uuid)
          execute function public.test_currency_changes_mid_save()`);
      try {
        await expect(
          rates.setPrices(MANAGER, propertyId, {
            version: read!.version,
            prices: [
              { unitType: "room", roomCapacity: null, amountMinor: 175000 },
            ],
          }),
        ).rejects.toBeInstanceOf(RatesStaleError);
      } finally {
        await owner.$executeRawUnsafe(
          "drop trigger a_test_currency_changes_mid_save on public.property_rates",
        );
        await owner.$executeRawUnsafe(
          "drop function public.test_currency_changes_mid_save()",
        );
      }
      // Rolled back whole: the price and the currency are as they were.
      const after = await rates.getPriceList(MANAGER, propertyId);
      expect(after?.currency).toBe("TRY");
      expect(after?.entries[0]).toMatchObject({
        amountMinor: 150000,
        currency: "TRY",
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_front_desk_reads_and_is_refused",
    async () => {
      const read = await list(DESK);
      expect(read.mayManage).toBe(false);
      expect(read.entries[0]?.amountMinor).toBe(160000);
      await expect(
        rates.setPrices(DESK, property, {
          version: read.version,
          prices: [{ unitType: "room", roomCapacity: null, amountMinor: 1 }],
        }),
      ).rejects.toBeInstanceOf(RatesRefusedError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_malformed_price_is_refused_before_the_database",
    async () => {
      const read = await list();
      for (const amountMinor of [0, -5, 1.5, 100_000_000_001]) {
        await expect(
          rates.setPrices(MANAGER, property, {
            version: read.version,
            prices: [{ unitType: "room", roomCapacity: null, amountMinor }],
          }),
        ).rejects.toMatchObject({ name: "RatesInputError", unitType: "room" });
      }
      await expect(
        rates.setPrices(MANAGER, property, {
          version: read.version,
          prices: [
            { unitType: "room", roomCapacity: null, amountMinor: 1 },
            { unitType: "room", roomCapacity: null, amountMinor: 2 },
          ],
        }),
      ).rejects.toBeInstanceOf(RatesInputError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "two_saves_from_one_version_do_not_both_land",
    async () => {
      const read = await list();
      const results = await Promise.allSettled([
        rates.setPrices(MANAGER, property, {
          version: read.version,
          prices: [
            { unitType: "suite", roomCapacity: null, amountMinor: 300000 },
          ],
        }),
        rates.setPrices(MANAGER, property, {
          version: read.version,
          prices: [
            { unitType: "apartment", roomCapacity: null, amountMinor: 250000 },
          ],
        }),
      ]);
      const saved = results.filter((r) => r.status === "fulfilled");
      const stale = results.filter(
        (r) => r.status === "rejected" && r.reason instanceof RatesStaleError,
      );
      expect([saved.length, stale.length]).toEqual([1, 1]);
    },
    DATABASE_BUDGET_MS,
  );
});

/** A Property of its own, trading in TRY, with one room priced at 1,500.00. */
async function pricedProperty(): Promise<{
  propertyId: string;
  roomId: string;
}> {
  const propertyId = randomUUID();
  const roomId = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, currency)
     values ($1, $2, 'Priced Booking Property', 'TRY')`,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'configuration', true), ($1, $2, 'front_desk', true),
            ($1, $2, 'finance', true)`,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity)
     values ($1, $2, $3, 'P-101', 'room', 2)`,
    roomId,
    propertyId,
    ORG,
  );
  const read = await rates.getPriceList(MANAGER, propertyId);
  await rates.setPrices(MANAGER, propertyId, {
    version: read!.version,
    prices: [{ unitType: "room", roomCapacity: null, amountMinor: 150000 }],
  });
  return { propertyId, roomId };
}

async function today(propertyId: string): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ day: string }[]>(
    `select app.property_today($1)::text as day`,
    propertyId,
  );
  return row!.day;
}

function plusDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A Guest booking of the room, quoted at the price the dialog would show. */
function booking(
  propertyId: string,
  unitId: string,
  from: string,
  nights: number,
  quoted: { rate: number | null; currency: string | null } = {
    rate: 150000,
    currency: "TRY",
  },
) {
  return {
    propertyId,
    accommodationUnitId: unitId,
    guestName: "Priced Guest",
    guestEmail: null,
    guestPhone: null,
    stayType: "guest" as const,
    startsOn: from,
    endsOn: plusDays(from, nights),
    quotedRateMinor: quoted.rate,
    quotedCurrency: quoted.currency,
  };
}

describe("a booking carries its price (slice 2)", () => {
  it(
    "a_guest_booking_is_stamped_and_keeps_its_price",
    async () => {
      const { propertyId, roomId } = await pricedProperty();
      const day = await today(propertyId);

      const units = await reservations.listBookableUnits(MANAGER, propertyId);
      expect(units[0]).toMatchObject({
        nightlyRateMinor: 150000,
        rateCurrency: "TRY",
      });

      const taken = await reservations.createReservation(
        MANAGER,
        booking(propertyId, roomId, plusDays(day, 1), 2),
      );
      expect(taken).toMatchObject({
        nightlyRateMinor: 150000,
        rateCurrency: "TRY",
      });

      const read = await rates.getPriceList(MANAGER, propertyId);
      await rates.setPrices(MANAGER, propertyId, {
        version: read!.version,
        prices: [{ unitType: "room", roomCapacity: null, amountMinor: 175000 }],
      });

      const [row] = (
        await reservations.listReservations(MANAGER, propertyId)
      ).filter((r) => r.reservationId === taken.reservationId);
      expect(row).toMatchObject({
        nightlyRateMinor: 150000,
        rateCurrency: "TRY",
      });
      // The next booking is quoted and stamped at the new price.
      expect(
        (await reservations.listBookableUnits(MANAGER, propertyId))[0]
          ?.nightlyRateMinor,
      ).toBe(175000);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_and_a_currency_change_serialise",
    async () => {
      const { propertyId, roomId } = await pricedProperty();
      const day = await today(propertyId);

      // The currency change holds the Property row; the booking, which takes it
      // FOR SHARE, must wait and then read the new currency. Without the lock it
      // would read TRY from its own snapshot and commit a TRY price at a
      // Property that trades in EUR.
      let bookingTaken:
        ReturnType<typeof reservations.createReservation> | undefined;
      await owner.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `update public.properties set currency = 'EUR' where id = $1`,
            propertyId,
          );
          bookingTaken = reservations.createReservation(
            MANAGER,
            booking(propertyId, roomId, plusDays(day, 1), 1),
          );
          // Long enough for the booking to reach the lock and wait on it.
          await new Promise((resolve) => setTimeout(resolve, 1500));
        },
        { timeout: 20_000 },
      );
      // The room's price is in TRY, which is now stale, so the stamp prices
      // nothing — and the desk quoted 1,500.00 TRY, so the booking is refused
      // rather than taken at a price nobody told the Guest. Without the lock
      // the stamp would read TRY from its own snapshot, match the quote, and
      // commit a TRY price at a Property that trades in EUR.
      await expect(bookingTaken!).rejects.toBeInstanceOf(PriceChangedError);
      const [property] = await owner.$queryRawUnsafe<{ currency: string }[]>(
        `select trim(currency) as currency from public.properties where id = $1`,
        propertyId,
      );
      expect(property?.currency).toBe("EUR");
      const [held] = await owner.$queryRawUnsafe<{ count: number }[]>(
        `select count(*)::int as count from public.reservations where property_id = $1`,
        propertyId,
      );
      expect(held?.count).toBe(0);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_booking_quoted_at_a_price_that_changed_is_refused",
    async () => {
      const { propertyId, roomId } = await pricedProperty();
      const day = await today(propertyId);
      // The dialog was read at 1,500.00; a manager then changes the price.
      const read = await rates.getPriceList(MANAGER, propertyId);
      await rates.setPrices(MANAGER, propertyId, {
        version: read!.version,
        prices: [{ unitType: "room", roomCapacity: null, amountMinor: 175000 }],
      });
      await expect(
        reservations.createReservation(
          MANAGER,
          booking(propertyId, roomId, plusDays(day, 1), 2),
        ),
      ).rejects.toBeInstanceOf(PriceChangedError);
      const [held] = await owner.$queryRawUnsafe<{ count: number }[]>(
        `select count(*)::int as count from public.reservations where property_id = $1`,
        propertyId,
      );
      expect(held?.count).toBe(0);

      // Quoted at the price that stands, it is taken at it.
      const taken = await reservations.createReservation(
        MANAGER,
        booking(propertyId, roomId, plusDays(day, 1), 2, {
          rate: 175000,
          currency: "TRY",
        }),
      );
      expect(taken.nightlyRateMinor).toBe(175000);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_priced_booking_fixes_the_currency",
    async () => {
      const { propertyId, roomId } = await pricedProperty();
      const day = await today(propertyId);
      await reservations.createReservation(
        MANAGER,
        booking(propertyId, roomId, plusDays(day, 3), 1),
      );
      await expect(
        owner.$executeRawUnsafe(
          `update public.properties set currency = 'EUR' where id = $1`,
          propertyId,
        ),
      ).rejects.toThrow(/fixed once a Folio is opened or a priced booking/);
    },
    DATABASE_BUDGET_MS,
  );
});

/**
 * A Guest in house since two nights ago on a booking priced at 1,500.00, with
 * an open Folio, and no day closed yet at their Property. Written as the owner
 * with the manager's request context set, so the booking is stamped as the
 * front desk's would be: a booking cannot be taken in the past, and a Guest
 * who has already slept here is what this needs.
 */
async function guestInHouseSinceTwoNightsAgo(): Promise<{
  propertyId: string;
  stayId: string;
  today: string;
}> {
  const { propertyId, roomId } = await pricedProperty();
  const day = await today(propertyId);
  const stayId = randomUUID();
  await owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select app.set_request_context($1::uuid)`,
      MANAGER,
    );
    const [booking] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `with guest as (
         insert into public.guests (organization_id, full_name)
         values ($1, 'Night Guest') returning id)
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1, $2, $3, guest.id, 'guest', 'checked_in',
              $4::date - 2, $4::date + 1
         from guest
       returning id`,
      ORG,
      propertyId,
      roomId,
      day,
    );
    await tx.$executeRawUnsafe(
      `insert into public.stays
         (id, organization_id, property_id, accommodation_unit_id,
          reservation_id, stay_type, status, starts_on, ends_on)
       values ($1, $2, $3, $4, $5, 'guest', 'in_house', $6::date - 2,
               $6::date + 1)`,
      stayId,
      ORG,
      propertyId,
      roomId,
      booking!.id,
      day,
    );
    await tx.$executeRawUnsafe(
      `insert into public.folios (organization_id, property_id, stay_id, currency)
       values ($1, $2, $3, 'TRY')`,
      ORG,
      propertyId,
      stayId,
    );
  });
  return { propertyId, stayId, today: day };
}

async function roomNights(stayId: string) {
  return owner.$queryRawUnsafe<{ day: string; amount: string }[]>(
    `select to_char(line.business_date, 'YYYY-MM-DD') as day,
            line.amount_minor::text as amount
       from public.folio_lines as line
       join public.folios as folio on folio.id = line.folio_id
      where folio.stay_id = $1 and line.source = 'room_night'
      order by line.business_date`,
    stayId,
  );
}

describe("a night is charged once (slice 3)", () => {
  it(
    "check_out_charges_the_nights_not_yet_charged",
    async () => {
      const {
        propertyId,
        stayId,
        today: day,
      } = await guestInHouseSinceTwoNightsAgo();

      const [departure] = (
        await reservations.listDepartures(MANAGER, propertyId, "in_house")
      ).filter((d) => d.stayId === stayId);
      expect(departure).toMatchObject({
        pendingNights: 2,
        pendingMinor: 300000,
        nightlyRateMinor: 150000,
        balanceMinor: 0,
      });

      // Nothing can take a payment yet, so the balance is left with a reason.
      await expect(
        reservations.checkOut(MANAGER, stayId, {
          folioVersion: departure!.folioVersion,
          pendingNights: 2,
          pendingMinor: 300000,
          earlyDeparture: true,
          balanceReason: null,
        }),
      ).rejects.toMatchObject({ name: "BalanceReasonError" });
      expect(await roomNights(stayId)).toEqual([]);

      await reservations.checkOut(MANAGER, stayId, {
        folioVersion: departure!.folioVersion,
        pendingNights: 2,
        pendingMinor: 300000,
        earlyDeparture: true,
        balanceReason: "Pays at the travel agency",
      });
      expect(await roomNights(stayId)).toEqual([
        { day: plusDays(day, -2), amount: "150000" },
        { day: plusDays(day, -1), amount: "150000" },
      ]);
      const record = await latestRecord(owner, "stay.checked_out", stayId);
      expect(record?.context).toMatchObject({
        nightsCharged: 2,
        // A number, as every other amount on a record is (DATA-01).
        balanceMinor: 300000,
      });

      // The close of yesterday then charges nothing again, and counts it.
      const closed = await businessDay.closeDay(
        MANAGER,
        propertyId,
        plusDays(day, -1),
        null,
      );
      expect(closed).toMatchObject({
        roomNightsCharged: 1,
        roomNightsNotCharged: 0,
      });
      expect(await roomNights(stayId)).toHaveLength(2);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "check_out_refuses_nights_it_did_not_show",
    async () => {
      const { propertyId, stayId } = await guestInHouseSinceTwoNightsAgo();
      const [departure] = (
        await reservations.listDepartures(MANAGER, propertyId, "in_house")
      ).filter((d) => d.stayId === stayId);
      await expect(
        reservations.checkOut(MANAGER, stayId, {
          folioVersion: departure!.folioVersion,
          pendingNights: 1,
          pendingMinor: 150000,
          earlyDeparture: true,
          balanceReason: "Pays later",
        }),
      ).rejects.toBeInstanceOf(FolioChangedError);
      expect(await roomNights(stayId)).toEqual([]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the_close_posts_one_room_night_per_guest, and the screen said so first",
    async () => {
      const {
        propertyId,
        stayId,
        today: day,
      } = await guestInHouseSinceTwoNightsAgo();
      const screen = await businessDay.getCloseTheDay(MANAGER, propertyId);
      expect(screen?.nightsToCharge).toEqual({
        nights: 1,
        amountMinor: 150000,
        currency: "TRY",
      });
      expect(screen?.nightsNotCharged).toEqual([]);

      await businessDay.closeDay(MANAGER, propertyId, plusDays(day, -1), null);
      expect(await roomNights(stayId)).toEqual([
        { day: plusDays(day, -1), amount: "150000" },
      ]);
      const after = await businessDay.getCloseTheDay(MANAGER, propertyId);
      expect(after?.recent[0]).toMatchObject({
        roomNightsCharged: 1,
        roomRevenueMinor: 150000,
        roomRevenueCurrency: "TRY",
        roomNightsNotCharged: 0,
      });
      const record = await latestRecord(
        owner,
        "business_day.closed",
        after!.recent[0]!.closeId,
      );
      expect(record?.context).toMatchObject({
        roomNightsCharged: 1,
        amountMinor: 150000,
        currency: "TRY",
      });
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "the worker's close charges the night as a Staff Member's does",
    async () => {
      const {
        propertyId,
        stayId,
        today: day,
      } = await guestInHouseSinceTwoNightsAgo();
      const outcome = await worker.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "select app.set_worker_context($1::uuid, 'business_day.close')",
          ORG,
        );
        const [row] = await tx.$queryRawUnsafe<{ outcome: string }[]>(
          `select app.close_business_day_automatically($1::uuid, $2::date) as outcome`,
          propertyId,
          plusDays(day, -1),
        );
        return row?.outcome;
      });
      expect(outcome).toBe("closed");
      expect(await roomNights(stayId)).toEqual([
        { day: plusDays(day, -1), amount: "150000" },
      ]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "a_close_and_a_check_out_do_not_deadlock",
    async () => {
      const {
        propertyId,
        stayId,
        today: day,
      } = await guestInHouseSinceTwoNightsAgo();
      const [departure] = (
        await reservations.listDepartures(MANAGER, propertyId, "in_house")
      ).filter((d) => d.stayId === stayId);

      // Arranged so the old order deadlocks: a holder keeps the Property's
      // day; the close queues behind it; then the check-out starts. Taking the
      // Stay first, it would hold the Stay while waiting on the day behind the
      // close, and the close — once it has the day — would wait on the Stay.
      const wait = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      let close: Promise<unknown> | undefined;
      let checkOut: Promise<unknown> | undefined;
      await owner.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            "select pg_advisory_xact_lock(3, hashtext($1::text))::text",
            propertyId,
          );
          close = businessDay.closeDay(
            MANAGER,
            propertyId,
            plusDays(day, -1),
            null,
          );
          await wait(500);
          checkOut = rivalReservations.checkOut(MANAGER, stayId, {
            folioVersion: departure!.folioVersion,
            pendingNights: 2,
            pendingMinor: 300000,
            earlyDeparture: true,
            balanceReason: "Pays later",
          });
          await wait(1000);
        },
        { timeout: 20_000 },
      );
      const [closed, checkedOut] = await Promise.allSettled([
        close!,
        checkOut!,
      ]);

      // Neither was chosen as a deadlock victim.
      for (const settled of [closed, checkedOut]) {
        if (settled.status === "rejected") {
          expect(String(settled.reason)).not.toMatch(/40P01|deadlock/i);
        }
      }
      expect(closed.status).toBe("fulfilled");
      // The close got the day first and charged last night, so the check-out
      // was shown a bill that changed, and is refused rather than charging it
      // again.
      expect(checkedOut.status).toBe("rejected");
      expect((checkedOut as PromiseRejectedResult).reason).toBeInstanceOf(
        FolioChangedError,
      );
      expect(await roomNights(stayId)).toEqual([
        { day: plusDays(day, -1), amount: "150000" },
      ]);
    },
    DATABASE_BUDGET_MS,
  );
});

// ---------------------------------------------------------------------------
// A bed's price follows its room (RANZ-111, ADR 0038 amended)
// ---------------------------------------------------------------------------

/**
 * A yurt: a single, a triple and a room of four, each let by the bed, and
 * nothing priced. A Property of its own, so a re-run starts from an empty list.
 */
async function yurt() {
  const propertyId = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, currency)
     values ($1, $2, 'Sized Yurt', 'TRY')`,
    propertyId,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'configuration', true), ($1, $2, 'front_desk', true)`,
    propertyId,
    ORG,
  );
  const rooms = [
    { name: "S-101", beds: ["A"] },
    { name: "S-301", beds: ["A", "B", "C"] },
    { name: "S-401", beds: ["A", "B", "C", "D"] },
  ];
  for (const room of rooms) {
    await owner.$executeRawUnsafe(
      `with room as (
         insert into public.accommodation_units
           (property_id, organization_id, name, unit_type, capacity)
         values ($1, $2, $3, 'room', $4)
         returning id)
       insert into public.accommodation_units
         (property_id, organization_id, parent_id, parent_unit_type, name,
          unit_type, capacity)
       select $1, $2, room.id, 'room', bed.name, 'bed', 1
         from room, unnest($5::text[]) as bed(name)`,
      propertyId,
      ORG,
      room.name,
      room.beds.length,
      room.beds,
    );
  }
  return propertyId;
}

async function bedIn(propertyId: string, room: string): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `select bed.id from public.accommodation_units as bed
       join public.accommodation_units as room on room.id = bed.parent_id
      where room.property_id = $1 and room.name = $2 and bed.name = 'A'`,
    propertyId,
    room,
  );
  return row!.id;
}

describe("a bed's price follows its room (RT-S4-*)", () => {
  it(
    "RT-S4-13: the section lists the general bed price and one row for each size of room the Property has",
    async () => {
      const propertyId = await yurt();
      const read = await rates.getPriceList(MANAGER, propertyId);
      expect(
        read!.entries.map((e) => [e.unitType, e.roomCapacity, e.sellableUnits]),
      ).toEqual([
        ["room", null, 0],
        ["bed", null, 8],
        ["bed", 1, 1],
        ["bed", 3, 3],
        ["bed", 4, 4],
        ["apartment", null, 0],
        ["suite", null, 0],
      ]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "RT-S4-14: a size price is saved and audited with its size, and clearing it says what it was",
    async () => {
      const propertyId = await yurt();
      const first = await rates.getPriceList(MANAGER, propertyId);
      const saved = await rates.setPrices(MANAGER, propertyId, {
        version: first!.version,
        prices: [
          { unitType: "bed", roomCapacity: null, amountMinor: 30000 },
          { unitType: "bed", roomCapacity: 1, amountMinor: 90000 },
          { unitType: "bed", roomCapacity: 4, amountMinor: 40000 },
        ],
      });
      expect(saved.status).toBe("saved");

      const record = await latestRecord(
        owner,
        "price_list.changed",
        propertyId,
      );
      expect(record?.context).toEqual({
        changes: [
          {
            unitType: "bed",
            roomCapacity: null,
            from: null,
            to: { amountMinor: 30000, currency: "TRY" },
          },
          {
            unitType: "bed",
            roomCapacity: 1,
            from: null,
            to: { amountMinor: 90000, currency: "TRY" },
          },
          {
            unitType: "bed",
            roomCapacity: 4,
            from: null,
            to: { amountMinor: 40000, currency: "TRY" },
          },
        ],
      });

      const second = await rates.getPriceList(MANAGER, propertyId);
      const unchanged = await rates.setPrices(MANAGER, propertyId, {
        version: second!.version,
        prices: [{ unitType: "bed", roomCapacity: 4, amountMinor: 40000 }],
      });
      expect(unchanged.status).toBe("unchanged");

      await rates.setPrices(MANAGER, propertyId, {
        version: second!.version,
        prices: [{ unitType: "bed", roomCapacity: 4, amountMinor: null }],
      });
      const cleared = await latestRecord(
        owner,
        "price_list.changed",
        propertyId,
      );
      expect(cleared?.context).toEqual({
        changes: [
          {
            unitType: "bed",
            roomCapacity: 4,
            from: { amountMinor: 40000, currency: "TRY" },
            to: null,
          },
        ],
      });
      // A cleared size keeps its row and its place in the list.
      const after = await rates.getPriceList(MANAGER, propertyId);
      expect(
        after!.entries
          .filter((e) => e.unitType === "bed")
          .map((e) => [e.roomCapacity, e.amountMinor]),
      ).toEqual([
        [null, 30000],
        [1, 90000],
        [3, null],
        [4, null],
      ]);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "RT-S4-14: a size on anything but a bed, or one past the most a room sleeps, is not a price",
    async () => {
      const propertyId = await yurt();
      const read = await rates.getPriceList(MANAGER, propertyId);
      for (const [unitType, roomCapacity] of [
        ["room", 2],
        ["bed", 0],
        ["bed", 65],
        ["bed", 1.5],
      ] as const) {
        await expect(
          rates.setPrices(MANAGER, propertyId, {
            version: read!.version,
            prices: [{ unitType, roomCapacity, amountMinor: 1000 }],
          }),
        ).rejects.toBeInstanceOf(RatesInputError);
      }
      await expect(
        rates.setPrices(MANAGER, propertyId, {
          version: read!.version,
          prices: [
            { unitType: "bed", roomCapacity: 4, amountMinor: 1000 },
            { unitType: "bed", roomCapacity: 4, amountMinor: 2000 },
          ],
        }),
      ).rejects.toBeInstanceOf(RatesInputError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "RT-S4-14: the desk, who holds no rates.manage, cannot price a size",
    async () => {
      const propertyId = await yurt();
      const read = await rates.getPriceList(DESK, propertyId);
      await expect(
        rates.setPrices(DESK, propertyId, {
          version: read!.version,
          prices: [{ unitType: "bed", roomCapacity: 4, amountMinor: 40000 }],
        }),
      ).rejects.toBeInstanceOf(RatesRefusedError);
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "RT-S4-12: the quote is the stamp, in a single and in a room of four",
    async () => {
      const propertyId = await yurt();
      const read = await rates.getPriceList(MANAGER, propertyId);
      await rates.setPrices(MANAGER, propertyId, {
        version: read!.version,
        prices: [
          { unitType: "bed", roomCapacity: null, amountMinor: 30000 },
          { unitType: "bed", roomCapacity: 1, amountMinor: 90000 },
          { unitType: "bed", roomCapacity: 4, amountMinor: 40000 },
        ],
      });
      const day = await today(propertyId);
      const units = await reservations.listBookableUnits(MANAGER, propertyId);

      const quoted = (room: string) =>
        units.find((unit) => unit.roomName === room && unit.unitName === "A");
      expect(quoted("S-101")?.nightlyRateMinor).toBe(90000);
      expect(quoted("S-401")?.nightlyRateMinor).toBe(40000);
      // The triple has no price of its own, so it is quoted the general one.
      expect(quoted("S-301")?.nightlyRateMinor).toBe(30000);

      for (const room of ["S-101", "S-301", "S-401"]) {
        const unit = quoted(room)!;
        const taken = await reservations.createReservation(MANAGER, {
          ...booking(
            propertyId,
            await bedIn(propertyId, room),
            plusDays(day, 1),
            2,
            { rate: unit.nightlyRateMinor, currency: unit.rateCurrency },
          ),
        });
        expect(taken).toMatchObject({
          nightlyRateMinor: unit.nightlyRateMinor,
          rateCurrency: "TRY",
        });
      }
    },
    DATABASE_BUDGET_MS,
  );

  it(
    "RT-S4-12: a quote that is not the size's price is refused, as a stale quote is",
    async () => {
      const propertyId = await yurt();
      const read = await rates.getPriceList(MANAGER, propertyId);
      await rates.setPrices(MANAGER, propertyId, {
        version: read!.version,
        prices: [
          { unitType: "bed", roomCapacity: null, amountMinor: 30000 },
          { unitType: "bed", roomCapacity: 4, amountMinor: 40000 },
        ],
      });
      const day = await today(propertyId);
      await expect(
        reservations.createReservation(
          MANAGER,
          booking(
            propertyId,
            await bedIn(propertyId, "S-401"),
            plusDays(day, 1),
            2,
            { rate: 30000, currency: "TRY" },
          ),
        ),
      ).rejects.toBeInstanceOf(PriceChangedError);
    },
    DATABASE_BUDGET_MS,
  );
});
