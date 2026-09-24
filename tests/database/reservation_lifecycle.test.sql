-- A Reservation ends with its Stay, and says which one it is
-- (20260916003800; CO-S1-26, CO-S1-29, CO-S1-35).
--
-- The pair rule is checked at commit, so an assertion about it has to reach a
-- commit. pgTAP runs inside one transaction; `set constraints all immediate`
-- fires the deferred triggers at that point instead, which is the same check
-- asked early.
--
-- Every assertion here was checked by breaking the thing it asserts — the
-- pair triggers made initially immediate, the checked_out arm widened to
-- true, the reference trigger dropped — and confirming it went red.
begin;
select plan(12);

insert into public.organizations (id, name, status) values
  ('c0a11111-1111-4111-8111-111111111111', 'Lifecycle Organization', 'active');
insert into public.properties (id, organization_id, name) values
  ('c0b11111-1111-4111-8111-111111111111',
   'c0a11111-1111-4111-8111-111111111111', 'Lifecycle Property');
insert into public.guests (id, organization_id, full_name) values
  ('c0d11111-1111-4111-8111-111111111111',
   'c0a11111-1111-4111-8111-111111111111', 'Lifecycle Guest');
insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('c0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'c0b11111-1111-4111-8111-111111111111',
       'c0a11111-1111-4111-8111-111111111111', 'LC-' || n, 'room', 2
from generate_series(1, 4) as n;

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select ('c0e1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'c0a11111-1111-4111-8111-111111111111',
       'c0b11111-1111-4111-8111-111111111111',
       ('c0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'c0d11111-1111-4111-8111-111111111111', 'guest', 'confirmed',
       app.property_today('c0b11111-1111-4111-8111-111111111111'),
       app.property_today('c0b11111-1111-4111-8111-111111111111') + 2
from generate_series(1, 4) as n;

-- Reservations 1-3 are checked in, each with its Stay, in one statement so the
-- pair agrees at commit.
with moved as (
  update public.reservations set status = 'checked_in'
   where id in ('c0e11111-1111-4111-8111-111111111111',
                'c0e11112-1111-4111-8111-111111111111',
                'c0e11113-1111-4111-8111-111111111111')
  returning id, organization_id, property_id, accommodation_unit_id, starts_on, ends_on
)
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select ('c0f' || substr(id::text, 4))::uuid, organization_id, property_id,
       accommodation_unit_id, id, 'guest', 'in_house', starts_on, ends_on
from moved;

set constraints all immediate;
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Check-out moves both, in either order (CO-S1-35)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.stays set status = 'departed'
     where reservation_id = 'c0e11111-1111-4111-8111-111111111111';
    update public.reservations set status = 'checked_out'
     where id = 'c0e11111-1111-4111-8111-111111111111';
    set constraints all immediate$$,
  'the Stay first and then the Reservation agree at commit');
set constraints all deferred;

select lives_ok(
  $$update public.reservations set status = 'checked_out'
     where id = 'c0e11112-1111-4111-8111-111111111111';
    update public.stays set status = 'departed'
     where reservation_id = 'c0e11112-1111-4111-8111-111111111111';
    set constraints all immediate$$,
  'and so do the Reservation first and then the Stay');
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- The pair cannot be left disagreeing (CO-S1-29)
-- ---------------------------------------------------------------------------

savepoint half_a_check_out;
update public.stays set status = 'departed'
 where reservation_id = 'c0e11113-1111-4111-8111-111111111111';
select throws_ok(
  $$set constraints all immediate$$,
  '23514', null,
  'a Stay that has departed behind a Reservation still checked in is refused at commit');
rollback to savepoint half_a_check_out;
set constraints all deferred;

savepoint checked_out_still_here;
update public.reservations set status = 'checked_out'
 where id = 'c0e11113-1111-4111-8111-111111111111';
select throws_ok(
  $$set constraints all immediate$$,
  '23514', null,
  'a Reservation checked out while its Guest is still in the room is refused at commit');
rollback to savepoint checked_out_still_here;
set constraints all deferred;

savepoint checked_in_nobody;
update public.reservations set status = 'checked_in'
 where id = 'c0e11114-1111-4111-8111-111111111111';
select throws_ok(
  $$set constraints all immediate$$,
  '23514', null,
  'a Reservation checked in with nobody in the room is refused at commit');
rollback to savepoint checked_in_nobody;
set constraints all deferred;

-- A withdrawn check-in is a pair the rule has no opinion about.
update public.stays set status = 'cancelled'
 where reservation_id = 'c0e11113-1111-4111-8111-111111111111';
update public.reservations set status = 'confirmed'
 where id = 'c0e11113-1111-4111-8111-111111111111';
select lives_ok(
  $$set constraints all immediate$$,
  'a cancelled Stay behind a confirmed Reservation is a withdrawn check-in, and allowed');
set constraints all deferred;

-- A Stay that began without a Reservation has no pair (CO-S1-06).
insert into public.stays
  (organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
values ('c0a11111-1111-4111-8111-111111111111',
        'c0b11111-1111-4111-8111-111111111111',
        'c0c11114-1111-4111-8111-111111111111', 'guest', 'departed',
        app.property_today('c0b11111-1111-4111-8111-111111111111') - 3,
        app.property_today('c0b11111-1111-4111-8111-111111111111') - 1);
select lives_ok(
  $$set constraints all immediate$$,
  'a Stay with no Reservation is not held to a pair');
set constraints all deferred;

select throws_ok(
  $$update public.reservations set status = 'checked_in'
     where id = 'c0e11111-1111-4111-8111-111111111111'$$,
  '23514', null,
  'a checked-out Reservation does not come back: undoing a check-out is not built');

-- ---------------------------------------------------------------------------
-- The reference
-- ---------------------------------------------------------------------------

select ok(
  (select bool_and(reference ~ '^R[0-9A-HJKMNP-TV-Z]{6}$') from public.reservations),
  'every Reservation has R and six characters with no I, L, O or U');

select is(
  (select count(distinct reference)::int from public.reservations),
  (select count(*)::int from public.reservations),
  'and no two share one');

select isnt(
  (select reference from public.reservations
    where id = 'c0e11111-1111-4111-8111-111111111111'),
  (select app.reservation_reference(1)),
  'references are not simply the sequence written out');

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on, reference)
values ('c0e22222-2222-4222-8222-222222222222',
        'c0a11111-1111-4111-8111-111111111111',
        'c0b11111-1111-4111-8111-111111111111',
        'c0c11114-1111-4111-8111-111111111111',
        'c0d11111-1111-4111-8111-111111111111', 'guest', 'confirmed',
        app.property_today('c0b11111-1111-4111-8111-111111111111') + 30,
        app.property_today('c0b11111-1111-4111-8111-111111111111') + 31,
        'RCHOSEN');

select isnt(
  (select reference from public.reservations
    where id = 'c0e22222-2222-4222-8222-222222222222'),
  'RCHOSEN',
  'a reference named in the insert is replaced: nobody chooses one');

select * from finish();
rollback;
