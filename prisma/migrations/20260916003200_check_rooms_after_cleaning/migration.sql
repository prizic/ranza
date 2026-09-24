-- CreateTable
CREATE TABLE "housekeeping_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID,
    "inspect_after_cleaning" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housekeeping_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "housekeeping_settings_organization_default_key" ON "housekeeping_settings"("organization_id") WHERE (property_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "housekeeping_settings_property_override_key" ON "housekeeping_settings"("property_id") WHERE (property_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "housekeeping_settings" ADD CONSTRAINT "housekeeping_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "housekeeping_settings" ADD CONSTRAINT "housekeeping_settings_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-28 slice 3, docs/features/housekeeping)
-- ---------------------------------------------------------------------------

-- Whether a room is inspected after cleaning before it counts as ready. The
-- product owner's answer was "each Organization decides, and a Property may
-- differ": one default per Organization, and an override per Property that is
-- on, off, or "use the default" (HK-S3-01 .. HK-S3-03).
--
-- ON THE NUMBER. 003200, after 003100 in the change before this one.
--
-- The setting changes what ready MEANS, never what any room HOLDS. That is why
-- app.unit_is_ready() is replaced below rather than any status being rewritten,
-- and why switching inspection on or off can strand no room (HK-S3-06).

-- A row says something: an Organization default always has a value, and an
-- override with no value is "use the default" only because it is a Property's.
alter table public.housekeeping_settings
  add constraint housekeeping_settings_says_something
    check (property_id is not null or inspect_after_cleaning is not null);

comment on table public.housekeeping_settings is
  'Whether a room is inspected after cleaning before it is ready: an '
  'Organization default (no property_id) and Property overrides (null value '
  '= use the default). Two partial unique indexes, because null is not equal '
  'to null in one over both columns (HK-S3-04).';

-- ---------------------------------------------------------------------------
-- Reading it
-- ---------------------------------------------------------------------------

-- Anybody in the Organization reads it: the board shows a Property what it
-- inherits, and readiness is read by whoever checks a Guest in.
alter table public.housekeeping_settings enable row level security;
alter table public.housekeeping_settings force row level security;

create policy housekeeping_settings_read_own_organization
  on public.housekeeping_settings for select
  using (organization_id in (select app.accessible_organization_ids()));

grant select on public.housekeeping_settings to ranza_app;

-- The Property's override, else its Organization's default, else off.
-- Definer, like every other gate in app.unit_is_ready(): an invoker version
-- would read an invisible setting as "off", and so a room as ready, for any
-- caller the settings' read policy does not admit. It writes nothing and says
-- one thing about a Property the caller already named.
create function app.housekeeping_inspection_required(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select setting.inspect_after_cleaning
       from public.housekeeping_settings as setting
      where setting.property_id = target_property_id),
    (select setting.inspect_after_cleaning
       from public.housekeeping_settings as setting
       join public.properties as property
         on property.organization_id = setting.organization_id
      where property.id = target_property_id
        and setting.property_id is null),
    false
  )
$$;

comment on function app.housekeeping_inspection_required(uuid) is
  'Whether rooms at a Property must be inspected before they are ready: its '
  'override, else the Organization default, else off (HK-S3-01 .. HK-S3-03).';

revoke execute on function app.housekeeping_inspection_required(uuid) from public;
grant execute on function app.housekeeping_inspection_required(uuid) to ranza_app;

-- ---------------------------------------------------------------------------
-- What ready means now
-- ---------------------------------------------------------------------------

-- The same signature as 20260916003000's, so every reader follows without a
-- change: the board, the arrivals list and check-in. Where housekeeping is not
-- available everything is ready (HK-S1-20). Otherwise dirty is never ready,
-- inspected always is, and clean is ready unless inspection is required.
--
-- A room with no row is clean, as ADR 0029 says and as the board shows it, so
-- under inspection it waits too (HK-S3-11). Switching inspection on therefore
-- means every room waits for an inspection, which is what the setting reads
-- as; it rewrites nothing, and each room clears as it is inspected. The outer
-- coalesce keeps a Unit that does not exist, or is not visible, ready rather
-- than null, as before.
create or replace function app.unit_is_ready(target_unit_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case
              when not app.capability_is_available(
                     holder.property_id, 'housekeeping', 'housekeeping') then true
              when holder.status = 'dirty' then false
              when holder.status = 'inspected' then true
              else not app.housekeeping_inspection_required(holder.property_id)
            end
       from (select unit.property_id,
                    coalesce(state.status, 'clean') as status
               from public.accommodation_units as unit
               left join public.housekeeping_unit_status as state
                 on state.accommodation_unit_id = unit.id
              where unit.id = app.unit_status_holder(target_unit_id)) as holder),
    true)
$$;

-- ---------------------------------------------------------------------------
-- Changing it: five gates, and reach decides which setting
-- ---------------------------------------------------------------------------

-- Whether the caller's membership reaches every Property of an Organization.
-- The default governs Properties the caller may not reach, so setting it
-- takes Organization-wide reach; overriding one Property takes reach to that
-- Property (HK-S3-05). Definer, so a policy can ask it without the caller
-- reading every membership row. It writes nothing.
create function app.has_organization_wide_reach(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.user_id = app.current_user_id()
      and membership.organization_id = target_organization_id
      and membership.status = 'active'
      and membership.access_scope = 'organization_wide'
  )
$$;

comment on function app.has_organization_wide_reach(uuid) is
  'Whether the acting Staff Member reaches every Property of the Organization.';

revoke execute on function app.has_organization_wide_reach(uuid) from public;
grant execute on function app.has_organization_wide_reach(uuid) to ranza_app;

-- accommodation.configure, the permission that already decides what the
-- Property's rooms are: whoever cleans a room decides nothing about how rooms
-- are checked (HK-S3-07). The capability is housekeeping's own.
create policy housekeeping_settings_insert_configure
  on public.housekeeping_settings for insert
  with check (
    app.has_organization_permission(organization_id, 'accommodation.configure')
    and case
      when property_id is null then
        app.can_use_capability_in_organization(
          organization_id, 'housekeeping', 'housekeeping')
        and app.has_organization_wide_reach(organization_id)
      else
        app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    end
  );

create policy housekeeping_settings_update_configure
  on public.housekeeping_settings for update
  using (
    app.has_organization_permission(organization_id, 'accommodation.configure')
    and case
      when property_id is null then
        app.can_use_capability_in_organization(
          organization_id, 'housekeeping', 'housekeeping')
        and app.has_organization_wide_reach(organization_id)
      else
        app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    end
  )
  with check (
    app.has_organization_permission(organization_id, 'accommodation.configure')
    and case
      when property_id is null then
        app.can_use_capability_in_organization(
          organization_id, 'housekeeping', 'housekeeping')
        and app.has_organization_wide_reach(organization_id)
      else
        app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    end
  );

-- No delete policy and no delete grant: resetting a Property to the default
-- clears its value (HK-S3-10), and the audit record keeps what it was.
--
-- A policy bounds rows; a grant bounds columns. Which Organization and which
-- Property a row is about is fixed at insert, so an update may change the value
-- and nothing else; the trigger below stamps the time.
grant insert (organization_id, property_id, inspect_after_cleaning)
  on public.housekeeping_settings to ranza_app;

grant update (inspect_after_cleaning)
  on public.housekeeping_settings to ranza_app;

-- When it last changed is the database's to say, as it is for a room's status
-- (20260916003100): a caller naming updated_at would be claiming when.
create function app.housekeeping_setting_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger housekeeping_settings_stamped
  before insert or update on public.housekeeping_settings
  for each row execute function app.housekeeping_setting_is_stamped();
