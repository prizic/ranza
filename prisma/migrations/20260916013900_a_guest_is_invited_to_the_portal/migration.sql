-- A Resident gets the Portal by invitation (RANZ-87, GP-S2-*, GP-S3-*, ADR 0060).
--
-- Nothing wrote stays.user_id (GP-DEF-02), so no Resident could see anything. The
-- desk now hands a student a link; opening it, the student makes an account or
-- signs in, and accepting it gives that Guest's own Stays to that account.
--
-- The invitation is of a Guest, not of a Stay. A yurt registers its students in
-- move-in week, before any Stay exists, and the Stay a check-in makes later is
-- still theirs: a trigger below gives it the login the Guest already has.
--
-- ADR 0001: Prisma generated the table below; everything beneath it is
-- hand-written in this same file because Prisma models none of it.

-- CreateTable
CREATE TABLE "guest_portal_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "invited_by" UUID NOT NULL,
    "accepted_by" UUID,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_portal_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_portal_invitations_token_key" ON "guest_portal_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "guest_portal_invitations_organization_idx" ON "guest_portal_invitations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_portal_invitations_pending_key" ON "guest_portal_invitations"("guest_id") WHERE (status = 'pending');

-- CreateIndex
CREATE UNIQUE INDEX "guest_portal_invitations_accepted_guest_key" ON "guest_portal_invitations"("guest_id") WHERE (status = 'accepted');

-- CreateIndex
CREATE UNIQUE INDEX "guest_portal_invitations_accepted_account_key" ON "guest_portal_invitations"("organization_id", "accepted_by") WHERE (status = 'accepted');

-- AddForeignKey
ALTER TABLE "guest_portal_invitations" ADD CONSTRAINT "guest_portal_invitations_guest_fkey" FOREIGN KEY ("guest_id", "organization_id") REFERENCES "guests"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "guest_portal_invitations" ADD CONSTRAINT "guest_portal_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "guest_portal_invitations" ADD CONSTRAINT "guest_portal_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "guest_portal_invitations" ADD CONSTRAINT "guest_portal_invitations_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

comment on table public.guest_portal_invitations is
  'The link a Guest is handed to get a Portal login, good once. Only the SHA-256 digest of the token is stored; the runtime role is not granted that column. Written only by app.invite_guest_to_portal, app.withdraw_portal_invitation and app.accept_portal_invitation (GP-S2-*, GP-S3-*).';

comment on column public.guest_portal_invitations.token_hash is
  'Lower-case hex SHA-256 of a 256-bit random token. The token is shown once and never kept. Not granted to the runtime role: the definers are the only readers.';

alter table public.guest_portal_invitations
  add constraint guest_portal_invitations_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  add constraint guest_portal_invitations_status_check
    check (status in ('pending', 'accepted', 'revoked')),
  -- A link has a lifetime. Expired is not a status: a pending link whose time
  -- has passed is read as expired, so nothing has to run to make it so.
  add constraint guest_portal_invitations_lifetime_check
    check (expires_at > created_at),
  -- Each status says who did it and when, and the other statuses' fields stay
  -- empty, so a row cannot be both used and withdrawn.
  add constraint guest_portal_invitations_outcome_check
    check (
      (status = 'pending'
        and accepted_by is null and accepted_at is null
        and revoked_by is null and revoked_at is null)
      or (status = 'accepted'
        and accepted_by is not null and accepted_at is not null
        and revoked_by is null and revoked_at is null)
      or (status = 'revoked'
        and revoked_by is not null and revoked_at is not null
        and accepted_by is null and accepted_at is null)
    );

-- ---------------------------------------------------------------------------
-- A permission of its own
-- ---------------------------------------------------------------------------

-- A link is a login to a student's stay and balance, so it is not folded into
-- front_desk.book: an Organization can give it to a role of its own, or keep it
-- from a trainee, the way guests.read_particulars is given (ADR 0058).
insert into public.staff_permissions (key, module_key)
values ('guests.invite_to_portal', 'front_office');

update public.staff_roles
   set permissions = array_append(permissions, 'guests.invite_to_portal'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('guests.invite_to_portal' = any (permissions));

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------

alter table public.guest_portal_invitations enable row level security;
alter table public.guest_portal_invitations force row level security;

-- The desk reads where an invitation stands. Reach to the Organization and the
-- permission, because the rows say which students have a login.
create policy guest_portal_invitations_read_with_permission
  on public.guest_portal_invitations for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(
          organization_id, 'guests.invite_to_portal')
  );

-- A policy bounds rows; a grant bounds columns (ADR 0012, amended). Every
-- column but the digest: even a Staff Member who may invite cannot read the
-- value the definers compare a token against. No INSERT, UPDATE or DELETE
-- grant and no policy for them: the functions below are the only writers.
grant select (
  id, organization_id, guest_id, status, expires_at, invited_by,
  accepted_by, accepted_at, revoked_by, revoked_at, created_at
) on public.guest_portal_invitations to ranza_app;

-- ---------------------------------------------------------------------------
-- The audit record, written in the statement that makes the change
-- ---------------------------------------------------------------------------

-- As app.record_webhook_audit: so there is no state in which the change
-- happened and the record of who made it did not, and a caller that is not the
-- module cannot skip it. The student who accepts is not a Staff Member and so
-- passes no audit policy; the record is written by the definer, and the actor is
-- the signed-in user, never an argument.
--
-- Counts, ids and dates only. No token, no digest, no address, no name.
create function app.record_guest_portal_audit(
  target_organization_id uuid,
  audit_action text,
  target_guest uuid,
  audit_context jsonb
)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into audit.records
    (organization_id, actor_id, action, subject_type, subject_id, context)
  values
    (target_organization_id, app.current_user_id(), audit_action, 'guest',
     target_guest, audit_context)
$$;

revoke execute on function app.record_guest_portal_audit(uuid, text, uuid, jsonb)
  from public, ranza_app, ranza_auth, ranza_worker;

-- ---------------------------------------------------------------------------
-- The desk invites
-- ---------------------------------------------------------------------------

-- Whether the caller may invite this Guest: reach to the Organization, the front
-- desk, a Property that has the Portal switched on, and the permission. An
-- invitation to a Portal that is off would lead a student to an empty page.
-- Invoker rights: it reads only what the caller's own policies show.
create function app.may_invite_to_portal(target_guest uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.guests as guest
     where guest.id = target_guest
       and guest.organization_id in (select app.accessible_organization_ids())
       and app.can_use_capability_in_organization(
             guest.organization_id, 'front_office', 'front_desk')
       and app.can_use_capability_in_organization(
             guest.organization_id, 'front_office', 'portal_stay_overview')
       and app.has_organization_permission(
             guest.organization_id, 'guests.invite_to_portal')
  );
$$;

revoke execute on function app.may_invite_to_portal(uuid) from public;
grant execute on function app.may_invite_to_portal(uuid) to ranza_app;

-- Records a link for a Guest. The caller makes the token and passes its digest,
-- so the token exists only where the desk reads it. Every gate is one refusal. A
-- Guest who already has a login is not invited again. A live link is withdrawn
-- in the same statement, so two cannot be live; the Guest row is locked so that
-- two desks inviting at once end with one live link and one waiting turn.
create function app.invite_guest_to_portal(target_guest uuid, new_token_hash text)
returns table (
  invitation_id uuid,
  invitation_organization_id uuid,
  invitation_expires_at timestamptz,
  replaced_invitation_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  guest_organization uuid;
  replaced uuid;
  created public.guest_portal_invitations%rowtype;
begin
  select guest.organization_id into guest_organization
    from public.guests as guest
   where guest.id = target_guest
     for update;

  if guest_organization is null or not app.may_invite_to_portal(target_guest) then
    raise exception 'that Guest cannot be invited'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.guest_portal_invitations as invitation
     where invitation.guest_id = target_guest
       and invitation.status = 'accepted'
  ) then
    raise exception 'that Guest already has a Portal login'
      using errcode = '55000';
  end if;

  update public.guest_portal_invitations
     set status = 'revoked',
         revoked_by = app.current_user_id(),
         revoked_at = current_timestamp
   where guest_id = target_guest
     and status = 'pending'
  returning id into replaced;

  insert into public.guest_portal_invitations
    (organization_id, guest_id, token_hash, expires_at, invited_by)
  values
    (guest_organization, target_guest, new_token_hash,
     current_timestamp + interval '14 days', app.current_user_id())
  returning * into created;

  perform app.record_guest_portal_audit(
    guest_organization, 'guest.portal_invited', target_guest,
    jsonb_build_object(
      'invitationId', created.id,
      'replacedInvitationId', replaced,
      'expiresAt', created.expires_at));

  invitation_id := created.id;
  invitation_organization_id := guest_organization;
  invitation_expires_at := created.expires_at;
  replaced_invitation_id := replaced;
  return next;
end;
$$;

revoke execute on function app.invite_guest_to_portal(uuid, text) from public;
grant execute on function app.invite_guest_to_portal(uuid, text) to ranza_app;

-- Withdraws the link that is live, if one is. Null says there was none: the
-- screen showed a link that had since been used, withdrawn or replaced.
create function app.withdraw_portal_invitation(target_guest uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  guest_organization uuid;
  withdrawn uuid;
begin
  select guest.organization_id into guest_organization
    from public.guests as guest
   where guest.id = target_guest
     for update;

  if guest_organization is null or not app.may_invite_to_portal(target_guest) then
    raise exception 'that invitation cannot be withdrawn'
      using errcode = '42501';
  end if;

  update public.guest_portal_invitations
     set status = 'revoked',
         revoked_by = app.current_user_id(),
         revoked_at = current_timestamp
   where guest_id = target_guest
     and status = 'pending'
  returning id into withdrawn;

  if withdrawn is not null then
    perform app.record_guest_portal_audit(
      guest_organization, 'guest.portal_invitation_withdrawn', target_guest,
      jsonb_build_object('invitationId', withdrawn));
  end if;
  return withdrawn;
end;
$$;

revoke execute on function app.withdraw_portal_invitation(uuid) from public;
grant execute on function app.withdraw_portal_invitation(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- The student opens the link
-- ---------------------------------------------------------------------------

-- What state a link is in, for the page behind it. The holder of a link cannot
-- sign in yet, so there is no acting user for row-level security to work with;
-- the argument is the digest of a 256-bit token, so nobody can name a row they
-- do not hold, and a digest that matches nothing returns no row ("never
-- existed" is one answer). It reads and writes nothing else, and names the
-- Guest by the name the desk typed so the student can see it is theirs.
create function app.portal_invitation_state(candidate_token_hash text)
returns table (
  state text,
  organization_name text,
  guest_name text,
  guest_email text,
  accepted_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when invitation.status = 'pending' and invitation.expires_at <= now()
             then 'expired'
           else invitation.status
         end,
         organization.name,
         guest.full_name,
         guest.email,
         invitation.accepted_by
    from public.guest_portal_invitations as invitation
    join public.guests as guest
      on guest.id = invitation.guest_id
     and guest.organization_id = invitation.organization_id
    join public.organizations as organization
      on organization.id = invitation.organization_id
   where invitation.token_hash = candidate_token_hash;
$$;

revoke execute on function app.portal_invitation_state(text) from public;
grant execute on function app.portal_invitation_state(text) to ranza_app;

-- Accepts a link as the signed-in user: the invitation is marked used and that
-- Guest's own Stays, in this Organization, are given to the user. The refusals
-- are returned, not raised, because the holder of a live token may be told why
-- it does not work (ADR 0060) and a raise cannot carry the word:
--
--   unknown        no link has this digest
--   revoked        withdrawn, or replaced by a newer one
--   used           accepted already
--   expired        its fourteen days are over
--   another_guest  this account already belongs to a different Guest here
--
-- Only an account that is signed in may accept; the user is never an argument.
-- A Stay that already names another account is not taken, and the audit record
-- counts both. A race between two links for one account ends at the unique
-- index on (organization, accepted_by), not here.
create function app.accept_portal_invitation(candidate_token_hash text)
returns table (
  outcome text,
  accepted_organization_id uuid,
  accepted_guest_id uuid,
  linked_stays integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting uuid := app.current_user_id();
  invitation public.guest_portal_invitations%rowtype;
  linked integer;
  held_elsewhere integer;
begin
  if acting is null then
    raise exception 'sign in to accept an invitation'
      using errcode = '42501';
  end if;

  select * into invitation
    from public.guest_portal_invitations as candidate
   where candidate.token_hash = candidate_token_hash
     for update;

  if not found then
    return query select 'unknown'::text, null::uuid, null::uuid, 0;
    return;
  end if;
  if invitation.status = 'revoked' then
    return query select 'revoked'::text, null::uuid, null::uuid, 0;
    return;
  end if;
  if invitation.status = 'accepted' then
    return query select 'used'::text, null::uuid, null::uuid, 0;
    return;
  end if;
  if invitation.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::uuid, 0;
    return;
  end if;
  if exists (
    select 1
      from public.guest_portal_invitations as other
     where other.organization_id = invitation.organization_id
       and other.accepted_by = acting
       and other.status = 'accepted'
       and other.guest_id <> invitation.guest_id
  ) then
    return query select 'another_guest'::text, null::uuid, null::uuid, 0;
    return;
  end if;

  update public.guest_portal_invitations
     set status = 'accepted',
         accepted_by = acting,
         accepted_at = current_timestamp
   where id = invitation.id;

  -- Exactly this Guest's Stays: those whose booking names them. Their
  -- Organization needs no clause of its own, because a booking's Guest is one
  -- of its Organization by a composite foreign key. A withdrawn check-in (a
  -- cancelled Stay) is not given.
  update public.stays as stay
     set user_id = acting,
         updated_at = current_timestamp
    from public.reservations as booking
   where booking.id = stay.reservation_id
     and booking.guest_id = invitation.guest_id
     and stay.status <> 'cancelled'
     and stay.user_id is null;
  get diagnostics linked = row_count;

  select count(*)::int into held_elsewhere
    from public.stays as stay
    join public.reservations as booking on booking.id = stay.reservation_id
   where booking.guest_id = invitation.guest_id
     and stay.status <> 'cancelled'
     and stay.user_id <> acting;

  perform app.record_guest_portal_audit(
    invitation.organization_id, 'guest.portal_invitation_accepted',
    invitation.guest_id,
    jsonb_build_object(
      'invitationId', invitation.id,
      'linkedStays', linked,
      'heldByAnotherAccount', held_elsewhere));

  return query select 'accepted'::text, invitation.organization_id,
                      invitation.guest_id, linked;
end;
$$;

revoke execute on function app.accept_portal_invitation(text) from public;
grant execute on function app.accept_portal_invitation(text) to ranza_app;

-- ---------------------------------------------------------------------------
-- A Stay made later is the Guest's too
-- ---------------------------------------------------------------------------

-- A student invited at registration has no Stay until check-in. The Stay a
-- check-in makes then names the login that Guest already has, so accepting early
-- is not a half-done job and the desk never links anything by hand. Written for
-- NEW only. A Stay inserted with an account named keeps it; a Stay whose booking
-- is replaced takes the new booking's Guest's login, or none.
create function app.stay_follows_its_guests_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  login uuid;
begin
  if new.reservation_id is not null and new.status <> 'cancelled' then
    select invitation.accepted_by into login
      from public.reservations as booking
      join public.guest_portal_invitations as invitation
        on invitation.guest_id = booking.guest_id
       and invitation.organization_id = booking.organization_id
       and invitation.status = 'accepted'
     where booking.id = new.reservation_id;
  end if;

  if tg_op = 'INSERT' then
    new.user_id := coalesce(new.user_id, login);
  else
    new.user_id := login;
  end if;
  return new;
end;
$$;

revoke execute on function app.stay_follows_its_guests_login() from public;

create trigger stays_follow_their_guests_login
  before insert or update of reservation_id on public.stays
  for each row execute function app.stay_follows_its_guests_login();
