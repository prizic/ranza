-- An expired invitation is no answer to a stranger (SP-S1-33).
--
-- app.accept_staff_invitation()'s caller check looked the token up by
-- status = 'pending' alone. A signed-in stranger presenting a token that was
-- still pending but past its expiry was refused with 42501, while a token that
-- never existed returned no row — so for that caller "expired" and "never
-- existed" were two answers, and the difference told them a live-looking
-- invitation existed. The guard now asks the same question the acceptance
-- does, expires_at > now(), and an expired token falls through to the same
-- empty result as every other token that is not acceptable.
--
-- Copied from 20260916002800, the latest definition, with that one clause
-- added. Signature, owner and grants are unchanged.
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
       and invitation.status = 'pending'
       and invitation.expires_at > now();

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
