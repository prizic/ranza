/**
 * Why a destination is closed to a Staff Member, said by the gate that stopped
 * them (RANZ-53, DX-01, HR-01, INTEGRATIONS-01, PORTFOLIO-03).
 *
 * One refusal for every gate said "not in your Subscription" to a Front desk
 * Staff Member whose Organization had bought the module — a remedy that was not
 * theirs. `explainDenial` reads the gates one at a time, so each is switched off
 * alone while the others hold, and every answer is checked against the list the
 * rail is built from (`listPermittedProperties`): a destination is explained as
 * `open` exactly where that list is not empty. The two cannot disagree.
 *
 * It runs as `ranza_app`, which owns nothing and bypasses nothing: the
 * Subscription, Entitlement and capability rows it reads are the ones a member's
 * policies already show them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCoreModule,
  type CapabilityRef,
  type Denial,
} from "../../packages/ranza/core/src";
import { createPrismaClient } from "../../packages/db/src";

const ORG = "e5300002-0000-4000-8000-000000000001";
const SUSPENDED_ORG = "e5300002-0000-4000-8000-000000000002";
const BOUGHT = "e5300004-0000-4000-8000-000000000001";
const SWITCHED_OFF = "e5300004-0000-4000-8000-000000000002";
const LAPSED = "e5300004-0000-4000-8000-000000000003";
const OWNER = "e5300001-0000-4000-8000-000000000001";
const DESK = "e5300001-0000-4000-8000-000000000002";
const LAPSED_OWNER = "e5300001-0000-4000-8000-000000000003";
const NOBODY = "e5300001-0000-4000-8000-000000000004";
const MANAGER_OF_INTEGRATIONS = "e5300001-0000-4000-8000-000000000005";
const MANAGE_ONLY_ROLE = "manage_only_e53";
const NEVER_ASSIGNED = "e5300004-0000-4000-8000-0000000000ff";

const INTEGRATIONS: CapabilityRef = {
  moduleKey: "platform_core",
  capabilityKey: "integrations",
};
const HR: CapabilityRef = {
  moduleKey: "human_resources",
  capabilityKey: "staff_administration",
};

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const integrations = (userId: string, propertyId?: string) =>
  core.explainDenial(userId, {
    capability: INTEGRATIONS,
    permission: "integrations.view",
    propertyId,
  });

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'denial-owner@example.test'), ($2,'denial-desk@example.test'),
       ($3,'denial-lapsed@example.test'), ($4,'denial-nobody@example.test')
     on conflict (id) do nothing`,
    OWNER,
    DESK,
    LAPSED_OWNER,
    NOBODY,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status) values
       ($1,'Denial Organization','active'), ($2,'Denial Lapsed Organization','active')
     on conflict (id) do nothing`,
    ORG,
    SUSPENDED_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name) values
       ($1,$4,'Denial Bought'), ($2,$4,'Denial Switched Off'),
       ($3,$5,'Denial Lapsed')
     on conflict (id) do nothing`,
    BOUGHT,
    SWITCHED_OFF,
    LAPSED,
    ORG,
    SUSPENDED_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values
       ($1,'active'), ($2,'suspended')
     on conflict (organization_id) do update set status = excluded.status`,
    ORG,
    SUSPENDED_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status) values
       ($1,'platform_core','active'), ($2,'platform_core','active')
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
    SUSPENDED_ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1,$4,'integrations',true), ($2,$4,'integrations',false),
       ($3,$5,'integrations',true)
     on conflict (property_id, capability_key) do update
       set enabled = excluded.enabled`,
    BOUGHT,
    SWITCHED_OFF,
    LAPSED,
    ORG,
    SUSPENDED_ORG,
  );
  // A role an Organization wrote that may manage integrations and not see
  // them: either permission opens the screen, so it is still shown it.
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles
       (scope_id, key, organization_id, name, permissions, status)
     values ($1::uuid, $2, $1::uuid, 'Manage only E53', array['integrations.manage'], 'active')
     on conflict (scope_id, key) do update
       set permissions = array['integrations.manage'], status = 'active'`,
    ORG,
    MANAGE_ONLY_ROLE,
  );
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1,'denial-manage-only@example.test')
     on conflict (id) do nothing`,
    MANAGER_OF_INTEGRATIONS,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1,$3,'owner','00000000-0000-0000-0000-000000000000','organization_wide'),
       ($1,$4,'front_desk','00000000-0000-0000-0000-000000000000','assigned_properties'),
       ($2,$5,'owner','00000000-0000-0000-0000-000000000000','organization_wide'),
       ($1,$6,$7,$1,'assigned_properties')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null`,
    ORG,
    SUSPENDED_ORG,
    OWNER,
    DESK,
    LAPSED_OWNER,
    MANAGER_OF_INTEGRATIONS,
    MANAGE_ONLY_ROLE,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments
       (property_id, organization_id, user_id) values ($1,$2,$3), ($1,$2,$4)
     on conflict (property_id, user_id) do update
       set status = 'active', revoked_at = null`,
    BOUGHT,
    ORG,
    DESK,
    MANAGER_OF_INTEGRATIONS,
  );
});

afterAll(async () => {
  await owner.$executeRawUnsafe(
    "delete from public.property_assignments where organization_id in ($1,$2)",
    ORG,
    SUSPENDED_ORG,
  );
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id in ($1,$2)",
    ORG,
    SUSPENDED_ORG,
  );
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("which gate stopped them", () => {
  it("DENY-01: nothing stops an Owner at a Property that has it", async () => {
    expect(await integrations(OWNER, BOUGHT)).toEqual({ reason: "open" });
  });

  it("DENY-02: a Property that has switched it off says so, not the Subscription", async () => {
    expect(await integrations(OWNER, SWITCHED_OFF)).toEqual({
      reason: "not_enabled",
    });
  });

  it("DENY-03: a role without the permission is told which one, where the module is bought and on", async () => {
    expect(await integrations(DESK, BOUGHT)).toEqual({
      reason: "no_permission",
      permission: "integrations.view",
    });
  });

  it("DENY-04: an Organization whose Subscription has lapsed is told it is the Subscription", async () => {
    expect(await integrations(LAPSED_OWNER, LAPSED)).toEqual({
      reason: "not_subscribed",
    });
  });

  it("DENY-05: a module the Organization never bought is the Subscription, whoever asks", async () => {
    const question = {
      capability: HR,
      permission: "hr.view",
      propertyId: BOUGHT,
    };
    expect(await core.explainDenial(OWNER, question)).toEqual({
      reason: "not_subscribed",
    });
    expect(await core.explainDenial(DESK, question)).toEqual({
      reason: "not_subscribed",
    });
  });

  it("DENY-06: a Property the viewer is not assigned to, forged, or not an id at all is one answer", async () => {
    const stale: Denial = { reason: "not_reachable" };
    expect(await integrations(DESK, SWITCHED_OFF)).toEqual(stale);
    expect(await integrations(OWNER, LAPSED)).toEqual(stale);
    expect(await integrations(OWNER, NEVER_ASSIGNED)).toEqual(stale);
    expect(await integrations(OWNER, "not-an-id")).toEqual(stale);
    expect(await integrations(NOBODY, BOUGHT)).toEqual(stale);
  });

  it("DENY-07: somebody who reaches no Property is told so, not given a gate", async () => {
    expect(await integrations(NOBODY)).toEqual({ reason: "no_property" });
  });

  it("DENY-08: with no Property named, the answer is the furthest any Property they reach got", async () => {
    // The Owner reaches Properties where it is on and off: on is the answer.
    expect(await integrations(OWNER)).toEqual({ reason: "open" });
    expect(await integrations(DESK)).toEqual({
      reason: "no_permission",
      permission: "integrations.view",
    });
    expect(
      await core.explainDenial(OWNER, {
        capability: HR,
        permission: "hr.view",
      }),
    ).toEqual({ reason: "not_subscribed" });
  });

  it("DENY-08b: any one of several permissions opens it, and one alone is named when none is held", async () => {
    const eitherWay = {
      capability: INTEGRATIONS,
      permission: ["integrations.view", "integrations.manage"],
      propertyId: BOUGHT,
    };
    expect(
      await core.explainDenial(MANAGER_OF_INTEGRATIONS, eitherWay),
    ).toEqual({ reason: "open" });
    // Asked for the one it does not hold, the same person is refused.
    expect(
      await core.explainDenial(MANAGER_OF_INTEGRATIONS, {
        ...eitherWay,
        permission: "integrations.view",
      }),
    ).toEqual({ reason: "no_permission", permission: "integrations.view" });
    // Somebody holding neither is told the first, which is the one that opens
    // the screen to look, and every one that would have opened it (CALENDAR-18).
    expect(await core.explainDenial(DESK, eitherWay)).toEqual({
      reason: "no_permission",
      permission: "integrations.view",
      anyOf: ["integrations.view", "integrations.manage"],
    });
  });

  it("DENY-09: a destination no package selection removes asks only the permission", async () => {
    const audit = { permission: "audit.read", propertyId: BOUGHT };
    expect(await core.explainDenial(OWNER, audit)).toEqual({ reason: "open" });
    expect(await core.explainDenial(DESK, audit)).toEqual({
      reason: "no_permission",
      permission: "audit.read",
    });
    // The lapsed Organization's Subscription is not asked about.
    expect(
      await core.explainDenial(LAPSED_OWNER, {
        permission: "audit.read",
        propertyId: LAPSED,
      }),
    ).toEqual({ reason: "open" });
  });
});

describe("the explanation and the rail cannot disagree", () => {
  const cases: [string, string, CapabilityRef | undefined, string, string?][] =
    [
      ["Owner", OWNER, INTEGRATIONS, "integrations.view", BOUGHT],
      ["Owner", OWNER, INTEGRATIONS, "integrations.view", SWITCHED_OFF],
      ["Front desk", DESK, INTEGRATIONS, "integrations.view", BOUGHT],
      ["Lapsed Owner", LAPSED_OWNER, INTEGRATIONS, "integrations.view", LAPSED],
      ["Owner", OWNER, HR, "hr.view", BOUGHT],
      ["Owner", OWNER, undefined, "audit.read", BOUGHT],
      ["Front desk", DESK, undefined, "audit.read", BOUGHT],
      ["Owner", OWNER, INTEGRATIONS, "integrations.view"],
      ["Nobody", NOBODY, INTEGRATIONS, "integrations.view"],
    ];

  for (const [who, userId, capability, permission, propertyId] of cases) {
    it(`DENY-10: ${who}, ${permission}, ${propertyId ?? "no Property named"}`, async () => {
      const listed = await core.listPermittedProperties(
        userId,
        permission,
        capability,
      );
      const opens = propertyId
        ? listed.some((property) => property.propertyId === propertyId)
        : listed.length > 0;
      const denial = await core.explainDenial(userId, {
        capability,
        permission,
        propertyId,
      });
      expect(denial.reason === "open").toBe(opens);
    });
  }
});
