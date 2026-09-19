-- A definer that did not check its caller.
--
-- `app.identify_staff_user(text)` was security definer, granted to ranza_app,
-- and asked nothing about who was calling. It returned the user id when an
-- address already had one and INSERTed a public.users row when it did not. So
-- any path holding the runtime role could ask whether an address has an
-- account, and could write rows into the table the application treats as the
-- list of people.
--
-- The membership INSERT that follows it is policy-gated and would refuse. That
-- is not a defence: the definer runs first, and its side effect has already
-- happened by the time the policy speaks. SP-S1-04 says an invite into an
-- Organization the actor does not reach is "refused and indistinguishable from
-- the Organization not existing", and a refusal that leaves a new row behind is
-- not that.
--
-- This is the rule the Guest summary already follows and the reason ADR 0012
-- gives: a definer bypasses row-level security, so it asks the question the
-- policy would have asked, itself, before it does anything.
--
-- The signature changes, so the old function is dropped rather than replaced —
-- `create or replace function` cannot change a return type or an argument list,
-- and a script that ignores that failure leaves the original in place.

drop function if exists app.identify_staff_user(text);

create function app.identify_staff_user(
  target_organization_id uuid,
  candidate_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(btrim(candidate_email));
  found uuid;
begin
  -- Both gates the membership INSERT would apply, asked before the lookup and
  -- before the insert, because both side effects are the problem.
  --
  -- The capability is here and not only the permission on purpose. Checking
  -- the permission alone would leave the identical defect for an Organization
  -- whose Subscription has lapsed: the caller is an administrator, the policy
  -- refuses on the commercial gate, and a users row is written anyway. Inviting
  -- is commercially gated (SP-S1-21), so identifying the invitee is too.
  if not (
    app.has_organization_permission(target_organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          target_organization_id, 'platform_core', 'staff_administration')
  ) then
    -- One answer for "not yours", "no such Organization" and "no longer paid".
    -- Telling them apart would confirm which Organizations exist, which is what
    -- SP-S1-04 forbids.
    raise exception 'that Organization is not yours to add staff to'
      using errcode = '42501';
  end if;

  if normalized = '' or normalized not like '%_@_%' then
    raise exception 'an invitation needs an email address'
      using errcode = '22023';
  end if;

  select id into found from public.users where lower(email) = normalized;
  if found is not null then
    return found;
  end if;

  insert into public.users (email) values (normalized) returning id into found;
  return found;
end;
$$;

comment on function app.identify_staff_user(uuid, text) is
  'The one place staff invitation reaches public.users. Creates a person with '
  'no credential; signing in still requires an account Better Auth owns. Takes '
  'the Organization because it is security definer: it asks the permission and '
  'capability the membership policy would ask, before either of its own side '
  'effects — returning whether an address is known, and writing a row.';

revoke execute on function app.identify_staff_user(uuid, text) from public;
grant execute on function app.identify_staff_user(uuid, text) to ranza_app;

-- ---------------------------------------------------------------------------
-- What accepting an invitation does, said out loud
-- ---------------------------------------------------------------------------
-- No behaviour changes here. The comment was incomplete in a way that would
-- mislead somebody reading the table: the first statement in the function marks
-- a matching lapsed invitation 'expired', so `updated_at` on an expired row
-- records when somebody last presented the link, not when it lapsed. Anybody
-- reasoning about when an invitation went stale from that column would be
-- reading the wrong event.
--
-- The comment is re-issued here rather than edited in 20260916002200, which has
-- been applied. An applied migration is never edited, comments included.
comment on function app.accept_staff_invitation(text) is
  'Accepts a pending invitation by token hash and stamps the membership. '
  'Returns no row for withdrawn, expired, already used and never existed '
  'alike — one answer, so the link cannot be used to discover which '
  'Organizations invited which addresses. Side effect worth knowing: a lapsed '
  'pending invitation matching the hash is marked expired first, so updated_at '
  'on an expired row is when somebody last tried the link, not when it lapsed. '
  'Presenting the token is not how membership is granted: the membership is '
  'written active at invite time (SP-S1-01) and acceptance only records that '
  'it happened (SP-S1-07), so nothing here is an authorization boundary.';
