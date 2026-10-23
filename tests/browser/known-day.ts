import { randomUUID } from "node:crypto";

import { expect, type APIRequestContext } from "@playwright/test";

import { PASSWORD } from "./front-desk";
import { psql } from "./local-database";
import { aBacklog } from "./ux-fixtures";

/**
 * A Property whose day is known exactly, in an Organization of its own.
 *
 * Today's figures are only worth checking against their lists when somebody
 * knows what they should say. The shared test Property cannot promise that:
 * every other spec brings arrivals to it and nothing takes them away. So this
 * brings its own Organization, Property, Units, Reservations, Stays and Staff,
 * once per run, and nothing else reaches it — a run's rows are never deleted
 * (a Stay is history), but no other run or screen counts them.
 *
 * Staff are made through the application's own sign-up route, because the
 * provider-subject mapping belongs to it (ADR 0005), and are then given a
 * membership here. One per focus Today can lead with, and one whose role leads
 * nowhere.
 */

export const FOCUSES = [
  "manager",
  "front_desk",
  "housekeeping",
  "finance",
  "nowhere",
  "checks_in_only",
  "checks_out_only",
] as const;
export type Focus = (typeof FOCUSES)[number];

/**
 * The role each kind of Staff Member holds: a shipped one, or one this
 * Organization composed. A role's name plays no part in what Today shows, so
 * the composed ones are the point — one that leads nowhere, and two that hold
 * only half of what the shipped Front desk does (TD-S2-04).
 */
const ROLE: Record<Focus, { key: string; permissions?: string[] }> = {
  manager: { key: "manager" },
  front_desk: { key: "front_desk" },
  housekeeping: { key: "housekeeping" },
  finance: { key: "finance" },
  nowhere: { key: "observer", permissions: ["maintenance.report"] },
  checks_in_only: {
    key: "desk_in",
    permissions: ["front_desk.check_in", "maintenance.report"],
  },
  checks_out_only: {
    key: "desk_out",
    permissions: ["front_desk.check_out", "maintenance.report"],
  },
};

export interface KnownDay {
  organizationId: string;
  propertyId: string;
  /** The sign-in of each kind of Staff Member, all in this Organization. */
  email: Record<Focus, string>;
  /** The Guests the day is made of, by what they are doing. */
  guest: {
    ready: string;
    notReady: string;
    blocked: string;
    checkedIn: string;
    owing: string;
    leavesFree: string;
    overdue: string;
    gone: string;
  };
  /** What Today should say, written from the rows above and nothing else. */
  expected: {
    arrivals: {
      expected: number;
      checkedIn: number;
      toCome: number;
      ready: number;
      notReady: number;
      blocked: number;
    };
    departures: {
      due: number;
      departed: number;
      overdue: number;
      /** Days the overdue Guest is past their date. */
      overdueDays: number;
    };
    owing: { guests: number; overdueGuests: number };
    openFolios: number;
  };
}

/** The balance a Guest leaving today owes, and the overdue Guest's. */
export const OWED_TODAY = 18_000;
export const OWED_OVERDUE = 7_500;

function sql(strings: TemplateStringsArray, ...values: string[]): string {
  return strings.reduce((out, part, i) => out + part + (values[i] ?? ""), "");
}

/** Every Unit in the Property: [name, floor]. */
const UNITS: readonly [string, number][] = [
  ["101", 1],
  ["102", 1],
  ["103", 1],
  ["104", 1],
  ["201", 2],
  ["202", 2],
  ["203", 2],
  ["204", 2],
  ["205", 2],
  ["301", 3],
  ["302", 3],
];

async function signUp(
  request: APIRequestContext,
  origin: string,
  email: string,
  name: string,
): Promise<void> {
  const headers = { origin };
  // Sign-up and sign-in share a limit of a few per ten seconds; the table the
  // limit is kept in is this database's, so the fixture clears it itself.
  psql("delete from public.auth_rate_limit");
  const signedUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password: PASSWORD, name },
  });
  expect(
    signedUp.ok(),
    `could not sign up ${email}: ${signedUp.status()}`,
  ).toBe(true);
  // One authenticated request is what maps the provider subject onto a user.
  await request.get("/en/today");
}

export async function aKnownDay(
  request: APIRequestContext,
  origin: string,
): Promise<KnownDay> {
  const tag = randomUUID().slice(0, 8);
  const organizationId = randomUUID();
  const propertyId = randomUUID();

  const email = Object.fromEntries(
    FOCUSES.map((focus) => [focus, `e2e-day-${tag}-${focus}@example.test`]),
  ) as Record<Focus, string>;

  for (const focus of FOCUSES) {
    await signUp(request, origin, email[focus], focus);
  }

  psql(sql`
    insert into public.organizations (id, name, status)
    values ('${organizationId}', 'E2E Day ${tag}', 'active');
    insert into public.subscriptions (organization_id, status)
    values ('${organizationId}', 'active');
    insert into public.entitlements (organization_id, module_key, status)
    select '${organizationId}', module_key, 'active'
      from unnest(array['platform_core', 'front_office', 'housekeeping',
                        'billing_folios', 'maintenance']) as module_key;
    insert into public.properties (id, organization_id, name)
    values ('${propertyId}', '${organizationId}', 'E2E Day Property ${tag}');
    insert into public.property_capabilities
      (property_id, organization_id, capability_key, enabled)
    select '${propertyId}', '${organizationId}', capability_key, true
      from unnest(array['today', 'front_desk', 'housekeeping', 'finance',
                        'maintenance']) as capability_key;
    insert into public.staff_roles
      (scope_id, key, organization_id, name, permissions)
    values ${FOCUSES.flatMap((focus) => {
      const role = ROLE[focus];
      return role.permissions
        ? [
            `('${organizationId}', '${role.key}', '${organizationId}', '${role.key} ${tag}', array[${role.permissions.map((p) => `'${p}'`).join(", ")}])`,
          ]
        : [];
    }).join(", ")};
    insert into public.organization_memberships
      (organization_id, user_id, role, role_scope_id, access_scope)
    select '${organizationId}', member.id, wanted.role,
           case when wanted.composed then '${organizationId}'::uuid
                else '00000000-0000-0000-0000-000000000000'::uuid end,
           'assigned_properties'
      from public.users as member
      join (values ${FOCUSES.map(
        (focus) =>
          `('${email[focus]}', '${ROLE[focus].key}', ${ROLE[focus].permissions ? "true" : "false"})`,
      ).join(", ")}) as wanted (email, role, composed)
        on wanted.email = member.email;
    insert into public.property_assignments
      (property_id, organization_id, user_id)
    select '${propertyId}', '${organizationId}', member.id
      from public.users as member
     where member.email like 'e2e-day-${tag}-%';
  `);

  // The Property's own units; 301 is out of service and 302 blocked.
  psql(
    `insert into public.accommodation_units
       (property_id, organization_id, name, unit_type, capacity, floor)
     values ${UNITS.map(
       ([name, floor]) =>
         `('${propertyId}', '${organizationId}', '${name}', 'room', 2, ${floor})`,
     ).join(", ")}`,
  );
  psql(
    sql`update public.accommodation_units set status = 'out_of_service'
         where property_id = '${propertyId}' and name = '301'`,
  );
  psql(
    sql`update public.accommodation_units
           set status = 'blocked', status_reason = 'Painting'
         where property_id = '${propertyId}' and name = '302'`,
  );
  // Rooms are inspected after cleaning here, so a room cleaned and not yet
  // inspected is a thing the day can have.
  psql(
    sql`insert into public.housekeeping_settings
          (organization_id, property_id, inspect_after_cleaning)
        values ('${organizationId}', '${propertyId}', true)`,
  );
  const status = (room: string, state: string) =>
    psql(
      sql`insert into public.housekeeping_unit_status
            (accommodation_unit_id, property_id, organization_id, status)
          select id, property_id, organization_id, '${state}'
            from public.accommodation_units
           where property_id = '${propertyId}' and name = '${room}'`,
    );
  status("101", "inspected");
  status("102", "dirty");
  status("103", "inspected");
  status("205", "clean");

  const names = {
    ready: `Ready ${tag}`,
    notReady: `NotReady ${tag}`,
    blocked: `Blocked ${tag}`,
    checkedIn: `CheckedIn ${tag}`,
    owing: `Owing ${tag}`,
    leavesFree: `LeavesFree ${tag}`,
    overdue: `Overdue ${tag}`,
    gone: `Gone ${tag}`,
  };

  /** An arrival: a confirmed booking for one Guest in one room, from today. */
  const arrival = (room: string, guest: string) =>
    psql(sql`
      with unit as (
        select id, property_id, organization_id from public.accommodation_units
         where property_id = '${propertyId}' and name = '${room}'
      ), guest as (
        insert into public.guests (organization_id, full_name)
        select organization_id, '${guest}' from unit returning id
      )
      insert into public.reservations
        (organization_id, property_id, accommodation_unit_id, guest_id,
         stay_type, status, starts_on, ends_on)
      select unit.organization_id, unit.property_id, unit.id, guest.id,
             'guest', 'confirmed',
             app.property_today(unit.property_id),
             app.property_today(unit.property_id) + 2
        from unit, guest`);

  /**
   * A Guest in house: the booking, the Stay it became and the Folio it opened,
   * in one statement because the database refuses a checked-in booking without
   * its Stay. Dates are days from today; `owedMinor` is what the Folio holds.
   */
  const inHouse = (
    room: string,
    guest: string,
    from: number,
    to: number,
    owedMinor: number,
  ) =>
    psql(sql`
      with unit as (
        select id, property_id, organization_id from public.accommodation_units
         where property_id = '${propertyId}' and name = '${room}'
      ), guest as (
        insert into public.guests (organization_id, full_name)
        select organization_id, '${guest}' from unit returning id
      ), reservation as (
        insert into public.reservations
          (organization_id, property_id, accommodation_unit_id, guest_id,
           stay_type, status, starts_on, ends_on)
        select unit.organization_id, unit.property_id, unit.id, guest.id,
               'guest', 'checked_in',
               app.property_today(unit.property_id) + (${String(from)}),
               app.property_today(unit.property_id) + (${String(to)})
          from unit, guest
        returning id, organization_id, property_id, accommodation_unit_id,
                  starts_on, ends_on
      ), stay as (
        insert into public.stays
          (organization_id, property_id, accommodation_unit_id, reservation_id,
           stay_type, status, starts_on, ends_on)
        select organization_id, property_id, accommodation_unit_id, id,
               'guest', 'in_house', starts_on, ends_on
          from reservation
        returning id, organization_id, property_id
      ), folio as (
        insert into public.folios (organization_id, property_id, stay_id, currency)
        select organization_id, property_id, id, 'TRY' from stay
        returning id, organization_id, property_id
      )
      insert into public.folio_lines
        (organization_id, property_id, folio_id, line_type, description,
         amount_minor)
      select organization_id, property_id, id, 'charge', 'Minibar',
             ${String(owedMinor)}
        from folio
       where ${String(owedMinor)} > 0`);

  // Arriving today: 101 ready, 102 dirty, 302 blocked.
  arrival("101", names.ready);
  arrival("102", names.notReady);
  arrival("302", names.blocked);
  // Checked in earlier today.
  inHouse("103", names.checkedIn, 0, 2, 0);
  // Leaving today, one with a balance and one without; and one overdue.
  inHouse("201", names.owing, -2, 0, OWED_TODAY);
  inHouse("202", names.leavesFree, -2, 0, 0);
  inHouse("203", names.overdue, -3, -1, OWED_OVERDUE);
  // Left already today. The database stamps when.
  inHouse("204", names.gone, -2, 0, 0);
  psql(sql`
    with departed as (
      update public.stays set status = 'departed'
       where property_id = '${propertyId}'
         and reservation_id in (
           select reservation.id from public.reservations as reservation
             join public.guests as guest on guest.id = reservation.guest_id
            where guest.full_name = '${names.gone}')
      returning id, reservation_id
    ), closed as (
      update public.folios set status = 'closed', closed_at = now()
       where stay_id in (select id from departed)
    )
    update public.reservations set status = 'checked_out'
     where id in (select reservation_id from departed)`);

  // Maintenance: an urgent repair keeping 301 out of order and past its return,
  // one in progress and one waiting for parts.
  const manager = psql(
    sql`select id from public.users where email = '${email.manager}'`,
  );
  // The database stamps who reported a problem from the acting Staff Member,
  // so the statement acts as the manager.
  psql(sql`
    select set_config('app.user_id', '${manager}', true);
    insert into public.maintenance_requests
      (organization_id, property_id, number, title, accommodation_unit_id,
       priority, status, reported_by)
    select '${organizationId}', '${propertyId}', request.number, request.title,
           unit.id, request.priority, 'new', '${manager}'
      from (values (1, 'Burst pipe', '301', 'urgent'),
                   (2, 'Loose handrail', '205', 'this_week'),
                   (3, 'Broken hairdryer', '104', 'can_wait'))
           as request (number, title, room, priority)
      join public.accommodation_units as unit
        on unit.property_id = '${propertyId}' and unit.name = request.room
     -- The database numbers requests in the order it meets them.
     order by request.number;
    update public.maintenance_requests set status = 'in_progress'
     where property_id = '${propertyId}' and number = 2;
    update public.maintenance_requests set status = 'waiting_for_parts'
     where property_id = '${propertyId}' and number = 3;
    insert into public.maintenance_unit_holds
      (request_id, organization_id, property_id, taken_by, expected_back_on)
    select request.id, request.organization_id, request.property_id,
           '${manager}', app.property_today(request.property_id)
      from public.maintenance_requests as request
     where request.property_id = '${propertyId}' and request.number = 1;
    -- A date already past cannot be entered, only reached: the room was due
    -- back yesterday and is not back.
    set local session_replication_role = replica;
    update public.maintenance_unit_holds
       set expected_back_on = app.property_today(property_id) - 1
     where property_id = '${propertyId}';
  `);

  return {
    organizationId,
    propertyId,
    email,
    guest: names,
    expected: {
      arrivals: {
        expected: 4,
        checkedIn: 1,
        toCome: 3,
        ready: 1,
        notReady: 1,
        blocked: 1,
      },
      departures: { due: 3, departed: 1, overdue: 1, overdueDays: 1 },
      owing: { guests: 2, overdueGuests: 1 },
      openFolios: 4,
    },
  };
}

/**
 * A second Property in the same Organization, with nothing in it: no Units, no
 * bookings, nobody in house, and yesterday closed, so no day waits either.
 * What Today says when every figure is zero.
 */
export function aQuietProperty(day: KnownDay): string {
  const propertyId = randomUUID();
  psql(sql`
    insert into public.properties (id, organization_id, name)
    values ('${propertyId}', '${day.organizationId}', 'E2E Quiet Property');
    insert into public.property_capabilities
      (property_id, organization_id, capability_key, enabled)
    select '${propertyId}', '${day.organizationId}', capability_key, true
      from unnest(array['today', 'front_desk', 'housekeeping', 'finance',
                        'maintenance']) as capability_key;
    insert into public.property_assignments
      (property_id, organization_id, user_id)
    select '${propertyId}', '${day.organizationId}', assignment.user_id
      from public.property_assignments as assignment
     where assignment.property_id = '${day.propertyId}';
  `);
  aBacklog(propertyId, 1);
  return propertyId;
}
