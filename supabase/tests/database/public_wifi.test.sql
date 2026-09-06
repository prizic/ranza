begin;
select no_plan();
select ok(not has_table_privilege('anon','public.wifi_access','select'),'No anonymous customer-table read');
select ok(not has_table_privilege('authenticated','private.wifi_public_tokens','select'),'Token digests remain private');
select ok(not has_function_privilege('anon','public.resolve_public_wifi(text,text)','execute'),'Anonymous cannot invoke privileged resolver directly');
select ok(has_function_privilege('service_role','public.resolve_public_wifi(text,text)','execute'),'Server resolver has minimal RPC');
insert into auth.users(id,email) values
('c1000000-0000-4000-8000-000000000001','public-wifi-owner@test.invalid'),
('c1000000-0000-4000-8000-000000000002','public-wifi-outsider@test.invalid');
insert into public.operators(id,name,status) values('c2000000-0000-4000-8000-000000000001','Public Wi-Fi','active');
insert into public.branches(id,operator_id,name,residence_classification) values
('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Guest Branch','mixed');
insert into public.operator_memberships(operator_id,auth_user_id,role,access_scope) values
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','owner','operator_wide');
insert into public.operator_entitlements(operator_id,capability_key,catalog_version,allowed_modes) values
('c2000000-0000-4000-8000-000000000001','wifi',1,array['protected','public_qr']);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.store_protected_wifi('c3000000-0000-4000-8000-000000000001','aes-256-gcm-v1.nonce.tag.ciphertext',1);
select throws_ok($$select public.issue_public_wifi_link('c3000000-0000-4000-8000-000000000001',repeat('a',64),false)$$,'42501','Public Wi-Fi change denied','Exposure acceptance required');
select lives_ok($$select public.issue_public_wifi_link('c3000000-0000-4000-8000-000000000001',repeat('a',64),true)$$,'Owner enables public link');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.revoke_public_wifi_link('c3000000-0000-4000-8000-000000000001')$$,'42501','Public Wi-Fi change denied','Unrelated actor cannot revoke');
reset role;
select ok(public.resolve_public_wifi(repeat('a',64),repeat('f',64)) is not null,'Current token resolves');
select is(public.resolve_public_wifi(repeat('b',64),repeat('f',64)),null::jsonb,'Guessed token fails');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.issue_public_wifi_link('c3000000-0000-4000-8000-000000000001',repeat('b',64),true);
reset role;
select is(public.resolve_public_wifi(repeat('a',64),repeat('f',64)),null::jsonb,'Rotation rejects old digest');
select ok(public.resolve_public_wifi(repeat('b',64),repeat('f',64)) is not null,'Replacement digest resolves');
select is((select encrypted_payload from public.wifi_access where branch_id='c3000000-0000-4000-8000-000000000001'),'aes-256-gcm-v1.nonce.tag.ciphertext','Rotation never changes Wi-Fi password ciphertext');
update private.wifi_public_tokens set expires_at=clock_timestamp()-interval '1 second';
select is(public.resolve_public_wifi(repeat('b',64),repeat('f',64)),null::jsonb,'Expired token fails');
update private.wifi_public_tokens set expires_at=clock_timestamp()+interval '1 day';
set local role authenticated;
select public.revoke_public_wifi_link('c3000000-0000-4000-8000-000000000001',true);
reset role;
select is(public.resolve_public_wifi(repeat('b',64),repeat('f',64)),null::jsonb,'Revoked token cannot resolve');
select is((select mode from public.wifi_access where branch_id='c3000000-0000-4000-8000-000000000001'),'protected','Owner returns to Protected mode');
set local role authenticated;
select public.issue_public_wifi_link('c3000000-0000-4000-8000-000000000001',repeat('c',64),true);
reset role;
update public.branches set status='archived' where id='c3000000-0000-4000-8000-000000000001';
select is(public.resolve_public_wifi(repeat('c',64),repeat('f',64)),null::jsonb,'Archived Branch denies token');
update public.branches set status='active' where id='c3000000-0000-4000-8000-000000000001';
select public.resolve_public_wifi(repeat('c',64),repeat('e',64)) from generate_series(1,120);
select is(public.resolve_public_wifi(repeat('c',64),repeat('e',64)),null::jsonb,'Network request burst is bounded');
select ok(not exists(select 1 from public.audit_events where action like 'wifi.link_%' and (after_summary::text like '%ciphertext%' or after_summary::text like '%'||repeat('c',64)||'%')),'Token and ciphertext excluded from audits');
select * from finish();
rollback;
