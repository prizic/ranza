-- An invitation can be looked at before it is accepted (PEOPLE-01).
--
-- The page behind an invitation link has to say what is wrong with a link that
-- does not work — it has expired, it was used, it was withdrawn — and
-- app.accept_staff_invitation() deliberately cannot: it returns no row for all
-- of them (SP-S1-33), because a stranger probing it must not learn which
-- Organizations have invited which addresses.
--
-- A stranger probing this function learns nothing either. The argument is the
-- SHA-256 digest of a 256-bit random token, so there is nothing to guess: the
-- only caller who can name a row is somebody holding the link, and for them the
-- row's state is theirs to know. A digest that matches nothing returns no row,
-- so "never existed" is still one answer and says nothing about the rest.
--
-- It reads and writes nothing else. It is a definer because the person holding
-- the link cannot sign in, so row-level security has no acting user to work
-- with; it is granted to ranza_app alone, as accept_staff_invitation() is.
create function app.staff_invitation_state(candidate_token_hash text)
returns table (
  state text,
  user_id uuid,
  email text,
  organization_name text,
  role_key text,
  role_scope_id uuid,
  role_name text,
  has_login boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when invitation.status = 'pending' and membership.status = 'revoked'
             then 'membership_revoked'
           when invitation.status = 'pending' and invitation.expires_at <= now()
             then 'expired'
           else invitation.status
         end,
         invitation.user_id,
         account.email,
         organization.name,
         membership.role,
         membership.role_scope_id,
         role.name,
         exists (
           select 1
             from public.auth_identities as identity
            where identity.user_id = invitation.user_id
         )
    from public.staff_invitations as invitation
    join public.users as account on account.id = invitation.user_id
    join public.organizations as organization
      on organization.id = invitation.organization_id
    join public.organization_memberships as membership
      on membership.organization_id = invitation.organization_id
     and membership.user_id = invitation.user_id
    join public.staff_roles as role
      on role.scope_id = membership.role_scope_id
     and role.key = membership.role
   where invitation.token_hash = candidate_token_hash;
$$;

comment on function app.staff_invitation_state(text) is
  'What state an invitation link is in, for the page behind it: pending, '
  'accepted, withdrawn, expired, or membership_revoked, with the address, the '
  'Organization, the role and whether that person already has a login. Takes '
  'the digest of the token, so it answers only to somebody holding the link; '
  'a digest that matches nothing returns no row. Reads, never writes.';

revoke execute on function app.staff_invitation_state(text) from public;
grant execute on function app.staff_invitation_state(text) to ranza_app;
