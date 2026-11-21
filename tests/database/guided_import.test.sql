-- Guided import: the record and its rows (IMP-S1-*, ADR 0065).
--
-- Four claims:
--
--   who            only `import.run` at a Property it reaches stages an import
--                  there; another Organization sees nothing; the rows are the
--                  uploader's alone, to read and to settle.
--
--   the states     an import moves forward only: started by its uploader with
--                  a ready row, one running at a Property, finished by its
--                  last row or by anybody stopping it, never reopened and
--                  never deleted.
--
--   the rows       a ready row is settled once, while its import is running;
--                  a wrong row never; the counts are the rows' own.
--
--   the sweep      after seven days the worker, and only the worker, deletes
--                  the rows and closes what was left open; the counts stay.
--
-- Rows in docs/features/guided-import/edge-cases.csv are named beside the
-- assertion that proves them. Each break below was applied inside a
-- rolled-back transaction, the altered object printed first, and the named
-- assertions seen red (the output of that run is in the commit message):
--   insert policy without the permission        IMP-S1-02 a front desk stages nothing
--   insert policy without the Property's reach  IMP-S1-02 a manager who does not reach it
--   rows readable by any importer               IMP-S1-04 none of its rows
--   the uploader test dropped from the mover    IMP-S1-10 nobody starts somebody else's
--   the ready-row test dropped                  IMP-S1-06 no ready row
--   the one-running index dropped               IMP-S1-07 a second import
--   the settle trigger dropped                  IMP-S1-08 settled once, a wrong row, before the start
--   the finish dropped from the counter         IMP-S1-09 the last ready row
--   the closing trigger dropped                 IMP-S1-12 left unimported
--   the closing trigger's caller check dropped  IMP-S1-12 by nobody else
--   the counter's caller check dropped          IMP-S1-08 moved by nobody who does not reach
--   the never-deleted trigger dropped           IMP-S1-14 never deleted
--   the sweep's seven days made zero            IMP-S1-15 a younger import
--   the sweep granted to ranza_app              IMP-S1-15 only the worker
begin;
select plan(55);

insert into public.users (id, email) values
  ('a6511111-1111-4111-8111-111111111111', 'imp-manager@example.test'),
  ('a6522222-2222-4222-8222-222222222222', 'imp-second-manager@example.test'),
  ('a6533333-3333-4333-8333-333333333333', 'imp-desk@example.test'),
  ('a6544444-4444-4444-8444-444444444444', 'imp-elsewhere@example.test'),
  ('a6555555-5555-4555-8555-555555555555', 'imp-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('a65a1111-1111-4111-8111-111111111111', 'Import Organization', 'active'),
  ('a65a2222-2222-4222-8222-222222222222', 'Other Import Organization', 'active');

insert into public.properties (id, organization_id, name) values
  ('a65b1111-1111-4111-8111-111111111111',
   'a65a1111-1111-4111-8111-111111111111', 'Import Yurt'),
  ('a65b3333-3333-4333-8333-333333333333',
   'a65a1111-1111-4111-8111-111111111111', 'Import Annexe'),
  ('a65b2222-2222-4222-8222-222222222222',
   'a65a2222-2222-4222-8222-222222222222', 'Other Import Yurt');

-- Two managers who reach everything, a desk, a manager who reaches only the
-- annexe, and a manager of another Organization.
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('a65a1111-1111-4111-8111-111111111111', 'a6511111-1111-4111-8111-111111111111',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('a65a1111-1111-4111-8111-111111111111', 'a6522222-2222-4222-8222-222222222222',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('a65a1111-1111-4111-8111-111111111111', 'a6533333-3333-4333-8333-333333333333',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('a65a1111-1111-4111-8111-111111111111', 'a6544444-4444-4444-8444-444444444444',
   'manager', '00000000-0000-0000-0000-000000000000', 'assigned_properties'),
  ('a65a2222-2222-4222-8222-222222222222', 'a6555555-5555-4555-8555-555555555555',
   'manager', '00000000-0000-0000-0000-000000000000', 'organization_wide');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('a65b3333-3333-4333-8333-333333333333',
   'a65a1111-1111-4111-8111-111111111111', 'a6544444-4444-4444-8444-444444444444');

insert into public.subscriptions (organization_id, status) values
  ('a65a1111-1111-4111-8111-111111111111', 'active'),
  ('a65a2222-2222-4222-8222-222222222222', 'active');

-- ---------------------------------------------------------------------------
-- The catalogue: read, never called, so an absent object fails and does not raise
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select key from public.staff_roles
      where organization_id is null and 'import.run' = any (permissions)
      order by 1 $$,
  $$ values ('manager'::text), ('owner') $$,
  'IMP-S1-02: an owner and a manager hold import.run, and no other role of the product''s');

select is_empty(
  $$ select relname from pg_catalog.pg_class
      where relname in ('imports', 'import_rows')
        and relnamespace = 'public'::regnamespace
        and not (relrowsecurity and relforcerowsecurity) $$,
  'IMP-S1-03: both tables force their policies on their owner too');

select is(
  (select string_agg(table_name || '.' || column_name, ' '
                     order by (table_name || '.' || column_name) collate "C")
     from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'ranza_app'
      and privilege_type = 'UPDATE'
      and table_name in ('imports', 'import_rows')),
  'import_rows.outcome import_rows.result_id import_rows.state imports.status',
  'IMP-S1-08: the application writes an import''s status and a row''s outcome, and no count or cell');

select is_empty(
  $$ select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('ranza_worker', 'ranza_auth', 'public')
        and table_name in ('imports', 'import_rows') $$,
  'IMP-S1-15: nobody else is granted the tables: the worker reaches them through two functions');

select is(
  (select count(*)::int from pg_catalog.pg_proc as proc
    where proc.pronamespace = 'app'::regnamespace
      and proc.proname in ('imports_past_retention', 'forget_import_rows')
      and has_function_privilege('ranza_worker', proc.oid, 'execute')
      and not has_function_privilege('ranza_app', proc.oid, 'execute')
      and not has_function_privilege('ranza_auth', proc.oid, 'execute')),
  2,
  'IMP-S1-15: only the worker runs the sweep');

-- ---------------------------------------------------------------------------
-- Staging
-- ---------------------------------------------------------------------------

set local role ranza_app;
select app.set_request_context('a6511111-1111-4111-8111-111111111111');

-- Names the second manager as its uploader, to show the stamp wins.
select lives_ok(
  $$ insert into public.imports
       (organization_id, property_id, kind, file_name, uploaded_by)
     values ('a65a1111-1111-4111-8111-111111111111',
             'a65b1111-1111-4111-8111-111111111111', 'rooms', 'one.csv',
             'a6522222-2222-4222-8222-222222222222') $$,
  'IMP-S1-01: a manager stages an import and nothing else is written');

select results_eq(
  $$ select uploaded_by, status, started_at is null
       from public.imports where file_name = 'one.csv' $$,
  $$ values ('a6511111-1111-4111-8111-111111111111'::uuid, 'staged'::text, true) $$,
  'IMP-S1-01: the uploader and the state are stamped, whatever the caller sent');

select lives_ok(
  $$ insert into public.import_rows
       (import_id, row_number, organization_id, property_id, state, cells, problems)
     select import.id, row.number, import.organization_id, import.property_id,
            row.state, jsonb_build_object('number', row.number::text), row.problems
       from public.imports as import,
            (values (2, 'ready', '[]'::jsonb), (3, 'ready', '[]'), (4, 'ready', '[]'),
                    (5, 'wrong', '[{"column":"capacity","code":"not_a_number"}]'),
                    (6, 'skipped', '[]')) as row (number, state, problems)
      where import.file_name = 'one.csv' $$,
  'IMP-S1-01: its rows arrive ready, wrong or already there');

select results_eq(
  $$ select ready_count, wrong_count, skipped_count, imported_count
       from public.imports where file_name = 'one.csv' $$,
  $$ values (3, 1, 1, 0) $$,
  'IMP-S1-09: the counts are the rows'' own from the moment they arrive');

select is(
  (select count(*)::int from public.accommodation_units
    where property_id = 'a65b1111-1111-4111-8111-111111111111'),
  0, 'IMP-S1-01: and no room exists yet');

select throws_ok(
  $$ insert into public.import_rows
       (import_id, row_number, organization_id, property_id, state, cells)
     select id, 7, organization_id, property_id, 'imported', '{}'::jsonb
       from public.imports where file_name = 'one.csv' $$,
  'RZI02', null,
  'IMP-S1-08: a row does not arrive already imported');

select throws_ok(
  $$ update public.import_rows set state = 'imported' where row_number = 2 $$,
  'RZI02', null,
  'IMP-S1-08: no row is settled before the import starts');

-- An import with nothing ready.
insert into public.imports (organization_id, property_id, kind, file_name, uploaded_by)
values ('a65a1111-1111-4111-8111-111111111111', 'a65b1111-1111-4111-8111-111111111111',
        'rooms', 'nothing-ready.csv', 'a6511111-1111-4111-8111-111111111111');
insert into public.import_rows
  (import_id, row_number, organization_id, property_id, state, cells)
select id, 2, organization_id, property_id, 'wrong', '{}'::jsonb
  from public.imports where file_name = 'nothing-ready.csv';

select throws_ok(
  $$ update public.imports set status = 'importing' where file_name = 'nothing-ready.csv' $$,
  'RZI01', null,
  'IMP-S1-06: an import with no ready row does not start');

-- ---------------------------------------------------------------------------
-- Who may not
-- ---------------------------------------------------------------------------

select app.set_request_context('a6533333-3333-4333-8333-333333333333');

select throws_ok(
  $$ insert into public.imports
       (organization_id, property_id, kind, file_name, uploaded_by)
     values ('a65a1111-1111-4111-8111-111111111111',
             'a65b1111-1111-4111-8111-111111111111', 'rooms', 'desk.csv',
             'a6533333-3333-4333-8333-333333333333') $$,
  '42501', null,
  'IMP-S1-02: a front desk without import.run stages nothing');

select is(
  (select count(*)::int from public.imports), 0,
  'IMP-S1-02: and reads no import');

select app.set_request_context('a6544444-4444-4444-8444-444444444444');

select throws_ok(
  $$ insert into public.imports
       (organization_id, property_id, kind, file_name, uploaded_by)
     values ('a65a1111-1111-4111-8111-111111111111',
             'a65b1111-1111-4111-8111-111111111111', 'rooms', 'elsewhere.csv',
             'a6544444-4444-4444-8444-444444444444') $$,
  '42501', null,
  'IMP-S1-02: nor a manager who does not reach the Property');

select lives_ok(
  $$ insert into public.imports
       (organization_id, property_id, kind, file_name, uploaded_by)
     values ('a65a1111-1111-4111-8111-111111111111',
             'a65b3333-3333-4333-8333-333333333333', 'rooms', 'annexe.csv',
             'a6544444-4444-4444-8444-444444444444') $$,
  'IMP-S1-02: who stages one at the Property they do reach');

select is(
  (select count(*)::int from public.imports where file_name <> 'annexe.csv'), 0,
  'IMP-S1-02: and reads no import of a Property out of their reach');

select app.set_request_context('a6555555-5555-4555-8555-555555555555');

select is(
  (select count(*)::int from public.imports)
  + (select count(*)::int from public.import_rows), 0,
  'IMP-S1-03: another Organization reads no import and no row');

select throws_ok(
  $$ insert into public.imports
       (organization_id, property_id, kind, file_name, uploaded_by)
     values ('a65a1111-1111-4111-8111-111111111111',
             'a65b1111-1111-4111-8111-111111111111', 'rooms', 'outsider.csv',
             'a6555555-5555-4555-8555-555555555555') $$,
  '42501', null,
  'IMP-S1-03: and stages none in this one');

-- The second manager: an importer at the same Property, and not the uploader.
select app.set_request_context('a6522222-2222-4222-8222-222222222222');

select results_eq(
  $$ select (select count(*)::int from public.imports where file_name = 'one.csv'),
            (select count(*)::int from public.import_rows) $$,
  $$ values (1, 0) $$,
  'IMP-S1-04: another holder of import.run reads the import and none of its rows');

select throws_ok(
  $$ update public.imports set status = 'importing' where file_name = 'one.csv' $$,
  'RZI01', null,
  'IMP-S1-10: nobody starts somebody else''s import');

select throws_ok(
  $$ update public.imports set status = 'discarded' where file_name = 'one.csv' $$,
  'RZI01', null,
  'IMP-S1-13: nor discards it');

-- Their own, ready to run, for the one-at-a-time rule below.
insert into public.imports (organization_id, property_id, kind, file_name, uploaded_by)
values ('a65a1111-1111-4111-8111-111111111111', 'a65b1111-1111-4111-8111-111111111111',
        'rooms', 'second-manager.csv', 'a6522222-2222-4222-8222-222222222222');
insert into public.import_rows
  (import_id, row_number, organization_id, property_id, state, cells)
select id, 2, organization_id, property_id, 'ready', '{}'::jsonb
  from public.imports where file_name = 'second-manager.csv';

-- ---------------------------------------------------------------------------
-- Running
-- ---------------------------------------------------------------------------

select app.set_request_context('a6511111-1111-4111-8111-111111111111');

select lives_ok(
  $$ update public.imports set status = 'importing' where file_name = 'one.csv' $$,
  'IMP-S1-06: its uploader starts an import with ready rows');

select results_eq(
  $$ select status, started_at is not null, closed_at is null
       from public.imports where file_name = 'one.csv' $$,
  $$ values ('importing'::text, true, true) $$,
  'IMP-S1-06: and it is importing from that moment');

-- The second manager starts theirs while the first is running.
select app.set_request_context('a6522222-2222-4222-8222-222222222222');

select throws_ok(
  $$ update public.imports set status = 'importing' where file_name = 'second-manager.csv' $$,
  '23505', null,
  'IMP-S1-07: a second import does not start at a Property while one is running');

-- Settles a row that is not theirs: no row is theirs to reach, so nothing
-- happens, which the uploader then reads.
update public.import_rows as row set state = 'imported'
  from public.imports as import
 where import.id = row.import_id and import.file_name = 'one.csv' and row.row_number = 2;

select app.set_request_context('a6511111-1111-4111-8111-111111111111');

select is(
  (select state from public.import_rows as row
     join public.imports as import on import.id = row.import_id
    where import.file_name = 'one.csv' and row.row_number = 2),
  'ready',
  'IMP-S1-10: nobody settles a row of somebody else''s import');

select lives_ok(
  $$ update public.import_rows as row
        set state = 'imported', result_id = 'a65c0000-0000-4000-8000-000000000001'
       from public.imports as import
      where import.id = row.import_id and import.file_name = 'one.csv'
        and row.row_number = 2 $$,
  'IMP-S1-08: a ready row is settled once');

select throws_ok(
  $$ update public.import_rows as row set state = 'refused'
       from public.imports as import
      where import.id = row.import_id and import.file_name = 'one.csv'
        and row.row_number = 2 $$,
  'RZI02', null,
  'IMP-S1-08: and not a second time');

select throws_ok(
  $$ update public.import_rows as row set state = 'imported'
       from public.imports as import
      where import.id = row.import_id and import.file_name = 'one.csv'
        and row.row_number = 5 $$,
  'RZI02', null,
  'IMP-S1-08: a wrong row is never imported');

select throws_ok(
  $$ update public.import_rows as row set state = 'left'
       from public.imports as import
      where import.id = row.import_id and import.file_name = 'one.csv'
        and row.row_number = 3 $$,
  'RZI02', null,
  'IMP-S1-12: a row is not left unimported while its import is still running');

update public.import_rows as row set state = 'skipped', outcome = 'already_there'
  from public.imports as import
 where import.id = row.import_id and import.file_name = 'one.csv' and row.row_number = 3;

select is(
  (select status from public.imports where file_name = 'one.csv'),
  'importing',
  'IMP-S1-09: an import with a ready row left is still importing');

update public.import_rows as row set state = 'refused', outcome = 'not_permitted'
  from public.imports as import
 where import.id = row.import_id and import.file_name = 'one.csv' and row.row_number = 4;

select results_eq(
  $$ select status, closed_at is not null, closed_by,
            ready_count, imported_count, skipped_count, refused_count, wrong_count, left_count
       from public.imports where file_name = 'one.csv' $$,
  $$ values ('finished'::text, true, 'a6511111-1111-4111-8111-111111111111'::uuid,
             0, 1, 2, 1, 1, 0) $$,
  'IMP-S1-09: settling the last ready row finishes the import with the counts of its rows');

select throws_ok(
  $$ update public.imports set status = 'importing' where file_name = 'one.csv' $$,
  'RZI01', null,
  'IMP-S1-14: a finished import is not reopened');

select throws_ok(
  $$ delete from public.imports where file_name = 'one.csv' $$,
  '42501', null,
  'IMP-S1-14: an import is never deleted');

-- ---------------------------------------------------------------------------
-- Stopping and discarding
-- ---------------------------------------------------------------------------

insert into public.imports (organization_id, property_id, kind, file_name, uploaded_by)
values ('a65a1111-1111-4111-8111-111111111111', 'a65b1111-1111-4111-8111-111111111111',
        'rooms', 'to-stop.csv', 'a6511111-1111-4111-8111-111111111111'),
       ('a65a1111-1111-4111-8111-111111111111', 'a65b1111-1111-4111-8111-111111111111',
        'rooms', 'to-discard.csv', 'a6511111-1111-4111-8111-111111111111'),
       ('a65a1111-1111-4111-8111-111111111111', 'a65b1111-1111-4111-8111-111111111111',
        'rooms', 'left-staged.csv', 'a6511111-1111-4111-8111-111111111111');
insert into public.import_rows
  (import_id, row_number, organization_id, property_id, state, cells)
select import.id, row.number, import.organization_id, import.property_id, 'ready', '{}'::jsonb
  from public.imports as import, (values (2), (3)) as row (number)
 where import.file_name in ('to-stop.csv', 'to-discard.csv', 'left-staged.csv');

select lives_ok(
  $$ update public.imports set status = 'importing' where file_name = 'to-stop.csv' $$,
  'IMP-S1-07: the next import starts once the one before it has finished');

update public.import_rows as row set state = 'imported'
  from public.imports as import
 where import.id = row.import_id and import.file_name = 'to-stop.csv' and row.row_number = 2;

select app.set_request_context('a6522222-2222-4222-8222-222222222222');

select lives_ok(
  $$ update public.imports set status = 'finished' where file_name = 'to-stop.csv' $$,
  'IMP-S1-12: another holder of import.run may stop it');

select lives_ok(
  $$ update public.imports set status = 'importing' where file_name = 'second-manager.csv' $$,
  'IMP-S1-12: and a stopped import frees the Property for the next one');

select app.set_request_context('a6511111-1111-4111-8111-111111111111');

select results_eq(
  $$ select import.status, import.closed_by, import.imported_count, import.left_count,
            (select state from public.import_rows
              where import_id = import.id and row_number = 3)
       from public.imports as import where import.file_name = 'to-stop.csv' $$,
  $$ values ('finished'::text, 'a6522222-2222-4222-8222-222222222222'::uuid, 1, 1, 'left'::text) $$,
  'IMP-S1-12: a stopped import is finished and its ready rows are left unimported');

select lives_ok(
  $$ update public.imports set status = 'discarded' where file_name = 'to-discard.csv' $$,
  'IMP-S1-13: its uploader discards a preview');

select results_eq(
  $$ select status, left_count, ready_count, started_at is null
       from public.imports where file_name = 'to-discard.csv' $$,
  $$ values ('discarded'::text, 2, 0, true) $$,
  'IMP-S1-13: and its rows are left unimported');

select throws_ok(
  $$ update public.imports set status = 'importing' where file_name = 'to-discard.csv' $$,
  'RZI01', null,
  'IMP-S1-13: a discarded import cannot be started');

select throws_ok(
  $$ select * from app.imports_past_retention() $$,
  '42501', null,
  'IMP-S1-15: the application cannot ask what is past its retention');

-- ---------------------------------------------------------------------------
-- The owner of the tables, whom no grant restrains
-- ---------------------------------------------------------------------------

set local role none;

select throws_ok(
  $$ delete from public.imports where file_name = 'one.csv' $$,
  '42501', null,
  'IMP-S1-14: an import is not deleted by the owner either');

select throws_ok(
  $$ update public.imports set status = 'staged' where file_name = 'one.csv' $$,
  'RZI01', null,
  'IMP-S1-14: nor moved backwards');

-- The two triggers that write on a mover's behalf run as their owner, so each
-- asks who is calling. Under the policies that question is already answered;
-- it binds here, for a write no policy saw, by nobody in particular. Each is
-- asked where the other is not: closing an import with no ready row moves no
-- row, so the counter is silent, and a row arriving closes nothing. Closing
-- 'left-staged.csv' instead would pass on either check, and did.
select set_config('app.user_id', '', true);

select throws_ok(
  $$ update public.imports set status = 'discarded' where file_name = 'nothing-ready.csv' $$,
  '42501', 'that import is out of reach',
  'IMP-S1-12: an import is closed by somebody who reaches it or by the worker, and by nobody else');

select throws_ok(
  $$ insert into public.import_rows
       (import_id, row_number, organization_id, property_id, state, cells)
     select id, 99, organization_id, property_id, 'ready', '{}'::jsonb
       from public.imports where file_name = 'left-staged.csv' $$,
  '42501', 'that import is out of reach',
  'IMP-S1-08: and its counts are moved by nobody who does not reach it');

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------

-- Eight days pass for a finished import, a staged one and the one the second
-- manager left running. The trigger that stamps `touched_at` is off for this
-- one statement, because nothing but time is meant to age an import.
alter table public.imports disable trigger imports_move_forward;
update public.imports
   set touched_at = now() - interval '8 days'
 where file_name in ('one.csv', 'left-staged.csv', 'second-manager.csv');
-- And six for one more, which the sweep must leave: young in the same
-- transaction would be younger than any window, and prove nothing.
update public.imports
   set touched_at = now() - interval '6 days'
 where file_name = 'to-stop.csv';
alter table public.imports enable trigger imports_move_forward;

select set_config('test.finished', id::text, true) from public.imports where file_name = 'one.csv';
select set_config('test.staged', id::text, true) from public.imports where file_name = 'left-staged.csv';
select set_config('test.running', id::text, true) from public.imports where file_name = 'second-manager.csv';
select set_config('test.young', id::text, true) from public.imports where file_name = 'to-stop.csv';

set local role ranza_worker;

select is(
  app.forget_import_rows(current_setting('test.finished')::uuid), false,
  'IMP-S1-15: the sweep forgets nothing outside a worker context');

select app.set_worker_context('a65a2222-2222-4222-8222-222222222222', 'guided_import.test');

select is(
  app.forget_import_rows(current_setting('test.finished')::uuid), false,
  'IMP-S1-15: nor an import of another Organization');

select app.set_worker_context('a65a1111-1111-4111-8111-111111111111', 'guided_import.test');

select results_eq(
  $$ select count(*)::int from app.imports_past_retention()
      where organization_id = 'a65a1111-1111-4111-8111-111111111111' $$,
  $$ values (3) $$,
  'IMP-S1-15: three imports are past seven days');

select is(
  app.forget_import_rows(current_setting('test.young')::uuid), false,
  'IMP-S1-15: and leaves a younger import alone');

select is(
  app.forget_import_rows(current_setting('test.finished')::uuid)
  and app.forget_import_rows(current_setting('test.staged')::uuid)
  and app.forget_import_rows(current_setting('test.running')::uuid),
  true,
  'IMP-S1-15: the sweep forgets rows older than seven days and keeps the counts');

select is(
  app.forget_import_rows(current_setting('test.finished')::uuid), false,
  'IMP-S1-15: once');

set local role none;

select results_eq(
  $$ select file_name, status, rows_forgotten_at is not null,
            imported_count, left_count,
            (select count(*)::int from public.import_rows where import_id = import.id)
       from public.imports as import
      where file_name in ('one.csv', 'left-staged.csv', 'second-manager.csv', 'to-stop.csv')
      order by 1 $$,
  $$ values ('left-staged.csv'::text, 'discarded'::text, true, 0, 2, 0),
            ('one.csv', 'finished', true, 1, 0, 0),
            ('second-manager.csv', 'finished', true, 0, 1, 0),
            ('to-stop.csv', 'finished', false, 1, 1, 2) $$,
  'IMP-S1-15: the rows are gone, what was open is closed, the counts stay and the younger import keeps its rows');

select is(
  (select count(*)::int from public.imports
    where property_id = 'a65b1111-1111-4111-8111-111111111111' and status = 'importing'),
  0,
  'IMP-S1-15: so an import nobody came back to no longer holds the Property');

select * from finish();
rollback;
