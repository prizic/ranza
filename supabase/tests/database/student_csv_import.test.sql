begin;
select plan(17);

select has_table('private', 'roster_imports', 'Import batches are private');
select has_table('private', 'roster_import_rows', 'Staged Student data is private');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
('81000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','csv-owner@example.test','');
insert into public.operators (id,name,status) values
('82000000-0000-4000-8000-000000000001','CSV Operator','active'),
('82000000-0000-4000-8000-000000000002','Other CSV Operator','active');
insert into public.branches (id,operator_id,name,residence_classification) values
('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','CSV Branch','female'),
('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','Other CSV Branch','male');
insert into public.operator_memberships (id,operator_id,auth_user_id,role,access_scope) values
('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','owner','operator_wide');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(
  (public.stage_student_roster_import(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    repeat('a',64),
    '[{"rowNumber":2,"externalReference":"S-1","displayName":"Ayşe Kaya","preferredLocale":"tr"},{"rowNumber":3,"externalReference":"S-2","displayName":"A","preferredLocale":"xx"}]'::jsonb
  )->>'valid_count')::int,
  1,
  'Preview counts independently validated rows'
);
select is(
  jsonb_array_length(public.stage_student_roster_import(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    repeat('a',64),
    '[]'::jsonb
  )->'rows'),
  2,
  'Stable import key returns the original staged preview'
);
select throws_ok(
  $$select public.stage_student_roster_import(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000002',
    repeat('b',64),
    '[{"rowNumber":2,"externalReference":"X","displayName":"Other Branch","preferredLocale":"tr"}]'::jsonb
  )$$,
  '42501', 'Roster import access denied',
  'Cross-Operator Branch staging is denied'
);
select throws_ok(
  $$select public.confirm_student_roster_import(
    '82000000-0000-4000-8000-000000000001', repeat('a',64), array[3]
  )$$,
  '22023', 'Selected rows include validation errors',
  'Invalid rows cannot be selected for commit'
);
select is(
  (public.confirm_student_roster_import(
    '82000000-0000-4000-8000-000000000001', repeat('a',64), array[2]
  )->>'imported_count')::int,
  1,
  'Valid selected rows commit atomically'
);
select is((select count(*) from public.students where operator_id='82000000-0000-4000-8000-000000000001'),1::bigint,'One Student is imported');
select is((select count(*) from public.student_branch_history where branch_id='83000000-0000-4000-8000-000000000001' and ended_at is null),1::bigint,'One current Branch assignment is imported');
select is(
  (public.confirm_student_roster_import(
    '82000000-0000-4000-8000-000000000001', repeat('a',64), array[2]
  )->>'imported_count')::int,
  1,
  'Retry returns the completed outcome'
);
select is((select count(*) from public.students where external_reference='S-1'),1::bigint,'Retry creates no duplicate Student');
select is((select count(*) from public.student_branch_history where student_id=(select id from public.students where external_reference='S-1')),1::bigint,'Retry creates no duplicate assignment');

select is(
  (public.stage_student_roster_import(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    repeat('c',64),
    '[{"rowNumber":2,"externalReference":"S-1","displayName":"Duplicate Student","preferredLocale":"en"},{"rowNumber":3,"externalReference":"S-3","displayName":"New Student","preferredLocale":"en"},{"rowNumber":4,"externalReference":"S-3","displayName":"Repeated Student","preferredLocale":"en"}]'::jsonb
  )->>'valid_count')::int,
  0,
  'Existing and in-file external-reference duplicates are preview errors'
);

select is(
  (public.stage_student_roster_import(
    '82000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    repeat('d',64),
    '[{"rowNumber":2,"externalReference":"S-4","displayName":"Cancelled Student","preferredLocale":"ar"}]'::jsonb
  )->>'status'),
  'staged',
  'A valid batch can be staged before confirmation'
);
select is(
  public.cancel_student_roster_import('82000000-0000-4000-8000-000000000001',repeat('d',64))->>'status',
  'cancelled',
  'Staff can cancel without writes'
);
select is((select count(*) from public.students where external_reference='S-4'),0::bigint,'Cancellation creates no Student');
select throws_ok(
  $$select public.confirm_student_roster_import(
    '82000000-0000-4000-8000-000000000001', repeat('d',64), array[2]
  )$$,
  '22023', 'Roster import is not staged',
  'Cancelled imports cannot be confirmed'
);

reset role;
select is((select count(*) from public.audit_events where action='student.roster_imported'),1::bigint,'Successful import outcome and actor are audited');
select ok(
  not exists (
    select 1 from public.audit_events
    where action like 'student.roster_import%'
      and (after_summary::text like '%Ayşe%' or after_summary::text like '%S-1%')
  ),
  'Audit summaries contain no Student names or external references'
);

select * from finish();
rollback;
