/**
 * Where the room commands record themselves.
 *
 * Adding, blocking and unblocking rooms had no integration suite of its own —
 * the pgTAP suites prove their policies and the Rooms screen was exercised in a
 * browser — so nothing noticed what their audit records said. Since ADR 0031
 * that matters: a record's location decides who may read it, and a room
 * command that dropped it would hide its history from every Staff Member
 * assigned to that Property.
 *
 * A Property of each run's own, so room numbers never collide with an earlier
 * run's; the Organization and the Owner are shared and idempotent.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccommodationModule } from "../../packages/ranza/accommodation/src";
import { createPrismaClient } from "../../packages/db/src";
import { latestRecord } from "./audit-record";

const ORG = "d5200002-0000-4000-8000-000000000001";
const OWNER = "d5200001-0000-4000-8000-000000000001";
const PROPERTY = randomUUID();

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const accommodation = createAccommodationModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email)
     values ($1, 'accommodation-audit-owner@example.test')
     on conflict (id) do nothing`,
    OWNER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Accommodation Audit Organization', 'active')
     on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'front_office', 'active')
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1, $2, 'owner', 'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    OWNER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1, $2, $3)`,
    PROPERTY,
    ORG,
    `Accommodation Audit ${PROPERTY.slice(0, 8)}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'front_desk', true)`,
    PROPERTY,
    ORG,
  );
});

afterAll(async () => {
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("a room command records the Property it happened at", () => {
  it("adding, blocking and unblocking rooms each name the Property", async () => {
    const added = await accommodation.addUnits(OWNER, {
      propertyId: PROPERTY,
      building: null,
      floor: 1,
      unitType: "room",
      firstNumber: "101",
      count: 2,
      capacity: 2,
      letByTheBed: false,
    });
    const addition = await latestRecord(owner, "unit.added", PROPERTY);
    expect(addition?.locationId).toBe(PROPERTY);
    expect(addition?.context).toMatchObject({ names: ["101", "102"] });

    const [room] = added.unitIds;
    await accommodation.blockUnit(OWNER, room!, "A leak in the ceiling");
    const block = await latestRecord(owner, "unit.blocked", room!);
    expect(block?.locationId).toBe(PROPERTY);
    expect(block?.reason).toBe("A leak in the ceiling");

    await accommodation.unblockUnit(OWNER, room!);
    const unblock = await latestRecord(owner, "unit.unblocked", room!);
    expect(unblock?.locationId).toBe(PROPERTY);
    expect(unblock?.context).toMatchObject({
      hadBeenBlockedFor: "A leak in the ceiling",
    });
  });
});
