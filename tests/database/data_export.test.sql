-- An export is a record with a requester and a state (EXP-S1-*, ADR 0043).
--
-- What is asserted is the refusal in each place the record could be forged or a
-- file could leak, read from the catalogue wherever a function that raises on a
-- missing object would take the rest of the suite with it:
--
--   - who may ask, for which datasets, and what the request may say;
--   - that the runtime role cannot set a status, put a file anywhere, or read
--     one with SELECT;
--   - that the state machine refuses every arrow it does not draw, for the owner
--     too;
--   - that the worker holds no table privilege at all and reaches an export
--     through twelve functions only it may execute;
--   - that each reader returns exactly what its requester could read in the
--     workspace NOW, compared against the workspace's own policies rather than
--     against a list typed here, and refuses one who has lost the permission;
--   - that a download asks the downloader again.
--
-- Checked by breaking each thing in turn, proof printed first: the insert
-- grant widened to status, the select grant widened to file_content, the
-- requester's role permission test (EXP-S1-24), the reach filter, the
-- commercial gate, the audit.read mapping, the state trigger, the expiry test
-- in the download, the downloader's permission test — each red on the
-- assertion named for it.
begin;
select plan(110);

-- ---------------------------------------------------------------------------
-- The world
-- ---------------------------------------------------------------------------

insert into public.users (id, email) values
  ('ec100000-0000-4000-8000-000000000001', 'export-owner@example.test'),
  ('ec100000-0000-4000-8000-000000000002', 'export-one@example.test'),
  ('ec100000-0000-4000-8000-000000000003', 'export-auditor@example.test'),
  ('ec100000-0000-4000-8000-000000000004', 'export-reader@example.test'),
  ('ec100000-0000-4000-8000-000000000005', 'export-createonly@example.test'),
  ('ec100000-0000-4000-8000-000000000006', 'export-otherorg@example.test'),
  ('ec100000-0000-4000-8000-000000000007', 'export-assigned@example.test'),
  ('ec100000-0000-4000-8000-000000000008', 'export-wide@example.test'),
  ('ec100000-0000-4000-8000-000000000009', 'export-gone@example.test');

insert into public.organizations (id, name, status) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'Export Organization', 'active'),
  ('ec0b0000-0000-4000-8000-00000000000b', 'Export Other Organization', 'active');

insert into public.subscriptions (organization_id, status) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'active'),
  ('ec0b0000-0000-4000-8000-00000000000b', 'active');

insert into public.entitlements (organization_id, module_key) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'front_office'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'billing_folios'),
  ('ec0b0000-0000-4000-8000-00000000000b', 'front_office');

-- P1: front desk and finance on. P2: finance on, front desk off. P3: archived.
-- The commercial gate is per Property, so each dataset has one it must leave out.
insert into public.properties (id, organization_id, name, status) values
  ('ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'Export P1', 'active'),
  ('ec200000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'Export P2', 'active'),
  ('ec200000-0000-4000-8000-000000000003', 'ec0a0000-0000-4000-8000-00000000000a', 'Export P3', 'archived'),
  ('ec200000-0000-4000-8000-0000000000b1', 'ec0b0000-0000-4000-8000-00000000000b', 'Export Other P', 'active');

insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'front_desk', true),
  ('ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'finance', true),
  ('ec200000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'front_desk', false),
  ('ec200000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'finance', true),
  ('ec200000-0000-4000-8000-0000000000b1', 'ec0b0000-0000-4000-8000-00000000000b', 'front_desk', true);

insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'exporter_one', 'ec0a0000-0000-4000-8000-00000000000a', 'Exporter one',
   array['data_export.create', 'data_export.read', 'front_desk.check_in', 'finance.manage_folio']),
  ('ec0a0000-0000-4000-8000-00000000000a', 'auditor_exporter', 'ec0a0000-0000-4000-8000-00000000000a', 'Auditor exporter',
   array['data_export.create', 'audit.read']),
  ('ec0a0000-0000-4000-8000-00000000000a', 'reader_only', 'ec0a0000-0000-4000-8000-00000000000a', 'Reader only',
   array['data_export.read']),
  ('ec0a0000-0000-4000-8000-00000000000a', 'create_only', 'ec0a0000-0000-4000-8000-00000000000a', 'Create only',
   array['data_export.create', 'front_desk.book']),
  ('ec0a0000-0000-4000-8000-00000000000a', 'assigned_exporter', 'ec0a0000-0000-4000-8000-00000000000a', 'Assigned exporter',
   array['data_export.create', 'data_export.read', 'front_desk.book', 'audit.read', 'finance.manage_folio']),
  ('ec0a0000-0000-4000-8000-00000000000a', 'wide_reader', 'ec0a0000-0000-4000-8000-00000000000a', 'Wide reader',
   array['data_export.read', 'front_desk.book']);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope, status) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001', 'owner',
   '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002', 'exporter_one',
   'ec0a0000-0000-4000-8000-00000000000a', 'assigned_properties', 'active'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000003', 'auditor_exporter',
   'ec0a0000-0000-4000-8000-00000000000a', 'organization_wide', 'active'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000004', 'reader_only',
   'ec0a0000-0000-4000-8000-00000000000a', 'organization_wide', 'active'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000005', 'create_only',
   'ec0a0000-0000-4000-8000-00000000000a', 'organization_wide', 'active'),
  ('ec0b0000-0000-4000-8000-00000000000b', 'ec100000-0000-4000-8000-000000000006', 'owner',
   '00000000-0000-0000-0000-000000000000', 'organization_wide', 'active'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000007', 'assigned_exporter',
   'ec0a0000-0000-4000-8000-00000000000a', 'assigned_properties', 'active'),
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000008', 'wide_reader',
   'ec0a0000-0000-4000-8000-00000000000a', 'organization_wide', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope, status, revoked_at) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000009', 'exporter_one',
   'ec0a0000-0000-4000-8000-00000000000a', 'organization_wide', 'revoked', now());

-- exporter_one reaches P1 only; assigned_exporter reaches P2 only.
insert into public.property_assignments (property_id, organization_id, user_id) values
  ('ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002'),
  ('ec200000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000007');

insert into public.guests (id, organization_id, full_name, email) values
  ('ec400000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'Export Guest One', 'one@example.test'),
  ('ec400000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'Export Guest Two', null),
  ('ec400000-0000-4000-8000-0000000000b3', 'ec0b0000-0000-4000-8000-00000000000b', 'Other Organization Guest', null);

-- UN1 and UN3 are P1's; UN2 and UN4 are P2's.
insert into public.accommodation_units (id, property_id, organization_id, name, unit_type, capacity) values
  ('ec300000-0000-4000-8000-000000000001', 'ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'EXP-101', 'room', 2),
  ('ec300000-0000-4000-8000-000000000003', 'ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'EXP-103', 'room', 2),
  ('ec300000-0000-4000-8000-000000000002', 'ec200000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'EXP-201', 'room', 2),
  ('ec300000-0000-4000-8000-000000000004', 'ec200000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'EXP-203', 'room', 2);

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type, status, starts_on, ends_on)
select r.id, 'ec0a0000-0000-4000-8000-00000000000a', r.property_id, r.unit_id, r.guest_id,
       'guest', 'confirmed', today + 5, today + 7
from (select app.property_today('ec200000-0000-4000-8000-000000000001') as today) as clock,
     (values
       ('ec600000-0000-4000-8000-000000000001'::uuid, 'ec200000-0000-4000-8000-000000000001'::uuid,
        'ec300000-0000-4000-8000-000000000003'::uuid, 'ec400000-0000-4000-8000-000000000001'::uuid),
       ('ec600000-0000-4000-8000-000000000002'::uuid, 'ec200000-0000-4000-8000-000000000002'::uuid,
        'ec300000-0000-4000-8000-000000000004'::uuid, 'ec400000-0000-4000-8000-000000000002'::uuid)
     ) as r(id, property_id, unit_id, guest_id);

-- A walk-in at each of P1 and P2 (a Stay with no booking), each with a Folio.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id, stay_type, status, starts_on, ends_on)
select s.id, 'ec0a0000-0000-4000-8000-00000000000a', s.property_id, s.unit_id, null,
       'guest', 'in_house', app.property_today(s.property_id), app.property_today(s.property_id) + 2
from (values
       ('ec700000-0000-4000-8000-000000000001'::uuid, 'ec200000-0000-4000-8000-000000000001'::uuid,
        'ec300000-0000-4000-8000-000000000001'::uuid),
       ('ec700000-0000-4000-8000-000000000002'::uuid, 'ec200000-0000-4000-8000-000000000002'::uuid,
        'ec300000-0000-4000-8000-000000000002'::uuid)
     ) as s(id, property_id, unit_id);

insert into public.folios (id, organization_id, property_id, stay_id, currency) values
  ('ec800000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000001', 'ec700000-0000-4000-8000-000000000001', 'TRY'),
  ('ec800000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000002', 'ec700000-0000-4000-8000-000000000002', 'TRY');

insert into public.folio_lines (id, organization_id, property_id, folio_id, line_type, description, amount_minor) values
  ('ec900000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000001', 'ec800000-0000-4000-8000-000000000001', 'charge', 'Room', 10000),
  ('ec900000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000002', 'ec800000-0000-4000-8000-000000000002', 'charge', 'Room', 5000);

-- One record per place an audit record can be: P1, P2, the whole Organization,
-- and an archived Property. Written by their actors; the append-only trigger
-- fires for updates and deletes only.
insert into audit.records (id, organization_id, location_id, actor_id, action, subject_type, subject_id) values
  ('eca00000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000001', 'ec100000-0000-4000-8000-000000000002',
   'reservation.created', 'reservation', 'ec600000-0000-4000-8000-000000000001'),
  ('eca00000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000002', 'ec100000-0000-4000-8000-000000000001',
   'reservation.created', 'reservation', 'ec600000-0000-4000-8000-000000000002'),
  ('eca00000-0000-4000-8000-000000000003', 'ec0a0000-0000-4000-8000-00000000000a',
   null, 'ec100000-0000-4000-8000-000000000001',
   'staff.invited', 'membership', 'ec100000-0000-4000-8000-000000000002'),
  ('eca00000-0000-4000-8000-000000000004', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec200000-0000-4000-8000-000000000003', 'ec100000-0000-4000-8000-000000000001',
   'unit.added', 'accommodation_unit', 'ec300000-0000-4000-8000-000000000001');

-- Exports, requested as the owner of the database would insert them, so that
-- what the worker does with each is the thing under test and not the request
-- policy (which is under test further down). All pending.
--   E1  exporter_one (P1 only): everything but the audit log
--   E2  the auditor: the audit log
--   E3  exporter_one asks for the audit log, which their role does not hold
--   E4  the owner: everything
--   E5  somebody whose membership has been revoked
--   E6  never claimed
insert into public.data_exports (id, organization_id, requester_id, requester_name, resource_types, format) values
  ('ece00000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002',
   'Exporter One', array['residents_guests', 'reservations_stays', 'rooms_beds', 'folios_payments'], 'csv'),
  ('ece00000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000003',
   'Auditor', array['audit_log'], 'json'),
  ('ece00000-0000-4000-8000-000000000003', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002',
   'Exporter One', array['audit_log'], 'csv'),
  ('ece00000-0000-4000-8000-000000000004', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
   'Owner', array['residents_guests', 'reservations_stays', 'rooms_beds', 'folios_payments', 'audit_log'], 'json'),
  ('ece00000-0000-4000-8000-000000000005', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000009',
   'Gone', array['rooms_beds'], 'csv'),
  ('ece00000-0000-4000-8000-000000000006', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
   'Owner', array['rooms_beds'], 'csv');

-- ---------------------------------------------------------------------------
-- The catalogue: what is granted, to whom, and what the mapping names
-- ---------------------------------------------------------------------------

select set_eq(
  $$select p.proname::text || ' ' || a.grantee::regrole::text
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) as a
     where n.nspname = 'app'
       and p.proname in ('claim_data_export', 'export_guests', 'export_reservations',
                         'export_units', 'export_folio_lines', 'export_audit_records',
                         'complete_data_export', 'fail_data_export', 'expire_data_export',
                         'run_export_schedule', 'stalled_data_exports', 'expired_data_exports',
                         'pending_data_exports', 'export_schedules_due')
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner$$,
  array['claim_data_export ranza_worker', 'export_guests ranza_worker',
        'export_reservations ranza_worker', 'export_units ranza_worker',
        'export_folio_lines ranza_worker', 'export_audit_records ranza_worker',
        'complete_data_export ranza_worker', 'fail_data_export ranza_worker',
        'expire_data_export ranza_worker', 'run_export_schedule ranza_worker',
        'stalled_data_exports ranza_worker', 'expired_data_exports ranza_worker',
        'pending_data_exports ranza_worker', 'export_schedules_due ranza_worker'],
  'EXP-S1-19: only the worker may execute the functions that produce an export, and nobody else');

select set_eq(
  $$select a.grantee::regrole::text
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) as a
     where n.nspname = 'app' and p.proname = 'read_data_export_file'
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner$$,
  array['ranza_app'],
  'EXP-S1-19: the runtime role alone may ask for a file, through the one function that asks who is asking');

select is_empty(
  $$select p.proname::text || ' ' || a.grantee::text
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) as a
     where n.nspname = 'app'
       and p.proname in ('data_export_in_progress', 'export_requester_may',
                         'export_requester_properties', 'export_requester_is_organization_wide',
                         'data_export_requires')
       and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner$$,
  'EXP-S1-19: the helpers the readers are built from are executable by their owner alone');

select is_empty(
  $$select table_schema || '.' || table_name || ' ' || privilege_type
      from information_schema.table_privileges
     where grantee = 'ranza_worker'
       and ((table_schema = 'public' and table_name in
              ('data_exports', 'export_schedules', 'guests', 'reservations', 'stays',
               'accommodation_units', 'folios', 'folio_lines'))
            or table_schema = 'audit')
    union all
    select table_schema || '.' || table_name || ' ' || privilege_type || ' ' || column_name
      from information_schema.column_privileges
     where grantee = 'ranza_worker'
       and ((table_schema = 'public' and table_name in
              ('data_exports', 'export_schedules', 'guests', 'reservations', 'stays',
               'accommodation_units', 'folios', 'folio_lines'))
            or table_schema = 'audit')$$,
  'EXP-S1-18: the worker holds nothing on exports, schedules or the tables an export reads, not even a column');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'data_exports'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'$$,
  array['organization_id', 'requester_id', 'requester_name', 'resource_types', 'format'],
  'EXP-S1-06: a request may say who, which datasets and which format, and nothing else');

select is_empty(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'data_exports'
       and grantee = 'ranza_app' and privilege_type in ('UPDATE', 'DELETE')$$,
  'EXP-S1-07: the runtime role holds no update or delete on an export, not a column');

select ok(
  not exists (select 1 from information_schema.column_privileges
               where table_schema = 'public' and table_name = 'data_exports'
                 and grantee = 'ranza_app' and privilege_type = 'SELECT'
                 and column_name = 'file_content')
  and exists (select 1 from information_schema.column_privileges
               where table_schema = 'public' and table_name = 'data_exports'
                 and grantee = 'ranza_app' and privilege_type = 'SELECT'
                 and column_name = 'status'),
  'EXP-S1-12: the runtime role selects every column of an export but its file');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'export_schedules'
       and grantee = 'ranza_app' and privilege_type = 'UPDATE'$$,
  array['status', 'updated_at'],
  'EXP-S1-34: a schedule is paused and resumed from the workspace and not otherwise edited');

select is_empty(
  $$select p from (
      select unnest(app.data_export_resource_permissions(resource)) as p
        from unnest(array['residents_guests', 'reservations_stays', 'rooms_beds',
                          'folios_payments', 'audit_log']) as resource) as named
     where not exists (select 1 from public.staff_permissions as known where known.key = named.p)$$,
  'EXP-S1-35: every permission the mapping names is in the catalogue');

select is_empty(
  $$select key from public.staff_permissions
     where key like 'front\_desk.%'
       and key <> all (app.data_export_resource_permissions('residents_guests'))$$,
  'EXP-S1-35: and every front-desk permission the catalogue has opens the guest datasets, so a new one is decided here');

select is(
  app.data_export_resource_permissions('not_a_dataset'),
  null,
  'EXP-S1-35: a name that is no dataset maps to nothing, which no caller treats as permitted');

-- ---------------------------------------------------------------------------
-- Asking for an export (ranza_app)
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('ec100000-0000-4000-8000-000000000002');

select lives_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a',
              'ec100000-0000-4000-8000-000000000002', 'exporter-one@hotel.example',
              array['residents_guests', 'rooms_beds'], 'json')$$,
  'EXP-S1-01: a Staff Member holding data_export.create asks for the datasets their role can export');

select results_eq(
  $$select status, trigger_type, requester_name, schedule_id is null, file_name is null, error is null
      from public.data_exports where requester_name = 'exporter-one@***'$$,
  $$values ('pending', 'on_demand', 'exporter-one@***', true, true, true)$$,
  'EXP-S1-09: the request is pending and on demand, and an address given as the name is cut to its local part');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002',
              'Exporter One', array['audit_log'], 'csv')$$,
  '42501', null,
  'EXP-S1-03: a request for a dataset the role cannot export is refused when it is made, not later in a queue');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
              'Exporter One', array['rooms_beds'], 'csv')$$,
  '42501', null,
  'EXP-S1-04: nobody asks in another Staff Member''s name');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0b0000-0000-4000-8000-00000000000b', 'ec100000-0000-4000-8000-000000000002',
              'Exporter One', array['rooms_beds'], 'csv')$$,
  '42501', null,
  'EXP-S1-05: nor in an Organization they do not belong to');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format, status)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002',
              'Exporter One', array['rooms_beds'], 'csv', 'ready')$$,
  '42501', null,
  'EXP-S1-06: a request cannot say it is ready');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format, file_content)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002',
              'Exporter One', array['rooms_beds'], 'csv', 'a,b')$$,
  '42501', null,
  'EXP-S1-06: nor bring a file');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format, trigger_type)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000002',
              'Exporter One', array['rooms_beds'], 'csv', 'scheduled')$$,
  '42501', null,
  'EXP-S1-06: nor call itself scheduled');

select throws_ok(
  $$update public.data_exports set status = 'ready' where requester_name = 'exporter-one@***'$$,
  '42501', null,
  'EXP-S1-07: and nobody changes an export from the workspace');

select throws_ok(
  $$select file_content from public.data_exports where requester_name = 'exporter-one@***'$$,
  '42501', null,
  'EXP-S1-12: the file is not selectable, by anyone, whatever policy admits the row');

select throws_ok(
  $$delete from public.data_exports where requester_name = 'exporter-one@***'$$,
  '42501', null,
  'EXP-S1-17: an export is never deleted');

-- A role that cannot ask, or can ask for less.
select app.set_request_context('ec100000-0000-4000-8000-000000000004');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000004',
              'Reader', array['rooms_beds'], 'csv')$$,
  '42501', null,
  'EXP-S1-02: a Staff Member who may read exports but not create one is refused');

select app.set_request_context('ec100000-0000-4000-8000-000000000005');

select lives_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a',
              'ec100000-0000-4000-8000-000000000005', 'Create Only', array['reservations_stays'], 'csv')$$,
  'EXP-S1-11: a role with data_export.create alone can ask, and read back what it asked');

select results_eq(
  $$select count(*)::int from public.data_exports$$,
  $$values (1)$$,
  'EXP-S1-11: and sees that request and no other');

-- Reading
select app.set_request_context('ec100000-0000-4000-8000-000000000004');

select results_eq(
  $$select count(*)::int from public.data_exports where organization_id = 'ec0a0000-0000-4000-8000-00000000000a'$$,
  $$values (8)$$,
  'EXP-S1-10: a Staff Member holding data_export.read sees the Organization''s exports');

select app.set_request_context('ec100000-0000-4000-8000-000000000003');

select results_eq(
  $$select count(*)::int from public.data_exports where organization_id = 'ec0a0000-0000-4000-8000-00000000000a'$$,
  $$values (1)$$,
  'EXP-S1-11: one holding data_export.create alone sees what they asked for and nothing of anybody else''s');

select app.set_request_context('ec100000-0000-4000-8000-000000000006');

select results_eq(
  $$select count(*)::int from public.data_exports where organization_id = 'ec0a0000-0000-4000-8000-00000000000a'$$,
  $$values (0)$$,
  'EXP-S1-10: another Organization''s Staff Member sees none of them');

-- ---------------------------------------------------------------------------
-- What a row may hold, and where it may go (the owner is held to it too)
-- ---------------------------------------------------------------------------

set local role none;

select throws_ok(
  $$update public.data_exports set status = 'ready', file_name = 'x.csv', file_content = 'a',
           file_size_bytes = 1, expires_at = now() + interval '1 day', completed_at = now()
     where id = 'ece00000-0000-4000-8000-000000000006'$$,
  '23514', null,
  'EXP-S1-14: pending does not go straight to ready, for anyone');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format, status)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
              'Owner', array['rooms_beds'], 'csv', 'processing')$$,
  '23514', null,
  'EXP-S1-14: and an export is born pending');

select throws_ok(
  $$update public.data_exports set requester_id = 'ec100000-0000-4000-8000-000000000002', status = 'processing'
     where id = 'ece00000-0000-4000-8000-000000000006'$$,
  '23514', null,
  'EXP-S1-15: who asked is never rewritten');

select throws_ok(
  $$update public.data_exports set resource_types = array['audit_log'], status = 'processing'
     where id = 'ece00000-0000-4000-8000-000000000006'$$,
  '23514', null,
  'EXP-S1-15: nor what was asked for');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
              'Owner', array['rooms_beds'], 'excel')$$,
  '23514', null,
  'EXP-S1-08: excel is not a format, because nothing writes one');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
              'Owner', array['rooms_beds', 'payroll'], 'csv')$$,
  '23514', null,
  'EXP-S1-08: nor a dataset that does not exist');

select throws_ok(
  $$insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
      values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
              'Owner', array[]::text[], 'csv')$$,
  '23514', null,
  'EXP-S1-08: nor an export of nothing');

insert into public.data_exports (organization_id, requester_id, requester_name, resource_types, format)
values ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-000000000001',
        E'  Owner\tName  ', array['rooms_beds'], 'csv');

select results_eq(
  $$select count(*)::int from public.data_exports where requester_name = 'OwnerName'$$,
  $$values (1)$$,
  'EXP-S1-09: control characters in a name are stripped on the way in');

-- ---------------------------------------------------------------------------
-- The worker: nothing before a context, nothing outside it
-- ---------------------------------------------------------------------------

set local role ranza_worker;

select throws_ok(
  $$select * from app.claim_data_export('ece00000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'EXP-S1-21: an export is claimed only inside a worker context');

select app.set_worker_context('ec0b0000-0000-4000-8000-00000000000b', 'data_export.test');

select is_empty(
  $$select * from app.claim_data_export('ece00000-0000-4000-8000-000000000001')$$,
  'EXP-S1-21: and only in its own Organization: another Organization''s claim finds nothing');

select app.set_worker_context('ec0a0000-0000-4000-8000-00000000000a', 'data_export.test');

select results_eq(
  $$select count(*)::int from app.pending_data_exports() where export_id::text like 'ece00000-%'$$,
  $$values (6)$$,
  'EXP-S1-36: the queue holds the Organization''s pending exports');

select throws_ok(
  $$select * from app.export_guests('ece00000-0000-4000-8000-000000000006')$$,
  '42501', 'that export is not being processed here',
  'EXP-S1-22: a reader refuses an export nobody claimed');

select results_eq(
  $$select format from app.claim_data_export('ece00000-0000-4000-8000-000000000001')$$,
  $$values ('csv')$$,
  'EXP-S1-20: claiming moves a pending export to processing and says its format');

select is_empty(
  $$select * from app.claim_data_export('ece00000-0000-4000-8000-000000000001')$$,
  'EXP-S1-20: and a second claim finds it taken');

select ok(
  not exists (select 1 from app.pending_data_exports() where export_id = 'ece00000-0000-4000-8000-000000000001'),
  'EXP-S1-36: a claimed export leaves the queue at once, so a stuck one cannot hold the front of it');

select app.set_worker_context('ec0b0000-0000-4000-8000-00000000000b', 'data_export.test');

select throws_ok(
  $$select * from app.export_guests('ece00000-0000-4000-8000-000000000001')$$,
  '42501', 'that export is not being processed here',
  'EXP-S1-22: a reader answers for the worker''s own Organization''s exports only');

select app.set_worker_context('ec0a0000-0000-4000-8000-00000000000a', 'data_export.test');

select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000002')),
  1, 'EXP-S1-20: the auditor''s export is claimed');
select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000003')),
  1, 'EXP-S1-20: so is the one asking for what the role does not hold');
select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000004')),
  1, 'EXP-S1-20: the owner''s');
select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000005')),
  1, 'EXP-S1-20: and the revoked member''s');

-- ---------------------------------------------------------------------------
-- What each reader returns: what the requester could read in the workspace
-- ---------------------------------------------------------------------------

-- The workspace's own answer, taken as the requester under row-level security
-- and the commercial gate the screens put around it; the worker's answer is
-- taken under the worker. Two sets in two roles, so each goes through a
-- temporary table both can read.
create temp table seen_by_worker as
  select 'guest' as dataset, id::text as key from app.export_guests('ece00000-0000-4000-8000-000000000001')
  union all
  select 'reservation', reservation_id::text from app.export_reservations('ece00000-0000-4000-8000-000000000001')
   where reservation_id is not null
  union all
  select 'stay', stay_id::text from app.export_reservations('ece00000-0000-4000-8000-000000000001')
   where stay_id is not null
  union all
  select 'unit', id::text from app.export_units('ece00000-0000-4000-8000-000000000001')
  union all
  select 'folio_line', line_id::text from app.export_folio_lines('ece00000-0000-4000-8000-000000000001')
   where line_id is not null;
grant select on seen_by_worker to public;

set local role ranza_app;
select app.set_request_context('ec100000-0000-4000-8000-000000000002');

create temp table seen_by_requester as
  select 'guest' as dataset, guest.id::text as key from public.guests as guest
   where exists (select 1 from app.accessible_property_ids() as reached(id)
                  where app.capability_is_available(reached.id, 'front_office', 'front_desk'))
  union all
  select 'reservation', reservation.id::text from public.reservations as reservation
   where app.capability_is_available(reservation.property_id, 'front_office', 'front_desk')
  union all
  select 'stay', stay.id::text from public.stays as stay
   where app.capability_is_available(stay.property_id, 'front_office', 'front_desk')
  union all
  select 'unit', unit.id::text from public.accommodation_units as unit
   where app.capability_is_available(unit.property_id, 'front_office', 'front_desk')
  union all
  select 'folio_line', line.id::text from public.folio_lines as line
   where app.capability_is_available(line.property_id, 'billing_folios', 'finance');
grant select on seen_by_requester to public;

select set_eq(
  $$select dataset, key from seen_by_worker$$,
  $$select dataset, key from seen_by_requester$$,
  'EXP-S1-23: the worker''s rows for a requester are exactly the rows that requester reads in the workspace');

select ok(
  (select count(*) from seen_by_requester where dataset = 'guest') > 0
  and (select count(*) from seen_by_requester where dataset = 'reservation') > 0
  and (select count(*) from seen_by_requester where dataset = 'stay') > 0
  and (select count(*) from seen_by_requester where dataset = 'unit') > 0
  and (select count(*) from seen_by_requester where dataset = 'folio_line') > 0,
  'EXP-S1-23: and that comparison compared something in every dataset');

-- Gone, in every dataset: P2 is out of this requester's reach, and has its front
-- desk off besides.
select ok(
  not exists (select 1 from seen_by_worker
               where key in ('ec600000-0000-4000-8000-000000000002', 'ec700000-0000-4000-8000-000000000002',
                             'ec300000-0000-4000-8000-000000000002', 'ec300000-0000-4000-8000-000000000004',
                             'ec900000-0000-4000-8000-000000000002')),
  'EXP-S1-24: a requester who does not reach a Property gets none of its reservations, stays, rooms or folio lines');

select ok(
  not exists (select 1 from seen_by_worker where dataset = 'guest' and key = 'ec400000-0000-4000-8000-0000000000b3'),
  'EXP-S1-24: nor another Organization''s guests');

set local role ranza_worker;

select results_eq(
  $$select count(*)::int from app.export_reservations('ece00000-0000-4000-8000-000000000001')
     where reservation_id is null and stay_id = 'ec700000-0000-4000-8000-000000000001'$$,
  $$values (1)$$,
  'EXP-S1-23: a Stay that began without a booking is in the file, with the booking columns empty');

-- The commercial gate on its own, with reach not in the way: the owner reaches
-- P2, whose front desk is off.
select ok(
  not exists (select 1 from app.export_reservations('ece00000-0000-4000-8000-000000000004')
               where property_id = 'ec200000-0000-4000-8000-000000000002')
  and not exists (select 1 from app.export_units('ece00000-0000-4000-8000-000000000004')
                   where property_id = 'ec200000-0000-4000-8000-000000000002')
  and exists (select 1 from app.export_folio_lines('ece00000-0000-4000-8000-000000000004')
               where property_id = 'ec200000-0000-4000-8000-000000000002'),
  'EXP-S1-28: where a Property has the front desk off its bookings and rooms are not exported, and its folios, which are on, are');

select results_eq(
  $$select count(*)::int from app.export_guests('ece00000-0000-4000-8000-000000000004')
     where id = 'ec400000-0000-4000-8000-0000000000b3'$$,
  $$values (0)$$,
  'EXP-S1-24: an Organization-wide owner still gets only their own Organization''s guests');

-- Audit: ADR 0031's reach, compared with the log itself.
select throws_ok(
  $$select * from app.export_audit_records('ece00000-0000-4000-8000-000000000003')$$,
  '42501', 'export_refused:requester_not_permitted',
  'EXP-S1-25: a requester without audit.read is refused the audit log, and given no row of it');

select set_eq(
  $$select id::text from app.export_audit_records('ece00000-0000-4000-8000-000000000002')$$,
  $$values ('eca00000-0000-4000-8000-000000000001'), ('eca00000-0000-4000-8000-000000000002'),
           ('eca00000-0000-4000-8000-000000000003'), ('eca00000-0000-4000-8000-000000000004')$$,
  'EXP-S1-26: an Organization-wide reader of the log exports all of it, an archived Property''s records included');

set local role none;

-- The reader and the log agree for somebody whose reach is one Property: give
-- the auditor's permission to the P1-only member and compare with what the log
-- screen's own policy shows them.
insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'p1_auditor', 'ec0a0000-0000-4000-8000-00000000000a', 'P1 auditor',
   array['data_export.create', 'audit.read']);
insert into public.users (id, email) values
  ('ec100000-0000-4000-8000-00000000000a', 'export-p1auditor@example.test');
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-00000000000a', 'p1_auditor',
   'ec0a0000-0000-4000-8000-00000000000a', 'assigned_properties');
insert into public.property_assignments (property_id, organization_id, user_id) values
  ('ec200000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a', 'ec100000-0000-4000-8000-00000000000a');
insert into public.data_exports (id, organization_id, requester_id, requester_name, resource_types, format) values
  ('ece00000-0000-4000-8000-000000000007', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec100000-0000-4000-8000-00000000000a', 'P1 auditor', array['audit_log'], 'csv');

set local role ranza_worker;
select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000007')),
  1, 'EXP-S1-20: the P1 auditor''s export is claimed');
create temp table audit_seen_by_worker as
  select id::text as key from app.export_audit_records('ece00000-0000-4000-8000-000000000007');
grant select on audit_seen_by_worker to public;

set local role ranza_app;
select app.set_request_context('ec100000-0000-4000-8000-00000000000a');
create temp table audit_seen_by_requester as
  select id::text as key from audit.records;
grant select on audit_seen_by_requester to public;

select set_eq(
  $$select key from audit_seen_by_worker$$,
  $$select key from audit_seen_by_requester$$,
  'EXP-S1-26: and for a reader whose reach is one Property it is exactly what the log shows them');

select ok(
  (select count(*) from audit_seen_by_requester) = 1
  and 'eca00000-0000-4000-8000-000000000001' in (select key from audit_seen_by_requester),
  'EXP-S1-26: which is the one record at their Property, and none of the Organization''s or the other Properties''');

set local role ranza_worker;

-- A requester who has since left
select throws_ok(
  $$select * from app.export_units('ece00000-0000-4000-8000-000000000005')$$,
  '42501', 'export_refused:requester_not_permitted',
  'EXP-S1-27: an export whose requester''s membership has since been revoked is refused, not produced');

-- ---------------------------------------------------------------------------
-- The three ways an export ends, and the schedule
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select app.complete_data_export('ece00000-0000-4000-8000-000000000001', E'id\n1', '{"residents_guests": 1}'::jsonb)$$,
  'EXP-S1-29: a processing export is completed with its content and its counts');

set local role none;

select results_eq(
  $$select status, file_name, file_size_bytes::int, file_content, completed_at is not null,
           expires_at > now() + interval '6 days 23 hours', expires_at <= now() + interval '7 days 1 minute'
      from public.data_exports where id = 'ece00000-0000-4000-8000-000000000001'$$,
  $$values ('ready', 'export-ece00000.csv', 4, E'id\n1', true, true, true)$$,
  'EXP-S1-29: the file''s name, size and seven-day expiry are the database''s to set');

select results_eq(
  $$select event_type, payload->>'exportId', payload->'recordCounts'->>'residents_guests'
      from outbox.events where event_type = 'data_export.completed'$$,
  $$values ('data_export.completed', 'ece00000-0000-4000-8000-000000000001', '1')$$,
  'EXP-S1-29: finishing publishes data_export.completed, with ids and counts and no row');

set local role ranza_worker;

select throws_ok(
  $$select app.complete_data_export('ece00000-0000-4000-8000-000000000001', 'again', '{}'::jsonb)$$,
  '55000', null,
  'EXP-S1-29: a finished export is not finished twice');

select throws_ok(
  $$select app.complete_data_export('ece00000-0000-4000-8000-000000000006', 'unclaimed', '{}'::jsonb)$$,
  '55000', null,
  'EXP-S1-29: nor one nobody claimed');

select is(
  app.fail_data_export('ece00000-0000-4000-8000-000000000003', 'requester_not_permitted'),
  true, 'EXP-S1-30: a processing export fails with a reason');
select is(
  app.fail_data_export('ece00000-0000-4000-8000-000000000003', 'requester_not_permitted'),
  false, 'EXP-S1-30: and failing it again is harmless and says so');
select is(
  app.fail_data_export('ece00000-0000-4000-8000-000000000006', 'a driver said something with a secret in it'),
  true, 'EXP-S1-30: a pending export can be failed too, so a row that cannot be claimed does not wait for ever');

set local role none;

select results_eq(
  $$select id::text, status, error from public.data_exports
     where id in ('ece00000-0000-4000-8000-000000000003', 'ece00000-0000-4000-8000-000000000006')
     order by id$$,
  $$values ('ece00000-0000-4000-8000-000000000003', 'failed', 'requester_not_permitted'),
           ('ece00000-0000-4000-8000-000000000006', 'failed', 'internal_error')$$,
  'EXP-S1-30: a reason outside the fixed set is recorded as internal_error, and the detail stays in the log');

select results_eq(
  $$select count(*)::int from outbox.events where event_type = 'data_export.failed'$$,
  $$values (2)$$,
  'EXP-S1-30: each failure is published once');

select throws_ok(
  $$update public.data_exports set status = 'ready' where id = 'ece00000-0000-4000-8000-000000000003'$$,
  '23514', null,
  'EXP-S1-14: failed is final');

select throws_ok(
  $$update public.data_exports set status = 'pending' where id = 'ece00000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'EXP-S1-14: and nothing goes back to pending');

select throws_ok(
  $$update public.data_exports set status = 'failed', error = null where id = 'ece00000-0000-4000-8000-000000000005'$$,
  '23514', null,
  'EXP-S1-16: a failure without a reason is not a state');

select throws_ok(
  $$update public.data_exports set status = 'ready', file_name = 'x.csv', file_size_bytes = 1,
           expires_at = now() + interval '1 day', completed_at = now()
     where id = 'ece00000-0000-4000-8000-000000000005'$$,
  '23514', null,
  'EXP-S1-16: a ready export without a file is not a state');

-- Retention and the stalled
set local session_replication_role = replica;
update public.data_exports set expires_at = now() - interval '1 minute'
 where id = 'ece00000-0000-4000-8000-000000000001';
update public.data_exports set updated_at = now() - interval '31 minutes'
 where id = 'ece00000-0000-4000-8000-000000000004';
set local session_replication_role = origin;

set local role ranza_worker;

select set_eq(
  $$select export_id::text from app.expired_data_exports() where export_id::text like 'ece00000-%'$$,
  $$values ('ece00000-0000-4000-8000-000000000001')$$,
  'EXP-S1-31: a ready export past its expiry is listed for the worker');

select set_eq(
  $$select export_id::text from app.stalled_data_exports() where export_id::text like 'ece00000-%'$$,
  $$values ('ece00000-0000-4000-8000-000000000004')$$,
  'EXP-S1-31: so is one a worker claimed half an hour ago and never finished');

select is(app.expire_data_export('ece00000-0000-4000-8000-000000000001'), true,
  'EXP-S1-31: expiring clears it');
select is(app.expire_data_export('ece00000-0000-4000-8000-000000000001'), false,
  'EXP-S1-31: and once is enough');
select is(app.fail_data_export('ece00000-0000-4000-8000-000000000004', 'worker_stopped'), true,
  'EXP-S1-31: a stalled export is failed as worker_stopped');

set local role none;

select results_eq(
  $$select status, file_content is null, file_name, file_size_bytes::int
      from public.data_exports where id = 'ece00000-0000-4000-8000-000000000001'$$,
  $$values ('expired', true, 'export-ece00000.csv', 4)$$,
  'EXP-S1-31: an expired export keeps its name, size and history and loses its content');

-- Four more exports finish, for the download section: the auditor's audit log,
-- the P1 auditor's, the owner's rooms (which need no permission beyond reach)
-- and one that finishes already past its retention, before the worker has
-- cleared it.
insert into public.data_exports (id, organization_id, requester_id, requester_name, resource_types, format) values
  ('ece00000-0000-4000-8000-000000000008', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec100000-0000-4000-8000-000000000001', 'Owner', array['rooms_beds'], 'csv'),
  ('ece00000-0000-4000-8000-000000000009', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec100000-0000-4000-8000-000000000001', 'Owner', array['rooms_beds'], 'csv');

set local role ranza_worker;

select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000008')),
  1, 'EXP-S1-20: the owner''s rooms export is claimed');
select is(
  (select count(*)::int from app.claim_data_export('ece00000-0000-4000-8000-000000000009')),
  1, 'EXP-S1-20: and the one that will pass its retention unnoticed');

select lives_ok(
  $$select app.complete_data_export('ece00000-0000-4000-8000-000000000002', '[]', '{"audit_log": 4}'::jsonb);
    select app.complete_data_export('ece00000-0000-4000-8000-000000000007', 'id', '{"audit_log": 1}'::jsonb);
    select app.complete_data_export('ece00000-0000-4000-8000-000000000008', 'id', '{"rooms_beds": 4}'::jsonb);
    select app.complete_data_export('ece00000-0000-4000-8000-000000000009', 'id', '{"rooms_beds": 4}'::jsonb)$$,
  'EXP-S1-29: four more finish');

set local role none;

set local session_replication_role = replica;
update public.data_exports set expires_at = now() - interval '1 minute'
 where id = 'ece00000-0000-4000-8000-000000000009';
set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- A schedule, run
-- ---------------------------------------------------------------------------

insert into public.export_schedules (id, organization_id, created_by, created_by_name, name, resource_types, format, frequency) values
  ('ecf00000-0000-4000-8000-000000000001', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec100000-0000-4000-8000-000000000002', 'Exporter One', 'Nightly rooms', array['rooms_beds'], 'csv', 'daily'),
  ('ecf00000-0000-4000-8000-000000000002', 'ec0a0000-0000-4000-8000-00000000000a',
   'ec100000-0000-4000-8000-000000000003', 'Auditor', 'Paused one', array['audit_log'], 'json', 'weekly');

select ok(
  (select next_run_at > now() + interval '23 hours' and next_run_at <= now() + interval '1 day 1 minute'
     from public.export_schedules where id = 'ecf00000-0000-4000-8000-000000000001'),
  'EXP-S1-34: a schedule''s first run is one step from now, whatever the insert said');

set local session_replication_role = replica;
update public.export_schedules set next_run_at = now() - interval '2 days'
 where id = 'ecf00000-0000-4000-8000-000000000001';
update public.export_schedules set next_run_at = now() - interval '1 hour', status = 'paused'
 where id = 'ecf00000-0000-4000-8000-000000000002';
set local session_replication_role = origin;

set local role ranza_worker;
select app.set_worker_context('ec0b0000-0000-4000-8000-00000000000b', 'data_export.test');

select set_eq(
  $$select schedule_id::text from app.export_schedules_due() where schedule_id::text like 'ecf00000-%'$$,
  $$values ('ecf00000-0000-4000-8000-000000000001')$$,
  'EXP-S1-32: a due, active schedule is listed; a paused one is not');

select is(app.run_export_schedule('ecf00000-0000-4000-8000-000000000001'), null,
  'EXP-S1-32: another Organization''s worker cannot run it');

select app.set_worker_context('ec0a0000-0000-4000-8000-00000000000a', 'data_export.test');

select is(app.run_export_schedule('ecf00000-0000-4000-8000-000000000002'), null,
  'EXP-S1-32: a paused schedule does not run');

select ok(
  app.run_export_schedule('ecf00000-0000-4000-8000-000000000001') is not null,
  'EXP-S1-32: a due schedule starts an export');

select is(app.run_export_schedule('ecf00000-0000-4000-8000-000000000001'), null,
  'EXP-S1-32: once, however many replicas ask: the schedule has moved on');

set local role none;

create temp table scheduled_export as
  select id from public.data_exports where schedule_id = 'ecf00000-0000-4000-8000-000000000001';
grant select on scheduled_export to public;

select results_eq(
  $$select requester_id::text, requester_name, trigger_type, status, resource_types
      from public.data_exports where schedule_id = 'ecf00000-0000-4000-8000-000000000001'$$,
  $$values ('ec100000-0000-4000-8000-000000000002', 'Exporter One', 'scheduled', 'pending', array['rooms_beds'])$$,
  'EXP-S1-32: the export is requested by the schedule''s creator, under their name');

select ok(
  (select next_run_at > now() + interval '23 hours' and next_run_at <= now() + interval '1 day 1 minute'
          and last_run_at is not null
     from public.export_schedules where id = 'ecf00000-0000-4000-8000-000000000001'),
  'EXP-S1-32: and after two missed days the schedule is one step from now, not a burst of catch-up runs');

-- ---------------------------------------------------------------------------
-- The download
-- ---------------------------------------------------------------------------

set local role ranza_app;

select app.set_request_context('ec100000-0000-4000-8000-000000000003');
select results_eq(
  $$select file_name, format, file_content, resource_types from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')$$,
  $$values ('export-ece00000.json', 'json', '[]', array['audit_log'])$$,
  'EXP-S1-37: the requester downloads their own export');

select app.set_request_context('ec100000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')),
  1,
  'EXP-S1-37: so does somebody whose reach is the whole Organization and who holds every permission it covers');

select app.set_request_context('ec100000-0000-4000-8000-000000000008');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')),
  0,
  'EXP-S1-38: an Organization-wide holder of data_export.read without audit.read does not get an audit export');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000008')),
  1,
  'EXP-S1-38: but does get one of rooms, which asks nothing beyond reach');

select app.set_request_context('ec100000-0000-4000-8000-000000000007');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')),
  0,
  'EXP-S1-38: a colleague whose reach is one Property does not download another''s export, whatever else they hold');

select app.set_request_context('ec100000-0000-4000-8000-000000000005');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000008')),
  0,
  'EXP-S1-38: nor does one who holds data_export.create alone and did not make it');

select app.set_request_context('ec100000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')),
  0,
  'EXP-S1-38: another Organization''s owner is told what a missing export is told');

select app.set_request_context('ec100000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000001')),
  0,
  'EXP-S1-39: an expired export has no file to give');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000009')),
  0,
  'EXP-S1-39: and one past its expiry has none either, before the worker has cleared it');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000006')),
  0,
  'EXP-S1-39: a failed export has none');

select app.set_request_context('ec100000-0000-4000-8000-00000000000a');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000007')),
  1,
  'EXP-S1-37: a requester who reaches one Property downloads what they asked for');

set local role none;

-- The audit permission is taken from the auditor after they asked.
update public.staff_roles set permissions = array['data_export.create'], updated_at = now()
 where scope_id = 'ec0a0000-0000-4000-8000-00000000000a' and key = 'auditor_exporter';

set local role ranza_app;
select app.set_request_context('ec100000-0000-4000-8000-000000000003');
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')),
  0,
  'EXP-S1-40: a requester who has lost audit.read since cannot fetch the audit export they made');

select app.set_request_context(null);
select is(
  (select count(*)::int from app.read_data_export_file('ece00000-0000-4000-8000-000000000002')),
  0,
  'EXP-S1-37: with no acting Staff Member the file is not given');

-- ---------------------------------------------------------------------------
-- Run time re-checks the requester: a creator who has left
-- ---------------------------------------------------------------------------

set local role none;

update public.organization_memberships set status = 'revoked', revoked_at = now()
 where user_id = 'ec100000-0000-4000-8000-000000000002';

set local role ranza_worker;
select app.set_worker_context('ec0a0000-0000-4000-8000-00000000000a', 'data_export.test');

select is(
  (select count(*)::int from app.claim_data_export((select id from scheduled_export))),
  1, 'EXP-S1-33: the scheduled export is claimed like any other');

select throws_ok(
  $$select * from app.export_units((select id from scheduled_export))$$,
  '42501', 'export_refused:requester_not_permitted',
  'EXP-S1-33: a scheduled run re-checks its creator, who has left, and produces a refusal and no rows');

select is(app.fail_data_export((select id from scheduled_export), 'requester_not_permitted'), true,
  'EXP-S1-33: the refusal is the export''s outcome');
select is(app.fail_data_export('ece00000-0000-4000-8000-000000000005', 'requester_not_permitted'), true,
  'EXP-S1-27: and so it is for the member whose export was waiting when they were revoked');

set local role none;

select results_eq(
  $$select status from public.export_schedules where id = 'ecf00000-0000-4000-8000-000000000001'$$,
  $$values ('paused')$$,
  'EXP-S1-33: and the schedule is paused, so it does not produce the same refusal every morning');

select finish();
rollback;
