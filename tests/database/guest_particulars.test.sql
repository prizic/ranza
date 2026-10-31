-- A Guest's particulars: date of birth, studies, guardian, emergency contact
-- (RANZ-110, RANZ-99, PA-S1-*).
--
-- Three claims:
--
--   the values     what the checks accept, and that a row belongs to a Guest of
--                  its own Organization.
--
--   the read       only `guests.read_particulars` reads a row. A housekeeper
--                  reads the Guest and not their particulars; a manager of
--                  another Organization reads neither.
--
--   the write      only app.record_guest_particulars writes, for whoever may
--                  take a booking — a role that may book and may not read
--                  included — and a blank keeps what is on file.
--
-- Rows in docs/features/guest-particulars/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a rolled-back
-- transaction, the altered object printed first, and the named assertions seen
-- red:
--   read policy without the permission           PA-S1-04 housekeeping
--   record function without front_desk.book      PA-S1-06 housekeeping
--   record function overwriting with blanks      PA-S1-07
--   insert granted to ranza_app                  PA-S1-08 the catalogue
--
-- The grant break leaves the direct insert refused all the same: there is no
-- INSERT policy either, and row-level security refuses with the same 42501.
-- Two reasons bind it, so the catalogue assertion is the one that names the
-- grant.
begin;
select plan(24);

insert into public.users (id, email) values
  ('f7111111-1111-4111-8111-111111111111', 'gp-manager@example.test'),
  ('f7222222-2222-4222-8222-222222222222', 'gp-desk@example.test'),
  ('f7333333-3333-4333-8333-333333333333', 'gp-housekeeper@example.test'),
  ('f7444444-4444-4444-8444-444444444444', 'gp-outsider@example.test'),
  ('f7555555-5555-4555-8555-555555555555', 'gp-booker@example.test');

insert into public.organizations (id, name, status) values
  ('f7a11111-1111-4111-8111-111111111111', 'Particular Organization', 'active'),
  ('f7a22222-2222-4222-8222-222222222222', 'Other Particular Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'Particular Yurt'),
  ('f7b22222-2222-4222-8222-222222222222',
   'f7a22222-2222-4222-8222-222222222222', 'Other Particular Yurt');

-- A role an Organization wrote that may take a booking and nothing else: what
-- makes the permission, and not the name of a role, the thing asked.
insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('f7a11111-1111-4111-8111-111111111111', 'booker',
   'f7a11111-1111-4111-8111-111111111111', 'Booker',
   array['front_desk.book']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('f7a11111-1111-4111-8111-111111111111', 'f7111111-1111-4111-8111-111111111111',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f7a11111-1111-4111-8111-111111111111', 'f7222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f7a11111-1111-4111-8111-111111111111', 'f7333333-3333-4333-8333-333333333333',
   'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f7a22222-2222-4222-8222-222222222222', 'f7444444-4444-4444-8444-444444444444',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f7a11111-1111-4111-8111-111111111111', 'f7555555-5555-4555-8555-555555555555',
   'booker', 'f7a11111-1111-4111-8111-111111111111', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('f7a11111-1111-4111-8111-111111111111', 'active'),
  ('f7a22222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('f7a11111-1111-4111-8111-111111111111', 'front_office'),
  ('f7a22222-2222-4222-8222-222222222222', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('f7b11111-1111-4111-8111-111111111111',
   'f7a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f7b22222-2222-4222-8222-222222222222',
   'f7a22222-2222-4222-8222-222222222222', 'front_desk', true);

insert into public.guests (id, organization_id, full_name) values
  ('f7d00000-0000-4000-8000-000000000001',
   'f7a11111-1111-4111-8111-111111111111', 'Zeynep Öğrenci'),
  ('f7d00000-0000-4000-8000-000000000002',
   'f7a11111-1111-4111-8111-111111111111', 'Can Öğrenci'),
  ('f7d00000-0000-4000-8000-000000000003',
   'f7a22222-2222-4222-8222-222222222222', 'Another Organization''s Guest');

-- ---------------------------------------------------------------------------
-- The values
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, date_of_birth)
     values ('f7d00000-0000-4000-8000-000000000002',
             'f7a11111-1111-4111-8111-111111111111', '1899-12-31') $$,
  '23514', null, 'PA-S1-01: a date of birth is not before 1900');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, study_year)
     values ('f7d00000-0000-4000-8000-000000000002',
             'f7a11111-1111-4111-8111-111111111111', 9) $$,
  '23514', null, 'PA-S1-01: a year of study is one to eight');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, institution)
     values ('f7d00000-0000-4000-8000-000000000002',
             'f7a11111-1111-4111-8111-111111111111', ' ODTÜ') $$,
  '23514', null, 'PA-S1-01: a university is stored trimmed');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, guardian_name)
     values ('f7d00000-0000-4000-8000-000000000002',
             'f7a11111-1111-4111-8111-111111111111', 'A') $$,
  '23514', null, 'PA-S1-01: a guardian''s name is at least two characters');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, emergency_phone)
     values ('f7d00000-0000-4000-8000-000000000002',
             'f7a11111-1111-4111-8111-111111111111', repeat('5', 41)) $$,
  '23514', null, 'PA-S1-01: a telephone is at most forty characters, as a Guest''s');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id)
     values ('f7d00000-0000-4000-8000-000000000003',
             'f7a11111-1111-4111-8111-111111111111') $$,
  '23503', null, 'PA-S1-02: particulars name a Guest of their own Organization');

-- ---------------------------------------------------------------------------
-- The catalogue, and what the runtime role is given
-- ---------------------------------------------------------------------------

select is(
  (select module_key from public.staff_permissions
    where key = 'guests.read_particulars'),
  'front_office',
  'PA-S1-03: guests.read_particulars is in the catalogue');

select results_eq(
  $$ select key from public.staff_roles
      where organization_id is null
        and 'guests.read_particulars' = any (permissions)
      order by key $$,
  $$ values ('front_desk'::text), ('manager'), ('owner') $$,
  'PA-S1-03: the shipped Owner, Manager and Front desk hold it, and nobody else');

select ok(
  (select relforcerowsecurity from pg_catalog.pg_class
    where oid = 'public.guest_particulars'::regclass),
  'PA-S1-04: the table forces its policies on its owner too');

select is_empty(
  $$ select privilege_type from information_schema.table_privileges
      where table_schema = 'public' and table_name = 'guest_particulars'
        and grantee = 'ranza_app' and privilege_type <> 'SELECT' $$,
  'PA-S1-08: the runtime role may write the table no way but the function');

select ok(
  (select proacl::text from pg_catalog.pg_proc
    where oid = 'app.record_guest_particulars(uuid, date, text, smallint, text, text, text, text)'::regprocedure)
    !~ '(^|,)=X',
  'PA-S1-08: the function is nobody''s to call but the runtime role''s');

-- ---------------------------------------------------------------------------
-- The write and the read, as the runtime role
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('f7222222-2222-4222-8222-222222222222');
select lives_ok(
  $$ select app.record_guest_particulars(
       'f7d00000-0000-4000-8000-000000000001', '2008-03-14', 'ODTÜ', 1::smallint,
       'Ayten Öğrenci', '+90 532 111 11 11', 'Murat Öğrenci', '+90 532 222 22 22') $$,
  'PA-S1-06: a front desk records a student''s particulars');

select results_eq(
  $$ select date_of_birth, institution, study_year, guardian_name, guardian_phone,
            emergency_name, emergency_phone
       from public.guest_particulars
      where guest_id = 'f7d00000-0000-4000-8000-000000000001' $$,
  $$ values ('2008-03-14'::date, 'ODTÜ'::text, 1::smallint, 'Ayten Öğrenci'::text,
             '+90 532 111 11 11'::text, 'Murat Öğrenci'::text, '+90 532 222 22 22'::text) $$,
  'PA-S1-05: and reads them back, as the front desk may');

select lives_ok(
  $$ select app.record_guest_particulars(
       'f7d00000-0000-4000-8000-000000000001', null, null, 2::smallint,
       null, null, null, null) $$,
  'PA-S1-07: a booking with blanks records over them');

select results_eq(
  $$ select study_year, institution, guardian_name
       from public.guest_particulars
      where guest_id = 'f7d00000-0000-4000-8000-000000000001' $$,
  $$ values (2::smallint, 'ODTÜ'::text, 'Ayten Öğrenci'::text) $$,
  'PA-S1-07: what was typed replaces, and a blank keeps what is on file');

select throws_ok(
  $$ select app.record_guest_particulars(
       'f7d00000-0000-4000-8000-000000000002', current_date + 1, null, null,
       null, null, null, null) $$,
  '23514', null, 'PA-S1-01: a date of birth is not in the future');

select app.set_request_context('f7111111-1111-4111-8111-111111111111');
select is(
  (select count(*)::int from public.guest_particulars
    where guest_id = 'f7d00000-0000-4000-8000-000000000001'),
  1, 'PA-S1-05: a manager reads them');

select app.set_request_context('f7333333-3333-4333-8333-333333333333');
select is(
  (select count(*)::int from public.guests
    where id = 'f7d00000-0000-4000-8000-000000000001'),
  1, 'PA-S1-04: a housekeeper reads the Guest, a name on a room');
select is(
  (select count(*)::int from public.guest_particulars),
  0, 'PA-S1-04: and not their particulars');
select throws_ok(
  $$ select app.record_guest_particulars(
       'f7d00000-0000-4000-8000-000000000002', null, 'Hacettepe', null,
       null, null, null, null) $$,
  '42501', null, 'PA-S1-06: nor records any, without front_desk.book');

select app.set_request_context('f7555555-5555-4555-8555-555555555555');
select lives_ok(
  $$ select app.record_guest_particulars(
       'f7d00000-0000-4000-8000-000000000002', null, 'Hacettepe', 3::smallint,
       null, null, null, null) $$,
  'PA-S1-06: a role that may book records particulars, and a returning student''s again');
select is(
  (select count(*)::int from public.guest_particulars),
  0, 'PA-S1-04: but reads none back without guests.read_particulars');

select app.set_request_context('f7444444-4444-4444-8444-444444444444');
select throws_ok(
  $$ select app.record_guest_particulars(
       'f7d00000-0000-4000-8000-000000000001', null, 'Bilkent', null,
       null, null, null, null) $$,
  '42501', null, 'PA-S1-06: a manager of another Organization records nothing');

-- Last, because a missing grant raises.
select app.set_request_context('f7222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, institution)
     values ('f7d00000-0000-4000-8000-000000000002',
             'f7a11111-1111-4111-8111-111111111111', 'İTÜ') $$,
  '42501', null, 'PA-S1-08: nor by writing the table, which nobody may');

set local role none;

select * from finish();
rollback;
