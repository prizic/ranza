-- A write grant is a column list (IG-01 … IG-11).
--
-- `grant insert on <table>` covers every column the table has AND every column
-- it ever gains. So a grant written once, years before a column, silently
-- widens the day somebody adds one — and the column somebody adds is exactly
-- the kind that should not have been writable: a status, a tombstone, a
-- provenance timestamp.
--
-- WHAT THIS SUITE ASSERTS IS THE REFUSAL, NOT THE GRANT. Checking that a grant
-- exists proves a `GRANT` statement ran. The thing worth knowing is that the
-- withheld column is actually refused, so every table below gets an INSERT that
-- names its withheld column and has to fail 42501. Each of those was watched
-- failing to fail before the migration existed.
--
-- Read the shape of the grant from pg_class.relacl, NOT from
-- information_schema.column_privileges: that view expands a table-level grant
-- into one row per column, so `grant insert on t` and
-- `grant insert (every, column) on t` are byte-identical in it. That is how
-- this defect survived six migrations and every audit run against the schema.
begin;
select plan(30);

-- ---------------------------------------------------------------------------
-- The shape of every write grant (IG-01)
-- ---------------------------------------------------------------------------

-- No allowed set, and that is deliberate. An earlier version of this carried
-- public.guests as a dated exception, on the grounds that another branch
-- narrows it anyway. That is the failure our own rules already name: a carve-out
-- that becomes unnecessary the day a branch merges stops being needed WITHOUT
-- anything going red, so nobody ever checks whether it became wrong instead.
-- guests is narrowed here (IG-15) and the exception is gone. An assertion with
-- no exceptions in it is a stronger instrument than one with a date on it.
select is_empty(
  $$select n.nspname || '.' || c.relname || ' ' || a.privilege_type
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) as a
     where c.relkind = 'r'
       and n.nspname in ('public', 'outbox')
       and a.grantee = 'ranza_app'::regrole
       and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'ranza_app holds no table-level write grant anywhere: a write names its columns');

-- ranza_auth is the credential role and the same rule reaches the two tables
-- that are ours rather than Better Auth's. auth_* is deliberately excluded and
-- IG-08 says why: Better Auth owns those columns, a list here is a list this
-- repository does not control, and the next upgrade would break sign-in.
select is_empty(
  $$select c.relname || ' ' || a.privilege_type
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) as a
     where c.relkind = 'r' and n.nspname = 'public'
       and c.relname in ('users', 'auth_identities')
       and a.grantee = 'ranza_auth'::regrole
       and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'nor does ranza_auth on the two tables ADR 0005 makes ours');

-- Proof this sweep is looking at something. A query that matches nothing passes
-- is_empty, and an empty catalogue would make both assertions above vacuous —
-- the RG-S2-32 failure, where a coverage query run as the wrong role quietly
-- returned nothing.
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'outbox')) >= 20,
  'and it swept a catalogue with tables in it');

-- ---------------------------------------------------------------------------
-- The eight column lists, exactly (IG-02 … IG-11 and IG-15)
-- ---------------------------------------------------------------------------

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='stays'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['organization_id','property_id','accommodation_unit_id','reservation_id',
        'stay_type','status','starts_on','ends_on'],
  'stays: the eight columns check-in writes');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='folio_lines'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['organization_id','property_id','folio_id','line_type','description',
        'amount_minor','reverses_line_id'],
  'folio_lines: six for a charge and the seventh for a reversal');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='folios'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['organization_id','property_id','stay_id','currency'],
  'folios: the four openFolioWithin names');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='reservations'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['organization_id','property_id','accommodation_unit_id','guest_id',
        'stay_type','status','starts_on','ends_on'],
  'reservations: the eight createReservation names');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='outbox' and table_name='events'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['id','organization_id','event_type','payload'],
  'outbox.events: the four publish() names, and none of the worker''s bookkeeping');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='guests'
       and grantee='ranza_app' and privilege_type='INSERT'$$,
  array['organization_id','full_name','email','phone'],
  'guests: the four identifyGuestWithin names');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='users'
       and grantee='ranza_auth' and privilege_type='INSERT'$$,
  array['email','status','created_at','updated_at'],
  'users: the four Prisma''s model API actually emits');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema='public' and table_name='auth_identities'
       and grantee='ranza_auth' and privilege_type='INSERT'$$,
  array['user_id','issuer','subject','created_at'],
  'auth_identities: the four the identity write emits');

-- ---------------------------------------------------------------------------
-- The withheld column is REFUSED — which is the whole point
-- ---------------------------------------------------------------------------

-- Fixture enough to make each statement well-formed. Every INSERT below is
-- refused for the column it names, not for a missing foreign key: the ids are
-- real, so a 23503 here would mean the assertion is passing for the wrong
-- reason.
insert into public.users (id, email) values
  ('c1111111-1111-4111-8111-111111111111', 'grants-probe@example.test');
insert into public.organizations (id, name, status) values
  ('ca111111-1111-4111-8111-111111111111', 'Grants Probe', 'active');
insert into public.properties (id, organization_id, name) values
  ('cb111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111', 'Probe Property');
insert into public.subscriptions (organization_id, status) values
  ('ca111111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('ca111111-1111-4111-8111-111111111111', 'front_office'),
  ('ca111111-1111-4111-8111-111111111111', 'billing_folios');
insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('cb111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111', 'front_desk', true),
  ('cb111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111', 'finance', true);
insert into public.organization_memberships (organization_id, user_id, role, access_scope) values
  ('ca111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'manager', 'organization_wide');
insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity) values
  ('cc111111-1111-4111-8111-111111111111', 'cb111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111', 'P-1', 'room', 2);
insert into public.guests (id, organization_id, full_name) values
  ('c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111', 'Probe Guest');
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on) values
  ('ce111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
   'cb111111-1111-4111-8111-111111111111', 'cc111111-1111-4111-8111-111111111111',
   'c9111111-1111-4111-8111-111111111111', 'guest', 'confirmed', current_date, current_date + 2);
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id, stay_type, status, starts_on, ends_on) values
  ('cf111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
   'cb111111-1111-4111-8111-111111111111', 'cc111111-1111-4111-8111-111111111111',
   'ce111111-1111-4111-8111-111111111111', 'guest', 'in_house', current_date, current_date + 2);
insert into public.folios (id, organization_id, property_id, stay_id, currency) values
  ('cd111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
   'cb111111-1111-4111-8111-111111111111', 'cf111111-1111-4111-8111-111111111111', 'TRY');

set local role ranza_app;
select app.set_request_context('c1111111-1111-4111-8111-111111111111');

-- stays.user_id — the sharpest of the eight. It is what gives somebody a Portal
-- (ADR 0009), app.resident_stay_property_ids() reads it to decide which
-- Property a Resident reaches, and NOTHING under packages/ writes it. A Stay
-- inserted naming an arbitrary user hands that person a Resident's reach.
select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, reservation_id,
       user_id, stay_type, status, starts_on, ends_on)
    values ('ca111111-1111-4111-8111-111111111111','cb111111-1111-4111-8111-111111111111',
            'cc111111-1111-4111-8111-111111111111','ce111111-1111-4111-8111-111111111111',
            'c1111111-1111-4111-8111-111111111111','guest','reserved',
            current_date + 10, current_date + 12)$$,
  '42501', NULL,
  'a Stay cannot be inserted naming a user_id, which would grant a Portal');

-- folio_lines.posted_at — the table is append-only, so an INSERT is permanent
-- and a caller-chosen date backdates money into a period already reported on.
select throws_ok(
  $$insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description,
       amount_minor, posted_at)
    values ('ca111111-1111-4111-8111-111111111111','cb111111-1111-4111-8111-111111111111',
            'cd111111-1111-4111-8111-111111111111','charge','Backdated',
            1000, now() - interval '400 days')$$,
  '42501', NULL,
  'a folio line cannot be inserted with a posted_at of its own choosing');

-- folios.status and closed_at — a Folio born closed satisfies
-- folios_closed_at_check and was never settled.
select throws_ok(
  $$insert into public.folios
      (organization_id, property_id, stay_id, currency, status, closed_at)
    values ('ca111111-1111-4111-8111-111111111111','cb111111-1111-4111-8111-111111111111',
            'cf111111-1111-4111-8111-111111111111','TRY','closed', now())$$,
  '42501', NULL,
  'a Folio cannot be born closed');

select throws_ok(
  $$insert into public.folios
      (organization_id, property_id, stay_id, currency, status)
    values ('ca111111-1111-4111-8111-111111111111','cb111111-1111-4111-8111-111111111111',
            'cf111111-1111-4111-8111-111111111111','TRY','closed')$$,
  '42501', NULL,
  'and cannot state its own status even without the timestamp');

-- outbox.events published_at and dead_at — an event born delivered is never
-- delivered, and the delivery record is the worker's to write.
select throws_ok(
  $$insert into outbox.events (id, organization_id, event_type, payload, published_at)
    values (gen_random_uuid(),'ca111111-1111-4111-8111-111111111111','probe','{}'::jsonb, now())$$,
  '42501', NULL,
  'an event cannot be published at the moment it is written');

select throws_ok(
  $$insert into outbox.events (id, organization_id, event_type, payload, dead_at)
    values (gen_random_uuid(),'ca111111-1111-4111-8111-111111111111','probe','{}'::jsonb, now())$$,
  '42501', NULL,
  'nor be born dead, which would mean it is never attempted');

select throws_ok(
  $$insert into outbox.events (id, organization_id, event_type, payload, available_at)
    values (gen_random_uuid(),'ca111111-1111-4111-8111-111111111111','probe','{}'::jsonb, now() + interval '10 years')$$,
  '42501', NULL,
  'nor defer its own delivery by ten years');

-- reservations: nothing dramatic was withheld, so the assertion is that the
-- provenance columns are refused. A Reservation that can restate when it was
-- taken can be made to look older than the one it double-books.
select throws_ok(
  $$insert into public.reservations
      (organization_id, property_id, accommodation_unit_id, guest_id,
       stay_type, status, starts_on, ends_on, created_at)
    values ('ca111111-1111-4111-8111-111111111111','cb111111-1111-4111-8111-111111111111',
            'cc111111-1111-4111-8111-111111111111','c9111111-1111-4111-8111-111111111111','guest','requested',
            current_date + 20, current_date + 22, now() - interval '1 year')$$,
  '42501', NULL,
  'a Reservation cannot restate when it was taken');

-- guests, the eighth table (IG-15). Withheld: id, created_at, updated_at. Its
-- UPDATE grant was already a column list — update(updated_at), so that a second
-- booking's no-op conflict update can return an existing row without editing a
-- profile — and INSERT was the door left open beside it.
select throws_ok(
  $$insert into public.guests (id, organization_id, full_name)
    values ('c8111111-1111-4111-8111-111111111111',
            'ca111111-1111-4111-8111-111111111111', 'Chosen Id')$$,
  '42501', NULL,
  'a Guest cannot be recorded with an id of the caller''s choosing');

select throws_ok(
  $$insert into public.guests (organization_id, full_name, created_at)
    values ('ca111111-1111-4111-8111-111111111111', 'Backdated', now() - interval '1 year')$$,
  '42501', NULL,
  'nor claim to have been on file for a year');

select throws_ok(
  $$insert into public.guests (organization_id, full_name, updated_at)
    values ('ca111111-1111-4111-8111-111111111111', 'Touched', now())$$,
  '42501', NULL,
  'nor state when it was last touched, which only the conflict update may move');

-- The control: the four columns a booking actually writes still work. Without
-- this the three refusals above are satisfied by a grant of nothing at all.
select lives_ok(
  $$insert into public.guests (organization_id, full_name, email, phone)
    values ('ca111111-1111-4111-8111-111111111111', 'Recorded Normally',
            'recorded@example.test', '+90 532 000 00 00')$$,
  'and taking a booking still records a Guest');

reset role;

-- The two model-API tables, as the role that writes them.
set local role ranza_auth;

select throws_ok(
  $$insert into public.users (id, email, status, created_at, updated_at)
    values ('c2222222-2222-4222-8222-222222222222','chosen-id@example.test','active',now(),now())$$,
  '42501', NULL,
  'a Ranza user cannot be inserted with an id of the caller''s choosing');

select throws_ok(
  $$insert into public.auth_identities (id, user_id, issuer, subject, created_at)
    values ('c3333333-3333-4333-8333-333333333333','c1111111-1111-4111-8111-111111111111',
            'ranza','probe-subject', now())$$,
  '42501', NULL,
  'nor an identity, whose id is the row other tables would point at');

-- And the four columns sign-up actually writes still work, so the narrowing
-- did not simply break it. This is the half that proves the list is right
-- rather than merely small.
select lives_ok(
  $$insert into public.users (email, status, created_at, updated_at)
    values ('sign-up-still-works@example.test','active',now(),now())$$,
  'and sign-up still writes the four columns Prisma emits');

reset role;

-- ---------------------------------------------------------------------------
-- A definer that writes checks its caller (IG-12)
-- ---------------------------------------------------------------------------

-- `worker_organization_id` joined this list when app.end_sessions_for() was
-- fixed. It is a caller check of the same kind and not a weakening: the worker
-- context is set only by app.set_worker_context(), which is executable by
-- ranza_worker and revoked from everybody else, so a function that consults it
-- is asking who is calling and refusing when the answer is nobody.
select is_empty(
  $$select p.proname::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.prosecdef
       and p.prosrc ~* '(insert|update|delete)\s'
       and p.prosrc !~* '(current_user_id|accessible_|can_use_capability|has_organization_permission|worker_organization_id)'$$,
  'every security definer function in app that writes also checks its caller');

-- The assertion above is no longer vacuous, and that is the whole reason the
-- two numbers below are pinned. It swept eleven functions and none of them
-- wrote when it was written; staff and permissions brought ten more, three of
-- which write. All three were made to check their caller —
-- app.identify_staff_user() in 20260916002700, app.end_sessions_for() and
-- app.accept_staff_invitation() in 20260916002800 — rather than added to an
-- exception list, so the assertion still reads zero.
--
-- A coverage assertion that quietly matches nothing is the RG-S2-32 failure,
-- so the inventory is pinned beside it. When either number changes, read the
-- assertion again rather than update it.
--
-- Rooms and beds (20260916002900) brought two more, app.unit_can_be_blocked()
-- and app.unit_is_in_service(). Both are definers for the reason
-- app.unit_is_sellable() is — they consult rows the caller's policies may hide
-- — and neither writes, so the count of writers below is unchanged and the
-- sweep above still reads zero.
--
-- Housekeeping (20260916003000) brought two more. app.housekeeping_status_holder_is_a_room()
-- is a definer so a Unit the caller cannot see is still recognised as a bed,
-- and it does not write. app.mark_unit_dirty_after_check_out() writes: it is
-- the whole of what ranza_worker may do to housekeeping_unit_status, and it
-- names app.worker_organization_id(), which is what IG-12 asks of a writer.
-- The inspection setting (20260916003200) brought two that do not write:
-- app.has_organization_wide_reach(), so a policy can read the caller's
-- membership, and app.housekeeping_inspection_required(), so readiness never
-- reads an invisible setting as "off".
--
-- Maintenance (20260916004400) brought one, and it writes:
-- app.mark_unit_returned_to_service() is the whole of what ranza_worker may do
-- when a room comes back into service, and it names
-- app.worker_organization_id(). The request, hold and setting triggers are
-- invokers — they read only what the acting Staff Member already reaches — and
-- app.unit_is_in_service() was replaced, not added.
--
-- The service plan (20260916004600) brought one more, and it writes:
-- app.maintenance_service_is_recorded() sets an item's last service when its
-- work order is done, because finishing a work order is maintenance.manage and
-- the register is maintenance.equipment. It names
-- app.has_organization_permission() for the first of those before it writes.
-- The audit log's reach (20260916004200) brought five: the four the
-- audit.records read policy consults about its caller — which Properties,
-- which Organizations wholly, which with audit.read, and whether a location
-- belongs to a scope — and app.audit_location_names(), which names an archived
-- Property the ordinary policy hides. All five ask only about the caller and
-- none writes.
-- One guest in one Unit (20260916003700) brought one more,
-- app.unit_holds_one_occupancy(). A definer for the same reason again: whether
-- a Unit is free is not a question the actor's policies may shrink, or a room
-- reads empty because the viewer cannot see who is in it. It writes nothing.
-- The migration after it brought app.stay_and_reservation_agree(), which must
-- see a Reservation's every Stay to say whether they agree. It writes nothing
-- either. Then app.front_desk_closes_only_a_settled_folio(), which reads a
-- Folio's lines the front desk cannot see, to refuse closing one with money on
-- it; nothing written.
-- Maintenance and the front desk arrived on separate branches; the counts
-- below are the union of both.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef),
  37,
  'the definer sweep looked at 37 functions; change this number deliberately');

-- The pattern wants whitespace after the verb, so a trigger comparing
-- tg_op = 'UPDATE' does not count as writing — app.unit_holds_one_occupancy
-- does exactly that and writes nothing. Reformatting such a comparison so that
-- a space follows the verb would turn this red for a function that is innocent;
-- read it before changing the number.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef and p.prosrc ~* '(insert|update|delete)\s'),
  6,
  'six of them write, which is what makes the assertion above a test');

-- Part B: the inventory itself, so a thirty-eighth definer is a red test
-- rather than a silent addition. The first eleven are the ones IG-12 gives a
-- reason for; the ten after are staff and permissions; two are rooms and beds;
-- four are housekeeping; two are maintenance; five are the audit log's reach;
-- and the last three are the front desk's. The six that write are named in the
-- comments above.
select set_eq(
  $$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.prosecdef$$,
  array['accessible_organization_ids','accessible_property_ids',
        'can_use_capability','can_use_capability_in_organization',
        'capability_is_available','property_today','resident_can_use_capability',
        'resident_stay_accommodation_unit_ids','resident_stay_property_ids',
        'unit_has_no_current_occupant','unit_is_sellable',
        'accept_staff_invitation','end_sessions_for','has_organization_permission',
        'identify_staff_user','membership_role_is_active',
        'organization_keeps_an_administrator','organization_permissions',
        'role_change_keeps_an_administrator','role_is_not_held',
        'role_permissions_are_in_the_catalogue',
        'unit_can_be_blocked','unit_is_in_service',
        'housekeeping_status_holder_is_a_room','mark_unit_dirty_after_check_out',
        'has_organization_wide_reach','housekeeping_inspection_required',
        'mark_unit_returned_to_service', 'maintenance_service_is_recorded',
        'audit_reachable_locations','audit_whole_organization_ids',
        'audit_reader_organization_ids','audit_location_is_in_scope',
        'audit_location_names',
        'unit_holds_one_occupancy','stay_and_reservation_agree',
        'front_desk_closes_only_a_settled_folio'],
  'and they are exactly the thirty-seven the design gives a reason for');

select finish();
rollback;
