/**
 * The Owner's billing notice (OA-S1-14, ADR 0040).
 *
 * past_due is the grace period: gate 1 admits it, so nothing stops working,
 * and the only sign of it in the Workspace is this notice. It is shown to an
 * Owner of the Organization and to nobody else — a manager or a front desk can
 * do nothing about a card — and it names only the Organization that is
 * overdue, because an Owner of two may have one paid and one not.
 *
 * Read through @ranza/core as ranza_app, because that is what the layout runs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCoreModule } from "../../packages/ranza/core/src";
import { createPrismaClient } from "../../packages/db/src";

const OVERDUE = "b111ab1e-0000-4000-8000-000000000001";
const PAID = "b111ab1e-0000-4000-8000-000000000002";
const OWNER = "b111ab1e-0000-4000-8000-000000000011";
const MANAGER = "b111ab1e-0000-4000-8000-000000000012";
const STRANGER = "b111ab1e-0000-4000-8000-000000000013";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

async function subscription(organizationId: string, status: string) {
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1::uuid, $2)
     on conflict (organization_id) do update set status = excluded.status`,
    organizationId,
    status,
  );
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'billing-owner@example.test'),
       ($2,'billing-manager@example.test'),
       ($3,'billing-stranger@example.test')
     on conflict (id) do nothing`,
    OWNER,
    MANAGER,
    STRANGER,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Billing Overdue Hotels','active'),
       ($2,'Billing Paid Hotels','active')
     on conflict (id) do nothing`,
    OVERDUE,
    PAID,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope) values
       ($1,$3,'owner','organization_wide'),
       ($2,$3,'owner','organization_wide'),
       ($1,$4,'manager','organization_wide')
     on conflict do nothing`,
    OVERDUE,
    PAID,
    OWNER,
    MANAGER,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("the billing notice", () => {
  it("names the overdue Organization to its Owner, and not the paid one", async () => {
    await subscription(OVERDUE, "past_due");
    await subscription(PAID, "active");

    expect(await core.billingNotices(OWNER)).toEqual([
      { organizationId: OVERDUE, organizationName: "Billing Overdue Hotels" },
    ]);
  });

  it("is not shown to a manager of the overdue Organization", async () => {
    await subscription(OVERDUE, "past_due");

    expect(await core.billingNotices(MANAGER)).toEqual([]);
  });

  it("is not shown to somebody outside it", async () => {
    await subscription(OVERDUE, "past_due");

    expect(await core.billingNotices(STRANGER)).toEqual([]);
  });

  it("ends with the grace period: a suspended Subscription is not past due", async () => {
    await subscription(OVERDUE, "suspended");

    expect(await core.billingNotices(OWNER)).toEqual([]);
  });
});
