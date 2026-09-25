-- A business day closes after its cutoff, and a close is never rewritten
-- (20260916005000, ADR 0034, docs/features/close-the-day).
--
-- Every date below is relative to a Property's own business date, read through
-- app.property_today(), so nothing here depends on when the suite runs. The one
-- place the local hour matters — moving today back with a cutoff or a time
-- zone — picks its zones from the clock at run time rather than assuming one.
--
-- Closes that the clock could not have produced yet (a history ending five
-- days ago) are written in replica mode, which skips the stamping trigger; the
-- rules that trigger enforces are asserted separately, through ranza_app.
--
-- Checked by breaking each thing in turn, in a transaction with the proof of
-- the change printed before the suite ran: the permission clause, the unique
-- key, the not-ended, order, first-close, before-first and already-closed
-- branches, the caller check, the reason constraint, both guards and each of
-- the Stay guard's branches, the append-only trigger, a table-level grant, the
-- read policy widened and narrowed, a restrictive policy added, a requested
-- booking excluded, the overstay rule, the nights' departed-after branch, and
-- the closer's stamp — each red on the assertion named for it. Two produced no
-- red and are recorded instead: the policy's commercial gates are held first
-- by the stamp's caller check (CD-S1-31, CD-S1-32), so only removing both
-- goes red. The nights' departed-after branch was silent until the Guest who
-- checked out this morning was added to the busy Property.
begin;
select plan(59);

insert into public.users (id, email) values
  ('bd100000-0000-4000-8000-000000000001', 'close-desk@example.test'),
  ('bd100000-0000-4000-8000-000000000002', 'close-housekeeping@example.test'),
  ('bd100000-0000-4000-8000-000000000003', 'close-finance@example.test'),
  ('bd100000-0000-4000-8000-000000000004', 'close-far@example.test'),
  ('bd100000-0000-4000-8000-000000000005', 'close-outsider@example.test');

insert into public.organizations (id, name, status) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'Close Organization', 'active'),
  ('bd0b0000-0000-4000-8000-00000000000b', 'Close Other', 'active');
insert into public.subscriptions (organization_id, status) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'active'),
  ('bd0b0000-0000-4000-8000-00000000000b', 'active');
insert into public.entitlements (organization_id, module_key)
select org, module
from (values ('bd0a0000-0000-4000-8000-00000000000a'::uuid),
             ('bd0b0000-0000-4000-8000-00000000000b'::uuid)) as o (org),
     (values ('front_office'), ('billing_folios')) as m (module);

-- quiet 1, busy 2, backlog 3, clock 4, withdrawal 5, capability off 6,
-- permissions 8; 7 is the other Organization's.
insert into public.properties (id, organization_id, name)
select ('bd200000-0000-4000-8000-00000000000' || n)::uuid,
       case when n = 7 then 'bd0b0000-0000-4000-8000-00000000000b'::uuid
            else 'bd0a0000-0000-4000-8000-00000000000a'::uuid end,
       'Close Property ' || n
from generate_series(1, 8) as n;

insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled)
select property.id, property.organization_id, wanted.key, property.id <>
         'bd200000-0000-4000-8000-000000000006'::uuid or wanted.key <> 'front_desk'
from public.properties as property,
     (values ('front_desk'), ('finance')) as wanted (key)
where property.id::text like 'bd200000-%';

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd100000-0000-4000-8000-000000000001',
   'front_desk', 'organization_wide'),
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd100000-0000-4000-8000-000000000002',
   'housekeeping', 'organization_wide'),
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd100000-0000-4000-8000-000000000003',
   'finance', 'organization_wide'),
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd100000-0000-4000-8000-000000000004',
   'front_desk', 'assigned_properties'),
  ('bd0b0000-0000-4000-8000-00000000000b', 'bd100000-0000-4000-8000-000000000005',
   'front_desk', 'organization_wide');
insert into public.property_assignments (property_id, organization_id, user_id) values
  ('bd200000-0000-4000-8000-000000000002', 'bd0a0000-0000-4000-8000-00000000000a',
   'bd100000-0000-4000-8000-000000000004');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity)
select ('bd300000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       case when n <= 2 then 'bd200000-0000-4000-8000-000000000001'::uuid
            when n <= 12 or n = 15 then 'bd200000-0000-4000-8000-000000000002'::uuid
            else 'bd200000-0000-4000-8000-000000000005'::uuid end,
       'bd0a0000-0000-4000-8000-00000000000a', 'CLOSE-' || n, 'room', 2
from generate_series(1, 17) as n;

insert into public.guests (id, organization_id, full_name) values
  ('bd400000-0000-4000-8000-000000000001',
   'bd0a0000-0000-4000-8000-00000000000a', 'Close Guest');

-- An Organization's own check-in-only role; and two more Organizations the
-- desk belongs to, one whose Subscription has lapsed and one that never bought
-- the front desk, each with a Property that has the capability on.
insert into public.users (id, email) values
  ('bd100000-0000-4000-8000-000000000006', 'close-check-in-only@example.test');
insert into public.staff_roles (scope_id, key, organization_id, name, permissions) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'desk_in_only',
   'bd0a0000-0000-4000-8000-00000000000a', 'Check-in only', array['front_desk.check_in']);
insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd100000-0000-4000-8000-000000000006',
   'desk_in_only', 'bd0a0000-0000-4000-8000-00000000000a', 'organization_wide');

insert into public.organizations (id, name, status) values
  ('bd0c0000-0000-4000-8000-00000000000c', 'Close Lapsed', 'active'),
  ('bd0d0000-0000-4000-8000-00000000000d', 'Close Unbought', 'active');
insert into public.subscriptions (organization_id, status) values
  ('bd0c0000-0000-4000-8000-00000000000c', 'past_due'),
  ('bd0d0000-0000-4000-8000-00000000000d', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('bd0c0000-0000-4000-8000-00000000000c', 'front_office'),
  ('bd0d0000-0000-4000-8000-00000000000d', 'billing_folios');
insert into public.properties (id, organization_id, name) values
  ('bd200000-0000-4000-8000-000000000009', 'bd0c0000-0000-4000-8000-00000000000c',
   'Close Lapsed Property'),
  ('bd200000-0000-4000-8000-000000000010', 'bd0d0000-0000-4000-8000-00000000000d',
   'Close Unbought Property');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('bd200000-0000-4000-8000-000000000009', 'bd0c0000-0000-4000-8000-00000000000c',
   'front_desk', true),
  ('bd200000-0000-4000-8000-000000000010', 'bd0d0000-0000-4000-8000-00000000000d',
   'front_desk', true);
insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('bd0c0000-0000-4000-8000-00000000000c', 'bd100000-0000-4000-8000-000000000001',
   'front_desk', 'organization_wide'),
  ('bd0d0000-0000-4000-8000-00000000000d', 'bd100000-0000-4000-8000-000000000001',
   'front_desk', 'organization_wide');

-- The quiet Property: one Guest departed the day before yesterday and left
-- their Folio open. Nothing is open, so the day closes without a reason.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select 'bd500000-0000-4000-8000-000000000001', 'bd0a0000-0000-4000-8000-00000000000a',
       'bd200000-0000-4000-8000-000000000001', 'bd300000-0000-4000-8000-000000000001',
       'guest', 'departed', today - 4, today - 2
from (select app.property_today('bd200000-0000-4000-8000-000000000001') as today) as t;
insert into public.folios (organization_id, property_id, stay_id, currency) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000001',
   'bd500000-0000-4000-8000-000000000001', 'TRY');

-- The busy Property, closing yesterday (Y):
--   Stays  2 began Y, in house          arrived, a night
--          3 departed on Y, Folio open  departed, a Folio left open
--          4 in house through Y         a night
--          5 began Y, withdrawn         nothing
--          6 open-ended                 a night, never open
--          7 due out today              a night, not open
--          8 due out Y, still in house  a night, OPEN
--          9 checked out this morning   a night
--   Bookings 1 confirmed for Y, nobody came   OPEN
--            2 requested for Y - 1            OPEN
--            3 confirmed for tomorrow         not open
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select ('bd500000-0000-4000-8000-00000000000' || n)::uuid,
       'bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000002',
       ('bd300000-0000-4000-8000-0000000000' || lpad((n + 1)::text, 2, '0'))::uuid,
       'guest',
       case n when 3 then 'departed' when 5 then 'cancelled' else 'in_house' end,
       today - case n when 2 then 1 when 5 then 1 when 6 then 9 else 3 end,
       case n when 3 then today - 1 when 6 then null when 7 then today
              when 8 then today - 1 else today + 2 end
from generate_series(2, 8) as n,
     (select app.property_today('bd200000-0000-4000-8000-000000000002') as today) as t;
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select 'bd500000-0000-4000-8000-000000000009', 'bd0a0000-0000-4000-8000-00000000000a',
       'bd200000-0000-4000-8000-000000000002', 'bd300000-0000-4000-8000-000000000015',
       'guest', 'departed', today - 3, today
from (select app.property_today('bd200000-0000-4000-8000-000000000002') as today) as t;
insert into public.folios (organization_id, property_id, stay_id, currency) values
  ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000002',
   'bd500000-0000-4000-8000-000000000003', 'TRY');

insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
   status, starts_on, ends_on)
select ('bd600000-0000-4000-8000-00000000000' || n)::uuid,
       'bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000002',
       ('bd300000-0000-4000-8000-0000000000' || (9 + n))::uuid,
       'bd400000-0000-4000-8000-000000000001', 'guest',
       case n when 2 then 'requested' else 'confirmed' end,
       today + case n when 1 then -1 when 2 then -2 else 1 end,
       today + 2
from generate_series(1, 3) as n,
     (select app.property_today('bd200000-0000-4000-8000-000000000002') as today) as t;

-- The withdrawal Property: a check-in yesterday and one today, both with their
-- Reservations, so the pair agrees when the suite reaches them; and a Guest in
-- since three days ago who will be checked out.
insert into public.reservations
  (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
   status, starts_on, ends_on)
select ('bd600000-0000-4000-8000-00000000001' || n)::uuid,
       'bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000005',
       ('bd300000-0000-4000-8000-0000000000' || (12 + n))::uuid,
       'bd400000-0000-4000-8000-000000000001', 'guest', 'checked_in',
       today - 2 + n, today + 3
from generate_series(1, 2) as n,
     (select app.property_today('bd200000-0000-4000-8000-000000000005') as today) as t;
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, reservation_id,
   stay_type, status, starts_on, ends_on)
select ('bd500000-0000-4000-8000-00000000001' || n)::uuid,
       'bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000005',
       ('bd300000-0000-4000-8000-0000000000' || (12 + n))::uuid,
       ('bd600000-0000-4000-8000-00000000001' || n)::uuid,
       'guest', 'in_house', today - 2 + n, today + 3
from generate_series(1, 2) as n,
     (select app.property_today('bd200000-0000-4000-8000-000000000005') as today) as t;

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select 'bd500000-0000-4000-8000-000000000013', 'bd0a0000-0000-4000-8000-00000000000a',
       'bd200000-0000-4000-8000-000000000005', 'bd300000-0000-4000-8000-000000000016',
       'guest', 'in_house', today - 3, today + 1
from (select app.property_today('bd200000-0000-4000-8000-000000000005') as today) as t;
-- And one who left yesterday, whose departure the close will count.
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
select 'bd500000-0000-4000-8000-000000000014', 'bd0a0000-0000-4000-8000-00000000000a',
       'bd200000-0000-4000-8000-000000000005', 'bd300000-0000-4000-8000-000000000017',
       'guest', 'departed', today - 3, today - 1
from (select app.property_today('bd200000-0000-4000-8000-000000000005') as today) as t;

-- The backlog Property: a history ending five days ago, which the clock could
-- only have produced over a week.
set local session_replication_role = replica;
insert into public.business_day_closes
  (organization_id, property_id, business_date, closed_by_job)
select 'bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000003',
       app.property_today('bd200000-0000-4000-8000-000000000003') - n, 'test.fixture'
from generate_series(5, 6) as n;
set local session_replication_role = origin;

-- The clock Property: a zone whose local time is between 04:00 and 11:00 now,
-- with a 03:00 cutoff, so its business date is its local date and a cutoff of
-- 11:30 would make it the day before. And a zone far enough west that its
-- business date is earlier still. Both are chosen from the clock at run time.
create temporary table clock on commit drop as
with zone as (
  select offset_hours,
         case when offset_hours > 0 then 'Etc/GMT-' || offset_hours
              when offset_hours < 0 then 'Etc/GMT+' || -offset_hours
              else 'Etc/GMT' end as name
  from generate_series(-12, 14) as offset_hours
), morning as (
  select name from zone
  where (now() at time zone name)::time >= time '04:00'
    and (now() at time zone name)::time < time '11:00'
  order by offset_hours desc
  limit 1
)
select morning.name as morning,
       (select zone.name from zone
         where app.business_date(now(), zone.name, time '03:30')
               < app.business_date(now(), morning.name, time '03:00')
         order by zone.offset_hours
         limit 1) as west
from morning;

update public.properties
   set timezone = (select morning from clock),
       business_date_cutoff = time '03:00'
 where id = 'bd200000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- The catalogue and the table's shape
-- ---------------------------------------------------------------------------

select set_eq(
  $$select key from public.staff_roles
     where organization_id is null and 'front_desk.close_day' = any (permissions)$$,
  array['owner', 'manager', 'front_desk'],
  'the shipped owner, manager and front desk may close the day; finance and housekeeping may not');

select set_eq(
  $$select column_name::text from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'business_day_closes'
       and grantee = 'ranza_app' and privilege_type = 'INSERT'$$,
  array['organization_id', 'property_id', 'business_date', 'reason'],
  'a closer supplies the day and a reason and nothing else');

select is_empty(
  $$select privilege_type from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'business_day_closes'
       and grantee in ('ranza_worker', 'ranza_auth')$$,
  'neither the worker nor the credential role holds anything on a close');

-- The table-level view omits a column grant, so the column-level one is read
-- as well: `grant insert (reason)` to the worker would pass the check above.
select is_empty(
  $$select privilege_type || ' ' || column_name from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'business_day_closes'
       and grantee in ('ranza_worker', 'ranza_auth')$$,
  'nor any column of one');

-- A tripwire rather than a behaviour. The stamping trigger runs as the closer,
-- and its counts are the Property's only because every Staff read of these
-- three tables is by reach alone and a closer must reach the Property. The day
-- one of them is narrowed below that, this goes red, and the trigger has to
-- become a definer (CD-S1-17).
select set_eq(
  $$select tablename::text || ' ' || qual from pg_policies
     where schemaname = 'public' and cmd = 'SELECT'
       and tablename in ('stays', 'reservations', 'folios', 'business_day_closes')
       and policyname <> 'stays_read_own'$$,
  array['stays (property_id IN ( SELECT app.accessible_property_ids() AS accessible_property_ids))',
        'reservations (property_id IN ( SELECT app.accessible_property_ids() AS accessible_property_ids))',
        'folios (property_id IN ( SELECT app.accessible_property_ids() AS accessible_property_ids))',
        'business_day_closes (property_id IN ( SELECT app.accessible_property_ids() AS accessible_property_ids))'],
  'the counts see every row the Property has, and the date guard every close: Staff read all four by reach alone');

select is_empty(
  $$select tablename || ' ' || policyname from pg_policies
     where schemaname = 'public' and permissive = 'RESTRICTIVE'
       and tablename in ('stays', 'reservations', 'folios', 'business_day_closes')$$,
  'and no restrictive policy narrows any of them');

set local role ranza_app;

-- ---------------------------------------------------------------------------
-- When a day may close (TIME)
-- ---------------------------------------------------------------------------

select app.set_request_context('bd100000-0000-4000-8000-000000000001');

select throws_like(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000001',
            app.property_today('bd200000-0000-4000-8000-000000000001'))$$,
  '%has not ended%',
  'refuses to close a day whose cutoff has not passed');

select throws_like(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000001',
            app.property_today('bd200000-0000-4000-8000-000000000001') + 1)$$,
  '%has not ended%',
  'refuses to close a day that has not begun');

select throws_like(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000001',
            app.property_today('bd200000-0000-4000-8000-000000000001') - 2)$$,
  '%first close%',
  'the first close cannot reach back past yesterday');

select lives_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000001',
            app.property_today('bd200000-0000-4000-8000-000000000001') - 1)$$,
  'the first close at a Property is the day before today');

select is(
  (select row(closed_by, closed_by_job, reason, exceptions)::text
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000001'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000001') - 1),
  row('bd100000-0000-4000-8000-000000000001'::uuid, null::text, null::text,
      '[]'::jsonb)::text,
  'a quiet day closes without a reason, naming who closed it');

select is(
  (select row(arrived, departed, nights_occupied, folios_left_open)::text
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000001'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000001') - 1),
  '(0,0,0,1)',
  'a Folio left open is counted and does not block');

select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000001',
            app.property_today('bd200000-0000-4000-8000-000000000001') - 1)$$,
  '23505', null,
  'two desks closing one day make one close');

select throws_like(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000003',
            app.property_today('bd200000-0000-4000-8000-000000000003') - 3)$$,
  '%waits for%',
  'a day waits for the day before it');

select lives_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000003',
            app.property_today('bd200000-0000-4000-8000-000000000003') - 4)$$,
  'and closes once the day before it has');

select throws_like(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000003',
            app.property_today('bd200000-0000-4000-8000-000000000003') - 8)$$,
  '%before the first close%',
  'a day before the first close cannot be closed after it');

-- ---------------------------------------------------------------------------
-- What is open, and what a close records
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000002',
            app.property_today('bd200000-0000-4000-8000-000000000002') - 1)$$,
  '23514', null,
  'items left open need a reason');

select lives_ok(
  $$insert into public.business_day_closes
      (organization_id, property_id, business_date, reason)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000002',
            app.property_today('bd200000-0000-4000-8000-000000000002') - 1,
            'Guest in 8 extends by phone; booking 1 arrives tomorrow')$$,
  'a close with a reason is accepted with items open');

select set_eq(
  $$select item ->> 'kind' || ' ' || coalesce(item ->> 'reservationId', item ->> 'stayId')
      from public.business_day_closes,
           jsonb_array_elements(exceptions) as item
     where property_id = 'bd200000-0000-4000-8000-000000000002'$$,
  array['not_arrived bd600000-0000-4000-8000-000000000001',
        'not_arrived bd600000-0000-4000-8000-000000000002',
        'not_departed bd500000-0000-4000-8000-000000000008'],
  'a close with a reason records what was left open');

select is(
  (select reason from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  'Guest in 8 extends by phone; booking 1 arrives tomorrow',
  'and the reason it was closed anyway');

select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000002',
            app.property_today('bd200000-0000-4000-8000-000000000002') - 1)$$,
  '23505', null,
  'a day already closed says so, even with items open and no reason given');

select ok(
  (select exceptions @> '[{"reservationId": "bd600000-0000-4000-8000-000000000002"}]'
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  'a requested booking whose night has come is open');

select ok(
  (select exceptions @> '[{"stayId": "bd500000-0000-4000-8000-000000000008"}]'
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  'a Guest in house past their departure is open');

select ok(
  (select not exceptions @> '[{"stayId": "bd500000-0000-4000-8000-000000000007"}]'
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  'a Guest due out today is not open for yesterday');

select ok(
  (select not exceptions @> '[{"stayId": "bd500000-0000-4000-8000-000000000006"}]'
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  'an open-ended Stay is never left open');

select ok(
  (select not exceptions @> '[{"reservationId": "bd600000-0000-4000-8000-000000000003"}]'
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  'a booking for a later night is not open');

select is(
  (select row(arrived, departed, nights_occupied, folios_left_open)::text
     from public.business_day_closes
    where property_id = 'bd200000-0000-4000-8000-000000000002'
      and business_date = app.property_today('bd200000-0000-4000-8000-000000000002') - 1),
  '(1,1,6,1)',
  'the close counts arrivals, departures and nights, a withdrawn check-in excluded');

-- ---------------------------------------------------------------------------
-- Nothing is dated on a closed day afterwards
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000005',
            app.property_today('bd200000-0000-4000-8000-000000000005') - 1)$$,
  'the withdrawal Property closes yesterday');

select throws_ok(
  $$update public.stays set status = 'cancelled', updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000011'$$,
  'RZ001', null,
  'a check-in on a closed day cannot be withdrawn');

select app.set_request_context('bd100000-0000-4000-8000-000000000006');
select throws_ok(
  $$update public.stays set status = 'cancelled', updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000011'$$,
  'RZ001', null,
  'nor by a role that cannot close a day: the guard sees every close by reach');
select app.set_request_context('bd100000-0000-4000-8000-000000000001');

select lives_ok(
  $$update public.stays set status = 'cancelled', updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000012'$$,
  'a check-in on an open day can still be withdrawn');

select throws_ok(
  $$update public.stays
       set status = 'departed',
           ends_on = app.property_today('bd200000-0000-4000-8000-000000000005') - 1,
           updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000013'$$,
  'RZ001', null,
  'a departure cannot land on a closed day');

select lives_ok(
  $$update public.stays
       set status = 'departed',
           ends_on = app.property_today('bd200000-0000-4000-8000-000000000005'),
           updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000013'$$,
  'and a departure today is recorded as ever');

select throws_ok(
  $$update public.stays
       set ends_on = app.property_today('bd200000-0000-4000-8000-000000000005') - 1,
           updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000013'$$,
  'RZ001', null,
  'a departure cannot be re-dated onto a closed day');

select throws_ok(
  $$update public.stays
       set ends_on = app.property_today('bd200000-0000-4000-8000-000000000005'),
           updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000014'$$,
  'RZ001', null,
  'nor off one: the day that counted it is closed');

select lives_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000004',
            app.property_today('bd200000-0000-4000-8000-000000000004') - 1)$$,
  'the clock Property closes yesterday');

-- ---------------------------------------------------------------------------
-- Who may close (ACCESS)
-- ---------------------------------------------------------------------------

select app.set_request_context('bd100000-0000-4000-8000-000000000002');
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1)$$,
  '42501', null,
  'a role without close_day cannot close: housekeeping');

select app.set_request_context('bd100000-0000-4000-8000-000000000003');
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1)$$,
  '42501', null,
  'a role without close_day cannot close: finance');

select app.set_request_context('bd100000-0000-4000-8000-000000000006');
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1)$$,
  '42501', null,
  'a role without close_day cannot close: an Organization''s check-in-only role');

select app.set_request_context('bd100000-0000-4000-8000-000000000005');
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') + 5)$$,
  '42501', null,
  'another Organization''s day is refused like one that does not exist, whatever day is named');

select app.set_request_context('bd100000-0000-4000-8000-000000000004');
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1)$$,
  '42501', null,
  'a Property outside the closer''s reach is refused');

select set_eq(
  $$select property_id from public.business_day_closes$$,
  array['bd200000-0000-4000-8000-000000000002'::uuid],
  'closes are read only where the reader reaches: one Property reached, one Property''s closes');

select app.set_request_context('bd100000-0000-4000-8000-000000000001');
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000006',
            app.property_today('bd200000-0000-4000-8000-000000000006') - 1)$$,
  '42501', null,
  'a day cannot be closed without the front desk capability');

select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0c0000-0000-4000-8000-00000000000c', 'bd200000-0000-4000-8000-000000000009',
            app.property_today('bd200000-0000-4000-8000-000000000009') - 1)$$,
  '42501', null,
  'nor where the Subscription has lapsed');

select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0d0000-0000-4000-8000-00000000000d', 'bd200000-0000-4000-8000-000000000010',
            app.property_today('bd200000-0000-4000-8000-000000000010') - 1)$$,
  '42501', null,
  'nor where the Organization never bought the front desk');

select throws_ok(
  $$insert into public.business_day_closes
      (organization_id, property_id, business_date, arrived)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1, 40)$$,
  '42501', null,
  'a closer cannot supply the counts');

select throws_ok(
  $$update public.business_day_closes set reason = 'rewritten'
     where property_id = 'bd200000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a close is never rewritten by the desk');

select set_config('app.user_id', '', true);
select throws_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1)$$,
  '42501', null,
  'a ranza_app session with no user is refused: it may not even ask for a worker context');

select app.set_request_context('bd100000-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.business_day_closes (organization_id, property_id, business_date)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000008',
            app.property_today('bd200000-0000-4000-8000-000000000008') - 1)$$,
  'and the desk that holds close_day closes the same day');

-- Returns to whichever role connected: `ranza` locally, `postgres` on the
-- hosted database. Both bypass policies; neither bypasses a trigger.
set local role none;

select throws_ok(
  $$update public.business_day_closes set reason = 'rewritten'
     where property_id = 'bd200000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a close is never rewritten by anyone, the owner included');

select throws_ok(
  $$delete from public.business_day_closes
     where property_id = 'bd200000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'nor deleted');

-- A planned departure is not what a close counts — it counts an in-house Stay
-- by its status — so it may still move onto a closed day. The owner does it:
-- nothing in the product amends a Stay's dates yet.
select lives_ok(
  $$update public.stays
       set ends_on = app.property_today('bd200000-0000-4000-8000-000000000002') - 1
     where id = 'bd500000-0000-4000-8000-000000000004'$$,
  'an in-house Stay''s planned departure may still move onto a closed day');

select throws_ok(
  $$insert into public.stays
      (organization_id, property_id, accommodation_unit_id, stay_type, status,
       starts_on, ends_on)
    values ('bd0a0000-0000-4000-8000-00000000000a', 'bd200000-0000-4000-8000-000000000005',
            'bd300000-0000-4000-8000-000000000016', 'guest', 'in_house',
            app.property_today('bd200000-0000-4000-8000-000000000005') - 1,
            app.property_today('bd200000-0000-4000-8000-000000000005') + 2)$$,
  'RZ001', null,
  'a Stay cannot begin on a closed day, whoever writes it');

-- A Stay reserved before its day closed, begun after: reserved -> in_house is
-- the one change that begins a Stay without inserting one. No role may take it
-- yet, so the owner does; the reserved row is written in replica mode, as if it
-- had been there before the close.
set local session_replication_role = replica;
insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, stay_type, status,
   starts_on, ends_on)
values ('bd500000-0000-4000-8000-000000000020', 'bd0a0000-0000-4000-8000-00000000000a',
        'bd200000-0000-4000-8000-000000000005', 'bd300000-0000-4000-8000-000000000016',
        'guest', 'reserved',
        app.property_today('bd200000-0000-4000-8000-000000000005') - 1,
        app.property_today('bd200000-0000-4000-8000-000000000005') + 2);
set local session_replication_role = origin;

select throws_ok(
  $$update public.stays set status = 'in_house', updated_at = now()
     where id = 'bd500000-0000-4000-8000-000000000020'$$,
  'RZ001', null,
  'a Stay reserved for a closed day cannot be begun on it');

-- ---------------------------------------------------------------------------
-- The clock cannot be moved back onto a closed day
-- ---------------------------------------------------------------------------

select ok(
  (select morning is not null and west is not null from clock),
  'a morning zone and a zone west of it were found for the clock Property');

select throws_ok(
  $$update public.properties set business_date_cutoff = time '11:30'
     where id = 'bd200000-0000-4000-8000-000000000004'$$,
  'RZ001', null,
  'a cutoff cannot move today back onto a closed day');

select lives_ok(
  $$update public.properties set business_date_cutoff = time '03:30'
     where id = 'bd200000-0000-4000-8000-000000000004'$$,
  'a cutoff change that keeps today after the last close is allowed');

select throws_ok(
  $$update public.properties set timezone = (select west from clock)
     where id = 'bd200000-0000-4000-8000-000000000004'$$,
  'RZ001', null,
  'a time zone cannot move today back onto a closed day');

select is(
  (select business_date_cutoff from public.properties
    where id = 'bd200000-0000-4000-8000-000000000004'),
  time '03:30',
  'and the refused changes left the Property as it was');

select finish();
rollback;
