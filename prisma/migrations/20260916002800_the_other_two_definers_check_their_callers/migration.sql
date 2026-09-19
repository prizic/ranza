-- The other two definers that write.
--
-- `20260916002700` established the rule and applied it to one function:
-- a SECURITY DEFINER runs as its owner, whose role carries `BYPASSRLS` in every
-- environment this runs in — `ranza` is the superuser locally and `postgres`
-- has the flag on the hosted database — so the policies it would have obeyed do
-- not apply, and whatever gate they carried it carries itself or it carries not
-- at all. That migration fixed `app.identify_staff_user()`.
--
-- Two others write and were left. They were not missed by a person: IG-12's
-- sweep in `tests/database/insert_grants.test.sql` named them the moment
-- `chore/insert-grants` merged into this branch, which is what the sweep is
-- for. Neither branch's CI could see it — that suite did not exist on this
-- branch, and these functions did not exist on that one.
--
-- They are not the same size and are not written as though they were.

-- ---------------------------------------------------------------------------
-- app.end_sessions_for(uuid) — a real hole, and the larger of the two
-- ---------------------------------------------------------------------------
--
-- It deletes rows from `public.auth_session` for whatever user id it is handed.
-- The defence was the grant: `ranza_worker` may execute it, `ranza_app` may
-- not, and `ranza_worker` holds nothing on the credential tables. That bounds
-- WHO may call it and says nothing about WHICH user they may name. A worker
-- process with one wrong id in a payload signs out somebody in another
-- Organization, and the only thing that would have refused is the thing this
-- function exists to avoid needing.
--
-- Two checks, and the second is the one that binds the parameter.
--
-- The worker context first. `app.set_worker_context()` is executable by
-- `ranza_worker` and revoked from everybody else (20260916001400), so a caller
-- without one has not come through the dispatcher — `dispatch.ts` sets it from
-- the event's Organization before the handler runs. This is a caller check that
-- reads no tenant table, so it cannot quietly stop applying.
--
-- Then the target. Ending sessions is only ever the consequence of a reach
-- change inside one Organization, so the user named must be somebody that
-- Organization has. **Every status, not `active`** — a reach change is very
-- often a revocation, and a membership already revoked is precisely the case
-- this runs for. Narrowing to `active` would leave the check in place, passing,
-- and inert exactly when it matters, which is the shape AGENTS.md names.

create or replace function app.end_sessions_for(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  ended integer;
begin
  if acting_organization is null then
    raise exception 'ending sessions requires a worker context'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.organization_memberships as membership
     where membership.user_id = target_user_id
       and membership.organization_id = acting_organization
  ) then
    -- Deliberately not silent. A payload naming somebody this Organization
    -- does not employ is a publisher defect, and the handler already treats
    -- one of those as a reason to fail the delivery rather than mark it done.
    raise exception 'that user is not in the Organization this job is for'
      using errcode = '42501';
  end if;

  -- `auth_session."userId"` is the provider's subject, not a Ranza user id.
  -- The mapping is `public.auth_identities`, which is the indirection ADR 0005
  -- exists to keep in one place.
  with subjects as (
    select identity.subject
    from public.auth_identities as identity
    where identity.user_id = target_user_id
  )
  delete from public.auth_session as session
  using subjects
  where session."userId" = subjects.subject;

  get diagnostics ended = row_count;
  return ended;
end;
$$;

comment on function app.end_sessions_for(uuid) is
  'Ends every session a Ranza user holds. The whole of what ranza_worker may '
  'do to the credential tables: no grant, no token, no way to ask who is '
  'signed in. Refuses outside a worker context, and refuses a user the '
  'context''s Organization does not have — the grant bounds who calls it, '
  'these bound which user they may name.';

-- ---------------------------------------------------------------------------
-- app.accept_staff_invitation(text) — a tripwire, and said as one
-- ---------------------------------------------------------------------------
--
-- This one closes no hole, and writing it as though it did would be the more
-- expensive mistake. Accepting grants nothing: the membership is written
-- active at invite time (SP-S1-01) and acceptance only records that it
-- happened (SP-S1-07). Somebody holding another person's token can stamp
-- `accepted_at` on a membership that was already working and gain nothing
-- whatsoever for themselves — 20260916002700 said so in this function's own
-- comment, and that reasoning is still correct.
--
-- What changes is that it stops being a definer that writes and asks nothing,
-- so the sweep can assert zero rather than keep a list of exceptions. The
-- check is chosen to be one that actually fires: the flow deliberately runs
-- with **no** request context, because the invitee may not be able to sign in
-- yet and the token is the authentication. So the rule is conditional — if a
-- context is set at all, it must be the invitee's — and the arm with no
-- context, which is how `staff/src/module.ts` calls it, is untouched.
--
-- It refuses only when an invitation actually matches. A token that matches
-- nothing still returns no row rather than an error, because "withdrawn,
-- expired, already used and never existed" are deliberately one answer, and an
-- error that arrived only for real tokens would tell them apart.

create or replace function app.accept_staff_invitation(candidate_token_hash text)
returns table (organization_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_user uuid := app.current_user_id();
  invited_user uuid;
begin
  if acting_user is not null then
    select invitation.user_id into invited_user
      from public.staff_invitations as invitation
     where invitation.token_hash = candidate_token_hash
       and invitation.status = 'pending';

    if invited_user is not null and invited_user <> acting_user then
      raise exception 'that invitation is not yours to accept'
        using errcode = '42501';
    end if;
  end if;

  update public.staff_invitations as invitation
     set status = 'expired', updated_at = now()
   where invitation.token_hash = candidate_token_hash
     and invitation.status = 'pending'
     and invitation.expires_at <= now();

  return query
  with accepted as (
    update public.staff_invitations as invitation
       set status = 'accepted', accepted_at = now(), updated_at = now()
     where invitation.token_hash = candidate_token_hash
       and invitation.status = 'pending'
       and invitation.expires_at > now()
    returning invitation.organization_id, invitation.user_id
  ), noted as (
    update public.organization_memberships as membership
       set accepted_at = coalesce(membership.accepted_at, now()),
           updated_at = now()
      from accepted
     where membership.organization_id = accepted.organization_id
       and membership.user_id = accepted.user_id
       and membership.status = 'active'
    returning membership.organization_id, membership.user_id
  )
  select noted.organization_id, noted.user_id from noted;
end;
$$;

comment on function app.accept_staff_invitation(text) is
  'Accepts a pending invitation by token hash and stamps the membership. '
  'Returns no row for withdrawn, expired, already used and never existed '
  'alike — one answer, so the link cannot be used to discover which '
  'Organizations invited which addresses. Side effect worth knowing: a lapsed '
  'pending invitation matching the hash is marked expired first, so updated_at '
  'on an expired row is when somebody last tried the link, not when it lapsed. '
  'Presenting the token is not how membership is granted: the membership is '
  'written active at invite time (SP-S1-01) and acceptance only records that '
  'it happened (SP-S1-07), so nothing here is an authorization boundary. The '
  'caller check is a tripwire on top of that, not the boundary: the flow runs '
  'with no request context, and if one is ever set it must be the invitee''s.';
