begin;
select plan(12);
select ok(private.support_retry_available('{"status":"failed"}',1,'2026-09-06T10:00Z','2026-09-06T10:01Z'),'Failed retry becomes available after cooldown');
select ok(not private.support_retry_available('{"status":"failed"}',1,'2026-09-06T10:00Z','2026-09-06T10:00:59Z'),'Repeated submission in cooldown remains idempotent');
select ok(not private.support_retry_available('{"status":"failed"}',3,'2026-09-06T10:00Z','2026-09-06T10:10Z'),'Three attempts exhaust the source job');
select ok(not private.support_retry_available('{"status":"succeeded"}',1,'2026-09-06T10:00Z','2026-09-06T10:10Z'),'Success is never re-executed');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password) values
('f1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@export-fix.test',''),
('f1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@export-fix.test','');
insert into public.operators(id,name) values ('f2000000-0000-4000-8000-000000000001','Owner export'),('f2000000-0000-4000-8000-000000000002','Other export');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','owner','operator_wide'),
('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','owner','operator_wide');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.request_operator_export('f2000000-0000-4000-8000-000000000001')$$,'Owner requests own Operator bundle');
select throws_ok($$select public.request_operator_export('f2000000-0000-4000-8000-000000000002')$$,'42501','Operator export denied','Owner cannot change request Operator');
select is((select count(*) from public.operator_data_exports),1::bigint,'Requester reads own queue');
reset role;
update public.operator_data_exports set status='ready',completed_at=clock_timestamp();
set local role authenticated;
select lives_ok($$select public.authorize_operator_export((select id from public.operator_data_exports),'f2000000-0000-4000-8000-000000000001')$$,'Owner authorizes own ready object');
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.operator_data_exports),0::bigint,'Other Owner cannot read requester exports');
reset role;
update public.operator_data_exports set expires_at=requested_at+interval '1 millisecond',requested_at=clock_timestamp()-interval '1 day';
-- Make expiry unambiguously historical while preserving the table constraint.
update public.operator_data_exports set expires_at=clock_timestamp()-interval '1 hour';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.authorize_operator_export((select id from public.operator_data_exports),'f2000000-0000-4000-8000-000000000001')$$,'42501','Operator export download denied','Expiry denies further authorization');
reset role;
update public.operator_memberships set role='manager' where auth_user_id='f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.request_operator_export('f2000000-0000-4000-8000-000000000001')$$,'42501','Operator export denied','Manager cannot request Operator bundle');
select is((select count(*) from public.operator_data_exports),0::bigint,'Revoked Owner role loses export visibility');
select * from finish();rollback;
