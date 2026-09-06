begin;
select plan(17);
insert into auth.users (id, email) values
('61000000-0000-4000-8000-000000000001', 'entitlement-admin@test.invalid'),
('61000000-0000-4000-8000-000000000002', 'entitlement-owner@test.invalid'),
('61000000-0000-4000-8000-000000000003', 'entitlement-outsider@test.invalid');
insert into private.platform_memberships (auth_user_id, role) values ('61000000-0000-4000-8000-000000000001','platform_admin');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',now(),now());
insert into public.operators (id,name,status) values ('62000000-0000-4000-8000-000000000001','Entitlement test','active');
insert into public.branches (id,operator_id,name,residence_classification) values ('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','Branch','female');
insert into public.operator_memberships (operator_id,auth_user_id,role,access_scope) values ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','owner','operator_wide');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"65000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$insert into public.operator_entitlements (operator_id,capability_key,catalog_version,allowed_modes) values ('62000000-0000-4000-8000-000000000001','wifi',1,array['protected','public_qr'])$$, 'Admin grants modes');
select is(public.resolve_capability('62000000-0000-4000-8000-000000000001','wifi')->>'mode','protected','Catalog default resolves');
select throws_ok($$insert into public.operator_entitlements (operator_id,capability_key,catalog_version,allowed_modes) values ('62000000-0000-4000-8000-000000000001','balance',1,array['arbitrary'])$$,'22023','Unsupported entitlement modes','Catalog forbids invented mode');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002"}',true);
select lives_ok($$insert into public.feature_configurations (operator_id,capability_key,mode) values ('62000000-0000-4000-8000-000000000001','wifi','public_qr')$$,'Owner configures Operator');
select lives_ok($$insert into public.feature_configurations (operator_id,branch_id,capability_key,mode) values ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','wifi','protected')$$,'Owner configures Branch');
select is(public.resolve_capability('62000000-0000-4000-8000-000000000001','wifi','63000000-0000-4000-8000-000000000001')->>'mode','protected','Branch overrides Operator');
select throws_ok($$update public.feature_configurations set values = '{"secret":"unexpected"}' where capability_key='wifi'$$,'22023','Unsupported configuration values','Unknown values rejected');
select throws_ok($$insert into public.feature_configurations (operator_id,capability_key,mode) values ('62000000-0000-4000-8000-000000000001','meals','standard')$$,'42501','Capability unavailable','Unentitled module rejected');
select throws_ok($$insert into public.operator_entitlements (operator_id,capability_key,catalog_version,allowed_modes) values ('62000000-0000-4000-8000-000000000001','meals',1,array['standard'])$$,'42501',null,'Owner cannot self-grant');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000003"}',true);
select is((select count(*)::integer from public.feature_configurations),0,'Outsider sees no configuration');
select throws_ok($$select public.resolve_capability('62000000-0000-4000-8000-000000000001','wifi')$$,'42501','Operator access denied','Direct RPC denies cross-tenant read');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"65000000-0000-4000-8000-000000000001"}',true);
update public.operator_entitlements set status='revoked' where capability_key='wifi';
select is(public.resolve_capability('62000000-0000-4000-8000-000000000001','wifi')->>'reason','revoked','Revocation applies immediately');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002"}',true);
select is((select count(*)::integer from public.feature_configurations),2,'Revocation preserves readable history');
select throws_ok($$update public.feature_configurations set mode='protected' where branch_id is null$$,'42501','Capability unavailable','Revocation blocks configuration mutation');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"65000000-0000-4000-8000-000000000001"}',true);
update public.operator_entitlements set status='granted', starts_at=now()+interval '1 day' where capability_key='wifi';
select is(public.resolve_capability('62000000-0000-4000-8000-000000000001','wifi')->>'reason','scheduled','Future grants stay locked');
update public.operator_entitlements set starts_at=now()-interval '2 days', ends_at=now() where capability_key='wifi';
select is(public.resolve_capability('62000000-0000-4000-8000-000000000001','wifi')->>'reason','expired','End time is exclusive');
select ok((select count(*) from public.audit_events where target_type in ('operator_entitlement','feature_configuration')) >= 6,'Administrative changes audited');
select * from finish();
rollback;
