// Adds a student dormitory, "Demo Yurt Kadıköy", to an existing Organization:
// two blocks of women's and men's rooms let by the bed, and Residents booked
// for the academic term and in house, with their particulars (RANZ-105).
//
// It exists because nothing a dormitory sees — beds taken, empty beds by
// gender, a student's guardian — can be looked at on a hotel, and staging has
// only a hotel. It adds to an Organization rather than making one: an
// Organization is the Control Plane's to create, and the people who should see
// the yurt are the ones already in it.
//
// Run it again and it creates nothing twice: every row is looked up by its
// name first. It writes only to a database on this machine — staging's is
// reached through the tunnel in docs/runbooks/hetzner-staging.md — because it
// invents a hundred people.
import { spawnSync } from "node:child_process";

import {
  requireLocalDatabase,
  withoutConnectionOverrides,
} from "./local-url.mjs";

const DATABASE = process.env.DIRECT_URL ?? "";
const ORGANIZATION = process.env.YURT_ORGANIZATION ?? "Prizic Demo";
const PROPERTY = "Demo Yurt Kadıköy";

// The term a Turkish university dormitory lets its beds for.
const TERM = { startsOn: "2026-09-15", endsOn: "2027-06-15" };

// Per floor, the beds in each room: twenty, so three floors make sixty a block.
const ROOM_BEDS = [2, 3, 4, 3, 4, 4];
const FLOORS = [1, 2, 3];
const BLOCKS = [
  { name: "Blok A", prefix: "A", admits: "female" },
  { name: "Blok B", prefix: "B", admits: "male" },
];
const BED_NAMES = ["A", "B", "C", "D"];
// Of every block's sixty beds, the first forty are taken: the rest are what the
// Empty beds card and the room cards have to show.
const RESIDENTS_PER_BLOCK = 40;

const FIRST_NAMES = {
  female: ["Elif", "Zeynep", "Ayşe", "Merve", "Defne", "Ece", "İrem", "Selin"],
  male: ["Emre", "Mert", "Can", "Burak", "Kerem", "Arda", "Yusuf", "Efe"],
};
const SURNAMES = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Arslan"];
const PARENTS = ["Ahmet", "Fatma", "Mehmet", "Hatice", "Mustafa", "Emine"];
const INSTITUTIONS = [
  "İstanbul Üniversitesi",
  "Marmara Üniversitesi",
  "Boğaziçi Üniversitesi",
  "İstanbul Teknik Üniversitesi",
  "Yeditepe Üniversitesi",
];

requireLocalDatabase(DATABASE, {
  name: "DIRECT_URL",
  because:
    "this invents Residents with dates of birth and guardians, which have no\n" +
    "business appearing anywhere but a local database or staging's, reached\n" +
    "through its tunnel.",
});

function psql(sql) {
  const result = spawnSync(
    "psql",
    [DATABASE, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql],
    { encoding: "utf8", env: withoutConnectionOverrides() },
  );
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    process.exit(1);
  }
  return result.stdout.trim();
}

const literal = (value) =>
  value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const rows = (values) =>
  values.map((row) => `(${row.map(literal).join(", ")})`).join(",\n");

const organizationId = psql(
  `select id from public.organizations where name = ${literal(ORGANIZATION)}`,
);
if (!organizationId) {
  console.error(
    `No Organization named "${ORGANIZATION}". Set YURT_ORGANIZATION to one that exists.`,
  );
  process.exit(1);
}

// The Organization's own capabilities, from the Property it already has, so
// the yurt switches on nothing its other Properties do not.
psql(`
  with property as (
    insert into public.properties (organization_id, name, operating_model)
    select ${literal(organizationId)}, ${literal(PROPERTY)}, 'dormitory'
     where not exists (
       select 1 from public.properties
        where organization_id = ${literal(organizationId)}
          and name = ${literal(PROPERTY)})
    returning id, organization_id
  ), sibling as (
    select id from public.properties
     where organization_id = ${literal(organizationId)}
       and name <> ${literal(PROPERTY)}
     order by created_at
     limit 1
  )
  insert into public.property_capabilities
    (property_id, organization_id, capability_key, enabled)
  select property.id, property.organization_id, capability.capability_key,
         capability.enabled
    from property
    join public.property_capabilities as capability
      on capability.property_id = (select id from sibling)`);

const propertyId = psql(
  `select id from public.properties
    where organization_id = ${literal(organizationId)}
      and name = ${literal(PROPERTY)}`,
);

const rooms = BLOCKS.flatMap((block) =>
  FLOORS.flatMap((floor) =>
    ROOM_BEDS.map((beds, index) => ({
      name: `${block.prefix}-${floor}${String(index + 1).padStart(2, "0")}`,
      block,
      floor,
      beds,
    })),
  ),
);

psql(`
  insert into public.accommodation_units
    (property_id, organization_id, name, unit_type, capacity, building, floor,
     admits)
  select ${literal(propertyId)}, ${literal(organizationId)}, wanted.name,
         'room', wanted.beds::int, wanted.building, wanted.floor::int,
         wanted.admits
    from (values ${rows(
      rooms.map((room) => [
        room.name,
        room.beds,
        room.block.name,
        room.floor,
        room.block.admits,
      ]),
    )}) as wanted (name, beds, building, floor, admits)
   where not exists (
     select 1 from public.accommodation_units as unit
      where unit.property_id = ${literal(propertyId)}
        and unit.parent_id is null and unit.name = wanted.name)`);

psql(`
  insert into public.accommodation_units
    (property_id, organization_id, name, unit_type, capacity, parent_id)
  select room.property_id, room.organization_id, bed.name, 'bed', 1, room.id
    from public.accommodation_units as room
    cross join lateral unnest(
      (array[${BED_NAMES.map(literal).join(", ")}])[1:room.capacity]
    ) as bed (name)
   where room.property_id = ${literal(propertyId)}
     and room.parent_id is null
     and not exists (
       select 1 from public.accommodation_units as existing
        where existing.parent_id = room.id and existing.name = bed.name)`);

/** Every bed, in room order, each with the gender its block admits. */
const beds = rooms.flatMap((room) =>
  BED_NAMES.slice(0, room.beds).map((bed) => ({ room, bed })),
);

function residentFor(seat, index) {
  const gender = seat.room.block.admits;
  const first = FIRST_NAMES[gender][index % 8];
  const surname = SURNAMES[Math.floor(index / 8) % 6];
  const handle = `${first}.${surname}.${seat.room.name}${seat.bed}`
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[^a-z0-9.-]/g, "");
  return {
    ...seat,
    name: `${first} ${surname}`,
    email: `${handle}@demo-yurt.example`,
    gender,
    dateOfBirth: `${2005 + (index % 4)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    institution: INSTITUTIONS[index % INSTITUTIONS.length],
    studyYear: (index % 4) + 1,
    guardianName: `${PARENTS[index % 6]} ${surname}`,
    guardianPhone: `+90 532 ${String(100 + index).padStart(3, "0")} 00 ${String(index % 100).padStart(2, "0")}`,
  };
}

const residents = BLOCKS.flatMap((block) =>
  beds
    .filter((seat) => seat.room.block === block)
    .slice(0, RESIDENTS_PER_BLOCK)
    .map(residentFor),
);

psql(`
  insert into public.guests (organization_id, full_name, email, gender)
  select ${literal(organizationId)}, wanted.name, wanted.email, wanted.gender
    from (values ${rows(
      residents.map((r) => [r.name, r.email, r.gender]),
    )}) as wanted (name, email, gender)
   where not exists (
     select 1 from public.guests
      where organization_id = ${literal(organizationId)}
        and email = wanted.email)`);

psql(`
  insert into public.guest_particulars
    (guest_id, organization_id, date_of_birth, institution, study_year,
     guardian_name, guardian_phone)
  select guest.id, guest.organization_id, wanted.born::date,
         wanted.institution, wanted.year::smallint, wanted.guardian,
         wanted.phone
    from (values ${rows(
      residents.map((r) => [
        r.email,
        r.dateOfBirth,
        r.institution,
        r.studyYear,
        r.guardianName,
        r.guardianPhone,
      ]),
    )}) as wanted (email, born, institution, year, guardian, phone)
    join public.guests as guest
      on guest.organization_id = ${literal(organizationId)}
     and guest.email = wanted.email
  on conflict (guest_id) do nothing`);

// Booked for the term and checked in: a Reservation and the Stay it became,
// as a check-in leaves them, for each Resident who has none at the yurt yet.
psql(`
  with wanted (email, room, bed) as (
    values ${rows(residents.map((r) => [r.email, r.room.name, r.bed]))}
  ), seat as (
    select guest.id as guest_id, bed.id as unit_id
      from wanted
      join public.guests as guest
        on guest.organization_id = ${literal(organizationId)}
       and guest.email = wanted.email
      join public.accommodation_units as room
        on room.property_id = ${literal(propertyId)}
       and room.parent_id is null and room.name = wanted.room
      join public.accommodation_units as bed
        on bed.parent_id = room.id and bed.name = wanted.bed
     where not exists (
       select 1 from public.reservations
        where property_id = ${literal(propertyId)}
          and guest_id = guest.id)
  ), arrived as (
    insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id,
       stay_type, status, starts_on, ends_on)
    select ${literal(organizationId)}, ${literal(propertyId)}, seat.unit_id,
           seat.guest_id, 'resident', 'checked_in',
           ${literal(TERM.startsOn)}, ${literal(TERM.endsOn)}
      from seat
    returning id, accommodation_unit_id, starts_on, ends_on
  )
  insert into public.stays
    (organization_id, property_id, accommodation_unit_id, reservation_id,
     stay_type, status, starts_on, ends_on)
  select ${literal(organizationId)}, ${literal(propertyId)},
         accommodation_unit_id, id, 'resident', 'in_house', starts_on, ends_on
    from arrived`);

const summary = psql(`
  select count(*) filter (where unit.parent_id is not null) || ' beds, ' ||
         count(stay.id) || ' Residents in house'
    from public.accommodation_units as unit
    left join public.stays as stay
      on stay.accommodation_unit_id = unit.id and stay.status = 'in_house'
   where unit.property_id = ${literal(propertyId)}`);
console.log(`${PROPERTY} in ${ORGANIZATION}: ${summary}.`);
