-- What state an invitation link is in, for the page behind it (PEOPLE-01).
--
-- app.staff_invitation_state() lets somebody holding a link be told why it does
-- not work, which app.accept_staff_invitation() deliberately cannot. What makes
-- that safe is what these hold: it answers only to the digest of a token, it
-- tells a digest that matches nothing from nothing at all, and it reads — it
-- never marks a lapsed invitation expired, which accepting does.
--
-- Its own suite, as staff_invitation_bounds is: every row is written for the
-- assertion that reads it.
--
-- Watched go red by dropping the invitation.token_hash predicate (every
-- assertion that names a digest then returned somebody else's row or all of
-- them), by returning `invitation.status` unchanged (the expired and
-- membership_revoked assertions failed), and by granting execute to public (the
-- grant assertion failed). The break was printed from pg_proc before each run.

begin;

select plan(13);

insert into public.users (id, email) values
  ('c1111111-1111-4111-8111-111111111111', 'link-pending@example.test'),
  ('c2222222-2222-4222-8222-222222222222', 'link-expired@example.test'),
  ('c3333333-3333-4333-8333-333333333333', 'link-accepted@example.test'),
  ('c4444444-4444-4444-8444-444444444444', 'link-withdrawn@example.test'),
  ('c5555555-5555-4555-8555-555555555555', 'link-revoked@example.test'),
  ('c6666666-6666-4666-8666-666666666666', 'link-has-login@example.test'),
  ('c9999999-9999-4999-8999-999999999999', 'link-inviter@example.test');

insert into public.organizations (id, name, status) values
  ('c0000000-0000-4000-8000-000000000001', 'Link Organization', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, role_scope_id, access_scope, status, revoked_at) values
  ('c0000000-0000-4000-8000-000000000001', 'c1111111-1111-4111-8111-111111111111',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'active', null),
  ('c0000000-0000-4000-8000-000000000001', 'c2222222-2222-4222-8222-222222222222',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'active', null),
  ('c0000000-0000-4000-8000-000000000001', 'c3333333-3333-4333-8333-333333333333',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'active', null),
  ('c0000000-0000-4000-8000-000000000001', 'c4444444-4444-4444-8444-444444444444',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'revoked', now()),
  ('c0000000-0000-4000-8000-000000000001', 'c5555555-5555-4555-8555-555555555555',
   'front_desk', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'revoked', now()),
  ('c0000000-0000-4000-8000-000000000001', 'c6666666-6666-4666-8666-666666666666',
   'manager', '00000000-0000-0000-0000-000000000000', 'assigned_properties', 'active', null);

insert into public.staff_invitations
  (organization_id, user_id, token_hash, status, expires_at, invited_by, accepted_at) values
  ('c0000000-0000-4000-8000-000000000001', 'c1111111-1111-4111-8111-111111111111',
   'digest-pending', 'pending', now() + interval '1 day', 'c9999999-9999-4999-8999-999999999999', null),
  ('c0000000-0000-4000-8000-000000000001', 'c2222222-2222-4222-8222-222222222222',
   'digest-expired', 'pending', now() - interval '1 hour', 'c9999999-9999-4999-8999-999999999999', null),
  ('c0000000-0000-4000-8000-000000000001', 'c3333333-3333-4333-8333-333333333333',
   'digest-accepted', 'accepted', now() + interval '1 day', 'c9999999-9999-4999-8999-999999999999', now()),
  ('c0000000-0000-4000-8000-000000000001', 'c4444444-4444-4444-8444-444444444444',
   'digest-withdrawn', 'withdrawn', now() + interval '1 day', 'c9999999-9999-4999-8999-999999999999', null),
  ('c0000000-0000-4000-8000-000000000001', 'c5555555-5555-4555-8555-555555555555',
   'digest-revoked', 'pending', now() + interval '1 day', 'c9999999-9999-4999-8999-999999999999', null),
  ('c0000000-0000-4000-8000-000000000001', 'c6666666-6666-4666-8666-666666666666',
   'digest-has-login', 'pending', now() + interval '1 day', 'c9999999-9999-4999-8999-999999999999', null);

insert into public.auth_identities (user_id, issuer, subject) values
  ('c6666666-6666-4666-8666-666666666666', 'better-auth', 'link-has-login-subject');

-- Catalogue reads, so a missing function is a failing assertion and not a raise
-- that silences the rest of the suite.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'staff_invitation_state'
      and p.prosecdef and p.provolatile = 's'
      and array_to_string(p.proconfig, ',') = 'search_path=""'),
  1,
  'the function is a stable security definer with an empty search_path');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'staff_invitation_state'
      and p.proacl::text ~ 'ranza_app=X'
      and p.proacl::text !~ '(^|[{,])=X'
      and p.proacl::text !~ 'ranza_worker=X'
      and p.proacl::text !~ 'ranza_auth=X'),
  1,
  'it is executable by ranza_app and by nobody else');

set local role ranza_app;

select is(
  (select state from app.staff_invitation_state('digest-pending')),
  'pending', 'a link nobody has used is pending');
select is(
  (select state from app.staff_invitation_state('digest-expired')),
  'expired', 'a pending link past its week is expired');
select is(
  (select state from app.staff_invitation_state('digest-accepted')),
  'accepted', 'a used link is accepted');
select is(
  (select state from app.staff_invitation_state('digest-withdrawn')),
  'withdrawn', 'a link withdrawn with the revoke is withdrawn, not "revoked"');
select is(
  (select state from app.staff_invitation_state('digest-revoked')),
  'membership_revoked', 'a still-pending link of a revoked membership says so');
select is(
  (select count(*)::int from app.staff_invitation_state('digest-nobody-was-given')),
  0, 'a digest that matches nothing returns no row at all');

select is(
  (select email || '|' || organization_name || '|' || role_key || '|' || role_name
     from app.staff_invitation_state('digest-pending')),
  'link-pending@example.test|Link Organization|front_desk|Front desk',
  'it names the address, the Organization and the role the link is for');

select is(
  (select has_login from app.staff_invitation_state('digest-has-login')),
  true, 'it says when the person can already sign in');
select is(
  (select has_login from app.staff_invitation_state('digest-pending')),
  false, 'and when they cannot');

select is(
  (select user_id from app.staff_invitation_state('digest-pending')),
  'c1111111-1111-4111-8111-111111111111'::uuid,
  'the Ranza user is what the host needs to tie a new login to');

reset role;

-- Reading is not accepting: the lapsed pending row is left pending, where
-- accept_staff_invitation() would have marked it expired on its way past.
select is(
  (select status from public.staff_invitations where token_hash = 'digest-expired'),
  'pending',
  'reading a lapsed link does not mark it expired');

select * from finish();

rollback;
