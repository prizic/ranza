import { randomUUID } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

import { aKnownDay, type KnownDay } from "./known-day";
import { psql } from "./local-database";
import { aBacklog, anOverdueGuest } from "./ux-fixtures";

/**
 * The day the 2026-10-24 audit of Today met on staging, built on a Property of
 * its own: a house with a pile of overdue Guests, arrivals without a time, one
 * of them into a dirty room and one not yet confirmed, and days nobody closed.
 *
 * `aKnownDay` supplies the ordinary day (arrivals into a ready, a dirty and a
 * blocked room; guests leaving with and without a balance; one overdue Guest;
 * maintenance). This adds what made the audit's numbers disagree with each
 * other, so each finding is reproduced on data a real hotel can have.
 */
export interface AuditDay {
  day: KnownDay;
  /** Guests past their day to leave, all of them, as the page should count them. */
  overdue: number;
  /** An arrival whose booking nobody has confirmed. */
  requestedGuest: string;
  /** How many business days wait to be closed. */
  unclosedDays: number;
  /** Rooms with a guest in them, overdue or not. */
  inHouse: number;
  /** Guests due to leave today and still here. */
  leavingToday: number;
  /** Arrivals that hold a room tonight (confirmed, room free or freed). */
  arrivalsHoldingTonight: number;
}

const EXTRA_OVERDUE = 6;
const UNCLOSED_DAYS = 10;

/** A booking that was asked for and never confirmed, arriving today. */
function aRequestedArrival(propertyId: string): string {
  const tag = randomUUID().slice(0, 8);
  const guestName = `Requested ${tag}`;
  psql(
    `with target as (
       select id, organization_id from public.properties where id = '${propertyId}'
     ), unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity)
       select id, organization_id, 'R-${tag}', 'room', 2 from target
       returning id, property_id, organization_id
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from target
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id, guest.id,
            'guest', 'requested',
            app.property_today(unit.property_id),
            app.property_today(unit.property_id) + 2
     from unit, guest`,
  );
  return guestName;
}

export async function anAuditDay(
  request: APIRequestContext,
  origin: string,
): Promise<AuditDay> {
  const day = await aKnownDay(request, origin);
  for (let index = 0; index < EXTRA_OVERDUE; index += 1) {
    anOverdueGuest(day.propertyId, {
      daysOverdue: 2 + index,
      nightlyRateMinor: 5_000,
      withFolio: true,
    });
  }
  const requestedGuest = aRequestedArrival(day.propertyId);
  aBacklog(day.propertyId, UNCLOSED_DAYS + 1);
  const overdue = day.expected.departures.overdue + EXTRA_OVERDUE;
  return {
    day,
    overdue,
    requestedGuest,
    unclosedDays: UNCLOSED_DAYS,
    // 103 (checked in today), 201 and 202 (leave today), 203 (overdue) and the
    // extra overdue Guests.
    inHouse: 4 + EXTRA_OVERDUE,
    leavingToday: 2,
    // The ready room and the dirty one hold a room; the blocked one and the
    // request do not.
    arrivalsHoldingTonight: 2,
  };
}
