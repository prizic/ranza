// Adds a student dormitory, "Demo Yurt Kadıköy", to an existing Organization:
// two blocks of women's and men's rooms let by the bed, and Residents booked
// for the academic term and in house, with their particulars (RANZ-105). Each
// pays the term by instalments, a few are behind, a few are on leave tonight,
// and the past week's roll call has been taken.
//
// It exists because nothing a dormitory sees — beds taken, empty beds by
// gender, a student's guardian, who is overdue, who is out tonight — can be
// looked at on a hotel, and staging has only a hotel. It adds to an
// Organization rather than making one: an Organization is the Control Plane's
// to create, and the people who should see the yurt are the ones already in it.
//
// Money and attendance are dated from the Property's own today, so the yurt
// tells the same story whenever it is seeded. They are written as the
// application would have written them, with no audit record or outbox event.
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

// Per floor, the beds in each room: fifteen, so four floors make sixty a block,
// with a single, a double, a triple and quads, as a yurt lets them.
const ROOM_BEDS = [1, 2, 3, 4, 1, 4];
const FLOORS = [1, 2, 3, 4];
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
const SURNAMES = [
  "Yılmaz",
  "Kaya",
  "Demir",
  "Şahin",
  "Çelik",
  "Arslan",
  "Yıldız",
  "Yıldırım",
  "Öztürk",
  "Aydın",
  "Özdemir",
  "Doğan",
  "Kılıç",
  "Polat",
  "Çetin",
  "Kara",
  "Koç",
  "Kurt",
  "Özkan",
  "Şimşek",
];
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
// the yurt switches on nothing its other Properties do not, bar what a yurt
// is for, below.
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

// The yurt keeps leave and a roll call (ADR 0064). Its own statement, so that a
// yurt seeded before the capability existed is given it on a second run.
psql(`
  insert into public.property_capabilities
    (property_id, organization_id, capability_key, enabled)
  select property.id, property.organization_id, 'attendance', true
    from public.properties as property
   where property.organization_id = ${literal(organizationId)}
     and property.name = ${literal(PROPERTY)}
  on conflict (property_id, capability_key) do update set enabled = true`);

// The yurt gives its students the Portal (RANZ-87): a desk invites a student
// from the booking, and My stay shows the bed, the term and the balance. Its
// own statement for the same reason as the one above.
psql(`
  insert into public.property_capabilities
    (property_id, organization_id, capability_key, enabled)
  select property.id, property.organization_id, 'portal_stay_overview', true
    from public.properties as property
   where property.organization_id = ${literal(organizationId)}
     and property.name = ${literal(PROPERTY)}
  on conflict (property_id, capability_key) do update set enabled = true`);

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
    (property_id, organization_id, name, unit_type, capacity, parent_id,
     parent_unit_type)
  select room.property_id, room.organization_id, bed.name, 'bed', 1, room.id,
         'room'
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
  // Both names step by a stride coprime to their list, so neighbours in a room
  // never share either, and no two of a block's forty share a full name: rows
  // of "Elif Yılmaz, Zeynep Yılmaz, Ayşe Yılmaz" read as made up at a glance.
  const surname = SURNAMES[(index * 7) % SURNAMES.length];
  const first =
    FIRST_NAMES[gender][
      (index * 3 + Math.floor(index / SURNAMES.length)) %
        FIRST_NAMES[gender].length
    ];
  // A second run finds a Resident by this address, so changing a name here
  // seeds that bed's Resident again unless the hosted rows are renamed with it.
  const handle = `${first}.${surname}.${seat.room.name}${seat.bed}`
    .toLocaleLowerCase("tr")
    // ı has no decomposed form, so without this Yılmaz would lose a letter.
    .replace(/ı/g, "i")
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

// A check-in also opens the Stay's Folio, in the Property's currency, so
// Finance has a bill to show for every Resident in house. Its own statement, so
// that a yurt seeded before it did this is given its Folios on a second run.
psql(`
  insert into public.folios (organization_id, property_id, stay_id, currency)
  select stay.organization_id, stay.property_id, stay.id, property.currency
    from public.stays as stay
    join public.properties as property on property.id = stay.property_id
   where stay.property_id = ${literal(propertyId)}
     and stay.status = 'in_house'
     and not exists (
       select 1 from public.folios where folios.stay_id = stay.id)`);

// Where a row records who acted — a plan, a leave, a roll call — it names the
// Organization's first owner, as the desk working under them would.
const actorId = psql(`
  select user_id from public.organization_memberships
   where organization_id = ${literal(organizationId)}
     and role = 'owner' and status = 'active'
   order by created_at
   limit 1`);
if (!actorId) {
  console.error(
    `"${ORGANIZATION}" has no active owner to record as the one who took the payment plans and the roll call.`,
  );
  process.exit(1);
}

/** The seed's own students in house, numbered in a fixed order, as SQL. */
const seededStudents = `
  select stay.id as stay_id, stay.reservation_id, stay.starts_on,
         stay.ends_on, bed.parent_id as room_id,
         row_number() over (order by guest.email) as n
    from public.stays as stay
    join public.reservations as booking on booking.id = stay.reservation_id
    join public.guests as guest
      on guest.id = booking.guest_id
     and guest.email like '%@demo-yurt.example'
    join public.accommodation_units as bed
      on bed.id = stay.accommodation_unit_id
   where stay.property_id = ${literal(propertyId)}
     and stay.status = 'in_house'`;

const today = `app.property_today(${literal(propertyId)})`;
const localTime = (day, time) =>
  `((${day}) + time '${time}') at time zone property.timezone`;

// The term's fee in instalments, the way the booking dialog suggests it: the
// nights at the price of a bed in that size of room, a month apart from
// arrival and all before departure, with what does not divide evenly on the
// first (payment-plan-split.ts). Every fourth student pays in four senets,
// two months apart, instead. What has fallen due is charged on its due date,
// as the worker's app.post_due_instalments() words it, and paid a few days
// later — except by a few students, who are behind on the latest one, paid
// half of it, or have paid nothing. A bed the price list does not price gets
// no plan: nothing is invented from a price that is not there.
psql(`
  begin;

  create temporary table seeded_plan on commit drop as
  select student.*, rate.amount_minor * (student.ends_on - student.starts_on)
           as total_minor,
         case when student.n % 4 = 0 then 2 else 1 end as months_apart,
         case when student.n % 4 = 0 then 4 else 60 end as most_instalments
    from (${seededStudents}) as student
    join public.accommodation_units as room on room.id = student.room_id
    cross join lateral (
      select amount_minor from public.property_rates
       where property_id = ${literal(propertyId)}
         and unit_type = 'bed' and amount_minor is not null
         and (room_capacity = room.capacity or room_capacity is null)
       order by room_capacity nulls last
       limit 1
    ) as rate
   where not exists (
     select 1 from public.payment_plans as plan
      where plan.reservation_id = student.reservation_id);

  create temporary table seeded_instalment on commit drop as
  select plan.reservation_id, plan.n, due.ordinal, due.due_on,
         plan.total_minor / count(*) over booking
           + case when due.ordinal = 1
                  then plan.total_minor % count(*) over booking
                  else 0 end as amount_minor,
         count(*) over booking as instalments
    from seeded_plan as plan
    cross join lateral (
      select ordinal::integer,
             (plan.starts_on
               + make_interval(months => (ordinal::integer - 1) * plan.months_apart))::date
               as due_on
        from generate_series(1, plan.most_instalments) as ordinal
    ) as due
   where due.due_on < plan.ends_on
  window booking as (partition by plan.reservation_id);

  insert into public.payment_plans
    (organization_id, property_id, reservation_id, currency, created_by,
     created_at)
  select ${literal(organizationId)}, property.id, plan.reservation_id,
         property.currency, ${literal(actorId)},
         ${localTime("plan.starts_on", "10:00")}
    from seeded_plan as plan
    join public.properties as property on property.id = ${literal(propertyId)};

  insert into public.plan_instalments
    (organization_id, property_id, plan_id, ordinal, amount_minor, due_on,
     revision, created_at)
  select plan.organization_id, plan.property_id, plan.id, due.ordinal,
         due.amount_minor, due.due_on, 1, plan.created_at
    from seeded_instalment as due
    join public.payment_plans as plan
      on plan.reservation_id = due.reservation_id;

  create temporary table seeded_due on commit drop as
  select due.*, instalment.id as instalment_id, folio.id as folio_id,
         max(due.ordinal) over (partition by due.reservation_id) as latest
    from seeded_instalment as due
    join public.payment_plans as plan
      on plan.reservation_id = due.reservation_id
    join public.plan_instalments as instalment
      on instalment.plan_id = plan.id and instalment.ordinal = due.ordinal
    join public.stays as stay on stay.reservation_id = due.reservation_id
    join public.folios as folio
      on folio.stay_id = stay.id and folio.status = 'open'
   where due.due_on <= ${today};

  insert into public.folio_lines
    (organization_id, property_id, folio_id, line_type, description,
     amount_minor, source, business_date, instalment_id, posted_at)
  select property.organization_id, property.id, due.folio_id, 'charge',
         'Instalment ' || due.ordinal || ' of ' || due.instalments,
         due.amount_minor, 'instalment', due.due_on, due.instalment_id,
         ${localTime("due.due_on", "09:00")}
    from seeded_due as due
    join public.properties as property on property.id = ${literal(propertyId)};

  insert into public.folio_lines
    (organization_id, property_id, folio_id, line_type, description,
     amount_minor, payment_method, posted_at)
  select property.organization_id, property.id, paid.folio_id, 'payment',
         'Taksit ' || paid.ordinal || ' ödemesi', -paid.paid_minor,
         (array['bank_transfer', 'cash', 'card'])[(paid.n % 3 + 1)::integer],
         least(${localTime("paid.due_on + (paid.n % 4 + 1)::integer", "14:00")},
               now())
    from (
      select due.*,
             case
               when due.n % 40 = 19 then 0
               when due.ordinal = due.latest and due.n % 20 = 7
                 then due.amount_minor / 2
               when due.ordinal = due.latest and due.n % 16 = 3 then 0
               else due.amount_minor
             end as paid_minor
        from seeded_due as due
    ) as paid
    join public.properties as property on property.id = ${literal(propertyId)}
   where paid.paid_minor > 0;

  commit;`);

// A curfew, a few students on leave from tonight with the reason they gave,
// and the roll call of the week before, with one student out last night.
// Tonight's is left for the desk to take. Leave and roll call are stamped with
// the acting user by the database, so this acts as the owner.
const LEAVE_REASONS = [
  "Hafta sonu ailesinin yanında",
  "Bölüm gezisi, Kapadokya",
  "Hastanede annesine refakat",
];
psql(`
  begin;
  select set_config('app.user_id', ${literal(actorId)}, true);

  insert into public.attendance_settings
    (property_id, organization_id, curfew_time, updated_by)
  values (${literal(propertyId)}, ${literal(organizationId)}, '23:00',
          ${literal(actorId)})
  on conflict (property_id) do nothing;

  create temporary table seeded_student on commit drop as
  ${seededStudents};

  with away (n, reason) as (
    values ${rows(LEAVE_REASONS.map((reason, index) => [5 + index * 23, reason]))}
  ), granted as (
    insert into public.attendance_leaves
      (organization_id, property_id, stay_id, from_night, to_night,
       planned_to_night, granted_by)
    select ${literal(organizationId)}, ${literal(propertyId)}, student.stay_id,
           ${today}, ${today} + 2, ${today} + 2, ${literal(actorId)}
      from seeded_student as student
      join away on away.n::bigint = student.n
     where not exists (
       select 1 from public.attendance_leaves as held
        join seeded_student as seeded on seeded.stay_id = held.stay_id)
    returning id, stay_id
  )
  insert into public.attendance_leave_reasons
    (leave_id, organization_id, property_id, reason)
  select granted.id, ${literal(organizationId)}, ${literal(propertyId)},
         away.reason
    from granted
    join seeded_student as student on student.stay_id = granted.stay_id
    join away on away.n::bigint = student.n;

  insert into public.attendance_marks
    (organization_id, property_id, stay_id, night, status, marked_by)
  select ${literal(organizationId)}, ${literal(propertyId)}, student.stay_id,
         night.day,
         case when night.day = ${today} - 1 and student.n = 12
              then 'absent' else 'present' end,
         ${literal(actorId)}
    from seeded_student as student
    cross join lateral (
      select (${today} - back)::date as day
        from generate_series(1, 7) as back
    ) as night
   where night.day >= student.starts_on
     and not exists (
       select 1 from public.attendance_marks as mark
        where mark.property_id = ${literal(propertyId)}
          and mark.night = night.day);

  commit;`);

const summary = psql(`
  select count(*) filter (where unit.parent_id is not null) || ' beds, ' ||
         count(stay.id) || ' Residents in house, ' ||
         count(folio.id) || ' with a Folio, ' ||
         count(plan.id) || ' paying by instalments'
    from public.accommodation_units as unit
    left join public.stays as stay
      on stay.accommodation_unit_id = unit.id and stay.status = 'in_house'
    left join public.folios as folio on folio.stay_id = stay.id
    left join public.payment_plans as plan
      on plan.reservation_id = stay.reservation_id
   where unit.property_id = ${literal(propertyId)}`);
const standing = psql(`
  select overdue.students || ' overdue, '
         || (select count(*) from public.attendance_leaves
              where property_id = ${literal(propertyId)}
                and status = 'granted'
                and ${today} between from_night and to_night)
         || ' on leave tonight'
    from app.payment_plans_overdue(${literal(propertyId)}) as overdue`);
console.log(`${PROPERTY} in ${ORGANIZATION}: ${summary}; ${standing}.`);
