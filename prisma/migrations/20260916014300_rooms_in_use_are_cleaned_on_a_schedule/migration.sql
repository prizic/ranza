-- CreateTable
CREATE TABLE "housekeeping_stayover_settings" (
    "property_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cadence" TEXT,
    "every_days" SMALLINT,
    "weekday" SMALLINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housekeeping_stayover_settings_pkey" PRIMARY KEY ("property_id")
);

-- CreateTable
CREATE TABLE "housekeeping_stayover_cleanings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "accommodation_unit_id" UUID NOT NULL,
    "cleaned_on" DATE NOT NULL,
    "cleaned_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_at" TIMESTAMPTZ(6),
    "undone_by" UUID,

    CONSTRAINT "housekeeping_stayover_cleanings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "housekeeping_stayover_cleanings_property_id_cleaned_on_idx" ON "housekeeping_stayover_cleanings"("property_id", "cleaned_on");

-- CreateIndex
CREATE UNIQUE INDEX "housekeeping_stayover_cleanings_one_live_per_day" ON "housekeeping_stayover_cleanings"("accommodation_unit_id", "cleaned_on") WHERE (undone_at IS NULL);

-- AddForeignKey
ALTER TABLE "housekeeping_stayover_settings" ADD CONSTRAINT "housekeeping_stayover_settings_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "housekeeping_stayover_cleanings" ADD CONSTRAINT "housekeeping_stayover_cleanings_accommodation_unit_id_prop_fkey" FOREIGN KEY ("accommodation_unit_id", "property_id", "organization_id") REFERENCES "accommodation_units"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-83, docs/features/housekeeping, ADR 0063)
-- ---------------------------------------------------------------------------

-- A room somebody is staying in is cleaned on a schedule. Turnover (a Guest
-- left, the room is dirty) is untouched: it is housekeeping_unit_status, and
-- this adds nothing to it. A stayover is a different fact about a different
-- room, so it is two tables of its own and a read, not another value of the
-- status. That is what keeps an occupied room due for a clean from ever being
-- called dirty, refused at check-in, or sold as not ready (HK-S4-05).
--
-- ON THE NUMBER. 014300, the first of this lane's range.
--
-- Whether a room is due is READ, never stored: it follows from the schedule,
-- the day somebody arrived and the last time the room was cleaned, so changing
-- the schedule re-draws the whole list at once and no job exists that could
-- stall (ADR 0063). What is stored is the setting and each press.

-- ---------------------------------------------------------------------------
-- The schedule: one row per Property
-- ---------------------------------------------------------------------------

-- Never, every N days (N = 1 is every day), or one weekday a week. A null
-- cadence follows the default for the Property's operating model, which the
-- application chooses: nothing in the database reads the model (ADR 0057).
alter table public.housekeeping_stayover_settings
  add constraint housekeeping_stayover_settings_shape
    check (
      (cadence is null and every_days is null and weekday is null)
      or (cadence = 'none' and every_days is null and weekday is null)
      or (cadence = 'every_n_days' and every_days between 1 and 14
          and weekday is null)
      or (cadence = 'weekly' and weekday between 1 and 7 and every_days is null)
    );

comment on table public.housekeeping_stayover_settings is
  'How often a room somebody is staying in is cleaned at a Property: never, '
  'every N days, or one weekday a week. A null cadence follows the default for '
  'its operating model, chosen by the application and never by the database '
  '(ADR 0063).';

alter table public.housekeeping_stayover_settings enable row level security;
alter table public.housekeeping_stayover_settings force row level security;

-- Anybody in the Organization reads it, as they read the inspection setting:
-- the board shows what applies at a Property they work at.
create policy housekeeping_stayover_settings_read_own_organization
  on public.housekeeping_stayover_settings for select
  using (organization_id in (select app.accessible_organization_ids()));

-- accommodation.configure, the permission that already decides how the
-- Property's rooms are run, and housekeeping's own capability: the same gates as
-- the inspection setting's Property override (20260916003200).
create policy housekeeping_stayover_settings_insert_configure
  on public.housekeeping_stayover_settings for insert
  with check (
    app.has_organization_permission(organization_id, 'accommodation.configure')
    and app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
  );

create policy housekeeping_stayover_settings_update_configure
  on public.housekeeping_stayover_settings for update
  using (
    app.has_organization_permission(organization_id, 'accommodation.configure')
    and app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
  )
  with check (
    app.has_organization_permission(organization_id, 'accommodation.configure')
    and app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
  );

-- No delete policy and no delete grant: going back to the default clears the
-- cadence, and the audit record keeps what it was. Which Property a row is
-- about is fixed at insert, so an update changes the cadence and nothing else.
grant select on public.housekeeping_stayover_settings to ranza_app;

grant insert (property_id, organization_id, cadence, every_days, weekday)
  on public.housekeeping_stayover_settings to ranza_app;

grant update (cadence, every_days, weekday)
  on public.housekeeping_stayover_settings to ranza_app;

create function app.housekeeping_stayover_setting_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger housekeeping_stayover_settings_stamped
  before insert or update on public.housekeeping_stayover_settings
  for each row execute function app.housekeeping_stayover_setting_is_stamped();

-- ---------------------------------------------------------------------------
-- Each press: a row, undone by stamping it and never by deleting it
-- ---------------------------------------------------------------------------

alter table public.housekeeping_stayover_cleanings
  add constraint housekeeping_stayover_cleanings_undone_together
    check ((undone_at is null) = (undone_by is null));

comment on table public.housekeeping_stayover_cleanings is
  'One cleaning of a room somebody was staying in. A mistaken press is undone '
  'by stamping undone_at, never by deleting the row (ADR 0063).';

alter table public.housekeeping_stayover_cleanings enable row level security;
alter table public.housekeeping_stayover_cleanings force row level security;

create policy housekeeping_stayover_cleanings_read_accessible_property
  on public.housekeeping_stayover_cleanings for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.housekeeping_stayover_cleanings to ranza_app;

-- The same permission that marks a room clean (20260916003100): whoever hears
-- "204 is done" records it, and the housekeeper's own role already holds it.
-- The unit must be a status holder, a room or a bed with no room above it: a
-- bed under a room is cleaned with its room, as it is for turnover (HK-S4-09).
create policy housekeeping_stayover_cleanings_insert_update_status
  on public.housekeeping_stayover_cleanings for insert
  with check (
    app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    and app.has_organization_permission(organization_id, 'housekeeping.update_status')
    and exists (
      select 1
        from public.accommodation_units as unit
       where unit.id = accommodation_unit_id
         and unit.parent_id is null
    )
  );

-- An undo is allowed on the day of the press and not after: a press from last
-- week taken back today would re-open a room that was due then and is not now,
-- and rewrite what the board said on the days between (HK-S4-14).
create policy housekeeping_stayover_cleanings_update_update_status
  on public.housekeeping_stayover_cleanings for update
  using (
    app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    and app.has_organization_permission(organization_id, 'housekeeping.update_status')
    and undone_at is null
    and cleaned_on = app.property_today(property_id)
  )
  with check (
    app.can_use_capability(property_id, 'housekeeping', 'housekeeping')
    and app.has_organization_permission(organization_id, 'housekeeping.update_status')
  );

-- A policy bounds rows; a grant bounds columns. The date and who pressed are
-- stamped below, so a caller naming them would be claiming when and who. An
-- undo may name that it is one and nothing else.
grant insert (accommodation_unit_id, property_id, organization_id)
  on public.housekeeping_stayover_cleanings to ranza_app;

grant update (undone_at)
  on public.housekeeping_stayover_cleanings to ranza_app;

-- The Property's business date, not the server's: a press at 02:00 in Istanbul
-- belongs to the day the Property is still working (ADR 0021), and the caller
-- cannot choose a date that postpones the next clean.
create function app.housekeeping_stayover_cleaning_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.cleaned_on := app.property_today(new.property_id);
    new.cleaned_by := app.current_user_id();
    new.created_at := now();
    new.undone_at := null;
    new.undone_by := null;
  else
    new.undone_at := now();
    new.undone_by := app.current_user_id();
  end if;
  return new;
end;
$$;

create trigger housekeeping_stayover_cleanings_stamped
  before insert or update on public.housekeeping_stayover_cleanings
  for each row execute function app.housekeeping_stayover_cleaning_is_stamped();

-- ---------------------------------------------------------------------------
-- Which occupied rooms are due
-- ---------------------------------------------------------------------------

-- The rooms somebody is in at a Property that are due a clean today under the
-- schedule it is given, and those cleaned today (so a press can be undone).
-- The schedule is passed in, already resolved, so this function neither reads
-- the Property's operating model nor stores a default (ADR 0057, ADR 0063).
--
-- A cycle starts at the latest of: the day the earliest person still in the
-- room arrived, the last time it was marked clean or inspected, and the last
-- stayover clean. The next clean is due on the first scheduled day after that:
-- `every_n_days` is N days on, `weekly` is the next such weekday. A room that
-- is overdue stays due until it is cleaned, so a missed day is not lost.
--
-- Not listed, whatever the schedule says:
--   - a room that is dirty: turnover is its work, and marking it clean starts
--     the cycle over (HK-S4-06);
--   - a room blocked or out of service;
--   - a room everyone in it leaves today: it is about to be turnover (HK-S4-07).
-- A room cleaned today is listed whatever else is true, so the press that did
-- it can be seen and taken back.
--
-- Invoker, like app.housekeeping_states(): it reads stays, rooms and the status
-- under their reach-only policies, so one viewer gets one answer on every
-- screen. A bed under a room is cleaned with its room: its stay counts towards
-- the room it is in.
create function app.housekeeping_stayover_rooms(
  target_property_id uuid,
  cadence text,
  every_days integer,
  weekday integer
)
returns table (
  holder_id uuid,
  occupants integer,
  arrived_on date,
  last_cleaned_on date,
  due_on date,
  cleaning_id uuid
)
language sql
stable
set search_path = ''
as $$
  with property as (
    select current_property.timezone,
           current_property.business_date_cutoff,
           app.property_today(current_property.id) as today
      from public.properties as current_property
     where current_property.id = target_property_id
  ),
  occupied as (
    select coalesce(unit.parent_id, unit.id) as holder,
           count(*)::integer as occupants,
           min(stay.starts_on) as arrived_on,
           bool_and(coalesce(stay.ends_on = (select today from property), false))
             as leaves_today
      from public.stays as stay
      join public.accommodation_units as unit
        on unit.id = stay.accommodation_unit_id
     where stay.property_id = target_property_id
       and stay.status = 'in_house'
     group by coalesce(unit.parent_id, unit.id)
  ),
  measured as (
    select occupied.holder,
           occupied.occupants,
           occupied.arrived_on,
           occupied.leaves_today,
           state.status,
           holder_unit.status in ('blocked', 'out_of_service') as unavailable,
           greatest(
             (select max(cleaning.cleaned_on)
                from public.housekeeping_stayover_cleanings as cleaning
               where cleaning.accommodation_unit_id = occupied.holder
                 and cleaning.undone_at is null),
             case when state.status in ('clean', 'inspected')
                  then app.business_date(
                         state.changed_at,
                         (select timezone from property),
                         (select business_date_cutoff from property))
             end
           ) as last_cleaned_on,
           (select cleaning.id
              from public.housekeeping_stayover_cleanings as cleaning
             where cleaning.accommodation_unit_id = occupied.holder
               and cleaning.cleaned_on = (select today from property)
               and cleaning.undone_at is null) as cleaning_id
      from occupied
      join public.accommodation_units as holder_unit
        on holder_unit.id = occupied.holder
      join app.housekeeping_states(
             (select array_agg(listed.holder) from occupied as listed)
           ) as state
        on state.holder_id = occupied.holder
  ),
  scheduled as (
    select measured.*,
           greatest(measured.arrived_on, measured.last_cleaned_on) as cycle_start
      from measured
  )
  select scheduled.holder,
         scheduled.occupants,
         scheduled.arrived_on,
         scheduled.last_cleaned_on,
         case $2
           when 'every_n_days' then scheduled.cycle_start + $3
           when 'weekly' then scheduled.cycle_start
                + ((($4 - extract(isodow from scheduled.cycle_start)::integer + 6) % 7) + 1)
         end,
         scheduled.cleaning_id
    from scheduled
   where case $2
           when 'every_n_days' then $3 between 1 and 14
           when 'weekly' then $4 between 1 and 7
           else false
         end
     and (
       scheduled.cleaning_id is not null
       or (
         scheduled.status <> 'dirty'
         and not scheduled.unavailable
         and not scheduled.leaves_today
         and case $2
               when 'every_n_days' then scheduled.cycle_start + $3
               when 'weekly' then scheduled.cycle_start
                    + ((($4 - extract(isodow from scheduled.cycle_start)::integer + 6) % 7) + 1)
             end <= (select today from property)
       )
     )
$$;

comment on function app.housekeeping_stayover_rooms(uuid, text, integer, integer) is
  'The occupied rooms at a Property that are due a stayover clean today under a '
  'resolved schedule, and those cleaned today. Reads no operating model: the '
  'schedule is passed in (ADR 0057, ADR 0063).';

revoke execute on function app.housekeeping_stayover_rooms(uuid, text, integer, integer) from public;
grant execute on function app.housekeeping_stayover_rooms(uuid, text, integer, integer) to ranza_app;
