-- Reversing a charge is its own permission, and the line constraints that
-- bound any posting (FO-S4-10, FO-S7-01, FO-S2-04, FO-S4-05; ADR 0041).
--
-- folios.test.sql proves the policies, grants and triggers with a Manager, who
-- holds every finance permission, so it cannot tell which permission a line
-- asked for. This suite isolates each: a role that may only post, one that may
-- only reverse, and the shipped Front desk role, which may do neither.
--
-- Every assertion was checked by breaking what it asserts, recorded in
-- docs/evidence/decision-sheet/folios.md:
--   the policy asking post_charge for every line again        FO-S4-10
--   the permission clause dropped from the policy             FO-S7-01
--   folio_lines_description_check dropped                     FO-S2-04
--   folio_lines_type_check dropped                            FO-S4-05
--   the data migration narrowed to the shipped roles          FO-S4-10 (custom role)
--
-- Dates are the Property's own today, never a fixed day.
begin;
select plan(19);

insert into public.users (id, email) values
  ('a7111111-1111-4111-8111-111111111111', 'reverse-poster@example.test'),
  ('a7222222-2222-4222-8222-222222222222', 'reverse-reverser@example.test'),
  ('a7333333-3333-4333-8333-333333333333', 'reverse-desk@example.test'),
  ('a7444444-4444-4444-8444-444444444444', 'reverse-finance@example.test');

insert into public.organizations (id, name, status) values
  ('a7a11111-1111-4111-8111-111111111111', 'Reversal Organization', 'active');

insert into public.properties (id, organization_id, name, currency) values
  ('a7c11111-1111-4111-8111-111111111111',
   'a7a11111-1111-4111-8111-111111111111', 'Reversal Property', 'TRY');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('a7d11111-1111-4111-8111-111111111111',
   'a7c11111-1111-4111-8111-111111111111',
   'a7a11111-1111-4111-8111-111111111111', 'RV-101', 'room', 2);

insert into public.subscriptions (organization_id, status) values
  ('a7a11111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('a7a11111-1111-4111-8111-111111111111', 'billing_folios');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('a7c11111-1111-4111-8111-111111111111',
   'a7a11111-1111-4111-8111-111111111111', 'finance', true);

-- Written after the migration, so neither holds what it did not ask for: the
-- poster is the role an Organization writes when it wants somebody who posts
-- and does not void, and the reverser the opposite.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('a7a11111-1111-4111-8111-111111111111', 'charge_poster',
   'a7a11111-1111-4111-8111-111111111111', 'Charge poster',
   array['finance.post_charge']),
  ('a7a11111-1111-4111-8111-111111111111', 'charge_reverser',
   'a7a11111-1111-4111-8111-111111111111', 'Charge reverser',
   array['finance.reverse_charge']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('a7a11111-1111-4111-8111-111111111111',
   'a7111111-1111-4111-8111-111111111111', 'charge_poster',
   'a7a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('a7a11111-1111-4111-8111-111111111111',
   'a7222222-2222-4222-8222-222222222222', 'charge_reverser',
   'a7a11111-1111-4111-8111-111111111111', 'organization_wide');
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('a7a11111-1111-4111-8111-111111111111',
   'a7333333-3333-4333-8333-333333333333', 'front_desk', 'organization_wide'),
  ('a7a11111-1111-4111-8111-111111111111',
   'a7444444-4444-4444-8444-444444444444', 'finance', 'organization_wide');

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on)
select 'a7f11111-1111-4111-8111-111111111111',
       'a7a11111-1111-4111-8111-111111111111',
       'a7c11111-1111-4111-8111-111111111111',
       'a7d11111-1111-4111-8111-111111111111', null,
       'guest', 'in_house',
       app.property_today('a7c11111-1111-4111-8111-111111111111'),
       app.property_today('a7c11111-1111-4111-8111-111111111111') + 3;

insert into public.folios
  (id, organization_id, property_id, stay_id, currency) values
  ('a7e11111-1111-4111-8111-111111111111',
   'a7a11111-1111-4111-8111-111111111111',
   'a7c11111-1111-4111-8111-111111111111',
   'a7f11111-1111-4111-8111-111111111111', 'TRY');

-- ---------------------------------------------------------------------------
-- The catalogue and the shipped roles
-- ---------------------------------------------------------------------------

select is(
  (select module_key from public.staff_permissions
    where key = 'finance.reverse_charge'),
  'billing_folios',
  'FO-S4-10: finance.reverse_charge is in the catalogue, under Billing');

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null
       and 'finance.reverse_charge' = any (permissions)$$,
  array['owner', 'manager', 'finance'],
  'FO-S4-10: the shipped Owner, Manager and Finance roles reverse; Front desk and Housekeeping do not');

-- ---------------------------------------------------------------------------
-- A role that may only post
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('a7111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', 'Minibar', 4500)$$,
  'FO-S4-10: a role holding only finance.post_charge posts a charge');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'reversal', 'Voided by the poster', -4500,
            (select id from public.folio_lines where description = 'Minibar'))$$,
  '42501', NULL,
  'FO-S4-10: and may not reverse it: a reversal asks finance.reverse_charge');

-- ---------------------------------------------------------------------------
-- A role that may only reverse
-- ---------------------------------------------------------------------------

select app.set_request_context('a7222222-2222-4222-8222-222222222222');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', 'Posted by the reverser', 100)$$,
  '42501', NULL,
  'FO-S4-10: a role holding only finance.reverse_charge posts no charge');

select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'reversal', 'Charged to the wrong room', -4500,
            (select id from public.folio_lines where description = 'Minibar'))$$,
  'FO-S4-10: but reverses one');

-- ---------------------------------------------------------------------------
-- The shipped Front desk role (FO-S7-01)
-- ---------------------------------------------------------------------------

select app.set_request_context('a7333333-3333-4333-8333-333333333333');

select isnt_empty(
  $$select id from public.folios
     where id = 'a7e11111-1111-4111-8111-111111111111'$$,
  'FO-S7-01: the Front desk role reaches the Folio it opened at check-in');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', 'Posted at the desk', 2500)$$,
  '42501', NULL,
  'FO-S7-01: and posts no charge to it: the shipped Front desk role lacks finance.post_charge');

-- ---------------------------------------------------------------------------
-- The shipped Finance role does both
-- ---------------------------------------------------------------------------

select app.set_request_context('a7444444-4444-4444-8444-444444444444');

select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', 'Laundry', 7500)$$,
  'FO-S4-10: the shipped Finance role posts');

select lives_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'reversal', 'Laundry was complimentary', -7500,
            (select id from public.folio_lines where description = 'Laundry'))$$,
  'FO-S4-10: and reverses');

-- ---------------------------------------------------------------------------
-- The line constraints, from a role the policy admits (FO-S2-04, FO-S4-05)
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', %L, 100)$$, repeat('x', 201)),
  '23514', NULL,
  'FO-S2-04: a description over 200 characters is refused by the database');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', '    ', 100)$$,
  '23514', NULL,
  'FO-S2-04: and so is one that is blank once trimmed');

select lives_ok(
  format($$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', %L, 100)$$, repeat('y', 200)),
  'FO-S2-04: exactly 200 characters is a description');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'reversal', 'Undo the correction', 4500,
            (select id from public.folio_lines
              where description = 'Charged to the wrong room'))$$,
  '23514', NULL,
  'FO-S4-05: a reversal of a reversal is refused: it would be a positive line naming another');

select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, reverses_line_id)
    values ('a7a11111-1111-4111-8111-111111111111',
            'a7c11111-1111-4111-8111-111111111111',
            'a7e11111-1111-4111-8111-111111111111',
            'charge', 'A charge naming a line', 4500,
            (select id from public.folio_lines
              where description = 'Charged to the wrong room'))$$,
  '23514', NULL,
  'FO-S4-05: and so is a charge that names one');

select results_eq(
  $$select count(*) from public.folio_lines
     where folio_id = 'a7e11111-1111-4111-8111-111111111111'$$,
  $$values (5::bigint)$$,
  'every refusal above wrote nothing');

-- ---------------------------------------------------------------------------
-- The migration, from disk, keeps every existing role's ability to reverse
-- ---------------------------------------------------------------------------

-- Read rather than copied, as folios.test.sql reads its backfill. It is
-- written to run twice, which is what lets it run here.
\set reverse_migration `cat prisma/migrations/20260916009600_reversing_a_charge_is_its_own_permission/migration.sql`

reset role;

-- An Organization's own role from before the split: it posted, so it could
-- reverse. And one that never posted.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('a7a11111-1111-4111-8111-111111111111', 'night_auditor',
   'a7a11111-1111-4111-8111-111111111111', 'Night auditor',
   array['finance.post_charge', 'audit.read']),
  ('a7a11111-1111-4111-8111-111111111111', 'auditor',
   'a7a11111-1111-4111-8111-111111111111', 'Auditor',
   array['audit.read']);

select lives_ok(:'reverse_migration',
  'FO-S4-10: the migration runs against a database holding an Organization''s own posting role');

select is(
  (select permissions from public.staff_roles
    where scope_id = 'a7a11111-1111-4111-8111-111111111111'
      and key = 'night_auditor'),
  array['finance.post_charge', 'audit.read', 'finance.reverse_charge'],
  'FO-S4-10: a role an Organization wrote that posted keeps reversing');

select is(
  (select permissions from public.staff_roles
    where scope_id = 'a7a11111-1111-4111-8111-111111111111'
      and key = 'auditor'),
  array['audit.read'],
  'FO-S4-10: and a role that never posted gains nothing');

select * from finish();
rollback;
