begin;
select plan(18);

insert into auth.users(id,email) values
('b1000000-0000-4000-8000-000000000001','wifi-admin@test.invalid'),
('b1000000-0000-4000-8000-000000000002','wifi-owner@test.invalid'),
('b1000000-0000-4000-8000-000000000003','wifi-staff@test.invalid'),
('b1000000-0000-4000-8000-000000000004','wifi-student@test.invalid'),
('b1000000-0000-4000-8000-000000000005','wifi-other@test.invalid'),
('b1000000-0000-4000-8000-000000000006','wifi-inactive@test.invalid');
insert into private.platform_memberships(auth_user_id,role)
values('b1000000-0000-4000-8000-000000000001','platform_admin');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('b6000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',now(),now());
insert into public.operators(id,name,status) values
('b2000000-0000-4000-8000-000000000001','Wi-Fi Operator','active'),
('b2000000-0000-4000-8000-000000000002','Other Wi-Fi Operator','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Protected Branch','female'),
('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','Other Branch','male');
insert into public.operator_memberships(id,operator_id,auth_user_id,role,access_scope) values
('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','owner','operator_wide'),
('b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','branch_staff','assigned_branches');
insert into public.branch_assignments(operator_id,membership_id,branch_id,role) values
('b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','staff');
insert into public.students(id,operator_id,auth_user_id,display_name,status) values
('b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000004','Wi-Fi Student','active'),
('b5000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000005','Other Student','active'),
('b5000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000006','Inactive Student','inactive');
insert into public.student_branch_history(operator_id,student_id,branch_id) values
('b2000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001'),
('b2000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002'),
('b2000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"b6000000-0000-4000-8000-000000000001"}',true);
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes)
values('b2000000-0000-4000-8000-000000000001','wifi',1,array['protected','public_qr']);

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select lives_ok($$select public.store_protected_wifi('b3000000-0000-4000-8000-000000000001','aes-256-gcm-v1.nonce.tag.ciphertext',1,'protected')$$,'Owner stores encrypted Wi-Fi');
select is((private.read_protected_wifi('b3000000-0000-4000-8000-000000000001')->>'revision')::integer,1,'Initial revision is one');
select lives_ok($$select public.store_protected_wifi('b3000000-0000-4000-8000-000000000001','aes-256-gcm-v1.second.tag.ciphertext',1,'protected')$$,'Owner rotates protected details');
select is((private.read_protected_wifi('b3000000-0000-4000-8000-000000000001')->>'revision')::integer,2,'Rotation increments revision');
select throws_ok($$select public.store_protected_wifi('b3000000-0000-4000-8000-000000000001','aes-256-gcm-v1.nonce.tag.ciphertext',1,'public_qr')$$,'42501','Wi-Fi mode unavailable','Protected slice cannot select Public/QR');
select throws_ok($$select * from public.wifi_access$$,'42501',null,'Direct table access is denied');
select ok(not exists(select 1 from public.audit_events where before_summary::text like '%ciphertext%' or after_summary::text like '%ciphertext%'),'Audit excludes ciphertext');
select ok(exists(select 1 from public.audit_events where action='wifi.changed' and after_summary->>'secret'='[REDACTED]'),'Audit records redacted rotation');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003"}',true);
select is(private.read_protected_wifi('b3000000-0000-4000-8000-000000000001')->>'encrypted_payload','aes-256-gcm-v1.second.tag.ciphertext','Assigned staff reads protected ciphertext');
set local role postgres;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
update public.branch_assignments set status='revoked',revoked_at=clock_timestamp() where id=(select id from public.branch_assignments limit 1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Staff unassignment revokes access');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004"}',true);
select lives_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'Active Branch Student reads protected data');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000005"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Cross-Operator Student is denied');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000006"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Inactive Student is denied');

set local role postgres;
update public.students set status='inactive' where id='b5000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Student deactivation revokes access');

set local role postgres;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
update public.students set status='active' where id='b5000000-0000-4000-8000-000000000001';
update public.operator_entitlements set status='revoked' where operator_id='b2000000-0000-4000-8000-000000000001' and capability_key='wifi';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Entitlement revocation removes access');

set local role postgres;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
update public.operator_entitlements set status='granted' where operator_id='b2000000-0000-4000-8000-000000000001' and capability_key='wifi';
update public.operators set status='suspended' where id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Operator suspension removes access');

set local role postgres;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001"}',true);
update public.operators set status='active' where id='b2000000-0000-4000-8000-000000000001';
update public.student_branch_history set ended_at=clock_timestamp() where student_id='b5000000-0000-4000-8000-000000000001' and ended_at is null;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.read_protected_wifi('b3000000-0000-4000-8000-000000000001')$$,'42501','Protected Wi-Fi access denied','Transfer removes prior Branch access');

select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.store_protected_wifi('b3000000-0000-4000-8000-000000000002','aes-256-gcm-v1.nonce.tag.ciphertext',1,'protected')$$,'42501','Wi-Fi change denied','Cross-Operator write is denied');

select * from finish();
rollback;
