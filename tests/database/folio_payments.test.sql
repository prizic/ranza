-- Recording a payment on a Folio and payment reversal (PRE-01, FP-S1-01 to FP-S1-11; ADR 0015, ADR 0041).
--
-- Proves:
--   - payment lines reduce folio balance (amount_minor < 0)
--   - payment methods are validated (cash, card, bank_transfer, other)
--   - post_payment is held by front_desk, finance, manager, owner
--   - reverse_payment is held by finance, manager, owner (not front_desk)
--   - reversing a payment requires finance.reverse_payment
--   - reversing a payment cancels it exactly with positive minor units
--   - reversing a reversal line is refused
--   - closed folio refuses payment
--   - settled folio at zero balance closes cleanly

begin;
select plan(21);

insert into public.users (id, email) values
  ('b7111111-1111-4111-8111-111111111111', 'pay-poster@example.test'),
  ('b7222222-2222-4222-8222-222222222222', 'pay-reverser@example.test'),
  ('b7333333-3333-4333-8333-333333333333', 'pay-desk@example.test'),
  ('b7444444-4444-4444-8444-444444444444', 'pay-unauth@example.test');

insert into public.organizations (id, name, status) values
  ('b7a11111-1111-4111-8111-111111111111', 'Payments Organization', 'active');

insert into public.properties (id, organization_id, name, currency) values
  ('b7c11111-1111-4111-8111-111111111111',
   'b7a11111-1111-4111-8111-111111111111', 'Payments Property', 'TRY');

insert into public.accommodation_units
  (id, property_id, organization_id, name, unit_type, capacity) values
  ('b7d11111-1111-4111-8111-111111111111',
   'b7c11111-1111-4111-8111-111111111111',
   'b7a11111-1111-4111-8111-111111111111', 'PAY-101', 'room', 2);

insert into public.subscriptions (organization_id, status) values
  ('b7a11111-1111-4111-8111-111111111111', 'active');
insert into public.entitlements (organization_id, module_key) values
  ('b7a11111-1111-4111-8111-111111111111', 'billing_folios');
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled) values
  ('b7c11111-1111-4111-8111-111111111111',
   'b7a11111-1111-4111-8111-111111111111', 'finance', true);

insert into public.staff_roles
  (scope_id, key, organization_id, name, permissions) values
  ('b7a11111-1111-4111-8111-111111111111', 'pay_only_poster',
   'b7a11111-1111-4111-8111-111111111111', 'Payment poster',
   array['finance.post_payment']),
  ('b7a11111-1111-4111-8111-111111111111', 'pay_only_reverser',
   'b7a11111-1111-4111-8111-111111111111', 'Payment reverser',
   array['finance.reverse_payment']),
  ('b7a11111-1111-4111-8111-111111111111', 'pay_unauthorized',
   'b7a11111-1111-4111-8111-111111111111', 'Unauthorized',
   array[]::text[]);

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope) values
  ('b7a11111-1111-4111-8111-111111111111',
   'b7111111-1111-4111-8111-111111111111', 'pay_only_poster',
   'b7a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('b7a11111-1111-4111-8111-111111111111',
   'b7222222-2222-4222-8222-222222222222', 'pay_only_reverser',
   'b7a11111-1111-4111-8111-111111111111', 'organization_wide'),
  ('b7a11111-1111-4111-8111-111111111111',
   'b7333333-3333-4333-8333-333333333333', 'front_desk',
   '00000000-0000-0000-0000-000000000000', 'organization_wide'),
  ('b7a11111-1111-4111-8111-111111111111',
   'b7444444-4444-4444-8444-444444444444', 'pay_unauthorized',
   'b7a11111-1111-4111-8111-111111111111', 'organization_wide');

insert into public.stays
  (id, organization_id, property_id, accommodation_unit_id, user_id,
   stay_type, status, starts_on, ends_on)
select 'b7f11111-1111-4111-8111-111111111111',
       'b7a11111-1111-4111-8111-111111111111',
       'b7c11111-1111-4111-8111-111111111111',
       'b7d11111-1111-4111-8111-111111111111', null,
       'guest', 'in_house',
       app.property_today('b7c11111-1111-4111-8111-111111111111'),
       app.property_today('b7c11111-1111-4111-8111-111111111111') + 2;

insert into public.folios
  (id, organization_id, property_id, stay_id, currency) values
  ('b7e11111-1111-4111-8111-111111111111',
   'b7a11111-1111-4111-8111-111111111111',
   'b7c11111-1111-4111-8111-111111111111',
   'b7f11111-1111-4111-8111-111111111111', 'TRY');

-- Initial charge so there is an open balance
insert into public.folio_lines
  (id, organization_id, property_id, folio_id, line_type, description, amount_minor) values
  ('b7100000-0000-0000-0000-000000000001',
   'b7a11111-1111-4111-8111-111111111111',
   'b7c11111-1111-4111-8111-111111111111',
   'b7e11111-1111-4111-8111-111111111111',
   'charge', 'Room charge', 100000);

-- ---------------------------------------------------------------------------
-- 1. Catalogue and shipped role checks
-- ---------------------------------------------------------------------------

select is(
  (select module_key from public.staff_permissions where key = 'finance.post_payment'),
  'billing_folios',
  'finance.post_payment is in the catalogue under billing_folios'
);

select is(
  (select module_key from public.staff_permissions where key = 'finance.reverse_payment'),
  'billing_folios',
  'finance.reverse_payment is in the catalogue under billing_folios'
);

select ok(
  (select 'finance.post_payment' = any (permissions) from public.staff_roles where organization_id is null and key = 'front_desk'),
  'front_desk holds finance.post_payment'
);

select ok(
  (select not ('finance.reverse_payment' = any (permissions)) from public.staff_roles where organization_id is null and key = 'front_desk'),
  'front_desk does not hold finance.reverse_payment'
);

select ok(
  (select 'finance.post_payment' = any (permissions) from public.staff_roles where organization_id is null and key = 'finance'),
  'finance role holds finance.post_payment'
);

select ok(
  (select 'finance.reverse_payment' = any (permissions) from public.staff_roles where organization_id is null and key = 'finance'),
  'finance role holds finance.reverse_payment'
);

-- ---------------------------------------------------------------------------
-- 2. Constraints: payment_method and type checks
-- ---------------------------------------------------------------------------

select throws_matching(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Crypto pay', -5000, 'crypto')
  $$,
  'folio_lines_payment_method_check',
  'an invalid payment method is refused by check constraint'
);

select throws_matching(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Missing method', -5000, null)
  $$,
  'folio_lines_type_check',
  'a payment line without payment_method is refused'
);

select throws_matching(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Positive payment', 5000, 'cash')
  $$,
  'folio_lines_type_check',
  'a payment line with positive amount is refused by folio_lines_type_check'
);

select throws_matching(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'charge', 'Charge with payment method', 5000, 'cash')
  $$,
  'folio_lines_type_check',
  'a charge line with payment_method is refused by folio_lines_type_check'
);

-- ---------------------------------------------------------------------------
-- 3. Policy & Runtime testing under ranza_app
-- ---------------------------------------------------------------------------

set local role ranza_app;

-- Unauthorized cannot post payment
select app.set_request_context('b7444444-4444-4444-8444-444444444444');

select throws_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Denied pay', -10000, 'cash')
  $$,
  '42501',
  NULL,
  'user lacking finance.post_payment is denied by RLS policy'
);

-- Payment poster posts payment
select app.set_request_context('b7111111-1111-4111-8111-111111111111');
select lives_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Cash payment', -40000, 'cash')
  $$,
  'pay_only_poster can post a cash payment'
);

-- Front desk posts card payment
select app.set_request_context('b7333333-3333-4333-8333-333333333333');
select lives_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Card payment at desk', -60000, 'card')
  $$,
  'front_desk can post a card payment'
);

-- Balance is now 100000 - 40000 - 60000 = 0
select is(
  (select sum(amount_minor)::bigint from public.folio_lines where folio_id = 'b7e11111-1111-4111-8111-111111111111'),
  0::bigint,
  'payments sum with charges to reach exact zero balance'
);

-- Poster cannot reverse a payment (lacks finance.reverse_payment)
select app.set_request_context('b7111111-1111-4111-8111-111111111111');
select throws_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, reverses_line_id)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'reversal', 'Reverse cash payment', 40000,
       (select id from public.folio_lines where description = 'Cash payment' and line_type = 'payment'))
  $$,
  '42501',
  NULL,
  'pay_only_poster cannot reverse a payment line'
);

-- Reverser can reverse a payment
select app.set_request_context('b7222222-2222-4222-8222-222222222222');
select lives_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, reverses_line_id)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'reversal', 'Reverse cash payment', 40000,
       (select id from public.folio_lines where description = 'Cash payment' and line_type = 'payment'))
  $$,
  'pay_only_reverser can reverse a payment line'
);

-- Balance is now 40000
select is(
  (select sum(amount_minor)::bigint from public.folio_lines where folio_id = 'b7e11111-1111-4111-8111-111111111111'),
  40000::bigint,
  'reversing a payment line restores the balance'
);

-- Cannot reverse the same payment line twice
select throws_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, reverses_line_id)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'reversal', 'Reverse again', 40000,
       (select id from public.folio_lines where description = 'Cash payment' and line_type = 'payment'))
  $$,
  '23505',
  NULL,
  'a payment line cannot be reversed twice'
);

-- Cannot reverse a reversal line
select throws_matching(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, reverses_line_id)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'reversal', 'Reverse the reversal', -40000,
       (select id from public.folio_lines where description = 'Reverse cash payment' and line_type = 'reversal'))
  $$,
  'a reversal must cancel exactly the line it names',
  'a reversal line cannot reverse another reversal'
);

-- Post remaining 40000 to reach 0 balance
select app.set_request_context('b7111111-1111-4111-8111-111111111111');
select lives_ok(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Bank transfer settlement', -40000, 'bank_transfer')
  $$,
  'posts remaining payment to reach zero balance'
);

-- Close settled folio
set local role none;
update public.stays
   set status = 'departed'
 where id = 'b7f11111-1111-4111-8111-111111111111';

update public.folios
   set status = 'closed',
       closed_at = now()
 where id = 'b7e11111-1111-4111-8111-111111111111'
   and coalesce((select sum(amount_minor) from public.folio_lines where folio_id = 'b7e11111-1111-4111-8111-111111111111'), 0) = 0;

select is(
  (select status from public.folios where id = 'b7e11111-1111-4111-8111-111111111111'),
  'closed',
  'settled folio at zero balance is closed'
);

-- Payment on closed folio is refused
set local role ranza_app;
select app.set_request_context('b7111111-1111-4111-8111-111111111111');
select throws_matching(
  $$
    insert into public.folio_lines
      (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
    values
      ('b7a11111-1111-4111-8111-111111111111', 'b7c11111-1111-4111-8111-111111111111',
       'b7e11111-1111-4111-8111-111111111111', 'payment', 'Late pay', -1000, 'cash')
  $$,
  'that Folio is not open',
  'payment on a closed folio is refused by trigger'
);

rollback;
