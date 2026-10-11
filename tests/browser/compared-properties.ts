import { aFreshProperty, type FreshProperty } from "./fresh-property";
import { EMAIL } from "./front-desk";
import { psql } from "./local-database";

/** What a Property of the portfolio's comparison is made to hold. */
export interface ComparedSpec {
  currency: string;
  /** Rooms, none of them out of order, so each is sellable. */
  rooms: number;
  /** Guests in house, one to a room, starting yesterday. */
  inHouse: number;
  /** Of those, how many are due out today; the rest stay two more nights. */
  dueOutToday: number;
  /** Confirmed Reservations due today on rooms nobody is in. */
  arrivalsToCome: number;
  /** Maintenance requests not yet done or cancelled. */
  openMaintenance: number;
  /** What the first in-house Guest owes, in minor units. */
  owedMinor: number;
}

export type ComparedProperty = FreshProperty & ComparedSpec;

/**
 * A Property whose every portfolio figure is known before the screen is asked:
 * its rooms and who is in them, who is due today and who is due out, the open
 * maintenance, and a Folio with a balance.
 *
 * Alongside the open requests it holds one done and one cancelled, which must
 * not be counted, and a second Folio that has been paid in full, whose zero
 * balance must not lower or raise what is owed. Written as the owner with
 * triggers off, like the month fixtures, because the front desk's own check-in
 * would refuse a Stay that began yesterday. That includes the trigger that
 * numbers a Reservation, so the fixture gives each one its own reference, in
 * the shape the database suites assert of every Reservation (`R` and six
 * characters, hexadecimal here, which the alphabet admits).
 */
export function aComparedProperty(
  label: string,
  spec: ComparedSpec,
): ComparedProperty {
  const property = aFreshProperty(label, {
    currency: spec.currency,
    capabilities: [
      "analytics",
      "today",
      "front_desk",
      "finance",
      "maintenance",
    ],
  });
  const p = `'${property.propertyId}'`;
  psql(
    `set local session_replication_role = replica;
     do $body$
     declare
       p uuid := ${p};
       o uuid := (select organization_id from public.properties where id = p);
       today date := app.property_today(p);
       reporter uuid := (select id from public.users where lower(email) = lower('${EMAIL}'));
       paid uuid;
       owing uuid;
     begin
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, created_at)
       select p, o, 'R' || lpad(n::text, 2, '0'), 'room', 2, now() - interval '400 days'
         from generate_series(1, ${spec.rooms}) as n;

       create temp table rooms on commit drop as
         select id, row_number() over (order by name) as rank
           from public.accommodation_units where property_id = p;

       insert into public.stays
         (organization_id, property_id, accommodation_unit_id, stay_type, status,
          starts_on, ends_on)
       select o, p, id, 'guest', 'in_house', today - 1,
              case when rank <= ${spec.dueOutToday} then today else today + 2 end
         from rooms where rank <= ${spec.inHouse};

       insert into public.guests (organization_id, full_name)
       select o, 'Portfolio Guest ' || left(replace(p::text, '-', ''), 8) || ' ' || rank from rooms
        where rank > ${spec.inHouse} and rank <= ${spec.inHouse + spec.arrivalsToCome};
       insert into public.reservations
         (organization_id, property_id, accommodation_unit_id, guest_id,
          stay_type, status, starts_on, ends_on, reference)
       select o, p, rooms.id, guest.id, 'guest', 'confirmed', today, today + 2,
              'R' || upper(left(md5(p::text || rooms.rank::text), 6))
         from rooms
         join public.guests as guest
           on guest.organization_id = o
          and guest.full_name = 'Portfolio Guest ' || left(replace(p::text, '-', ''), 8) || ' ' || rooms.rank;

       insert into public.folios (organization_id, property_id, stay_id, currency)
       select o, p, stay.id, property.currency
         from public.stays as stay
         join public.properties as property on property.id = p
         join rooms on rooms.id = stay.accommodation_unit_id
        where stay.property_id = p and rooms.rank <= 2;

       select folio.id into owing from public.folios as folio
         join public.stays as stay on stay.id = folio.stay_id
         join rooms on rooms.id = stay.accommodation_unit_id
        where folio.property_id = p and rooms.rank = 1;
       insert into public.folio_lines
         (organization_id, property_id, folio_id, line_type, description, amount_minor)
       select o, p, owing, 'charge', 'Portfolio line', ${spec.owedMinor}
        where ${spec.owedMinor} > 0;

       select folio.id into paid from public.folios as folio
         join public.stays as stay on stay.id = folio.stay_id
         join rooms on rooms.id = stay.accommodation_unit_id
        where folio.property_id = p and rooms.rank = 2;
       if paid is not null then
         insert into public.folio_lines
           (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
         values (o, p, paid, 'charge', 'Portfolio line', 5000, null),
                (o, p, paid, 'payment', 'Portfolio line', -5000, 'cash');
       end if;

       insert into public.maintenance_requests
         (organization_id, property_id, number, title, accommodation_unit_id,
          status, cancel_reason, reported_by)
       select o, p, n, 'Portfolio request', (select id from rooms where rank = 1),
              case when n <= ${spec.openMaintenance} then 'new'
                   when n = ${spec.openMaintenance} + 1 then 'done'
                   else 'cancelled' end,
              case when n > ${spec.openMaintenance} + 1 then 'Not a fault' end,
              reporter
         from generate_series(1, ${spec.openMaintenance} + 2) as n;
     end $body$;
     select 1`,
  );
  return { ...property, ...spec };
}
