/**
 * Guest service requests against a real database (RANZ-64).
 *
 * The pgTAP suite proves the policies and constraints a statement at a time.
 * This proves what the screen depends on from the module on `ranza_app`: that
 * a write the policy refuses is an error and not a quiet success, that a
 * cancelled request reopens to New and gives up its reason, that a request
 * logged for a room is logged for the Guest in it, and who may be offered a
 * request.
 *
 * Breaks that were run, and what went red:
 *   the zero-row check removed from updateRequest     a_write_that_changes_nothing_is_not_a_success,
 *                                                     assigning_is_refused_for_somebody_who_may_not_manage
 *   the occupant lookup removed from createRequest    a_request_for_a_room_is_logged_for_the_guest_in_it
 *   the permission filter removed from assignees      only_staff_who_manage_requests_can_be_offered_a_request
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src";
import {
  createGuestServicesModule,
  ServiceRequestRefusedError,
  ServiceRequestStateError,
  ServiceRequestUnavailableError,
} from "../../packages/ranza/guest-services/src";

const ORG = "ee000002-0000-4000-8000-000000000001";
const PROPERTY = "ee000003-0000-4000-8000-000000000001";
const ROOM = "ee000004-0000-4000-8000-000000000001";
const EMPTY_ROOM = "ee000004-0000-4000-8000-000000000002";

const MANAGER = "ee000001-0000-4000-8000-000000000001";
const DESK = "ee000001-0000-4000-8000-000000000002";
const HOUSEKEEPER = "ee000001-0000-4000-8000-000000000003";
const FINANCE = "ee000001-0000-4000-8000-000000000004";

const SHIPPED_SCOPE = "00000000-0000-0000-0000-000000000000";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const guestServices = createGuestServicesModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const DATABASE_BUDGET_MS = 60_000;

async function seed() {
  await owner.$executeRawUnsafe(
    `insert into public.users (id, email) values
       ($1, 'gsi-manager@example.test'), ($2, 'gsi-desk@example.test'),
       ($3, 'gsi-housekeeper@example.test'), ($4, 'gsi-finance@example.test')
     on conflict (id) do nothing`,
    MANAGER,
    DESK,
    HOUSEKEEPER,
    FINANCE,
  );
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1, 'Guest Services Integration', 'active') on conflict (id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone)
     values ($1, $2, 'Guest Services Property', 'Europe/Istanbul')
     on conflict (id) do nothing`,
    PROPERTY,
    ORG,
  );
  for (const [id, name] of [
    [ROOM, "GSI-101"],
    [EMPTY_ROOM, "GSI-102"],
  ]) {
    await owner.$executeRawUnsafe(
      `insert into public.accommodation_units
         (id, property_id, organization_id, name, unit_type, capacity)
       values ($1, $2, $3, $4, 'room', 2) on conflict (id) do nothing`,
      id,
      PROPERTY,
      ORG,
      name,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1, 'active') on conflict (organization_id) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1, 'guest_services', 'active'), ($1, 'front_office', 'active')
     on conflict (organization_id, module_key) do nothing`,
    ORG,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled)
     values ($1, $2, 'guest_experience', true), ($1, $2, 'front_desk', true)
     on conflict (property_id, capability_key) do nothing`,
    PROPERTY,
    ORG,
  );
  // Shipped roles: the front desk and managers manage requests; housekeeping
  // only logs them; finance does neither.
  await owner.$executeRawUnsafe(
    `insert into public.organization_memberships
       (organization_id, user_id, role, role_scope_id, access_scope) values
       ($1, $2, 'manager', $6, 'organization_wide'),
       ($1, $3, 'front_desk', $6, 'organization_wide'),
       ($1, $4, 'housekeeping', $6, 'organization_wide'),
       ($1, $5, 'finance', $6, 'organization_wide')
     on conflict (organization_id, user_id) do nothing`,
    ORG,
    MANAGER,
    DESK,
    HOUSEKEEPER,
    FINANCE,
    SHIPPED_SCOPE,
  );
}

/** A Guest in house in the room, written by the owner: how they got there is not under test. */
async function guestInHouse(unitId: string): Promise<string> {
  const guestId = randomUUID();
  const reservationId = randomUUID();
  await owner.$executeRawUnsafe(
    `insert into public.guests (id, organization_id, full_name)
     values ($1::uuid, $2::uuid, 'Ada Occupant')`,
    guestId,
    ORG,
  );
  // One statement, so the check that a checked-in Reservation has a Stay in
  // house sees both.
  await owner.$executeRawUnsafe(
    `with booking as (
       insert into public.reservations
         (id, organization_id, property_id, accommodation_unit_id,
          guest_id, stay_type, status, starts_on, ends_on)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'guest', 'checked_in',
               app.property_today($3::uuid), app.property_today($3::uuid) + 2)
       returning id
     )
     insert into public.stays
       (organization_id, property_id, accommodation_unit_id, reservation_id,
        stay_type, status, starts_on, ends_on)
     select $2::uuid, $3::uuid, $4::uuid, booking.id, 'guest', 'in_house',
            app.property_today($3::uuid), app.property_today($3::uuid) + 2
       from booking`,
    reservationId,
    ORG,
    PROPERTY,
    unitId,
    guestId,
  );
  return guestId;
}

let title = 0;
function log(userId: string, extra: Record<string, unknown> = {}) {
  title += 1;
  return guestServices.createRequest(userId, {
    propertyId: PROPERTY,
    title: `Extra towels ${title}`,
    category: "amenities",
    priority: "normal",
    ...extra,
  });
}

beforeAll(seed, DATABASE_BUDGET_MS);

afterAll(async () => {
  for (const statement of [
    `delete from public.service_requests where organization_id = '${ORG}'`,
    `delete from public.stays where organization_id = '${ORG}'`,
    `delete from public.reservations where organization_id = '${ORG}'`,
    `delete from public.guests where organization_id = '${ORG}'`,
    `delete from public.property_capabilities where organization_id = '${ORG}'`,
    `delete from public.organization_memberships where organization_id = '${ORG}'`,
    `delete from public.entitlements where organization_id = '${ORG}'`,
    `delete from public.subscriptions where organization_id = '${ORG}'`,
    `delete from public.accommodation_units where organization_id = '${ORG}'`,
    `delete from public.properties where organization_id = '${ORG}'`,
    `delete from public.organizations where id = '${ORG}'`,
    `delete from public.users where id in ('${MANAGER}', '${DESK}', '${HOUSEKEEPER}', '${FINANCE}')`,
  ]) {
    await owner.$executeRawUnsafe(statement);
  }
  await owner.$disconnect();
  await prisma.$disconnect();
}, DATABASE_BUDGET_MS);

describe("what the viewer may do is read from the roles", () => {
  it("only_staff_who_manage_requests_can_be_offered_a_request", async () => {
    const offered = (await guestServices.assignees(MANAGER, PROPERTY)).map(
      (person) => person.email,
    );
    expect(offered).toEqual(
      expect.arrayContaining([
        "gsi-manager@example.test",
        "gsi-desk@example.test",
      ]),
    );
    expect(offered).not.toContain("gsi-housekeeper@example.test");
    expect(offered).not.toContain("gsi-finance@example.test");
  });

  it("access_follows_the_viewers_permissions", async () => {
    expect(await guestServices.access(MANAGER, PROPERTY)).toEqual({
      mayCreate: true,
      mayManage: true,
    });
    expect(await guestServices.access(HOUSEKEEPER, PROPERTY)).toEqual({
      mayCreate: true,
      mayManage: false,
    });
    expect(await guestServices.access(FINANCE, PROPERTY)).toEqual({
      mayCreate: false,
      mayManage: false,
    });
  });
});

describe("a write that does not land says so", () => {
  it("a_write_that_changes_nothing_is_not_a_success", async () => {
    const request = await log(HOUSEKEEPER);
    // Housekeeping may log but not work a request: the update policy matches
    // no row, which Postgres reports as success unless the module looks.
    await expect(
      guestServices.updateRequest(HOUSEKEEPER, request.id, {
        status: "in_progress",
      }),
    ).rejects.toBeInstanceOf(ServiceRequestUnavailableError);
    expect((await guestServices.request(MANAGER, request.id))?.status).toBe(
      "new",
    );
  });

  it("logging_without_the_permission_is_a_refusal_not_a_crash", async () => {
    await expect(log(FINANCE)).rejects.toBeInstanceOf(
      ServiceRequestRefusedError,
    );
  });

  it("assigning_is_refused_for_somebody_who_may_not_manage", async () => {
    const request = await log(HOUSEKEEPER);
    await expect(
      guestServices.updateRequest(HOUSEKEEPER, request.id, {
        assignedToUserId: DESK,
      }),
    ).rejects.toBeInstanceOf(ServiceRequestUnavailableError);
  });
});

describe("the lifecycle", () => {
  it("a_cancelled_request_reopens_to_new_and_gives_up_its_reason", async () => {
    const request = await log(MANAGER);
    await guestServices.updateRequest(MANAGER, request.id, {
      status: "cancelled",
      cancelReason: "logged twice",
    });
    // Sending it to In progress, as the screen once did, is refused by name.
    await expect(
      guestServices.updateRequest(MANAGER, request.id, {
        status: "in_progress",
      }),
    ).rejects.toMatchObject({ reason: "cancelledReopensToNew" });

    const reopened = await guestServices.updateRequest(MANAGER, request.id, {
      status: "new",
      cancelReason: null,
    });
    expect(reopened.status).toBe("new");
    expect(reopened.cancelReason).toBeNull();
  });

  it("a_resolved_request_cannot_be_cancelled_until_it_is_reopened", async () => {
    const request = await log(MANAGER);
    await guestServices.updateRequest(MANAGER, request.id, {
      status: "resolved",
      resolutionNotes: "Delivered",
    });
    const refused = guestServices.updateRequest(MANAGER, request.id, {
      status: "cancelled",
      cancelReason: "no longer needed",
    });
    await expect(refused).rejects.toBeInstanceOf(ServiceRequestStateError);
    await expect(refused).rejects.toMatchObject({
      reason: "resolvedCannotCancel",
    });
  });

  it("a_request_is_assigned_and_released", async () => {
    const request = await log(MANAGER);
    const assigned = await guestServices.updateRequest(MANAGER, request.id, {
      assignedToUserId: DESK,
    });
    expect(assigned.assignedToUserId).toBe(DESK);
    expect(assigned.assignedToName).toBe("gsi-desk@example.test");
    const released = await guestServices.updateRequest(MANAGER, request.id, {
      assignedToUserId: null,
    });
    expect(released.assignedToUserId).toBeNull();
  });
});

describe("a request for a room", () => {
  it("a_request_for_a_room_is_logged_for_the_guest_in_it", async () => {
    const guestId = await guestInHouse(ROOM);
    const request = await log(DESK, { accommodationUnitId: ROOM });
    expect(request.guestId).toBe(guestId);
    expect(request.guestName).toBe("Ada Occupant");
    expect(request.stayId).not.toBeNull();
  });

  it("an_empty_room_has_no_guest_to_log_it_for", async () => {
    const request = await log(DESK, { accommodationUnitId: EMPTY_ROOM });
    expect(request.guestId).toBeNull();
    expect(request.stayId).toBeNull();
  });
});
