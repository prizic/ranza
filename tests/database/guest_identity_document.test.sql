-- The identity document a Guest registers with: nationality, kind and number
-- (RANZ-81, PA-S2-*).
--
-- Four claims:
--
--   the values   a T.C. kimlik number is eleven digits whose last two follow
--                from the first nine, any other number is six to twenty upper
--                case letters and digits, the kind and the number are a pair,
--                and a nationality is two capital letters.
--
--   the mask     the runtime role is not granted the number: it reads the
--                last four, and the whole number only through
--                app.reveal_guest_identity_document, which asks reach and
--                guests.read_particulars.
--
--   the write    the record function stores all three, upper-cases and trims
--                a number, replaces the pair together, and a blank keeps it.
--
--   the old way  the eight-argument record function is gone, not left beside
--                the new one.
--
-- Rows in docs/features/guest-particulars/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a
-- rolled-back transaction, the altered object printed first, and the named
-- assertions seen red:
--   is_tc_kimlik() answering true to anything      PA-S2-02 checksum
--   the number check dropped from the table        PA-S2-03 bounds
--   the pair check dropped from the table          PA-S2-04
--   select on document_number granted to ranza_app PA-S2-06 mask
--   reveal function without the permission check   PA-S2-07 housekeeping
--   record function overwriting with blanks        PA-S2-09 blank keeps
--   reveal function without reach or permission    PA-S2-07 another Organization
--
-- The permission break alone leaves the other Organization's manager green:
-- reach refuses them first and the permission is asked behind it, so the two
-- never diverge for that caller. The reach clause stays because the helper it
-- leans on is shared; deleting both is the break that reddens that assertion.
begin;
select plan(35);

insert into public.users (id, email) values
  ('f8111111-1111-4111-8111-111111111111', 'id-manager@example.test'),
  ('f8222222-2222-4222-8222-222222222222', 'id-desk@example.test'),
  ('f8333333-3333-4333-8333-333333333333', 'id-housekeeper@example.test'),
  ('f8444444-4444-4444-8444-444444444444', 'id-outsider@example.test'),
  ('f8555555-5555-4555-8555-555555555555', 'id-booker@example.test');

insert into public.organizations (id, name, status) values
  ('f8a11111-1111-4111-8111-111111111111', 'Identity Organization', 'active'),
  ('f8a22222-2222-4222-8222-222222222222', 'Other Identity Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('f8b11111-1111-4111-8111-111111111111',
   'f8a11111-1111-4111-8111-111111111111', 'Identity Yurt'),
  ('f8b22222-2222-4222-8222-222222222222',
   'f8a22222-2222-4222-8222-222222222222', 'Other Identity Yurt');

insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('f8a11111-1111-4111-8111-111111111111', 'booker',
   'f8a11111-1111-4111-8111-111111111111', 'Booker',
   array['front_desk.book']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('f8a11111-1111-4111-8111-111111111111', 'f8111111-1111-4111-8111-111111111111',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8333333-3333-4333-8333-333333333333',
   'housekeeping', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a22222-2222-4222-8222-222222222222', 'f8444444-4444-4444-8444-444444444444',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('f8a11111-1111-4111-8111-111111111111', 'f8555555-5555-4555-8555-555555555555',
   'booker', 'f8a11111-1111-4111-8111-111111111111', 'organization_wide');

insert into public.subscriptions (organization_id, status) values
  ('f8a11111-1111-4111-8111-111111111111', 'active'),
  ('f8a22222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('f8a11111-1111-4111-8111-111111111111', 'front_office'),
  ('f8a22222-2222-4222-8222-222222222222', 'front_office');

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('f8b11111-1111-4111-8111-111111111111',
   'f8a11111-1111-4111-8111-111111111111', 'front_desk', true),
  ('f8b22222-2222-4222-8222-222222222222',
   'f8a22222-2222-4222-8222-222222222222', 'front_desk', true);

insert into public.guests (id, organization_id, full_name) values
  ('f8d00000-0000-4000-8000-000000000001',
   'f8a11111-1111-4111-8111-111111111111', 'Zeynep Öğrenci'),
  ('f8d00000-0000-4000-8000-000000000002',
   'f8a11111-1111-4111-8111-111111111111', 'Can Öğrenci'),
  ('f8d00000-0000-4000-8000-000000000003',
   'f8a11111-1111-4111-8111-111111111111', 'Ece Belgesiz');

-- ---------------------------------------------------------------------------
-- The values
-- ---------------------------------------------------------------------------

select ok(app.is_tc_kimlik('10000000146') and app.is_tc_kimlik('11111111110'),
  'PA-S2-02: a T.C. kimlik number with both check digits right is one');

select ok(
  not app.is_tc_kimlik('10000000147')
  and not app.is_tc_kimlik('10000000156')
  and not app.is_tc_kimlik('00000000000')
  and not app.is_tc_kimlik('1000000014')
  and not app.is_tc_kimlik('100000001460')
  and not app.is_tc_kimlik('1000000014A')
  and not app.is_tc_kimlik(null),
  'PA-S2-02: and not with a wrong digit, a leading zero, the wrong length or a letter');

select lives_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, nationality, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000002',
             'f8a11111-1111-4111-8111-111111111111', 'TR', 'tc_kimlik', '10000000146') $$,
  'PA-S2-02: the table stores a valid T.C. kimlik number');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'tc_kimlik', '10000000147') $$,
  '23514', null, 'PA-S2-02: and refuses one whose check digits are wrong');

select is(
  (select document_last_four from public.guest_particulars
    where guest_id = 'f8d00000-0000-4000-8000-000000000002'),
  '0146', 'PA-S2-05: the last four are generated from the number');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'passport', 'U1234') $$,
  '23514', null, 'PA-S2-03: a passport number of five characters is refused');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'passport', repeat('A', 21)) $$,
  '23514', null, 'PA-S2-03: and of twenty-one');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'passport', 'u1234567') $$,
  '23514', null, 'PA-S2-03: and one stored in lower case');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'residence_permit', 'U12-3456') $$,
  '23514', null, 'PA-S2-03: and one with punctuation in it');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'visa', 'U1234567') $$,
  '23514', null, 'PA-S2-03: a kind of document that is not one is refused');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_number)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'U1234567') $$,
  '23514', null, 'PA-S2-04: a number with no kind is refused');

select throws_ok(
  $$ insert into public.guest_particulars
       (guest_id, organization_id, document_type)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'passport') $$,
  '23514', null, 'PA-S2-04: and a kind with no number');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, nationality)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'tr') $$,
  '23514', null, 'PA-S2-01: a nationality in lower case is refused');

select throws_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, nationality)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'TUR') $$,
  '23514', null, 'PA-S2-01: and one of three letters');

select lives_ok(
  $$ insert into public.guest_particulars (guest_id, organization_id, nationality)
     values ('f8d00000-0000-4000-8000-000000000001',
             'f8a11111-1111-4111-8111-111111111111', 'XK') $$,
  'PA-S2-01: two capital letters are accepted, Kosovo''s included');

-- ---------------------------------------------------------------------------
-- The mask, and the catalogue
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'guest_particulars'
        and grantee = 'ranza_app' and column_name = 'document_number' $$,
  'PA-S2-06: the runtime role is granted every column but the number');

select is(
  (select count(*)::int from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'guest_particulars'
      and grantee = 'ranza_app' and privilege_type = 'SELECT'
      and column_name in ('nationality', 'document_type', 'document_last_four')),
  3, 'PA-S2-06: and reads the nationality, the kind and the last four');

select is_empty(
  $$ select privilege_type from information_schema.table_privileges
      where table_schema = 'public' and table_name = 'guest_particulars'
        and grantee = 'ranza_app' $$,
  'PA-S2-06: and holds no privilege on the table as a whole');

select ok(
  (select proacl::text from pg_catalog.pg_proc
    where oid = 'app.reveal_guest_identity_document(uuid)'::regprocedure)
    !~ '(^|,)=X',
  'PA-S2-07: the reveal function is nobody''s to call but the runtime role''s');

select is_empty(
  $$ select 1 from pg_catalog.pg_proc
      where oid = to_regprocedure(
        'app.record_guest_particulars(uuid, date, text, smallint, text, text, text, text)') $$,
  'PA-S2-09: the eight-argument writer is gone, not left beside the new one');

-- ---------------------------------------------------------------------------
-- The write and the read, as the runtime role
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('f8222222-2222-4222-8222-222222222222');
select lives_ok(
  $$ select app.record_guest_particulars(
       'f8d00000-0000-4000-8000-000000000001', null, null, null,
       null, null, null, null, 'tr', 'passport', ' u1234567 ') $$,
  'PA-S2-08: a front desk records a nationality and a document');

select results_eq(
  $$ select nationality, document_type, document_last_four
       from public.guest_particulars
      where guest_id = 'f8d00000-0000-4000-8000-000000000001' $$,
  $$ values ('TR'::text, 'passport'::text, '4567'::text) $$,
  'PA-S2-08: a number is stored trimmed and upper case, and read back as its last four');

select throws_ok(
  $$ select document_number from public.guest_particulars $$,
  '42501', null, 'PA-S2-06: the number is not selectable by the runtime role');

select lives_ok(
  $$ select app.record_guest_particulars(
       'f8d00000-0000-4000-8000-000000000001', null, 'ODTÜ', null,
       null, null, null, null, null, null, null) $$,
  'PA-S2-09: a booking with no document records over nothing');

select results_eq(
  $$ select nationality, document_type, document_last_four, institution
       from public.guest_particulars
      where guest_id = 'f8d00000-0000-4000-8000-000000000001' $$,
  $$ values ('TR'::text, 'passport'::text, '4567'::text, 'ODTÜ'::text) $$,
  'PA-S2-09: a blank keeps the nationality and the document on file');

select lives_ok(
  $$ select app.record_guest_particulars(
       'f8d00000-0000-4000-8000-000000000001', null, null, null,
       null, null, null, null, null, 'tc_kimlik', '11111111110') $$,
  'PA-S2-09: a new number with its kind is recorded');

select results_eq(
  $$ select nationality, document_type, document_last_four
       from public.guest_particulars
      where guest_id = 'f8d00000-0000-4000-8000-000000000001' $$,
  $$ values ('TR'::text, 'tc_kimlik'::text, '1110'::text) $$,
  'PA-S2-09: and replaces the kind and the number together');

select throws_ok(
  $$ select app.record_guest_particulars(
       'f8d00000-0000-4000-8000-000000000001', null, null, null,
       null, null, null, null, null, 'passport', null) $$,
  '23514', null, 'PA-S2-04: a kind alone is refused by the writer, not kept as half a pair');

select is(
  (select held_document_number from app.reveal_guest_identity_document(
     'f8d00000-0000-4000-8000-000000000001')),
  '11111111110', 'PA-S2-07: a front desk reveals the number');

select is(
  (select held_document_type from app.reveal_guest_identity_document(
     'f8d00000-0000-4000-8000-000000000001')),
  'tc_kimlik', 'PA-S2-07: with its kind');

select is_empty(
  $$ select 1 from app.reveal_guest_identity_document(
       'f8d00000-0000-4000-8000-000000000003') $$,
  'PA-S2-07: a Guest with no document reveals nothing');

select app.set_request_context('f8111111-1111-4111-8111-111111111111');
select is(
  (select held_document_number from app.reveal_guest_identity_document(
     'f8d00000-0000-4000-8000-000000000001')),
  '11111111110', 'PA-S2-07: a manager reveals the number');

select app.set_request_context('f8333333-3333-4333-8333-333333333333');
select is_empty(
  $$ select 1 from app.reveal_guest_identity_document(
       'f8d00000-0000-4000-8000-000000000001') $$,
  'PA-S2-07: a housekeeper reveals nothing, though they read the Guest');

select app.set_request_context('f8555555-5555-4555-8555-555555555555');
select is_empty(
  $$ select 1 from app.reveal_guest_identity_document(
       'f8d00000-0000-4000-8000-000000000001') $$,
  'PA-S2-07: a role that may book and may not read reveals nothing');

select app.set_request_context('f8444444-4444-4444-8444-444444444444');
select is_empty(
  $$ select 1 from app.reveal_guest_identity_document(
       'f8d00000-0000-4000-8000-000000000001') $$,
  'PA-S2-07: a manager of another Organization reveals nothing');

set local role none;

select * from finish();
rollback;
