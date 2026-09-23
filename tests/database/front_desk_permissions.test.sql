-- A permission for every front-desk command, and a transition for every
-- permission to guard (20260916003600).
--
-- Four Staff Members, each holding one permission through a role their
-- Organization composed, so every assertion isolates one command. A refusal by
-- USING matches no row and raises nothing, so those are asserted by reading the
-- row back as the owner; a refusal by WITH CHECK raises 42501; an undrawn
-- transition raises 23514 for every role, the owner included.
--
-- Every assertion here was checked by breaking the thing it asserts — each
-- WHEN arm of the two policies widened to true in turn, the check_in disjunct
-- dropped from the Folio insert, the transition triggers dropped — and
-- confirming it went red.
begin;
select plan(20);

insert into public.users (id, email) values
  ('f1111111-1111-4111-8111-111111111111', 'desk-in@example.test'),
  ('f2222222-2222-4222-8222-222222222222', 'desk-out@example.test'),
  ('f3333333-3333-4333-8333-333333333333', 'desk-cancel@example.test'),
  ('f4444444-4444-4444-8444-444444444444', 'desk-book@example.test');

insert into public.organizations (id, name, status) values
  ('f0a11111-1111-4111-8111-111111111111', 'Permission Organization', 'active');
insert into public.properties (id, organization_id, name) values
  ('f0b11111-1111-4111-8111-111111111111',
   'f0a11111-1111-4111-8111-111111111111', 'Permission Property');
insert into public.subscriptions (organization_id, status) values
  ('f0a11111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('f0a11111-1111-4111-8111-111111111111', 'front_office'),
  ('f0a11111-1111-4111-8111-111111111111', 'billing_folios');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('f0b11111-1111-4111-8111-111111111111',
   'f0a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f0b11111-1111-4111-8111-111111111111',
   'f0a11111-1111-4111-8111-111111111111', 'finance', true);

-- One permission each. None of them holds finance.manage_folio, which is the
-- point of the Folio assertions.
insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('f0a11111-1111-4111-8111-111111111111', 'desk_in',
   'f0a11111-1111-4111-8111-111111111111', 'Check-in only', array['front_desk.check_in']),
  ('f0a11111-1111-4111-8111-111111111111', 'desk_out',
   'f0a11111-1111-4111-8111-111111111111', 'Check-out only', array['front_desk.check_out']),
  ('f0a11111-1111-4111-8111-111111111111', 'desk_cancel',
   'f0a11111-1111-4111-8111-111111111111', 'Cancel only', array['front_desk.cancel']),
  ('f0a11111-1111-4111-8111-111111111111', 'desk_book',
   'f0a11111-1111-4111-8111-111111111111', 'Book only', array['front_desk.book']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('f0a11111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111',
   'desk_in', 'f0a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('f0a11111-1111-4111-8111-111111111111', 'f2222222-2222-4222-8222-222222222222',
   'desk_out', 'f0a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('f0a11111-1111-4111-8111-111111111111', 'f3333333-3333-4333-8333-333333333333',
   'desk_cancel', 'f0a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('f0a11111-1111-4111-8111-111111111111', 'f4444444-4444-4444-8444-444444444444',
   'desk_book', 'f0a11111-1111-4111-8111-111111111111', 'organization_wide');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('f0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'f0b11111-1111-4111-8111-111111111111',
       'f0a11111-1111-4111-8111-111111111111', 'PERM-' || n, 'room', 2
from generate_series(1, 8) as n;

insert into public.guests (id, organization_id, full_name) values
  ('f0d11111-1111-4111-8111-111111111111',
   'f0a11111-1111-4111-8111-111111111111', 'Permission Guest');

-- Reservations 1-3 are checked in with a Stay each; 5-8 are confirmed. Dates
-- are the Property's own, so nothing here depends on when the suite runs.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id,
   stay_type, status, starts_on, ends_on)
select ('f0e1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'f0a11111-1111-4111-8111-111111111111',
       'f0b11111-1111-4111-8111-111111111111',
       ('f0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'f0d11111-1111-4111-8111-111111111111', 'guest',
       case when n <= 3 then 'checked_in' else 'confirmed' end,
       app.property_today('f0b11111-1111-4111-8111-111111111111'),
       app.property_today('f0b11111-1111-4111-8111-111111111111') + 2
from generate_series(1, 8) as n
where n <> 4;

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select ('f0f1111' || n || '-1111-4111-8111-111111111111')::uuid,
       'f0a11111-1111-4111-8111-111111111111',
       'f0b11111-1111-4111-8111-111111111111',
       ('f0c1111' || n || '-1111-4111-8111-111111111111')::uuid,
       case when n <= 3 then ('f0e1111' || n || '-1111-4111-8111-111111111111')::uuid end,
       'guest',
       case when n = 4 then 'departed' else 'in_house' end,
       app.property_today('f0b11111-1111-4111-8111-111111111111') - 1,
       app.property_today('f0b11111-1111-4111-8111-111111111111') + 2
from generate_series(1, 4) as n;

-- An open Folio on Stay 2, for the refusal to close one.
insert into public.folios (id, organization_id, property_id, stay_id, currency) values
  ('f0f22222-2222-4222-8222-222222222222', 'f0a11111-1111-4111-8111-111111111111',
   'f0b11111-1111-4111-8111-111111111111', 'f0f11112-1111-4111-8111-111111111111', 'TRY');

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

select ok(
  exists (select 1 from public.staff_permissions where key = 'front_desk.cancel'),
  'cancelling is a permission a role can be composed from');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null and 'front_desk.cancel' = any (permissions)$$,
  array['owner', 'manager', 'front_desk'],
  'the shipped owner, manager and front desk may cancel; finance and housekeeping may not');

set local role ranza_app;

-- ---------------------------------------------------------------------------
-- Stays
-- ---------------------------------------------------------------------------

select app.set_request_context('f1111111-1111-4111-8111-111111111111');

select lives_ok(
  $$update public.stays set status = 'cancelled', updated_at = now()
     where id = 'f0f11111-1111-4111-8111-111111111111'$$,
  'a role that can check in can withdraw a check-in');

select throws_ok(
  $$update public.stays set status = 'departed', updated_at = now()
     where id = 'f0f11113-1111-4111-8111-111111111111'$$,
  '42501', null,
  'a role that can check in cannot check out');

select throws_ok(
  $$update public.stays set status = 'cancelled', updated_at = now()
     where id = 'f0f11114-1111-4111-8111-111111111111'$$,
  '23514', null,
  'nobody withdraws a Stay that has already departed: that is history, not a mistake');

select app.set_request_context('f2222222-2222-4222-8222-222222222222');

select throws_ok(
  $$update public.stays set status = 'cancelled', updated_at = now()
     where id = 'f0f11112-1111-4111-8111-111111111111'$$,
  '42501', null,
  'a role that can check out cannot withdraw a check-in');

select lives_ok(
  $$update public.stays set status = 'departed', updated_at = now()
     where id = 'f0f11112-1111-4111-8111-111111111111'$$,
  'a role that can check out can end a Stay');

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

select app.set_request_context('f3333333-3333-4333-8333-333333333333');

select lives_ok(
  $$update public.reservations set status = 'cancelled', updated_at = now()
     where id = 'f0e11115-1111-4111-8111-111111111111'$$,
  'a role that can cancel can cancel a confirmed Reservation');

select lives_ok(
  $$update public.reservations set status = 'no_show', updated_at = now()
     where id = 'f0e11116-1111-4111-8111-111111111111'$$,
  'the same permission records that nobody came');

select throws_ok(
  $$update public.reservations set status = 'checked_in', updated_at = now()
     where id = 'f0e11117-1111-4111-8111-111111111111'$$,
  '42501', null,
  'a role that can cancel cannot check anybody in');

select app.set_request_context('f1111111-1111-4111-8111-111111111111');

select throws_ok(
  $$update public.reservations set status = 'cancelled', updated_at = now()
     where id = 'f0e11117-1111-4111-8111-111111111111'$$,
  '42501', null,
  'a role that can check in cannot cancel');

select lives_ok(
  $$update public.reservations set status = 'checked_in', updated_at = now()
     where id = 'f0e11117-1111-4111-8111-111111111111'$$,
  'a role that can check in moves a Reservation to checked in');

select lives_ok(
  $$update public.reservations set status = 'confirmed', updated_at = now()
     where id = 'f0e11117-1111-4111-8111-111111111111'$$,
  'and back, which is withdrawing the check-in');

-- Holds only front_desk.book, which touches no row here: USING refuses, so the
-- update matches nothing rather than raising.
select app.set_request_context('f4444444-4444-4444-8444-444444444444');
update public.reservations set status = 'cancelled', updated_at = now()
 where id = 'f0e11118-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- Folios
-- ---------------------------------------------------------------------------

select app.set_request_context('f1111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('f0a11111-1111-4111-8111-111111111111',
            'f0b11111-1111-4111-8111-111111111111',
            'f0f11113-1111-4111-8111-111111111111', 'TRY')$$,
  'a role that can check in opens the Folio a check-in needs, without finance.manage_folio');

select app.set_request_context('f2222222-2222-4222-8222-222222222222');

select throws_ok(
  $$insert into public.folios (organization_id, property_id, stay_id, currency)
    values ('f0a11111-1111-4111-8111-111111111111',
            'f0b11111-1111-4111-8111-111111111111',
            'f0f11114-1111-4111-8111-111111111111', 'TRY')$$,
  '42501', null,
  'a role that can only check out opens no Folio');

select lives_ok(
  $$update public.folios set status = 'closed', closed_at = now(), updated_at = now()
     where id = 'f0f22222-2222-4222-8222-222222222222'$$,
  'a role that can check out closes a Folio');

select app.set_request_context('f1111111-1111-4111-8111-111111111111');

select throws_ok(
  $$update public.folios set status = 'open', closed_at = null, updated_at = now()
     where id = 'f0f22222-2222-4222-8222-222222222222'$$,
  '42501', null,
  'reopening a Folio stays finance''s');

-- ---------------------------------------------------------------------------
-- Read back as the owner
-- ---------------------------------------------------------------------------

set local role none;

select is(
  (select status from public.reservations where id = 'f0e11118-1111-4111-8111-111111111111'),
  'confirmed',
  'a role holding none of the commands changed nothing, and was told nothing');

select throws_ok(
  $$update public.reservations set status = 'confirmed'
     where id = 'f0e11115-1111-4111-8111-111111111111'$$,
  '23514', null,
  'a cancelled Reservation stays cancelled, whoever asks');

select throws_ok(
  $$update public.stays set status = 'in_house'
     where id = 'f0f11114-1111-4111-8111-111111111111'$$,
  '23514', null,
  'a departed Stay does not come back in house: undoing a check-out is not built');

select * from finish();
rollback;
