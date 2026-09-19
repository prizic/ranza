-- Staff and permissions, slice 2: the catalogue, and a fifth gate.
--
-- Slice 1 gave a role a set of permissions and asked it one question. This
-- enumerates what may be in that set, and puts the question in front of every
-- write the product already had.
--
-- ADR 0012 said a write policy carries all four of blueprint 3.5's gates. It is
-- amended rather than contradicted: the permission gate is a fifth condition
-- inside those same policies, not a second mechanism beside them. Amending every
-- policy already written is part of this slice and not a later tidy-up — a gate
-- that covers most of the writes is a gate somebody will find the gap in.

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

-- Every command the product has, as a row. Without this a role is a set drawn
-- from nothing: an Organization composing one has no list to compose from, and
-- the gate has no way to tell a permission from a typo.
--
-- A permission is named for the command a person would recognise, not for the
-- table it touches. `front_desk.check_in` writes a Stay, updates a Reservation
-- and opens a Folio, and nobody administering staff thinks of it as three
-- things.
create table public.staff_permissions (
  key         text primary key,
  module_key  text not null,
  created_at  timestamptz not null default now(),
  constraint staff_permissions_key_is_qualified check (key like '%._%')
);

comment on table public.staff_permissions is
  'What a role may be composed from. Ranza ships this table and an Organization '
  'never writes to it: a permission is a command that exists in a release.';

insert into public.staff_permissions (key, module_key) values
  ('front_desk.book',        'front_office'),
  ('front_desk.check_in',    'front_office'),
  ('front_desk.check_out',   'front_office'),
  ('finance.manage_folio',   'billing_folios'),
  ('finance.post_charge',    'billing_folios'),
  ('staff.administer',       'platform_core'),
  ('staff.define_roles',     'platform_core');

alter table public.staff_permissions enable row level security;
alter table public.staff_permissions force  row level security;

-- Readable by anybody signed in. It is the list a role editor is composed from
-- and it is the same list for every Organization; there is nothing in it that
-- belongs to one.
create policy staff_permissions_read_all
  on public.staff_permissions for select
  using (app.current_user_id() is not null);

grant select on public.staff_permissions to ranza_app;

-- An array element cannot carry a foreign key, so this is the trigger that
-- makes `staff_roles.permissions` a set drawn from the catalogue rather than a
-- column of free text. The array stays an array on purpose: it is read inside
-- every write policy on every row, and a junction table would turn that into a
-- join per row per policy.
create function app.role_permissions_are_in_the_catalogue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unknown text;
begin
  select offered into unknown
  from unnest(new.permissions) as offered
  where not exists (
    select 1 from public.staff_permissions as known where known.key = offered
  )
  limit 1;

  if unknown is not null then
    raise exception 'no such permission: %', unknown
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger staff_roles_permissions_are_known
  before insert or update of permissions on public.staff_roles
  for each row
  execute function app.role_permissions_are_in_the_catalogue();

-- What the roles Ranza ships may do, now that there is something to say.
-- Front desk carries finance.manage_folio because checking somebody in opens
-- their Folio; that is one act at the desk and splitting it would make the
-- shipped role unable to perform its own job.
update public.staff_roles set permissions = array[
  'front_desk.book', 'front_desk.check_in', 'front_desk.check_out',
  'finance.manage_folio', 'finance.post_charge',
  'staff.administer', 'staff.define_roles'
], updated_at = now()
where organization_id is null and key in ('owner', 'manager');

update public.staff_roles set permissions = array[
  'front_desk.book', 'front_desk.check_in', 'front_desk.check_out',
  'finance.manage_folio'
], updated_at = now()
where organization_id is null and key = 'front_desk';

update public.staff_roles set permissions = array[
  'finance.manage_folio', 'finance.post_charge'
], updated_at = now()
where organization_id is null and key = 'finance';

-- Housekeeping keeps an empty set, and that is the honest state: no command in
-- the product is theirs yet. Room status is the slice that gives them one.

-- ---------------------------------------------------------------------------
-- The fifth gate, inside the policies that already exist
-- ---------------------------------------------------------------------------

-- Each policy below is the one that was there, with one more conjunct. The
-- commercial gates, the reach gate and row-level security are unchanged; what
-- is new is that reaching a Property is no longer the same as being the person
-- who does this job there.

drop policy guests_insert_front_desk on public.guests;
create policy guests_insert_front_desk
  on public.guests for insert
  with check (
    app.can_use_capability_in_organization(
      organization_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.book')
  );

drop policy guests_update_front_desk on public.guests;
create policy guests_update_front_desk
  on public.guests for update
  using (
    app.can_use_capability_in_organization(
      organization_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.book')
  )
  with check (
    app.can_use_capability_in_organization(
      organization_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.book')
  );

drop policy reservations_insert_front_desk on public.reservations;
create policy reservations_insert_front_desk
  on public.reservations for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.book')
  );

-- Updating a Reservation is what check-in and its reversal do to it. Cancelling
-- will be a third command through this policy and will want its own permission;
-- nothing cancels yet, so inventing one now would be a permission nobody can
-- hold for a command nobody can run.
drop policy reservations_update_front_desk on public.reservations;
create policy reservations_update_front_desk
  on public.reservations for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.check_in')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.check_in')
  );

drop policy stays_insert_front_desk on public.stays;
create policy stays_insert_front_desk
  on public.stays for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.check_in')
    and (status <> 'in_house' or starts_on <= app.property_today(property_id))
  );

drop policy stays_update_front_desk on public.stays;
create policy stays_update_front_desk
  on public.stays for update
  using (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.check_out')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'front_desk')
    and app.has_organization_permission(organization_id, 'front_desk.check_out')
    and (status <> 'in_house' or starts_on <= app.property_today(property_id))
  );

drop policy folios_insert_finance on public.folios;
create policy folios_insert_finance
  on public.folios for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and app.has_organization_permission(organization_id, 'finance.manage_folio')
  );

drop policy folios_update_finance on public.folios;
create policy folios_update_finance
  on public.folios for update
  using (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and app.has_organization_permission(organization_id, 'finance.manage_folio')
  )
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and app.has_organization_permission(organization_id, 'finance.manage_folio')
  );

-- Money is the one place the split earns its keep: opening a Folio is part of
-- checking somebody in, and putting a charge on it is not.
drop policy folio_lines_insert_finance on public.folio_lines;
create policy folio_lines_insert_finance
  on public.folio_lines for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and app.has_organization_permission(organization_id, 'finance.post_charge')
  );
