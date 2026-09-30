-- Guest Services and Service Requests (Blueprint 5.5, 4.3, GX-S1-*)
begin;
select plan(16);

insert into public.users (id, email) values
  ('91111111-1111-4111-8111-111111111111', 'gx-manager@example.test'),
  ('92222222-2222-4222-8222-222222222222', 'gx-desk@example.test'),
  ('93333333-3333-4333-8333-333333333333', 'gx-outsider@example.test'),
  ('94444444-4444-4444-8444-444444444444', 'gx-noperm@example.test');

insert into public.organizations (id, name, status) values
  ('9a111111-1111-4111-8111-111111111111', 'Guest Services Org', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'Other Org', 'active');

insert into public.subscriptions (organization_id, status) values
  ('9a111111-1111-4111-8111-111111111111', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'active');

insert into public.entitlements (organization_id, module_key, status) values
  ('9a111111-1111-4111-8111-111111111111', 'guest_services', 'active'),
  ('9a222222-2222-4222-8222-222222222222', 'guest_services', 'active');

insert into public.properties (id, organization_id, name) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'Main Property'),
  ('9b222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', 'Second Property'),
  ('9b333333-3333-4333-8333-333333333333', '9a222222-2222-4222-8222-222222222222', 'Other Org Property');

insert into public.property_capabilities (property_id, organization_id, capability_key, enabled) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'guest_experience', true),
  ('9b222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', 'guest_experience', false),
  ('9b333333-3333-4333-8333-333333333333', '9a222222-2222-4222-8222-222222222222', 'guest_experience', true);

insert into public.accommodation_units (id, property_id, organization_id, name, unit_type) values
  ('9c111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '101', 'room'),
  ('9c222222-2222-4222-8222-222222222222', '9b333333-3333-4333-8333-333333333333', '9a222222-2222-4222-8222-222222222222', '201', 'room');

-- Roles & Memberships
insert into public.staff_roles (id, scope_id, organization_id, key, name, permissions) values
  ('9d111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'custom_manager', 'Manager',
   array['guest_services.create_request', 'guest_services.manage_requests']),
  ('9d222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'custom_desk', 'Desk',
   array['guest_services.create_request']),
  ('9d333333-3333-4333-8333-333333333333', '9a111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', 'no_permissions', 'No Perms',
   array[]::text[]);

insert into public.organization_memberships (organization_id, user_id, role, role_scope_id, access_scope) values
  ('9a111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111', 'custom_manager', '9a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('9a111111-1111-4111-8111-111111111111', '92222222-2222-4222-8222-222222222222', 'custom_desk', '9a111111-1111-4111-8111-111111111111', 'assigned_properties'),
  ('9a111111-1111-4111-8111-111111111111', '94444444-4444-4444-8444-444444444444', 'no_permissions', '9a111111-1111-4111-8111-111111111111', 'assigned_properties');

insert into public.property_assignments (property_id, organization_id, user_id) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111'),
  ('9b222222-2222-4222-8222-222222222222', '9a111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111'),
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '92222222-2222-4222-8222-222222222222'),
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', '94444444-4444-4444-8444-444444444444');

-- Switch to application role
set local role ranza_app;

-- 1. GX-S1-01: Logging a request creates a new request with number 1
select app.set_request_context('91111111-1111-4111-8111-111111111111');

insert into public.service_requests (
  organization_id, property_id, title, details, category, priority, accommodation_unit_id
) values (
  '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
  'Extra pillows please', 'Two extra feather pillows', 'housekeeping', 'normal',
  '9c111111-1111-4111-8111-111111111111'
);

select results_eq(
  $$ select number, status, category, priority from public.service_requests where title = 'Extra pillows please' $$,
  $$ values (1, 'new', 'housekeeping', 'normal') $$,
  'GX-S1-01: logging a request creates a new request numbered 1'
);

-- 2. GX-S1-02: Sequential number per property
insert into public.service_requests (
  organization_id, property_id, title, category, priority
) values (
  '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
  'Taxi reservation', 'front_desk', 'low'
);

select is(
  (select number from public.service_requests where title = 'Taxi reservation'),
  2,
  'GX-S1-02: second request at property receives number 2'
);

-- 3. GX-S1-04: User without permission is refused
select app.set_request_context('94444444-4444-4444-8444-444444444444');

select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title, category, priority
     ) values (
       '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
       'Unauthorized request', 'other', 'normal'
     ) $$,
  '42501',
  null,
  'GX-S1-04: creating without permission is refused by policy'
);

-- 4. GX-S1-05: Property with capability disabled is refused
select app.set_request_context('91111111-1111-4111-8111-111111111111');

select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title, category, priority
     ) values (
       '9a111111-1111-4111-8111-111111111111', '9b222222-2222-4222-8222-222222222222',
       'Disabled capability request', 'other', 'normal'
     ) $$,
  '42501',
  null,
  'GX-S1-05: request at property with disabled capability is refused'
);

-- 5. GX-S1-06: Property out of reach is inaccessible
select app.set_request_context('92222222-2222-4222-8222-222222222222');

select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title, category, priority
     ) values (
       '9a222222-2222-4222-8222-222222222222', '9b333333-3333-4333-8333-333333333333',
       'Unreached property request', 'other', 'normal'
     ) $$,
  '42501',
  null,
  'GX-S1-06: writing request to unreached property is refused'
);

-- 6. Read visibility: only accessible properties visible
select is(
  (select count(*)::int from public.service_requests),
  2,
  'GX-S1-06: reader sees only requests from accessible properties'
);

-- Switch back to owner/manager
select app.set_request_context('91111111-1111-4111-8111-111111111111');

-- 7. GX-S1-07: Unit must belong to same property
select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title, accommodation_unit_id
     ) values (
       '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
       'Invalid room request', '9c222222-2222-4222-8222-222222222222'
     ) $$,
  '23503',
  null,
  'GX-S1-07: composite foreign key rejects accommodation unit from another property'
);

-- 8. GX-S1-08: Title bounds
select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title
     ) values (
       '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
       'hi'
     ) $$,
  '23514',
  null,
  'GX-S1-08: title shorter than 3 characters is refused by check constraint'
);

-- 9. GX-S1-14: Invalid category
select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title, category
     ) values (
       '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
       'Valid title here', 'invalid_category'
     ) $$,
  '23514',
  null,
  'GX-S1-14: invalid category refused by check constraint'
);

-- 10. GX-S1-15: Invalid priority
select throws_ok(
  $$ insert into public.service_requests (
       organization_id, property_id, title, priority
     ) values (
       '9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111',
       'Valid title here', 'super_urgent'
     ) $$,
  '23514',
  null,
  'GX-S1-15: invalid priority refused by check constraint'
);

-- 11. GX-S1-11: Status update to in_progress and resolved
update public.service_requests
   set status = 'in_progress',
       assigned_to_user_id = '92222222-2222-4222-8222-222222222222'
 where title = 'Extra pillows please';

select is(
  (select status from public.service_requests where title = 'Extra pillows please'),
  'in_progress',
  'GX-S1-11: status moved to in_progress'
);

update public.service_requests
   set status = 'resolved',
       resolution_notes = 'Delivered to room 101'
 where title = 'Extra pillows please';

select results_eq(
  $$ select status, resolution_notes is not null, resolved_at is not null
       from public.service_requests
      where title = 'Extra pillows please' $$,
  $$ values ('resolved', true, true) $$,
  'GX-S1-11: status resolved stamps resolved_at and keeps resolution notes'
);

-- 12. Trigger check: resolved cannot be cancelled directly
select throws_ok(
  $$ update public.service_requests
        set status = 'cancelled',
            cancel_reason = 'Not needed'
      where title = 'Extra pillows please' $$,
  '22000',
  null,
  'Trigger check: resolved request cannot be cancelled directly'
);

-- 13. GX-S1-10: Cancel requires cancel_reason
select throws_ok(
  $$ update public.service_requests
        set status = 'cancelled'
      where title = 'Taxi reservation' $$,
  '23514',
  null,
  'GX-S1-10: cancel without cancel_reason is refused by check constraint'
);

-- 14. GX-S1-10: Cancel with reason succeeds
update public.service_requests
   set status = 'cancelled',
       cancel_reason = 'Guest changed their mind'
 where title = 'Taxi reservation';

select results_eq(
  $$ select status, cancel_reason from public.service_requests where title = 'Taxi reservation' $$,
  $$ values ('cancelled', 'Guest changed their mind') $$,
  'GX-S1-10: cancelled request records reason'
);

-- 15. GX-S1-12: Updating without manage permission is filtered
select app.set_request_context('92222222-2222-4222-8222-222222222222');

update public.service_requests
   set status = 'new'
 where title = 'Taxi reservation';

select is(
  (select status from public.service_requests where title = 'Taxi reservation'),
  'cancelled',
  'GX-S1-12: updating request without manage permission changes nothing'
);

-- 16. GX-S1-16: Delete is refused
select throws_ok(
  $$ delete from public.service_requests where title = 'Taxi reservation' $$,
  '42501',
  null,
  'GX-S1-16: deleting a service request is refused'
);

rollback;
