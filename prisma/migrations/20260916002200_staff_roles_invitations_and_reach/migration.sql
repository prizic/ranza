-- Staff and permissions, slice 1: the roster and reach.
--
-- Who works for an Organization, what they may do, and which Properties they
-- reach. The design is `docs/features/staff-and-permissions/` — every object
-- below names the row of `edge-cases.csv` that asked for it.
--
-- Two things already existed and are extended rather than replaced:
-- `organization_memberships` and `property_assignments` have carried reach
-- since the foundation migration, but only ever written by a seed or a fixture.
-- This is where they become things a Staff Member can change, which means they
-- acquire write policies, column grants and a history (ADR 0012).

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- A role is a **named set of permissions**, not a label. That is the decision
-- and not a later upgrade: `permissions` exists from the first migration, and
-- slice 2's catalogue is what will constrain the strings that may go in it.
--
-- `organization_id` is null for the roles Ranza ships, which every Organization
-- shares and none may edit (SP-S3-05). A nullable column cannot carry a foreign
-- key, so the same fact is also stored as `scope_id`, which is the Organization
-- or the nil uuid, and it is `scope_id` the composite key is built on. The
-- check keeps the two in step; nothing else may write either.
create table public.staff_roles (
  scope_id        uuid not null,
  key             text not null,
  organization_id uuid
    references public.organizations (id) on delete restrict,
  name            text not null,
  -- Slice 1 knows one permission, 'staff.administer'. Slice 2 enumerates the
  -- rest and adds the constraint that keeps a typo out of this array.
  permissions     text[] not null default '{}',
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (scope_id, key),
  constraint staff_roles_scope_matches_organization
    check (scope_id = coalesce(organization_id,
                               '00000000-0000-0000-0000-000000000000'::uuid)),
  -- SP-S3-03: a new set of permissions is a new role, and a role is named.
  constraint staff_roles_name_is_present check (btrim(name) <> ''),
  constraint staff_roles_status_check check (status in ('active', 'retired')),
  -- SP-S3-06: a shipped role arrives in a release. It is never retired by an
  -- Organization, and there is no other way to write this table.
  constraint staff_roles_shipped_is_never_retired
    check (organization_id is not null or status = 'active')
);

-- SP-S3-04: a name is unique within the Organization. Shipped roles share one
-- scope, so this also stops two shipped roles colliding.
create unique index staff_roles_scope_name_key
  on public.staff_roles (scope_id, name);

comment on table public.staff_roles is
  'A named set of permissions. organization_id null means Ranza ships it and '
  'every Organization shares it; scope_id is the same fact in a shape a '
  'composite foreign key can carry.';

-- The roles Ranza ships. Slice 1 only knows whether a role may administer
-- staff; the rest of each set arrives with the catalogue in slice 2.
insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
values
  ('00000000-0000-0000-0000-000000000000', 'owner',        null, 'Owner',        array['staff.administer']),
  ('00000000-0000-0000-0000-000000000000', 'manager',      null, 'Manager',      array['staff.administer']),
  ('00000000-0000-0000-0000-000000000000', 'front_desk',   null, 'Front desk',   '{}'),
  ('00000000-0000-0000-0000-000000000000', 'housekeeping', null, 'Housekeeping', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'finance',      null, 'Finance',      '{}');

-- ---------------------------------------------------------------------------
-- Memberships grow a role reference, and a history
-- ---------------------------------------------------------------------------

-- Anything already in this table names a shipped role, because until this
-- migration there were no others. That is what the default records, and it is
-- also what keeps a membership written without a scope honest: the nil uuid is
-- not a shorthand for "unknown", it is the Organization every shipped role
-- belongs to.
alter table public.organization_memberships
  add column role_scope_id uuid not null
    default '00000000-0000-0000-0000-000000000000'::uuid,
  add column accepted_at timestamptz,
  add column revoked_at  timestamptz,
  add column updated_at  timestamptz not null default now();

-- Any membership predating this migration names a role that must now exist.
-- 'staff' was a fixture's word for somebody without authority; front_desk is
-- the shipped role that means it.
update public.organization_memberships set role = 'front_desk'
where role not in (select key from public.staff_roles
                   where organization_id is null);

-- A role was three words in a check constraint. It is now a row, so the check
-- is what would stop an Organization authoring one of its own (SP-S3-08) and
-- the foreign key above is what proves the role exists.
alter table public.organization_memberships
  drop constraint organization_memberships_role_check;

alter table public.organization_memberships
  -- SP-S1-10: the role must be this Organization's own or one Ranza ships.
  -- Two constraints together make another Organization's role unrepresentable:
  -- the check bounds which scope may be named, the foreign key proves the role
  -- actually lives in the scope named. Neither is sufficient alone.
  add constraint organization_memberships_role_scope_check
    check (role_scope_id in (organization_id,
                             '00000000-0000-0000-0000-000000000000'::uuid)),
  add constraint organization_memberships_role_fkey
    foreign key (role_scope_id, role)
    references public.staff_roles (scope_id, key) on delete restrict,
  -- SP-S1-14/15: the undo window is measured from this, so it is not optional.
  add constraint organization_memberships_revoked_at_check
    check ((status = 'revoked') = (revoked_at is not null));

comment on column public.organization_memberships.accepted_at is
  'When they set a password. Null while an invitation is outstanding — the '
  'membership is active either way, because it was never waiting on it '
  '(SP-S1-07).';

alter table public.property_assignments
  add column revoked_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table public.property_assignments
  add constraint property_assignments_revoked_at_check
    check ((status = 'revoked') = (revoked_at is not null));

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

-- An invitation is the way to a password and nothing else (SP-S1-07). The
-- membership it belongs to is active from the moment it is written, so nothing
-- here grants reach and losing one costs nobody their job.
--
-- The token is stored as a SHA-256 digest. The plaintext is returned once, to
-- the person who created the invitation, and never again — there is no
-- Notifications module to send it (blueprint 5.12, SP-S1-26), so a human
-- passes it on, and a table full of live credentials is not the price of that.
create table public.staff_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id         uuid not null,
  token_hash      text not null unique,
  status          text not null default 'pending',
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  invited_by      uuid not null references public.users (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (organization_id, user_id)
    references public.organization_memberships (organization_id, user_id)
    on delete restrict,
  constraint staff_invitations_status_check
    check (status in ('pending', 'accepted', 'withdrawn', 'expired')),
  constraint staff_invitations_accepted_at_check
    check ((status = 'accepted') = (accepted_at is not null))
);

-- SP-S1-16: re-inviting writes a fresh invitation against the same membership,
-- so there are several over time and at most one of them is live.
create unique index staff_invitations_pending_key
  on public.staff_invitations (organization_id, user_id) where status = 'pending';

create index staff_invitations_organization_idx
  on public.staff_invitations (organization_id);

-- ---------------------------------------------------------------------------
-- What a Staff Member may do
-- ---------------------------------------------------------------------------

-- security definer for the same reason as app.accessible_organization_ids():
-- a policy has to consult membership and role rows without the caller holding
-- read access to them, and a policy on organization_memberships cannot read
-- organization_memberships through the same policy.
--
-- This is the shape slice 2 generalizes. Slice 1 asks it exactly one question —
-- may this person administer staff — and slice 2 asks it the rest.
create function app.has_organization_permission(
  target_organization_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    join public.staff_roles as role
      on role.scope_id = membership.role_scope_id
     and role.key = membership.role
    where membership.organization_id = target_organization_id
      and membership.user_id = app.current_user_id()
      and membership.status = 'active'
      and role.status = 'active'
      and target_permission = any (role.permissions)
  );
$$;

comment on function app.has_organization_permission(uuid, text) is
  'Whether the acting Staff Member holds a permission in this Organization. '
  'Says nothing about money or reach — those are the other gates.';

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.staff_roles       enable row level security;
alter table public.staff_roles       force  row level security;
alter table public.staff_invitations enable row level security;
alter table public.staff_invitations force  row level security;

-- SP-S1-20: a roster is the Organization's, not a private view of one row.
-- Replaces memberships_read_own, which showed a Staff Member only themselves
-- and made a staff screen impossible to draw.
drop policy memberships_read_own on public.organization_memberships;
create policy memberships_read_organization
  on public.organization_memberships for select
  using (organization_id in (select app.accessible_organization_ids()));

drop policy assignments_read_own on public.property_assignments;
create policy assignments_read_organization
  on public.property_assignments for select
  using (organization_id in (select app.accessible_organization_ids()));

-- SP-S2-03, SP-S3-07: the shipped roles and this Organization's own. Another
-- Organization's role is absent, which is indistinguishable from never having
-- existed.
create policy staff_roles_read_shipped_and_own
  on public.staff_roles for select
  using (organization_id is null
         or organization_id in (select app.accessible_organization_ids()));

create policy staff_invitations_read_organization
  on public.staff_invitations for select
  using (organization_id in (select app.accessible_organization_ids()));

-- The write policies carry blueprint 3.5's gates, not an application check
-- (ADR 0012). Reach and RLS come from accessible_organization_ids(); the
-- commercial gates come from can_use_capability_in_organization().
--
-- SP-S1-21 is why the commercial gate is written into the WITH CHECK against
-- the *resulting* status rather than the statement: taking reach away is never
-- blocked by money, because blocking a revoke turns an unpaid invoice into a
-- security incident. Leaving somebody active — inviting, changing a role,
-- undoing a revoke — is gated. A policy cannot see the old row, and it does not
-- need to: what matters is what the row says afterwards.
create policy memberships_written_by_an_administrator
  on public.organization_memberships for insert
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
  );

create policy memberships_changed_by_an_administrator
  on public.organization_memberships for update
  using (app.has_organization_permission(organization_id, 'staff.administer'))
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (status = 'revoked'
         or app.can_use_capability_in_organization(
              organization_id, 'platform_core', 'staff_administration'))
  );

create policy assignments_written_by_an_administrator
  on public.property_assignments for insert
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
  );

create policy assignments_changed_by_an_administrator
  on public.property_assignments for update
  using (app.has_organization_permission(organization_id, 'staff.administer'))
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and (status = 'revoked'
         or app.can_use_capability_in_organization(
              organization_id, 'platform_core', 'staff_administration'))
  );

create policy invitations_written_by_an_administrator
  on public.staff_invitations for insert
  with check (
    app.has_organization_permission(organization_id, 'staff.administer')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'staff_administration')
  );

-- Withdrawing an invitation travels with a revoke (SP-S1-27), so it is not
-- gated commercially either. Accepting one is the invitee's own act and runs
-- through a different path — see the module.
create policy invitations_changed_by_an_administrator
  on public.staff_invitations for update
  using (app.has_organization_permission(organization_id, 'staff.administer'))
  with check (app.has_organization_permission(organization_id, 'staff.administer'));

-- ---------------------------------------------------------------------------
-- An Organization always has somebody who can add staff
-- ---------------------------------------------------------------------------

-- SP-S1-12 and SP-S1-13. A row-level policy cannot express this: it is a fact
-- about the set of rows, not about the row being written, and two transactions
-- each counting the other's administrator would both find one.
--
-- The lock is the whole point. `for update` on the Organization's memberships
-- serializes the two, and READ COMMITTED gives the second transaction a fresh
-- snapshot after it waits, so it sees the first demotion and refuses.
create function app.organization_keeps_an_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a change that could have taken the last authority away is worth
  -- stopping. Without this the trigger refuses every change in an Organization
  -- that has no administrator at all — which is a state this schema does not
  -- create but fixtures and older data do, and the answer to it is not to
  -- freeze the Organization forever.
  if not exists (
    select 1 from public.staff_roles as role
    where role.scope_id = old.role_scope_id
      and role.key = old.role
      and role.status = 'active'
      and 'staff.administer' = any (role.permissions)
  ) then
    return null;
  end if;

  perform 1
  from public.organization_memberships as membership
  where membership.organization_id = old.organization_id
  for update;

  if not exists (
    select 1
    from public.organization_memberships as membership
    join public.staff_roles as role
      on role.scope_id = membership.role_scope_id
     and role.key = membership.role
    where membership.organization_id = old.organization_id
      and membership.status = 'active'
      and role.status = 'active'
      and 'staff.administer' = any (role.permissions)
  ) then
    raise exception
      'an Organization must keep somebody who can add staff'
      using errcode = '55000';
  end if;

  return null;
end;
$$;

-- Deferred to the end of the statement but not of the transaction: the check
-- has to see every row the statement touched, and it has to run while the
-- actor is still the one being answered.
create constraint trigger organization_memberships_keep_an_administrator
  after update on public.organization_memberships
  deferrable initially immediate
  for each row
  when (old.status = 'active'
        and (new.status <> 'active'
             or new.role is distinct from old.role
             or new.role_scope_id is distinct from old.role_scope_id))
  execute function app.organization_keeps_an_administrator();

-- Retiring or editing a role can take authority away just as surely.
create function app.role_change_keeps_an_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected uuid;
begin
  -- Same narrowing as above: a role that never carried staff authority cannot
  -- have taken the last of it away.
  if not exists (select 1 where 'staff.administer' = any (old.permissions)) then
    return null;
  end if;

  for affected in
    select distinct membership.organization_id
    from public.organization_memberships as membership
    where membership.role_scope_id = old.scope_id
      and membership.role = old.key
      and membership.status = 'active'
  loop
    perform 1
    from public.organization_memberships as membership
    where membership.organization_id = affected
    for update;

    if not exists (
      select 1
      from public.organization_memberships as membership
      join public.staff_roles as role
        on role.scope_id = membership.role_scope_id
       and role.key = membership.role
      where membership.organization_id = affected
        and membership.status = 'active'
        and role.status = 'active'
        and 'staff.administer' = any (role.permissions)
    ) then
      raise exception
        'an Organization must keep somebody who can add staff'
        using errcode = '55000';
    end if;
  end loop;

  return null;
end;
$$;

create trigger staff_roles_keep_an_administrator
  after update on public.staff_roles
  for each row
  when (old.status = 'active'
        and (new.status <> 'active'
             or new.permissions is distinct from old.permissions))
  execute function app.role_change_keeps_an_administrator();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- A policy bounds rows; a grant bounds columns (ADR 0012). The policy that lets
-- an administrator revoke a membership would equally let them move it to
-- another Organization or hand it to another person — row-level security is
-- row-level. These grants are what make that unreachable.
grant select on public.staff_roles, public.staff_invitations to ranza_app;

grant insert (organization_id, user_id, role, role_scope_id, access_scope, status)
  on public.organization_memberships to ranza_app;
grant update (role, role_scope_id, access_scope, status,
              accepted_at, revoked_at, updated_at)
  on public.organization_memberships to ranza_app;

grant insert (property_id, organization_id, user_id, status)
  on public.property_assignments to ranza_app;
grant update (status, revoked_at, updated_at)
  on public.property_assignments to ranza_app;

grant insert (organization_id, user_id, token_hash, status, expires_at, invited_by)
  on public.staff_invitations to ranza_app;
grant update (status, accepted_at, updated_at)
  on public.staff_invitations to ranza_app;

grant execute on function
  app.has_organization_permission(uuid, text)
to ranza_app;

-- ---------------------------------------------------------------------------
-- Accepting an invitation
-- ---------------------------------------------------------------------------

-- Accepting happens **before** the person can sign in, so there is no request
-- context and row-level security has no acting user to work with. The token is
-- the authentication: whoever holds it is the invitee, which is why only its
-- digest is stored and why the comparison below is against a digest the caller
-- computed rather than against anything reversible.
--
-- security definer for that reason and no other. It answers exactly one
-- question — is this digest a live invitation — and the only rows it can reach
-- are the ones that digest names.
--
-- SP-S1-08 and SP-S1-23: a withdrawn or expired invitation is refused here, in
-- the same statement that would have accepted it, so a link cannot be raced
-- against a revoke. Marking it expired on the way past keeps the table honest
-- without a sweeper job that does not exist yet.
create function app.accept_staff_invitation(candidate_token_hash text)
returns table (organization_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  'Turns a live invitation token into the membership it belongs to. Returns no '
  'row when the invitation is withdrawn, expired, already accepted, or when the '
  'membership was revoked in the meantime (SP-S1-08).';

grant execute on function app.accept_staff_invitation(text) to ranza_app;

-- ---------------------------------------------------------------------------
-- The person being invited
-- ---------------------------------------------------------------------------

-- SP-S1-20 shows a roster, and a roster is a list of people. users_read_self
-- showed a Staff Member only themselves, which is enough to know who you are
-- and not enough to draw a colleague.
--
-- Reach is still the Organization: somebody who shares no Organization with you
-- is absent, which is indistinguishable from not existing.
drop policy users_read_self on public.users;
create policy users_read_self_and_colleagues
  on public.users for select
  using (
    id = app.current_user_id()
    or exists (
      select 1
      from public.organization_memberships as membership
      where membership.user_id = users.id
        and membership.organization_id in (select app.accessible_organization_ids())
    )
  );

-- Inviting somebody who has never been here has to create their user row, and
-- `ranza_app` is granted no insert on public.users — sign-up writes that row as
-- `ranza_auth` (ADR 0005), and widening the grant would let any tenant query
-- mint people.
--
-- So this, which can do one thing: find a user by address, or create one with
-- no credential. A user row is not an account. Better Auth owns `auth_account`
-- and nothing here can write it, so the row this creates cannot sign in until
-- the invitation is accepted and a password is set through that path.
create function app.identify_staff_user(candidate_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(btrim(candidate_email));
  found uuid;
begin
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

comment on function app.identify_staff_user(text) is
  'The one place staff invitation reaches public.users. Creates a person with '
  'no credential; signing in still requires an account Better Auth owns.';

grant execute on function app.identify_staff_user(text) to ranza_app;
