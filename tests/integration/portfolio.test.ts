/**
 * The portfolio read against a real database (docs/features/portfolio, slice 1).
 *
 * `getPortfolio` is one statement under `withOrganizationContext`, run as
 * `ranza_app` under the policies, composed the way the workspace composes it:
 * who reaches a Property, which gates a figure passes and whether money may
 * leave the server are the database's answers here, not a fixture's. Every row
 * of docs/features/portfolio/edge-cases.csv has the test its `test_name` names.
 *
 * Each Organization is new every run. A Stay, a Folio line and a Property
 * cannot be deleted, and this suite counts rows ("five Properties"), so a
 * fixed Organization would pass once and then read last run's leftovers. The
 * Staff Members are fixed: a user is only a reach into whatever Organization a
 * test names.
 *
 * Breaks that were run, and what went red:
 *   the Organization filter removed                  PF-S1-24, PF-S1-25
 *   the Subscription status clause removed           PF-S1-09
 *   the accessible_property_ids() clause removed     PF-S1-04
 *   both of those two clauses removed        PF-S1-04, PF-S1-09, PF-S1-26
 *   the finance.manage_folio mask dropped            PF-S1-12
 *   the out_of_service exclusion changed             PF-S1-15
 *
 * Two clauses sit behind narrower guarantees, and the tests are shaped around
 * where they diverge. accessible_property_ids() is also what the `properties`
 * policy asks, so for a Staff Member alone its clause in the query is subsumed.
 * They part for somebody who reaches a Property as a Resident (ADR 0009): the
 * policy admits that row and only the clause hides it, which is the Staff
 * Member in PF-S1-04. A plain Resident (PF-S1-26) is shielded twice, because
 * the Subscription is readable only by a member, so that test goes red only
 * when both clauses are gone.
 */
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import { createReservationsModule } from "../../packages/ranza/reservations/src";

// composition.ts is `server-only` and opens the environment's connections; the
// suite hands the read the client it wants to measure instead.
const server = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../../apps/operator-workspace/src/server/composition", () => ({
  getComposition: () => ({ db: server.db }),
}));

import {
  getPortfolio,
  PortfolioTooLargeError,
  type Portfolio,
  type PortfolioProperty,
} from "../../apps/operator-workspace/src/server/portfolio";

const OWNER = "d1000001-0000-4000-8000-000000000001";
const ASSIGNEE = "d1000001-0000-4000-8000-000000000002";
const HOUSEKEEPER = "d1000001-0000-4000-8000-000000000003";
const DESK = "d1000001-0000-4000-8000-000000000004";
const OWNER_ELSEWHERE = "d1000001-0000-4000-8000-000000000005";
const NOBODY = "d1000001-0000-4000-8000-000000000006";
const RESIDENT = "d1000001-0000-4000-8000-000000000007";

const CEILING = 200;
const ALL_CAPABILITIES = [
  "analytics",
  "front_desk",
  "maintenance",
  "finance",
] as const;

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);
const reservations = createReservationsModule({ db: prisma });

interface PropertySeed {
  name?: string;
  timezone?: string;
  currency?: string;
  status?: "active" | "archived";
  capabilities?: readonly string[];
}

async function organization(
  status:
    "trialing" | "active" | "past_due" | "suspended" | "cancelled" = "active",
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, 'Portfolio ' || left($1::text, 8), 'active')`,
    id,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status) values ($1::uuid, $2)`,
    id,
    status,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     select $1::uuid, module_key, 'active'
       from unnest(array['platform_core', 'front_office', 'maintenance',
                         'billing_folios', 'analytics']) as module_key`,
    id,
  );
  return id;
}

async function property(
  organizationId: string,
  seed: PropertySeed = {},
): Promise<string> {
  const id = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.properties
       (id, organization_id, name, timezone, currency, status)
     values ($1::uuid, $2::uuid, coalesce($3, 'Portfolio ' || left($1::text, 8)),
             $4, $5, $6)`,
    id,
    organizationId,
    seed.name ?? null,
    seed.timezone ?? "Europe/Istanbul",
    seed.currency ?? "TRY",
    seed.status ?? "active",
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     select $1::uuid, $2::uuid, capability_key, true
       from unnest($3::text[]) as capability_key`,
    id,
    organizationId,
    [...(seed.capabilities ?? ALL_CAPABILITIES)],
  );
  return id;
}

/** `count` Properties in one statement, for the ceiling and the loop. */
async function manyProperties(
  organizationId: string,
  count: number,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name)
     select gen_random_uuid(), $1::uuid, 'Bulk ' || n
       from generate_series(1, $2::int) as n`,
    organizationId,
    count,
  );
}

async function member(
  organizationId: string,
  userId: string,
  role: "owner" | "manager" | "front_desk" | "housekeeping",
  scope: "organization_wide" | "assigned_properties" = "organization_wide",
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, access_scope)
     values ($1::uuid, $2::uuid, $3, $4)`,
    organizationId,
    userId,
    role,
    scope,
  );
}

async function assign(
  organizationId: string,
  propertyId: string,
  userId: string,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments
       (property_id, organization_id, user_id) values ($1::uuid, $2::uuid, $3::uuid)`,
    propertyId,
    organizationId,
    userId,
  );
}

async function unit(
  organizationId: string,
  propertyId: string,
  options: {
    status?: "available" | "blocked" | "out_of_service";
    parentId?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const status = options.status ?? "available";
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity, status,
        status_reason, parent_id, parent_unit_type)
     values ($1::uuid, $2::uuid, $3::uuid, 'PF-' || left($1::text, 8),
             $4, $5, $6, $7, $8::uuid, $9)`,
    id,
    propertyId,
    organizationId,
    options.parentId ? "bed" : "room",
    options.parentId ? 1 : 2,
    status,
    status === "blocked" ? "Held for the portfolio test" : null,
    options.parentId ?? null,
    options.parentId ? "room" : null,
  );
  return id;
}

/**
 * `total` rooms, the first `occupied` of them in house, the last
 * `outOfService` of them held out of order. Without a Reservation: a Stay may
 * begin without one, and sixty Guests are not what these counts are about.
 */
async function fillUnits(
  organizationId: string,
  propertyId: string,
  counts: { total: number; occupied: number; outOfService?: number },
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.accommodation_units
       (id, property_id, organization_id, name, unit_type, capacity, status)
     select gen_random_uuid(), $1::uuid, $2::uuid, 'F-' || lpad(n::text, 4, '0'),
            'room', 2,
            case when n > $3::int - $4::int then 'out_of_service' else 'available' end
       from generate_series(1, $3::int) as n`,
    propertyId,
    organizationId,
    counts.total,
    counts.outOfService ?? 0,
  );
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, stay_type, status,
        starts_on, ends_on)
     select $2::uuid, $1::uuid, unit.id, 'guest', 'in_house',
            app.property_today($1::uuid) - 1, app.property_today($1::uuid) + 1
       from public.accommodation_units as unit
      where unit.property_id = $1::uuid and unit.name like 'F-%'
        and unit.status = 'available'
      order by unit.name
      limit $3::int`,
    propertyId,
    organizationId,
    counts.occupied,
  );
}

/** A Guest's Stay, dated against the Property's own day. */
async function stay(
  organizationId: string,
  propertyId: string,
  unitId: string,
  options: {
    status?: "in_house" | "departed";
    startsOffset?: number;
    endsOffset?: number;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const status = options.status ?? "in_house";
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($2::uuid, 'Portfolio Guest') returning id
     ), reservation as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest',
              case when $5 = 'departed' then 'checked_out' else 'checked_in' end,
              app.property_today($3::uuid) + $6::int,
              app.property_today($3::uuid) + $7::int
         from guest
       returning id
     )
     insert into public.stays
       (id, organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on, departed_at)
     select $1::uuid, $2::uuid, $3::uuid, $4::uuid, reservation.id, 'guest', $5,
            app.property_today($3::uuid) + $6::int,
            app.property_today($3::uuid) + $7::int,
            case when $5 = 'departed' then now() end
       from reservation`,
    id,
    organizationId,
    propertyId,
    unitId,
    status,
    options.startsOffset ?? -2,
    options.endsOffset ?? 1,
  );
  return id;
}

/** A Resident in house with no end date, of the Property's own Organization. */
async function residentStay(
  organizationId: string,
  propertyId: string,
  userId: string,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `insert into public.stays
       (organization_id, property_id, accommodation_unit_id, user_id, stay_type,
        status, starts_on, ends_on)
     values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'resident', 'in_house',
             app.property_today($2::uuid) - 30, null)`,
    organizationId,
    propertyId,
    await unit(organizationId, propertyId),
    userId,
  );
}

/** A Reservation due on the Property's day (offset 0) or around it. */
async function booking(
  organizationId: string,
  propertyId: string,
  status: "requested" | "confirmed" | "cancelled" | "no_show",
  startsOffset = 0,
  endsOffset = 1,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `with guest as (
       insert into public.guests (organization_id, full_name)
       values ($1::uuid, 'Portfolio Arrival') returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select $1::uuid, $2::uuid, $3::uuid, guest.id, 'guest', $4,
            app.property_today($2::uuid) + $5::int,
            app.property_today($2::uuid) + $6::int
       from guest`,
    organizationId,
    propertyId,
    await unit(organizationId, propertyId),
    status,
    startsOffset,
    endsOffset,
  );
}

async function folio(
  organizationId: string,
  propertyId: string,
  currency: string,
  stayStatus: "in_house" | "departed" = "in_house",
): Promise<string> {
  const unitId = await unit(organizationId, propertyId);
  const stayId = await stay(organizationId, propertyId, unitId, {
    status: stayStatus,
  });
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.folios (organization_id, property_id, stay_id, currency)
     values ($1::uuid, $2::uuid, $3::uuid, $4) returning id`,
    organizationId,
    propertyId,
    stayId,
    currency,
  );
  return row!.id;
}

/** A signed line: a charge is positive, a payment negative (ADR 0015). */
async function post(
  organizationId: string,
  propertyId: string,
  folioId: string,
  line: {
    type: "charge" | "payment" | "reversal";
    amount: number;
    of?: string;
  },
): Promise<string> {
  const [row] = await owner.$queryRawUnsafe<{ id: string }[]>(
    `insert into public.folio_lines
       (organization_id, property_id, folio_id, line_type, description,
        amount_minor, reverses_line_id, payment_method)
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'Portfolio line', $5::bigint,
             $6::uuid, $7)
     returning id`,
    organizationId,
    propertyId,
    folioId,
    line.type,
    line.amount,
    line.of ?? null,
    line.type === "payment" ? "cash" : null,
  );
  return row!.id;
}

/** Closes a Folio that still has a balance, which the desk's trigger refuses. */
async function closeFolio(folioId: string): Promise<void> {
  await owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("set local session_replication_role = replica");
    await tx.$executeRawUnsafe(
      `update public.folios set status = 'closed', closed_at = now()
        where id = $1::uuid`,
      folioId,
    );
  });
}

/** An open Folio owing exactly `amount`. */
async function owing(
  organizationId: string,
  propertyId: string,
  currency: string,
  amount: number,
): Promise<void> {
  const id = await folio(organizationId, propertyId, currency);
  await post(organizationId, propertyId, id, { type: "charge", amount });
}

/**
 * Requests in the given states. Inserted with triggers off: the stamp trigger
 * forces `new` and an acting Staff Member, and the states under test are the
 * ones the maintenance module reaches through several moves.
 */
async function requests(
  organizationId: string,
  propertyId: string,
  statuses: readonly string[],
): Promise<void> {
  const unitId = await unit(organizationId, propertyId);
  await owner.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("set local session_replication_role = replica");
    for (const [index, status] of statuses.entries()) {
      await tx.$executeRawUnsafe(
        `insert into public.maintenance_requests
           (organization_id, property_id, number, title, accommodation_unit_id,
            status, cancel_reason, reported_by)
         values ($1::uuid, $2::uuid, $3::int, 'Portfolio request', $4::uuid, $5,
                 case when $5 = 'cancelled' then 'Not a fault' end, $6::uuid)`,
        organizationId,
        propertyId,
        index + 1,
        unitId,
        status,
        OWNER,
      );
    }
  });
}

async function setSubscription(
  organizationId: string,
  status: string,
): Promise<void> {
  await owner.$executeRawUnsafe(
    `update public.subscriptions set status = $2 where organization_id = $1::uuid`,
    organizationId,
    status,
  );
}

/** An Organization with an Owner, and `count` fully enabled Properties. */
async function owned(count = 1): Promise<{
  organizationId: string;
  propertyIds: string[];
}> {
  const organizationId = await organization();
  await member(organizationId, OWNER, "owner");
  const propertyIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    propertyIds.push(await property(organizationId));
  }
  return { organizationId, propertyIds };
}

function row(portfolio: Portfolio, propertyId: string): PortfolioProperty {
  const found = portfolio.properties.find((p) => p.propertyId === propertyId);
  if (!found) throw new Error(`no row for ${propertyId}`);
  return found;
}

function figures(entry: PortfolioProperty): unknown[] {
  return [
    entry.sellableUnits,
    entry.occupiedUnits,
    entry.arrivalsToCome,
    entry.departuresToCome,
    entry.openMaintenanceRequests,
    entry.openFolioBalanceMinor,
  ];
}

/** A timezone that reads one in the morning now, so before the 04:00 cutoff. */
function justAfterMidnight(): string {
  const now = new Date();
  const target = now.getUTCMinutes() >= 50 ? 2 : 1;
  let offset = (((target - now.getUTCHours()) % 24) + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return "Etc/GMT";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

/** The statements a read sends, counted where the read hands them over. */
function counted(db: typeof prisma) {
  const statements: string[] = [];
  const sent = new Set<string | symbol>([
    "$queryRaw",
    "$queryRawUnsafe",
    "$executeRaw",
    "$executeRawUnsafe",
  ]);
  const counting = {
    $transaction: (run: (tx: unknown) => Promise<unknown>, options?: unknown) =>
      db.$transaction(
        (tx) =>
          run(
            new Proxy(tx, {
              get(target, name) {
                const value = Reflect.get(target, name, target);
                if (typeof value !== "function") return value;
                if (!sent.has(name)) return value.bind(target);
                return (...args: unknown[]) => {
                  statements.push(String(name));
                  return value.apply(target, args);
                };
              },
            }),
          ),
        options as never,
      ),
  };
  return { statements, db: counting as unknown as typeof prisma };
}

let info: MockInstance<typeof console.info>;
let failure: MockInstance<typeof console.error>;

beforeAll(async () => {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'portfolio-owner@example.test'), ($2, 'portfolio-assignee@example.test'),
       ($3, 'portfolio-housekeeper@example.test'), ($4, 'portfolio-desk@example.test'),
       ($5, 'portfolio-elsewhere@example.test'), ($6, 'portfolio-nobody@example.test'),
       ($7, 'portfolio-resident@example.test')
     on conflict (id) do nothing`,
    OWNER,
    ASSIGNEE,
    HOUSEKEEPER,
    DESK,
    OWNER_ELSEWHERE,
    NOBODY,
    RESIDENT,
  );
});

beforeEach(() => {
  server.db = prisma;
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  failure = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("who reads which rows", () => {
  it("anyone_reaching_a_property_reads_its_row", async () => {
    const { organizationId, propertyIds } = await owned();
    await member(organizationId, HOUSEKEEPER, "housekeeping");
    await member(organizationId, DESK, "front_desk");
    for (const viewer of [OWNER, HOUSEKEEPER, DESK]) {
      const portfolio = await getPortfolio(viewer, organizationId);
      expect(portfolio.properties.map((p) => p.propertyId)).toEqual(
        propertyIds,
      );
    }
  });

  it("an_organization_wide_member_reads_every_active_property", async () => {
    const { organizationId, propertyIds } = await owned(5);
    const portfolio = await getPortfolio(OWNER, organizationId);
    expect(portfolio.properties.map((p) => p.propertyId).sort()).toEqual(
      [...propertyIds].sort(),
    );
  });

  it("an_assigned_member_reads_only_their_properties", async () => {
    const { organizationId, propertyIds } = await owned(5);
    await member(organizationId, ASSIGNEE, "manager", "assigned_properties");
    await assign(organizationId, propertyIds[0]!, ASSIGNEE);
    await assign(organizationId, propertyIds[3]!, ASSIGNEE);

    const portfolio = await getPortfolio(ASSIGNEE, organizationId);
    expect(portfolio.properties.map((p) => p.propertyId).sort()).toEqual(
      [propertyIds[0]!, propertyIds[3]!].sort(),
    );
    // No count and no placeholder for the other three.
    expect(portfolio.properties).toHaveLength(2);
    expect(JSON.stringify(portfolio)).not.toContain(propertyIds[1]!);
  });

  it("an_unreached_property_is_absent_not_withheld", async () => {
    const { organizationId, propertyIds } = await owned(3);
    const [first, second, unreached] = propertyIds as [string, string, string];
    await member(organizationId, ASSIGNEE, "manager", "assigned_properties");
    await assign(organizationId, first, ASSIGNEE);
    await assign(organizationId, second, ASSIGNEE);
    // The same person holds a Resident's Stay at the third Property, which is a
    // different reach (ADR 0009): the `properties` policy lets them read its
    // row, and only the query's own clause keeps it out of the portfolio.
    await residentStay(organizationId, unreached, ASSIGNEE);
    const policyAdmitsIt = await withOrganizationContext(
      prisma,
      { userId: ASSIGNEE },
      (tx) =>
        tx.$queryRaw<{ id: string }[]>`
          select id::text from public.properties where id = ${unreached}::uuid`,
    );
    expect(policyAdmitsIt).toHaveLength(1);

    const portfolio = await getPortfolio(ASSIGNEE, organizationId);
    expect(portfolio.properties.map((p) => p.propertyId).sort()).toEqual(
      [first, second].sort(),
    );
    expect(JSON.stringify(portfolio)).not.toContain(unreached);
  });

  it("an_archived_property_is_absent_for_an_owner", async () => {
    const { organizationId, propertyIds } = await owned();
    await property(organizationId, { status: "archived" });
    const portfolio = await getPortfolio(OWNER, organizationId);
    expect(portfolio.properties.map((p) => p.propertyId)).toEqual(propertyIds);
  });

  it("a_member_reaching_nothing_gets_an_empty_list", async () => {
    const { organizationId } = await owned();
    // The control: the Organization has a Property somebody reaches.
    expect((await getPortfolio(OWNER, organizationId)).properties).toHaveLength(
      1,
    );
    // No membership at all.
    const stranger = await getPortfolio(NOBODY, organizationId);
    expect(stranger.properties).toEqual([]);
    // A membership that reaches no Property: assigned to none.
    await member(organizationId, ASSIGNEE, "manager", "assigned_properties");
    const unassigned = await getPortfolio(ASSIGNEE, organizationId);
    expect(unassigned.properties).toEqual([]);
    // An Organization whose only Property is archived.
    const closed = await organization();
    await member(closed, OWNER, "owner");
    await property(closed, { status: "archived" });
    expect((await getPortfolio(OWNER, closed)).properties).toEqual([]);
    expect(unassigned.occupancy).toEqual({
      occupiedUnits: 0,
      sellableUnits: 0,
    });
    expect(unassigned.balancesByCurrency).toEqual([]);
  });

  it("a_single_property_viewer_gets_one_row", async () => {
    const { organizationId, propertyIds } = await owned(3);
    await member(organizationId, ASSIGNEE, "manager", "assigned_properties");
    await assign(organizationId, propertyIds[1]!, ASSIGNEE);
    const portfolio = await getPortfolio(ASSIGNEE, organizationId);
    expect(portfolio.properties.map((p) => p.propertyId)).toEqual([
      propertyIds[1],
    ]);
  });

  it("each_row_carries_the_property_id", async () => {
    const { organizationId, propertyIds } = await owned(3);
    const portfolio = await getPortfolio(OWNER, organizationId);
    for (const entry of portfolio.properties) {
      expect(entry.propertyId).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(portfolio.properties.map((p) => p.propertyId).sort()).toEqual(
      [...propertyIds].sort(),
    );
    expect(portfolio.organizationId).toBe(organizationId);
  });
});

describe("what admits an Organization", () => {
  it("a_past_due_organization_still_reads_its_portfolio", async () => {
    const organizationId = await organization("past_due");
    await member(organizationId, OWNER, "owner");
    const propertyId = await property(organizationId);
    const portfolio = await getPortfolio(OWNER, organizationId);
    expect(portfolio.properties.map((p) => p.propertyId)).toEqual([propertyId]);
    expect(portfolio.properties[0]!.entitled).toBe(true);

    const trialing = await organization("trialing");
    await member(trialing, OWNER, "owner");
    await property(trialing);
    expect((await getPortfolio(OWNER, trialing)).properties).toHaveLength(1);
  });

  it("a_suspended_or_cancelled_organization_gets_an_empty_portfolio", async () => {
    const { organizationId } = await owned(2);
    expect((await getPortfolio(OWNER, organizationId)).properties).toHaveLength(
      2,
    );
    for (const status of ["suspended", "cancelled"]) {
      await setSubscription(organizationId, status);
      const portfolio = await getPortfolio(OWNER, organizationId);
      // The same answer as having nothing: not withheld rows.
      expect(portfolio.properties).toEqual([]);
      expect(portfolio.balancesByCurrency).toEqual([]);
    }
    await setSubscription(organizationId, "active");
    expect((await getPortfolio(OWNER, organizationId)).properties).toHaveLength(
      2,
    );
  });

  it("a_reached_property_without_the_capability_is_withheld_not_dropped", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const entitled = await property(organizationId, { name: "Open Hotel" });
    const withheld = await property(organizationId, {
      name: "Withheld Hotel",
      capabilities: ["front_desk", "maintenance", "finance"],
    });
    await fillUnits(organizationId, entitled, { total: 3, occupied: 1 });
    await fillUnits(organizationId, withheld, { total: 3, occupied: 1 });

    const portfolio = await getPortfolio(OWNER, organizationId);
    expect(portfolio.properties).toHaveLength(2);
    const open = row(portfolio, entitled);
    const shut = row(portfolio, withheld);
    expect(open.entitled).toBe(true);
    expect(open.sellableUnits).toBe(3);
    expect(shut.entitled).toBe(false);
    expect(shut.propertyName).toBe("Withheld Hotel");
    expect(figures(shut)).toEqual([null, null, null, null, null, null]);
    // A withheld Property is not counted into the occupancy total.
    expect(portfolio.occupancy).toEqual({ occupiedUnits: 1, sellableUnits: 3 });

    // Switched off where it was on: the same, by the row's own flag.
    await owner.$executeRawUnsafe(
      `update public.property_capabilities set enabled = false
        where property_id = $1::uuid and capability_key = 'analytics'`,
      entitled,
    );
    const off = row(await getPortfolio(OWNER, organizationId), entitled);
    expect(off.entitled).toBe(false);
    expect(figures(off)).toEqual([null, null, null, null, null, null]);
  });

  it("a_disabled_module_gives_a_null_figure_not_zero", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const noMaintenance = await property(organizationId, {
      capabilities: ["analytics", "front_desk", "finance"],
    });
    const noFrontDesk = await property(organizationId, {
      capabilities: ["analytics", "maintenance", "finance"],
    });
    const noFinance = await property(organizationId, {
      capabilities: ["analytics", "front_desk", "maintenance"],
    });
    for (const id of [noMaintenance, noFrontDesk, noFinance]) {
      await fillUnits(organizationId, id, { total: 2, occupied: 1 });
      await requests(organizationId, id, ["new"]);
      await owing(organizationId, id, "TRY", 900);
    }

    const portfolio = await getPortfolio(OWNER, organizationId);
    const a = row(portfolio, noMaintenance);
    expect(a.openMaintenanceRequests).toBeNull();
    expect(a.sellableUnits).toBeGreaterThan(0);
    expect(a.openFolioBalanceMinor).toBe(900);

    const b = row(portfolio, noFrontDesk);
    expect([
      b.sellableUnits,
      b.occupiedUnits,
      b.arrivalsToCome,
      b.departuresToCome,
    ]).toEqual([null, null, null, null]);
    expect(b.openMaintenanceRequests).toBe(1);
    expect(b.openFolioBalanceMinor).toBe(900);

    const c = row(portfolio, noFinance);
    expect(c.openFolioBalanceMinor).toBeNull();
    expect(c.openMaintenanceRequests).toBe(1);
    expect(c.sellableUnits).toBeGreaterThan(0);
  });

  it("a_reader_without_finance_permission_sees_no_money", async () => {
    const { organizationId, propertyIds } = await owned(2);
    await member(organizationId, HOUSEKEEPER, "housekeeping");
    for (const id of propertyIds) {
      await fillUnits(organizationId, id, { total: 4, occupied: 2 });
      await owing(organizationId, id, "TRY", 5_000);
    }

    const masked = await getPortfolio(HOUSEKEEPER, organizationId);
    expect(masked.properties).toHaveLength(2);
    for (const entry of masked.properties) {
      expect(entry.openFolioBalanceMinor).toBeNull();
      // Four rooms, two occupied, and the Guest who owes occupies a fifth.
      expect(entry.occupiedUnits).toBe(3);
      expect(entry.sellableUnits).toBe(5);
    }
    expect(masked.balancesByCurrency).toEqual([]);
    expect(JSON.stringify(masked)).not.toContain("5000");

    const holder = await getPortfolio(OWNER, organizationId);
    expect(holder.properties.map((p) => p.openFolioBalanceMinor)).toEqual([
      5_000, 5_000,
    ]);
  });
});

describe("the figures", () => {
  it("money_is_never_summed_across_currencies", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const lira = await property(organizationId, { currency: "TRY" });
    const moreLira = await property(organizationId, { currency: "TRY" });
    const euro = await property(organizationId, { currency: "EUR" });
    await owing(organizationId, lira, "TRY", 1_000);
    await owing(organizationId, moreLira, "TRY", 500);
    await owing(organizationId, euro, "EUR", 7_000);

    const portfolio = await getPortfolio(OWNER, organizationId);
    expect(row(portfolio, lira)).toMatchObject({
      currency: "TRY",
      openFolioBalanceMinor: 1_000,
    });
    expect(row(portfolio, euro)).toMatchObject({
      currency: "EUR",
      openFolioBalanceMinor: 7_000,
    });
    // One entry a currency, each summed only within itself.
    expect(portfolio.balancesByCurrency).toEqual([
      { currency: "EUR", balanceMinor: 7_000 },
      { currency: "TRY", balanceMinor: 1_500 },
    ]);
    expect(Object.keys(portfolio).sort()).toEqual([
      "asOf",
      "balancesByCurrency",
      "occupancy",
      "organizationId",
      "properties",
    ]);
  });

  it("portfolio_occupancy_is_summed_counts", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const first = await property(organizationId);
    const second = await property(organizationId);
    const withheld = await property(organizationId, {
      capabilities: ["front_desk"],
    });
    await fillUnits(organizationId, first, { total: 20, occupied: 10 });
    await fillUnits(organizationId, second, { total: 40, occupied: 30 });
    await fillUnits(organizationId, withheld, { total: 9, occupied: 9 });

    const portfolio = await getPortfolio(OWNER, organizationId);
    // 40 of 60 as counts, not the mean of 50% and 75%, which would be 62.5%.
    expect(portfolio.occupancy).toEqual({
      occupiedUnits: 40,
      sellableUnits: 60,
    });
    expect(Object.keys(portfolio.occupancy).sort()).toEqual([
      "occupiedUnits",
      "sellableUnits",
    ]);
  });

  it("out_of_order_units_are_not_sellable", async () => {
    const { organizationId, propertyIds } = await owned();
    const propertyId = propertyIds[0]!;
    await unit(organizationId, propertyId); // free
    await unit(organizationId, propertyId, { status: "blocked" }); // still sellable
    await unit(organizationId, propertyId, { status: "out_of_service" });
    await unit(organizationId, propertyId, { status: "out_of_service" });
    // In house, then taken out of order around the Guest: always counted.
    const guestRoom = await unit(organizationId, propertyId);
    await stay(organizationId, propertyId, guestRoom);
    await owner.$executeRawUnsafe(
      `update public.accommodation_units set status = 'out_of_service'
        where id = $1::uuid`,
      guestRoom,
    );
    // A room with beds is not itself a unit; its beds are, and a room out of
    // order covers them whatever their own status (ADR 0032).
    const heldRoom = await unit(organizationId, propertyId, {
      status: "out_of_service",
    });
    await unit(organizationId, propertyId, { parentId: heldRoom });
    await unit(organizationId, propertyId, { parentId: heldRoom });
    const openRoom = await unit(organizationId, propertyId);
    await unit(organizationId, propertyId, { parentId: openRoom });

    const entry = row(await getPortfolio(OWNER, organizationId), propertyId);
    // Leaves: free, blocked, two out of order, the guest's, two covered beds,
    // one bed in an open room. Sellable: free, blocked, guest's, open bed.
    expect(entry.sellableUnits).toBe(4);
    expect(entry.occupiedUnits).toBe(1);
    expect(entry.occupiedUnits).toBeLessThanOrEqual(entry.sellableUnits!);
  });

  it("zero_sellable_units_returns_counts_and_no_ratio", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const bare = await property(organizationId);
    const allBroken = await property(organizationId);
    await unit(organizationId, allBroken, { status: "out_of_service" });

    const portfolio = await getPortfolio(OWNER, organizationId);
    for (const id of [bare, allBroken]) {
      expect(row(portfolio, id)).toMatchObject({
        sellableUnits: 0,
        occupiedUnits: 0,
      });
      expect(Object.keys(row(portfolio, id)).join()).not.toMatch(
        /rate|ratio|percent/i,
      );
    }
    expect(portfolio.occupancy).toEqual({ occupiedUnits: 0, sellableUnits: 0 });
  });

  it("arrivals_still_to_come_excludes_those_already_checked_in", async () => {
    const { organizationId, propertyIds } = await owned();
    const propertyId = propertyIds[0]!;
    await booking(organizationId, propertyId, "confirmed");
    await booking(organizationId, propertyId, "requested");
    // Late and still not here: the booking still covers tonight.
    await booking(organizationId, propertyId, "confirmed", -1, 2);
    // Neither is arriving.
    await booking(organizationId, propertyId, "cancelled");
    await booking(organizationId, propertyId, "no_show");
    // Already checked in today.
    const unitId = await unit(organizationId, propertyId);
    await stay(organizationId, propertyId, unitId, {
      startsOffset: 0,
      endsOffset: 1,
    });
    // Due tomorrow.
    await booking(organizationId, propertyId, "confirmed", 1, 2);

    const entry = row(await getPortfolio(OWNER, organizationId), propertyId);
    expect(entry.arrivalsToCome).toBe(3);
  });

  it("departures_still_to_come_excludes_those_already_out", async () => {
    const { organizationId, propertyIds } = await owned();
    const propertyId = propertyIds[0]!;
    const make = (options: Parameters<typeof stay>[3]) =>
      unit(organizationId, propertyId).then((id) =>
        stay(organizationId, propertyId, id, options),
      );
    await make({ startsOffset: -2, endsOffset: 0 }); // due today
    await make({ startsOffset: -4, endsOffset: -1 }); // overdue, still here
    await make({ startsOffset: -3, endsOffset: 0, status: "departed" }); // gone
    await make({ startsOffset: -1, endsOffset: 1 }); // leaves tomorrow
    await residentStay(organizationId, propertyId, RESIDENT); // no end date

    const entry = row(await getPortfolio(OWNER, organizationId), propertyId);
    expect(entry.departuresToCome).toBe(2);
  });

  it("open_maintenance_counts_requests_not_yet_done", async () => {
    const { organizationId, propertyIds } = await owned();
    const propertyId = propertyIds[0]!;
    await requests(organizationId, propertyId, [
      "new",
      "in_progress",
      "waiting_for_parts",
      "done",
      "cancelled",
    ]);
    const entry = row(await getPortfolio(OWNER, organizationId), propertyId);
    expect(entry.openMaintenanceRequests).toBe(3);
  });

  it("money_owed_is_the_sum_of_positive_folio_balances", async () => {
    const { organizationId, propertyIds } = await owned();
    const propertyId = propertyIds[0]!;

    // Charge 10 000, payment 4 000: owes 6 000.
    const paid = await folio(organizationId, propertyId, "TRY");
    await post(organizationId, propertyId, paid, {
      type: "charge",
      amount: 10_000,
    });
    await post(organizationId, propertyId, paid, {
      type: "payment",
      amount: -4_000,
    });
    // Charged then reversed: owes nothing.
    const reversed = await folio(organizationId, propertyId, "TRY");
    const charge = await post(organizationId, propertyId, reversed, {
      type: "charge",
      amount: 5_000,
    });
    await post(organizationId, propertyId, reversed, {
      type: "reversal",
      amount: -5_000,
      of: charge,
    });
    // Paid more than charged: a credit does not offset what others owe.
    const credit = await folio(organizationId, propertyId, "TRY");
    await post(organizationId, propertyId, credit, {
      type: "charge",
      amount: 1_000,
    });
    await post(organizationId, propertyId, credit, {
      type: "payment",
      amount: -3_000,
    });
    // Owes 2 500 and has no payment yet.
    await owing(organizationId, propertyId, "TRY", 2_500);
    // Closed with a balance: not open, not counted.
    const closed = await folio(organizationId, propertyId, "TRY", "departed");
    await post(organizationId, propertyId, closed, {
      type: "charge",
      amount: 9_999,
    });
    await closeFolio(closed);

    const entry = row(await getPortfolio(OWNER, organizationId), propertyId);
    expect(entry.openFolioBalanceMinor).toBe(8_500);
  });
});

describe("a Property's own day", () => {
  it("each_row_uses_its_own_business_date", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    // 25 hours apart, so the two business dates differ whenever this runs.
    const ahead = await property(organizationId, {
      timezone: "Pacific/Kiritimati",
    });
    const behind = await property(organizationId, {
      timezone: "Pacific/Pago_Pago",
    });
    const dates = await owner.$queryRawUnsafe<{ id: string; day: string }[]>(
      `select id::text, to_char(app.property_today(id), 'YYYY-MM-DD') as day
         from public.properties where id = any($1::uuid[])`,
      [ahead, behind],
    );
    const [gap] = await owner.$queryRawUnsafe<{ days: number }[]>(
      `select (app.property_today($1::uuid) - app.property_today($2::uuid))::int
              as days`,
      ahead,
      behind,
    );
    await booking(organizationId, ahead, "confirmed", 0);
    await booking(organizationId, behind, "confirmed", 0);
    // The other Property's today is a future date here, not an arrival.
    await booking(
      organizationId,
      behind,
      "confirmed",
      gap!.days,
      gap!.days + 1,
    );

    const portfolio = await getPortfolio(OWNER, organizationId);
    for (const { id, day } of dates) {
      expect(row(portfolio, id).businessDate).toBe(day);
    }
    expect(row(portfolio, ahead).businessDate).not.toBe(
      row(portfolio, behind).businessDate,
    );
    expect(row(portfolio, ahead).arrivalsToCome).toBe(1);
    expect(row(portfolio, behind).arrivalsToCome).toBe(1);
  });

  it("an_unclosed_day_keeps_the_open_business_date", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const propertyId = await property(organizationId, {
      timezone: justAfterMidnight(),
    });
    // Due out on the open day, and one on the calendar's new date.
    const leaving = await unit(organizationId, propertyId);
    await stay(organizationId, propertyId, leaving, {
      startsOffset: -2,
      endsOffset: 0,
    });
    const staying = await unit(organizationId, propertyId);
    await stay(organizationId, propertyId, staying, {
      startsOffset: -2,
      endsOffset: 1,
    });
    await booking(organizationId, propertyId, "confirmed", 0);
    await booking(organizationId, propertyId, "confirmed", 1, 2);

    const [clock] = await owner.$queryRawUnsafe<{ calendar: string }[]>(
      `select to_char((now() at time zone timezone)::date, 'YYYY-MM-DD') as calendar
         from public.properties where id = $1::uuid`,
      propertyId,
    );
    const entry = row(await getPortfolio(OWNER, organizationId), propertyId);
    // It is past midnight there and before the 04:00 cutoff.
    expect(entry.businessDate).not.toBe(clock!.calendar);
    expect(entry.arrivalsToCome).toBe(1);
    expect(entry.departuresToCome).toBe(1);
  });
});

describe("one statement", () => {
  it("all_rows_are_read_in_one_snapshot", async () => {
    const { organizationId, propertyIds } = await owned(3);
    for (const id of propertyIds) {
      await fillUnits(organizationId, id, { total: 4, occupied: 2 });
    }
    const measured = counted(prisma);
    server.db = measured.db;

    const before = Date.now();
    const portfolio = await getPortfolio(OWNER, organizationId);
    const after = Date.now();

    // The context call, and exactly one read for every row.
    expect(measured.statements).toEqual(["$executeRawUnsafe", "$queryRaw"]);
    expect(portfolio.properties).toHaveLength(3);
    const stamp = new Date(portfolio.asOf);
    expect(stamp.toISOString()).toBe(portfolio.asOf);
    expect(stamp.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(stamp.getTime()).toBeLessThanOrEqual(after + 1_000);
    // And the stamp is on an empty answer too.
    const empty = await getPortfolio(NOBODY, organizationId);
    expect(new Date(empty.asOf).toISOString()).toBe(empty.asOf);
  });

  it("statement_count_does_not_grow_with_properties", async () => {
    const { organizationId, propertyIds } = await owned(12);
    for (const id of propertyIds) {
      await fillUnits(organizationId, id, { total: 2, occupied: 1 });
      await owing(organizationId, id, "TRY", 100);
    }
    await member(organizationId, ASSIGNEE, "manager", "assigned_properties");

    const sent: string[][] = [];
    let reached = 0;
    for (const upTo of [1, 2, 12]) {
      while (reached < upTo) {
        await assign(organizationId, propertyIds[reached]!, ASSIGNEE);
        reached += 1;
      }
      const measured = counted(prisma);
      server.db = measured.db;
      const portfolio = await getPortfolio(ASSIGNEE, organizationId);
      expect(portfolio.properties).toHaveLength(upTo);
      sent.push(measured.statements);
    }
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[2]).toEqual(sent[0]);
    expect(sent[0]).toEqual(["$executeRawUnsafe", "$queryRaw"]);
  });
});

describe("another Organization, and a Resident", () => {
  it("another_organizations_properties_never_appear", async () => {
    const ours = await owned(2);
    const theirs = await organization();
    await member(theirs, OWNER_ELSEWHERE, "owner");
    const foreign = await property(theirs);

    const portfolio = await getPortfolio(OWNER, ours.organizationId);
    expect(portfolio.properties.map((p) => p.propertyId).sort()).toEqual(
      [...ours.propertyIds].sort(),
    );
    expect(JSON.stringify(portfolio)).not.toContain(foreign);
    // Asking for theirs by id answers with nothing, not with ours.
    const probe = await getPortfolio(OWNER, theirs);
    expect(probe.properties).toEqual([]);
  });

  it("a_two_organization_member_sees_only_the_active_one", async () => {
    const first = await organization();
    const second = await organization();
    await member(first, OWNER_ELSEWHERE, "owner");
    await member(second, OWNER_ELSEWHERE, "owner");
    const inFirst = await property(first);
    const inSecond = await property(second);

    const one = await getPortfolio(OWNER_ELSEWHERE, first);
    expect(one.properties.map((p) => p.propertyId)).toEqual([inFirst]);
    const two = await getPortfolio(OWNER_ELSEWHERE, second);
    expect(two.properties.map((p) => p.propertyId)).toEqual([inSecond]);
  });

  it("a_resident_reads_no_portfolio", async () => {
    const { organizationId, propertyIds } = await owned();
    await residentStay(organizationId, propertyIds[0]!, RESIDENT);
    // They do reach the Property row as a Resident, so an empty answer is the
    // query's doing and not an absence of data.
    const ownRow = await withOrganizationContext(
      prisma,
      { userId: RESIDENT },
      (tx) =>
        tx.$queryRaw<{ id: string }[]>`
          select id::text from public.properties
           where id = ${propertyIds[0]!}::uuid`,
    );
    expect(ownRow).toHaveLength(1);

    expect((await getPortfolio(OWNER, organizationId)).properties).toHaveLength(
      1,
    );
    const portfolio = await getPortfolio(RESIDENT, organizationId);
    expect(portfolio.properties).toEqual([]);
    expect(portfolio.occupancy).toEqual({ occupiedUnits: 0, sellableUnits: 0 });
    expect(portfolio.balancesByCurrency).toEqual([]);
  });

  it("a_read_outside_the_organization_context_returns_nothing", async () => {
    const { organizationId, propertyIds } = await owned();
    const propertyId = propertyIds[0]!;
    await fillUnits(organizationId, propertyId, { total: 2, occupied: 1 });
    await owing(organizationId, propertyId, "TRY", 700);

    const tables = [
      "properties",
      "accommodation_units",
      "stays",
      "folios",
      "folio_lines",
      "subscriptions",
    ];
    for (const table of tables) {
      const [outside] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `select count(*)::int as n from public.${table}
          where organization_id = $1::uuid`,
        organizationId,
      );
      expect(outside!.n, table).toBe(0);
      const [inside] = await withOrganizationContext(
        prisma,
        { userId: OWNER },
        (tx) =>
          tx.$queryRawUnsafe<{ n: number }[]>(
            `select count(*)::int as n from public.${table}
              where organization_id = $1::uuid`,
            organizationId,
          ),
      );
      expect(inside!.n, table).toBeGreaterThan(0);
    }
  });
});

describe("ordering, the ceiling and changed reach", () => {
  it("rows_are_ordered_by_name_then_id", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    for (const name of ["Bravo", "alpha", "Alpha", "Alpha", "Zulu", "alpha"]) {
      await property(organizationId, { name });
    }
    const expected = await owner.$queryRawUnsafe<
      { id: string; name: string }[]
    >(
      `select id::text, name from public.properties
        where organization_id = $1::uuid order by name, id`,
      organizationId,
    );

    const first = await getPortfolio(OWNER, organizationId);
    const second = await getPortfolio(OWNER, organizationId);
    const ids = first.properties.map((p) => p.propertyId);
    expect(ids).toEqual(expected.map((p) => p.id));
    expect(second.properties.map((p) => p.propertyId)).toEqual(ids);
    // Equal names break on the id, ascending.
    const twins = first.properties.filter((p) => p.propertyName === "Alpha");
    expect(twins).toHaveLength(2);
    expect(twins[0]!.propertyId < twins[1]!.propertyId).toBe(true);
  });

  it("more_than_the_ceiling_is_refused_not_truncated", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    await manyProperties(organizationId, CEILING);
    expect((await getPortfolio(OWNER, organizationId)).properties).toHaveLength(
      CEILING,
    );

    await manyProperties(organizationId, 1);
    await expect(getPortfolio(OWNER, organizationId)).rejects.toBeInstanceOf(
      PortfolioTooLargeError,
    );
  });

  it("a_second_read_reflects_changed_reach", async () => {
    const { organizationId, propertyIds } = await owned(2);
    await member(organizationId, ASSIGNEE, "manager", "assigned_properties");
    await assign(organizationId, propertyIds[0]!, ASSIGNEE);
    await assign(organizationId, propertyIds[1]!, ASSIGNEE);
    expect(
      (await getPortfolio(ASSIGNEE, organizationId)).properties,
    ).toHaveLength(2);

    await owner.$executeRawUnsafe(
      `update public.property_assignments
          set status = 'revoked', revoked_at = now()
        where property_id = $1::uuid and user_id = $2::uuid`,
      propertyIds[1]!,
      ASSIGNEE,
    );
    const again = await getPortfolio(ASSIGNEE, organizationId);
    expect(again.properties.map((p) => p.propertyId)).toEqual([propertyIds[0]]);
  });

  it("a_reversed_check_in_lowers_occupancy", async () => {
    const organizationId = await organization();
    await member(organizationId, DESK, "front_desk");
    const propertyId = await property(organizationId);
    const roomId = await unit(organizationId, propertyId);
    const reservationId = randomUUID();
    await owner.$executeRawUnsafe(
      `with guest as (
         insert into public.guests (organization_id, full_name)
         values ($2::uuid, 'Portfolio Reversal') returning id
       )
       insert into public.reservations
         (id, organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on)
       select $1::uuid, $2::uuid, $3::uuid, $4::uuid, guest.id, 'guest',
              'confirmed', app.property_today($3::uuid),
              app.property_today($3::uuid) + 2
         from guest`,
      reservationId,
      organizationId,
      propertyId,
      roomId,
    );

    const { stayId } = await reservations.checkIn(DESK, reservationId);
    expect(
      row(await getPortfolio(DESK, organizationId), propertyId).occupiedUnits,
    ).toBe(1);

    await reservations.reverseCheckIn(
      DESK,
      stayId,
      "Checked in the wrong Guest by mistake",
    );
    const after = row(await getPortfolio(DESK, organizationId), propertyId);
    expect(after.occupiedUnits).toBe(0);
    expect(after.sellableUnits).toBe(1);
  });
});

describe("telemetry", () => {
  it("portfolio_viewed_records_outcome_including_denial", async () => {
    const organizationId = await organization();
    await member(organizationId, OWNER, "owner");
    const named = await property(organizationId, {
      name: "Secret Palace Hotel",
    });
    await owing(organizationId, named, "TRY", 123_457);
    const logged = () => info.mock.calls;
    const eventOf = (
      outcome: string,
      propertyCount: number,
      userId: string,
    ) => [
      "portfolio.viewed",
      { userId, organizationId, propertyCount, outcome },
    ];

    await getPortfolio(OWNER, organizationId);
    expect(logged().at(-1)).toEqual(eventOf("ok", 1, OWNER));

    await getPortfolio(NOBODY, organizationId);
    expect(logged().at(-1)).toEqual(eventOf("empty", 0, NOBODY));

    // Refused: the count says how many were reached, and nothing is truncated.
    const crowded = await organization();
    await member(crowded, OWNER, "owner");
    await manyProperties(crowded, CEILING + 1);
    await expect(getPortfolio(OWNER, crowded)).rejects.toBeInstanceOf(
      PortfolioTooLargeError,
    );
    expect(logged().at(-1)).toEqual([
      "portfolio.viewed",
      {
        userId: OWNER,
        organizationId: crowded,
        propertyCount: CEILING + 1,
        outcome: "refused",
      },
    ]);

    // Counts only: no figure, no Property name, anywhere in what was logged.
    const everything = JSON.stringify([
      ...info.mock.calls,
      ...failure.mock.calls,
    ]);
    expect(everything).not.toContain("Secret Palace");
    expect(everything).not.toContain("123457");

    // The exception path is recorded too, and the error is not swallowed.
    info.mockClear();
    const broken = new Error("the pool is gone");
    server.db = {
      $transaction: () => Promise.reject(broken),
    } as unknown as typeof prisma;
    await expect(getPortfolio(OWNER, organizationId)).rejects.toBe(broken);
    expect(failure.mock.calls).toEqual([
      [
        "portfolio.viewed",
        { userId: OWNER, organizationId, propertyCount: 0, outcome: "failed" },
      ],
    ]);
    expect(info).not.toHaveBeenCalled();
  });
});
