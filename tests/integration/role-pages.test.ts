/**
 * Which pages each shipped role is offered (SP-S6-01 to SP-S6-06).
 *
 * A role reaches the pages of the work it does and no others, so the shell can
 * show a Housekeeping Staff Member three pages and not a dozen. The rail, the
 * Property switcher and every page ask one gate (`gateOf`), and the shell asks
 * all of them in one read (`listPermittedPropertiesByGate`); this holds that
 * read to two things against the roles Ranza ships, in a real database:
 *
 * - the pages each role is offered are the ones written down below, so a role
 *   that gains or loses a page does so in this table, where a reviewer sees it;
 * - the bulk read answers exactly what `listPermittedProperties` answers for
 *   each permission alone, so the two ways of asking cannot disagree.
 *
 * It runs as `ranza_app`: the policies a member's own reads pass through.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCoreModule } from "../../packages/ranza/core/src";
import { createPrismaClient } from "../../packages/db/src";
import {
  ALL_SCREENS,
  gateOf,
} from "../../apps/operator-workspace/src/lib/screens";

const ORG = "e6600002-0000-4000-8000-000000000001";
const PROPERTY = "e6600004-0000-4000-8000-000000000001";
const SHIPPED = "00000000-0000-0000-0000-000000000000";

const ROLES = ["owner", "manager", "front_desk", "finance", "housekeeping"];
const USER = Object.fromEntries(
  ROLES.map((role, index) => [
    role,
    `e6600001-0000-4000-8000-00000000000${index + 1}`,
  ]),
);

/** Every destination a role's permissions decide: Today is everybody's, and a group is not a page. */
const GATED = ALL_SCREENS.filter(
  (screen) => !screen.children && !screen.derived && screen.segment !== "today",
);

const FRONT_OFFICE = [
  "reservations",
  "room-calendar",
  "rooms",
  "arrivals",
  "departures",
  "close-day",
];

/** The pages each shipped role is offered, besides Today. */
const OFFERED: Record<string, string[]> = {
  housekeeping: ["guest-experience", "housekeeping", "maintenance"],
  finance: ["departures", "finance", "maintenance", "analytics", "data-export"],
  front_desk: [
    ...FRONT_OFFICE,
    "guest-experience",
    "housekeeping",
    "maintenance",
    "finance",
  ],
};

/**
 * An Owner who reaches the whole Organization and stands apart from the five
 * above: the database refuses to leave an Organization without somebody who can
 * add staff at every Property, so the scope of any of the five can only be
 * moved and moved back while this one holds that place.
 */
const KEEPER = "e6600001-0000-4000-8000-0000000000a1";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const core = createCoreModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

async function offeredTo(userId: string): Promise<string[]> {
  const answers = await core.listPermittedPropertiesByGate(
    userId,
    GATED.map((screen) => {
      const gate = gateOf(screen.segment);
      const permissions =
        typeof gate.permission === "string"
          ? [gate.permission]
          : (gate.permission ?? []);
      return {
        permissions,
        capability: gate.capability,
        organizationWide: gate.organizationWide,
      };
    }),
  );
  return GATED.filter((_, index) => (answers[index]?.length ?? 0) > 0).map(
    (screen) => screen.segment,
  );
}

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1,'Role Pages Organization','active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     values ($1,$2,'Role Pages Property') on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1,'active')
     on conflict (organization_id) do update set status = 'active'`,
    ORG,
  );
  // Every module and capability a destination asks for is on, so what separates
  // one role from another is its permissions and nothing else.
  const modules = [...new Set(GATED.map((screen) => screen.module))];
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     select $1, module_key, 'active' from unnest($2::text[]) as module_key
     on conflict (organization_id, module_key) do update set status = 'active'`,
    ORG,
    modules,
  );
  const capabilities = [
    ...new Set(
      GATED.map((screen) => gateOf(screen.segment).capability?.capabilityKey),
    ),
  ].filter((key): key is string => key !== undefined);
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select $1::uuid, $2::uuid, capability_key, true
       from unnest($3::text[]) as capability_key
     on conflict (property_id, capability_key) do update set enabled = true`,
    PROPERTY,
    ORG,
    capabilities,
  );
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values ($1,$2) on conflict (id) do nothing`,
    KEEPER,
    "role-pages-keeper@example.test",
  );
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope)
     values ($1,$2,'owner',$3,'organization_wide')
     on conflict (organization_id, user_id) do update
       set status = 'active', revoked_at = null, access_scope = 'organization_wide'`,
    ORG,
    KEEPER,
    SHIPPED,
  );
  for (const role of ROLES) {
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1,$2) on conflict (id) do nothing`,
      USER[role],
      `role-pages-${role}@example.test`,
    );
    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, role_scope_id, access_scope)
       values ($1,$2,$3,$4,'assigned_properties')
       on conflict (organization_id, user_id) do update
         set status = 'active', revoked_at = null, role = excluded.role`,
      ORG,
      USER[role],
      role,
      SHIPPED,
    );
    await owner.$executeRawUnsafe(
      `insert into public.property_assignments
         (property_id, organization_id, user_id) values ($1,$2,$3)
       on conflict (property_id, user_id) do update
         set status = 'active', revoked_at = null`,
      PROPERTY,
      ORG,
      USER[role],
    );
  }
});

afterAll(async () => {
  await owner.$executeRawUnsafe(
    "delete from public.property_assignments where organization_id = $1",
    ORG,
  );
  await owner.$executeRawUnsafe(
    "delete from public.organization_memberships where organization_id = $1",
    ORG,
  );
  await owner.$disconnect();
  await prisma.$disconnect();
});

describe("the pages a shipped role is offered", () => {
  for (const [role, pages] of Object.entries(OFFERED)) {
    it(`SP-S6-01: ${role} is offered ${pages.length} pages besides Today, and no others`, async () => {
      expect((await offeredTo(USER[role]!)).sort()).toEqual([...pages].sort());
    });
  }

  it("SP-S6-02: an Owner and a Manager are offered every page a Front desk is, and the rest of the work of running the Property", async () => {
    const front = new Set(OFFERED.front_desk);
    for (const role of ["owner", "manager"]) {
      const offered = new Set(await offeredTo(USER[role]!));
      for (const page of front) expect(offered.has(page)).toBe(true);
      for (const page of [
        "people",
        "hr",
        "analytics",
        "configuration",
        "integrations",
        "data-export",
        "audit-log",
      ]) {
        expect(offered.has(page)).toBe(true);
      }
    }
  });

  it("SP-S6-03: nobody else is offered the Owner's pages — a Housekeeping role is not offered Finance, People, HR, Analytics or Configuration", async () => {
    const offered = new Set(await offeredTo(USER.housekeeping!));
    for (const page of [
      "finance",
      "people",
      "hr",
      "analytics",
      "configuration",
    ]) {
      expect(offered.has(page)).toBe(false);
    }
  });
});

describe("one read for every page, and the same answer as one at a time", () => {
  for (const role of ["front_desk", "finance", "housekeeping"]) {
    it(`SP-S6-04: for ${role}, each page's list is what its permissions give one at a time`, async () => {
      const gates = GATED.map((screen) => gateOf(screen.segment));
      const bulk = await core.listPermittedPropertiesByGate(
        USER[role]!,
        gates.map((gate) => ({
          permissions:
            typeof gate.permission === "string"
              ? [gate.permission]
              : (gate.permission ?? []),
          capability: gate.capability,
          organizationWide: gate.organizationWide,
        })),
      );
      for (const [index, gate] of gates.entries()) {
        // The one-at-a-time read cannot ask for the whole Organization's reach,
        // so a gate that does is held on its own, below (ACC-S3-01).
        if (gate.organizationWide) continue;
        const permissions =
          typeof gate.permission === "string"
            ? [gate.permission]
            : (gate.permission ?? []);
        const single = await Promise.all(
          permissions.map((permission) =>
            core.listPermittedProperties(
              USER[role]!,
              permission,
              gate.capability,
            ),
          ),
        );
        const ids = (list: readonly { propertyId: string }[]) =>
          [...new Set(list.map((property) => property.propertyId))].sort();
        expect(ids(bulk[index] ?? [])).toEqual(ids(single.flat()));
      }
    });
  }

  it("SP-S6-05: no gates is no read, and a gate with no permissions lists nothing", async () => {
    expect(await core.listPermittedPropertiesByGate(USER.owner!, [])).toEqual(
      [],
    );
    expect(
      await core.listPermittedPropertiesByGate(USER.owner!, [
        { permissions: [] },
      ]),
    ).toEqual([[]]);
  });

  it("SP-S6-06: somebody who belongs to no Organization is offered nothing", async () => {
    expect(await offeredTo("e6600001-0000-4000-8000-0000000000ff")).toEqual([]);
  });
});

describe("the ledger is the whole Organization's (ACC-S3-01)", () => {
  async function reaching<T>(
    role: string,
    scope: "organization_wide" | "assigned_properties",
    run: () => Promise<T>,
  ): Promise<T> {
    const setScope = (value: string) =>
      owner.$executeRawUnsafe(
        "update public.organization_memberships set access_scope = $1 where organization_id = $2 and user_id = $3",
        value,
        ORG,
        USER[role],
      );
    await setScope(scope);
    try {
      return await run();
    } finally {
      await setScope("assigned_properties");
    }
  }

  const ledger = gateOf("ledger");
  const question = {
    capability: ledger.capability,
    permission: ledger.permission,
    organizationWide: ledger.organizationWide,
  };

  it("offers it to a role holding finance.view_ledger only once that role reaches every Property", async () => {
    for (const role of ["owner", "manager", "finance"]) {
      expect(await offeredTo(USER[role]!), `${role}, assigned`).not.toContain(
        "ledger",
      );
      expect(
        await reaching(role, "organization_wide", () => offeredTo(USER[role]!)),
        `${role}, whole Organization`,
      ).toContain("ledger");
    }
  });

  it("never offers it to a role without the permission, however far it reaches", async () => {
    for (const role of ["front_desk", "housekeeping"]) {
      expect(
        await reaching(role, "organization_wide", () => offeredTo(USER[role]!)),
        role,
      ).not.toContain("ledger");
    }
  });

  it("says which of the two is missing", async () => {
    expect(
      await core.explainDenial(USER.finance!, {
        ...question,
        propertyId: PROPERTY,
      }),
    ).toEqual({ reason: "not_organization_wide" });
    expect(
      await reaching("front_desk", "organization_wide", () =>
        core.explainDenial(USER.front_desk!, {
          ...question,
          propertyId: PROPERTY,
        }),
      ),
    ).toMatchObject({
      reason: "no_permission",
      permission: "finance.view_ledger",
    });
    expect(
      await reaching("finance", "organization_wide", () =>
        core.explainDenial(USER.finance!, {
          ...question,
          propertyId: PROPERTY,
        }),
      ),
    ).toEqual({ reason: "open" });
  });
});
