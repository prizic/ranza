-- One guest in one Unit (20260916003700, ADR 0029).
--
-- Written as the owner: the rules under test are an index and a trigger, which
-- bind every role, so a policy has nothing to add here and would only make a
-- refusal ambiguous. The concurrent half — a booking and a check-in on one Unit
-- at the same moment — cannot be shown in one transaction and is in
-- tests/integration/front-office.test.ts.
--
-- Every assertion here was checked by breaking the thing it asserts — dropping
-- the unique index, dropping the branch that extends an overdue Stay through
-- tonight, extending a Stay due out today as well, removing the entering-only guard, dropping the Stay-side branch —
-- and confirming it went red.
begin;
select plan(15);

insert into public.organizations (id, name, status) values
  ('a0a11111-1111-4111-8111-111111111111', 'Occupancy Organization', 'active');
insert into public.properties (id, organization_id, name) values
  ('a0b11111-1111-4111-8111-111111111111',
   'a0a11111-1111-4111-8111-111111111111', 'Occupancy Property');
insert into public.guests (id, organization_id, full_name) values
  ('a0d11111-1111-4111-8111-111111111111',
   'a0a11111-1111-4111-8111-111111111111', 'Occupancy Guest');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('a0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'a0b11111-1111-4111-8111-111111111111',
       'a0a11111-1111-4111-8111-111111111111', 'OCC-' || n, 'room', 2
from generate_series(1, 7) as n;

create temporary table day as
  select app.property_today('a0b11111-1111-4111-8111-111111111111') as today;

-- Unit 1: somebody who should have left two days ago and has not.
-- Unit 2: somebody leaving in five days.
-- Unit 3: a Resident with no end date.
-- Unit 4: somebody leaving in two days.
-- Unit 7: somebody due out this morning.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type,
   status, starts_on, ends_on)
select ('a0f1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'a0a11111-1111-4111-8111-111111111111',
       'a0b11111-1111-4111-8111-111111111111',
       ('a0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       case when n = 3 then 'resident' else 'guest' end, 'in_house',
       (select today from day) - 5,
       case n when 1 then (select today from day) - 2
              when 2 then (select today from day) + 5
              when 3 then null
              when 4 then (select today from day) + 2
              when 7 then (select today from day) end
from generate_series(1, 7) as n
where n not in (5, 6);

-- ---------------------------------------------------------------------------
-- The room
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, stay_type,
       status, starts_on, ends_on)
    values ('a0a11111-1111-4111-8111-111111111111',
            'a0b11111-1111-4111-8111-111111111111',
            'a0c11111-1111-4111-8111-111111111111', 'guest', 'in_house',
            (select today from day), (select today from day) + 2)$$,
  '23505', null,
  'nobody is checked in on top of a Guest who overstayed, although their dates have passed');

select lives_ok(
  $$update public.stays set status = 'departed', ends_on = (select today from day)
     where id = 'a0f11111-1111-4111-8111-111111111111'$$,
  'once they are checked out');

select lives_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, stay_type,
       status, starts_on, ends_on)
    values ('a0a11111-1111-4111-8111-111111111111',
            'a0b11111-1111-4111-8111-111111111111',
            'a0c11111-1111-4111-8111-111111111111', 'guest', 'in_house',
            (select today from day), (select today from day) + 2)$$,
  'the next Guest goes in the same day');

-- ---------------------------------------------------------------------------
-- The booking
-- ---------------------------------------------------------------------------

create function pg_temp.book(unit int, starts int, ends int) returns void
language sql as $$
  insert into public.reservations
    (organization_id, property_id, accommodation_unit_id, guest_id,
     stay_type, status, starts_on, ends_on)
  values ('a0a11111-1111-4111-8111-111111111111',
          'a0b11111-1111-4111-8111-111111111111',
          ('a0c1111' || unit || '-1111-4111-8111-111111111111')::uuid,
          'a0d11111-1111-4111-8111-111111111111', 'guest', 'confirmed',
          (select today from day) + starts,
          case when ends is null then null else (select today from day) + ends end);
$$;

select throws_ok(
  $$select pg_temp.book(2, 3, 4)$$,
  '55006', null,
  'a booking cannot promise a night somebody in house is staying for');

select lives_ok(
  $$select pg_temp.book(4, 2, 4)$$,
  'a booking may start the day an in-house Guest is due to leave');

select lives_ok(
  $$select pg_temp.book(7, 0, 1)$$,
  'tonight can be sold in a room whose Guest is due out this morning');

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       stay_type, status, starts_on, ends_on)
    select organization_id, property_id, accommodation_unit_id, id,
           'guest', 'in_house', starts_on, ends_on
    from public.reservations
    where accommodation_unit_id = 'a0c11117-1111-4111-8111-111111111111'$$,
  '23505', null,
  'and the Guest who bought it waits at the desk until the room is checked out');

select throws_ok(
  $$select pg_temp.book(3, 200, 201)$$,
  '55006', null,
  'nor any night of a Resident who has not said when they leave');

-- A Guest overstaying on Unit 5 into a booking that was taken legally, which is
-- what time does: the Stay grew into the booking after it was made. The booking
-- goes in normally; only the Stay is written in replica mode, which skips
-- ordinary triggers for this session and is the only way to produce the state
-- time produces inside one transaction.
select pg_temp.book(5, 0, 2);
set local session_replication_role = replica;
insert into public.stays
  (organization_id, property_id, accommodation_unit_id, stay_type,
   status, starts_on, ends_on)
values ('a0a11111-1111-4111-8111-111111111111',
        'a0b11111-1111-4111-8111-111111111111',
        'a0c11115-1111-4111-8111-111111111111', 'guest', 'in_house',
        (select today from day) - 4, (select today from day) - 1);
set local session_replication_role = origin;

select throws_ok(
  $$select pg_temp.book(5, 0, 1)$$,
  '55006', null,
  'tonight is held by a Guest who overstayed, even though their plan says they left');

select lives_ok(
  $$select pg_temp.book(5, 2, 3)$$,
  'and nothing after it: an overdue Stay holds tonight, not the future');

select lives_ok(
  $$update public.reservations set updated_at = now()
     where accommodation_unit_id = 'a0c11115-1111-4111-8111-111111111111'
       and starts_on = (select today from day)$$,
  'a booking the overstay grew into can still be touched, so it can be cancelled');

-- The same for a withdrawn check-in: its Reservation returns to confirmed while
-- somebody else holds the Unit, and must not be refused for it. Arranged in
-- replica mode because it is otherwise unreachable today — the one Stay that
-- could hold the nights is the one being withdrawn.
set local session_replication_role = replica;
update public.reservations set status = 'checked_in'
 where accommodation_unit_id = 'a0c11115-1111-4111-8111-111111111111'
   and starts_on = (select today from day) + 2;
update public.stays set ends_on = (select today from day) + 5
 where accommodation_unit_id = 'a0c11115-1111-4111-8111-111111111111'
   and status = 'in_house';
set local session_replication_role = origin;

select lives_ok(
  $$update public.reservations set status = 'confirmed'
     where accommodation_unit_id = 'a0c11115-1111-4111-8111-111111111111'
       and starts_on = (select today from day) + 2$$,
  'a withdrawn check-in returns to confirmed whoever holds the Unit meanwhile');

select throws_ok(
  $$update public.reservations set ends_on = (select today from day) + 3
     where accommodation_unit_id = 'a0c11115-1111-4111-8111-111111111111'
       and starts_on = (select today from day)$$,
  '55006', null,
  'but not moved: changing its nights asks the question again');

-- ---------------------------------------------------------------------------
-- The other side: a Stay over somebody else's booking
-- ---------------------------------------------------------------------------

select pg_temp.book(6, 0, 3);

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, stay_type,
       status, starts_on, ends_on)
    values ('a0a11111-1111-4111-8111-111111111111',
            'a0b11111-1111-4111-8111-111111111111',
            'a0c11116-1111-4111-8111-111111111111', 'guest', 'in_house',
            (select today from day), (select today from day) + 1)$$,
  '55006', null,
  'nobody is put in a room another confirmed booking holds tonight');

select is(
  app.stay_holds('in_house', date '2026-01-01', date '2026-01-03', date '2026-01-10'),
  daterange(date '2026-01-01', date '2026-01-11', '[)'),
  'an overdue Stay holds everything from its start to the end of tonight');

select * from finish();
rollback;
