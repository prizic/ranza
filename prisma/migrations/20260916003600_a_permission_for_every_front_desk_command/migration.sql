-- A permission for every front-desk command, and a transition for every
-- permission to guard (RANZ-23).
--
-- Hand-written; this migration adds no column and no table.
--
-- Until now one permission guarded each table rather than each command. The
-- UPDATE policy on stays asked for front_desk.check_out, so withdrawing a
-- mistaken check-in — which updates a Stay — needed check-out too: a role
-- composed for check-in only could not take back its own mistake. The UPDATE
-- policy on reservations asked for front_desk.check_in, so check-out could not
-- move a Reservation on for a role holding check-out alone. And opening a
-- Folio needed finance.manage_folio, so an Organization's own check-in role
-- without it could not check anybody in at a Property that bills: the Folio
-- insert failed and took the check-in with it.
--
-- WITH CHECK sees the row as it will be and not as it was, so a policy can ask
-- which permission the new status needs but not which transition this is. That
-- is why the transitions are here too. Without them a role allowed to reach
-- 'cancelled' in order to withdraw an in-house check-in could reach it from
-- 'departed' as well, rewriting the history of a Stay that happened. The
-- triggers draw exactly the arrows in docs/features/check-out/states.mmd that a
-- command exists for; anything not drawn is refused for every role, the owner
-- included.

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

-- Cancelling a booking and recording that nobody came are one job at a desk —
-- both end a Reservation that will never become a Stay — and one permission.
insert into public.staff_permissions (key, module_key) values
  ('front_desk.cancel', 'front_office');

update public.staff_roles
   set permissions = array_append(permissions, 'front_desk.cancel'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('front_desk.cancel' = any (permissions));

-- ---------------------------------------------------------------------------
-- The transitions
-- ---------------------------------------------------------------------------

-- 23514 like a check constraint, because that is what this is: a rule about
-- the row's own values that a check constraint cannot state, since it needs
-- the old one.
create function app.stay_transition_is_drawn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'reserved' and new.status in ('in_house', 'cancelled'))
    or (old.status = 'in_house' and new.status in ('departed', 'cancelled'))
  ) then
    raise exception 'a Stay cannot go from % to %', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function app.stay_transition_is_drawn() is
  'Refuses every Stay status change not drawn in docs/features/check-out/states.mmd, for every role.';

create trigger stays_transition_is_drawn
  before update of status on public.stays
  for each row execute function app.stay_transition_is_drawn();

-- checked_out is named although the status check does not allow it yet: the
-- migration that adds it then needs no change here.
create function app.reservation_transition_is_drawn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'requested'  and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed'  and new.status in ('checked_in', 'cancelled', 'no_show'))
    or (old.status = 'checked_in' and new.status in ('confirmed', 'checked_out'))
  ) then
    raise exception 'a Reservation cannot go from % to %', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function app.reservation_transition_is_drawn() is
  'Refuses every Reservation status change not drawn in docs/features/check-out/states.mmd, for every role.';

create trigger reservations_transition_is_drawn
  before update of status on public.reservations
  for each row execute function app.reservation_transition_is_drawn();

-- ---------------------------------------------------------------------------
-- The policies
-- ---------------------------------------------------------------------------

-- USING admits a Staff Member holding any permission whose command touches the
-- table, because a row USING refuses is never offered to WITH CHECK; WITH
-- CHECK then asks for the permission of the command the new status belongs
-- to. The commercial gates and reach are unchanged, in both halves.

drop policy stays_update_front_desk on public.stays;
create policy stays_update_front_desk
  on public.stays for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and (app.has_organization_permission(organization_id, 'front_desk.check_out')
         or app.has_organization_permission(organization_id, 'front_desk.check_in'))
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    -- No arm for in_house: check-in reaches it by INSERT. The trigger still
    -- draws reserved to in_house, for completeness, and no role here can take
    -- it until a command exists that needs it.
    and case status
          when 'departed'  then app.has_organization_permission(organization_id, 'front_desk.check_out')
          -- Withdrawing a check-in is part of checking in: the person who can
          -- make the mistake can take it back.
          when 'cancelled' then app.has_organization_permission(organization_id, 'front_desk.check_in')
          else false
        end
  );

comment on policy stays_update_front_desk on public.stays is
  'Ending a Stay needs front_desk.check_out; withdrawing one needs front_desk.check_in. Which columns is bounded by the grant, which transitions by stays_transition_is_drawn.';

drop policy reservations_update_front_desk on public.reservations;
create policy reservations_update_front_desk
  on public.reservations for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and (app.has_organization_permission(organization_id, 'front_desk.check_in')
         or app.has_organization_permission(organization_id, 'front_desk.check_out')
         or app.has_organization_permission(organization_id, 'front_desk.cancel'))
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and case status
          -- confirmed is where a withdrawn check-in returns to, and that is
          -- all this arm means. Confirming a requested booking is a booking
          -- command and will want front_desk.book, but WITH CHECK cannot tell
          -- the two arrivals apart; nothing writes requested yet, and the arrow
          -- must be split — by a trigger or a policy of its own — before a
          -- booking engine or a channel does.
          when 'confirmed'   then app.has_organization_permission(organization_id, 'front_desk.check_in')
          when 'checked_in'  then app.has_organization_permission(organization_id, 'front_desk.check_in')
          when 'checked_out' then app.has_organization_permission(organization_id, 'front_desk.check_out')
          when 'cancelled'   then app.has_organization_permission(organization_id, 'front_desk.cancel')
          when 'no_show'     then app.has_organization_permission(organization_id, 'front_desk.cancel')
          else false
        end
  );

comment on policy reservations_update_front_desk on public.reservations is
  'Each status a Reservation can move to needs the permission of the command that moves it there; reservations_transition_is_drawn decides which moves exist.';

-- Opening a Folio is part of checking somebody in (blueprint 6.1 step 5), so a
-- check-in is enough to open one. Posting to it is not: folio_lines keeps
-- finance.post_charge.
drop policy folios_insert_finance on public.folios;
create policy folios_insert_finance
  on public.folios for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and (app.has_organization_permission(organization_id, 'finance.manage_folio')
         or app.has_organization_permission(organization_id, 'front_desk.check_in'))
  );

-- Closing one is part of the two front-desk commands that end a Stay:
-- check-out closes a settled Folio, and withdrawing a check-in closes the empty
-- one it opened. Anything else — reopening — stays finance's. Which Folio a
-- front-desk role may close is bounded by a trigger in the check-out migration
-- that follows, not here: it has to read the lines, which the front desk
-- cannot see.
drop policy folios_update_finance on public.folios;
create policy folios_update_finance
  on public.folios for update
  using (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and (app.has_organization_permission(organization_id, 'finance.manage_folio')
         or app.has_organization_permission(organization_id, 'front_desk.check_out')
         or app.has_organization_permission(organization_id, 'front_desk.check_in'))
  )
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and (app.has_organization_permission(organization_id, 'finance.manage_folio')
         or (status = 'closed'
             and (app.has_organization_permission(organization_id, 'front_desk.check_out')
                  or app.has_organization_permission(organization_id, 'front_desk.check_in'))))
  );
