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
import { latestRecord } from "./audit-record";

const ORG = "a7000002-0000-4000-8000-000000000001";
const MANAGER = "a7000001-0000-4000-8000-000000000001";
const DESK = "a7000001-0000-4000-8000-000000000002";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const rates = createRatesModule({ db: prisma });
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
     values ($1, 'platform_core') on conflict do nothing`,
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
  await owner.$disconnect();
});

describe("the price list", () => {
  it(
    "an_empty_list_names_every_kind_and_its_sellable_units",
    async () => {
      const read = await list();
      expect(read.currency).toBe("TRY");
      expect(read.mayManage).toBe(true);
      expect(
        read.entries.map((e) => [e.unitType, e.amountMinor, e.sellableUnits]),
      ).toEqual([
        ["room", null, 2],
        ["bed", null, 2],
        ["apartment", null, 0],
        ["suite", null, 0],
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
          { unitType: "room", amountMinor: 150000 },
          { unitType: "bed", amountMinor: 45000 },
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
            from: null,
            to: { amountMinor: 150000, currency: "TRY" },
          },
          {
            unitType: "bed",
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
          { unitType: "room", amountMinor: 150000 },
          { unitType: "suite", amountMinor: null },
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
        prices: [{ unitType: "room", amountMinor: 160000 }],
      });
      const refused = rates.setPrices(MANAGER, property, {
        version: read.version,
        prices: [{ unitType: "bed", amountMinor: 1 }],
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
        prices: [{ unitType: "bed", amountMinor: null }],
      });
      expect((await list()).entries[1]?.amountMinor).toBeNull();
      const record = await latestRecord(owner, "price_list.changed", property);
      expect(record?.context).toEqual({
        changes: [
          {
            unitType: "bed",
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
        prices: [{ unitType: "room", amountMinor: 160000 }],
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
    "the_front_desk_reads_and_is_refused",
    async () => {
      const read = await list(DESK);
      expect(read.mayManage).toBe(false);
      expect(read.entries[0]?.amountMinor).toBe(160000);
      await expect(
        rates.setPrices(DESK, property, {
          version: read.version,
          prices: [{ unitType: "room", amountMinor: 1 }],
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
            prices: [{ unitType: "room", amountMinor }],
          }),
        ).rejects.toMatchObject({ name: "RatesInputError", unitType: "room" });
      }
      await expect(
        rates.setPrices(MANAGER, property, {
          version: read.version,
          prices: [
            { unitType: "room", amountMinor: 1 },
            { unitType: "room", amountMinor: 2 },
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
          prices: [{ unitType: "suite", amountMinor: 300000 }],
        }),
        rates.setPrices(MANAGER, property, {
          version: read.version,
          prices: [{ unitType: "apartment", amountMinor: 250000 }],
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
