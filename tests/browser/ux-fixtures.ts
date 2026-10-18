import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { psql } from "./local-database";
import { EMAIL } from "./front-desk";

/**
 * Fixtures for the front-desk UX specs: a Property of the run's own, assigned
 * to the seeded Staff Member, and the people who make the desk's hard days.
 *
 * Archived afterwards by `archive`, because an overdue Guest holds a business
 * day open for ever and a closed day can never be reopened: neither may leak
 * into the next run's figures, or into the Property list of whoever opens the
 * workspace next.
 */

const made: string[] = [];

/** Archives every Property this spec file made. Call from `test.afterAll`. */
export function archiveMadeProperties(): void {
  if (made.length === 0) return;
  psql(
    `update public.properties set status = 'archived', updated_at = now()
      where id in (${made.map((id) => `'${id}'`).join(",")})`,
  );
}

/**
 * A new Property in the seeded Staff Member's Organization with the front desk
 * on and the Staff Member assigned to it.
 */
export function aDeskProperty(
  capabilities: readonly string[] = ["today", "front_desk", "finance"],
): string {
  const name = `E2E UX ${randomUUID().slice(0, 8)}`;
  const wanted = capabilities.map((key) => `('${key}')`).join(", ");
  const propertyId = psql(
    `with member as (
       select id from public.users where lower(email) = lower('${EMAIL}')
     ), home as (
       select property.organization_id as id
       from public.properties as property
       join public.property_assignments as assignment
         on assignment.property_id = property.id
        and assignment.user_id = (select id from member)
       order by property.name
       limit 1
     ), created as (
       insert into public.properties (organization_id, name)
       select id, '${name}' from home
       returning id, organization_id
     ), capability as (
       insert into public.property_capabilities
         (property_id, organization_id, capability_key, enabled)
       select created.id, created.organization_id, wanted.key, true
       from created, (values ${wanted}) as wanted (key)
     ), assignment as (
       insert into public.property_assignments
         (property_id, organization_id, user_id)
       select id, organization_id, (select id from member) from created
     )
     select id from created`,
  );
  expect(propertyId, "no seeded Organization to put a Property in").not.toBe(
    "",
  );
  made.push(propertyId);
  return propertyId;
}

export interface Housed {
  guestName: string;
  unitName: string;
  reference: string;
  stayId: string;
}

/**
 * A Guest in house who should have left `daysOverdue` days ago, on a Unit of
 * their own, written the way an overstay really arises: checked in while their
 * last night was still ahead.
 */
export function anOverdueGuest(
  propertyId: string,
  options: { daysOverdue: number; nightlyRateMinor?: number },
): Housed {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Test Overdue ${tag}`;
  const unitName = `E2E-O-${tag}`;
  const rate = options.nightlyRateMinor;
  const [reference, stayId] = psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     ), booking as (
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on
          ${rate === undefined ? "" : ", nightly_rate_minor, rate_currency"})
       select unit.organization_id, unit.property_id, unit.id, guest.id,
              'guest', 'checked_in',
              app.property_today(unit.property_id) - ${options.daysOverdue + 3},
              app.property_today(unit.property_id) - ${options.daysOverdue}
              ${rate === undefined ? "" : `, ${rate}, 'TRY'`}
       from unit, guest
       returning id, reference, organization_id, property_id, accommodation_unit_id, starts_on, ends_on
     ), stay as (
       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, reservation_id,
          stay_type, status, starts_on, ends_on)
       select organization_id, property_id, accommodation_unit_id, id,
              'guest', 'in_house', starts_on, ends_on
       from booking
       returning id
     )
     select booking.reference || '|' || stay.id from booking, stay`,
  ).split("|");
  return {
    guestName,
    unitName,
    reference: reference!,
    stayId: stayId!,
  };
}

/** A confirmed booking `startsIn` days from today for `nights` nights. */
export function aBooking(
  propertyId: string,
  options: {
    startsIn: number;
    nights: number;
    label?: string;
    nightlyRateMinor?: number;
    unitName?: string;
  },
): { guestName: string; unitName: string; reference: string } {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Test ${options.label ?? "Booking"} ${tag}`;
  const unitName = options.unitName ?? `E2E-B-${tag}`;
  const rate = options.nightlyRateMinor;
  const reference = psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on
        ${rate === undefined ? "" : ", nightly_rate_minor, rate_currency"})
     select unit.organization_id, unit.property_id, unit.id, guest.id,
            'guest', 'confirmed',
            app.property_today(unit.property_id) + ${options.startsIn},
            app.property_today(unit.property_id) + ${options.startsIn + options.nights}
            ${rate === undefined ? "" : `, ${rate}, 'TRY'`}
     from unit, guest
     returning reference`,
  );
  return { guestName, unitName, reference };
}

/**
 * A booking arriving today into a room housekeeping has marked dirty, so the
 * desk is asked before checking the Guest in (ADR 0029).
 */
export function aDirtyRoomArrival(propertyId: string): {
  guestName: string;
  unitName: string;
} {
  const tag = randomUUID().slice(0, 8);
  const unitName = `E2E-D-${tag}`;
  const guestName = `Test Dirty ${tag}`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, '${unitName}', 'room', 2 from target
       returning id, property_id, organization_id
     ), dirty as (
       insert into public.housekeeping_unit_status
         (accommodation_unit_id, property_id, organization_id, status)
       select id, property_id, organization_id, 'dirty' from unit
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id, guest.id,
            'guest', 'confirmed',
            app.property_today(unit.property_id),
            app.property_today(unit.property_id) + 2
     from unit, guest`,
  );
  return { guestName, unitName };
}

/**
 * A backlog of waiting business days: the last close was `closedDaysAgo` days
 * ago, so `closedDaysAgo - 1` days wait. Written by the owner connection with
 * the triggers lifted, as `close-the-day.spec.ts` does, because the close is
 * what is under test and not how an earlier one came to be.
 */
export function aBacklog(propertyId: string, closedDaysAgo: number): void {
  psql(
    `set session_replication_role = replica;
     insert into public.business_day_closes
       (organization_id, property_id, business_date, closed_by_job)
     select organization_id, id, app.property_today(id) - ${closedDaysAgo}, 'test.fixture'
     from public.properties where id = '${propertyId}';`,
  );
}
