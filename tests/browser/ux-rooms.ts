import { psql } from "./local-database";
import { aFreshProperty } from "./fresh-property";
import { DESK_EMAIL, EMAIL } from "./front-desk";

export interface RoomSpec {
  name: string;
  floor?: number;
  /** Housekeeping's status for the room; a room with none reads clean. */
  status?: "dirty" | "clean" | "inspected";
}

/**
 * A Property of this run's own, reached by the seeded Manager and by the Front
 * desk colleague, with housekeeping and the front desk on and these rooms.
 *
 * Rooms are never deleted and an add is history, so a spec that adds rooms or
 * reads a figure brings a Property nobody else writes to. Assigned here
 * because `aFreshProperty` leaves a Property to nobody.
 */
export function aPropertyWithRooms(
  label: string,
  rooms: readonly RoomSpec[],
): { propertyId: string; name: string } {
  const property = aFreshProperty(label, {
    capabilities: [
      "today",
      "front_desk",
      "finance",
      "housekeeping",
      "maintenance",
    ],
  });
  psql(
    `insert into public.property_assignments
       (property_id, organization_id, user_id)
     select property.id, property.organization_id, person.id
     from public.properties as property
     cross join public.users as person
     where property.id = '${property.propertyId}'
       and lower(person.email) in (lower('${EMAIL}'), lower('${DESK_EMAIL}'))
     on conflict (property_id, user_id) do nothing`,
  );
  if (rooms.length === 0) return property;

  const values = rooms
    .map(
      (room) =>
        `('${room.name}', ${room.floor ?? "null"}::int, ${room.status ? `'${room.status}'` : "null"})`,
    )
    .join(", ");
  psql(
    `with property as (
       select id, organization_id from public.properties
        where id = '${property.propertyId}'
     ), wanted (name, floor, status) as (values ${values}),
     unit as (
       insert into public.accommodation_units
         (property_id, organization_id, name, unit_type, capacity, floor)
       select property.id, property.organization_id, wanted.name, 'room', 2,
              wanted.floor
       from property, wanted
       returning id, name, property_id, organization_id
     )
     insert into public.housekeeping_unit_status
       (accommodation_unit_id, property_id, organization_id, status)
     select unit.id, unit.property_id, unit.organization_id, wanted.status
     from unit join wanted on wanted.name = unit.name
     where wanted.status is not null`,
  );
  return property;
}

/** A Guest arriving today into a room that already exists at the Property. */
export function anArrivalInto(propertyId: string, roomName: string): string {
  const guestName = `Test Arrival ${roomName}`;
  psql(
    `with unit as (
       select id, property_id, organization_id from public.accommodation_units
        where property_id = '${propertyId}' and name = '${roomName}'
     ), guest as (
       insert into public.guests (organization_id, full_name)
       select organization_id, '${guestName}' from unit
       returning id
     )
     insert into public.reservations
       (organization_id, property_id, accommodation_unit_id, guest_id,
        stay_type, status, starts_on, ends_on)
     select unit.organization_id, unit.property_id, unit.id, guest.id,
            'guest', 'confirmed', app.property_today(unit.property_id),
            app.property_today(unit.property_id) + 2
     from unit, guest`,
  );
  return guestName;
}
