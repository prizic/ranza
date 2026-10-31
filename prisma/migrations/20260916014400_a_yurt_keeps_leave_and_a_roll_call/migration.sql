-- Leave (izin) and the nightly roll call (yoklama) (RANZ-101, LA-S1-*, ADR 0064
-- Proposed).
--
-- A Turkish dormitory records who may be away for the night and who is in at
-- the curfew. A Resident not in by the curfew and not on leave is missing, and
-- the yurt may have to tell the guardian. Neither is specific to a yurt: a
-- hostel or staff housing keeps the same records. So this is a Property
-- capability, `attendance`, available to any Property, and nothing here reads
-- `operating_model` (ADR 0057).
--
-- Four tables, because four sets of people read them:
--
--   attendance_settings       the curfew, read by anyone who reaches the Property
--   attendance_leaves         the nights a Resident is away; read by whoever may
--                             take the roll call or grant leave
--   attendance_leave_reasons  why. A reason can be a medical or a family matter
--                             of somebody who is seventeen (KVKK), so it sits
--                             apart and only `leave.grant` reads it. The roll
--                             call only needs to know who is away, not why.
--   attendance_marks          present or absent, one row per revision, never
--                             changed: the latest row is the current answer and
--                             every earlier one is who said what, and when.
--
-- Nothing is ever deleted. A leave that did not happen is cancelled; one that
-- ended early is ended; a roll call that was wrong has a newer mark above it.
--
-- SQLSTATEs, Ranza's own class (see 20260916005000):
--   RZL01  that Resident cannot be given leave on those nights
--   RZL02  that leave cannot be ended or cancelled so
--   RZL03  leave is given a reason
--   RZA01  that Resident cannot be called on that night

-- ---------------------------------------------------------------------------
-- Who may, and where
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key) values
  ('attendance.take', 'front_office'),
  ('leave.grant', 'front_office');

-- Not housekeeping and not finance: a cleaner needs a name on a room, not
-- whether a student is out tonight. An Organization gives either permission to
-- a role of its own, a night warden who only calls the roll included.
update public.staff_roles
   set permissions = array_append(permissions, 'attendance.take'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('attendance.take' = any (permissions));

update public.staff_roles
   set permissions = array_append(permissions, 'leave.grant'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('leave.grant' = any (permissions));

-- The capability is a Property's to have (gate 3 of blueprint 3.5), and a
-- dormitory has it on from the start: ADR 0057 lets the model choose which
-- capabilities are on when it is first chosen, and nothing else. This is that
-- choice for the Properties that already exist, a one-time statement and not a
-- rule; a hotel or a hostel is given the capability like any other.
insert into public.property_capabilities
  (property_id, organization_id, capability_key, enabled)
select property.id, property.organization_id, 'attendance', true
  from public.properties as property
 where property.operating_model = 'dormitory'
on conflict (property_id, capability_key) do nothing;

-- ---------------------------------------------------------------------------
-- The curfew
-- ---------------------------------------------------------------------------

-- One row per Property, made when somebody sets the curfew. No row means the
-- application's default for the Property; a row with no time means no curfew,
-- on purpose. The time is local to the Property and belongs to the evening of
-- the business night it is read for, or to the small hours after it when it is
-- earlier than the Property's cutoff (a curfew at 00:30).
create table public.attendance_settings (
  property_id uuid primary key,
  organization_id uuid not null,
  curfew_time time(0),
  updated_at timestamptz not null default current_timestamp,
  updated_by uuid references public.users (id) on delete restrict,
  constraint attendance_settings_property_fkey
    foreign key (property_id, organization_id)
    references public.properties (id, organization_id)
    on delete restrict on update no action
);

comment on table public.attendance_settings is
  'A Property''s curfew for the roll call. No row: the application''s default; a row with no time: no curfew (LA-S1-*).';

alter table public.attendance_settings enable row level security;
alter table public.attendance_settings force row level security;

create policy attendance_settings_read_accessible_property
  on public.attendance_settings for select
  using (property_id in (select app.accessible_property_ids()));

create policy attendance_settings_insert_configure
  on public.attendance_settings for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'configuration.manage')
  );

create policy attendance_settings_update_configure
  on public.attendance_settings for update
  using (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'configuration.manage')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'configuration.manage')
  );

revoke all on public.attendance_settings from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.attendance_settings to ranza_app;
grant insert (property_id, organization_id, curfew_time)
  on public.attendance_settings to ranza_app;
grant update (curfew_time) on public.attendance_settings to ranza_app;

create function app.attendance_setting_is_stamped()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := current_timestamp;
  new.updated_by := app.current_user_id();
  return new;
end;
$$;

create trigger attendance_settings_stamped
  before insert or update on public.attendance_settings
  for each row execute function app.attendance_setting_is_stamped();

-- Whether a night's curfew has passed at an instant. The instant is an
-- argument so a boundary can be tested without waiting for it; the screen
-- passes now(). No curfew has never passed.
create function app.curfew_has_passed(
  night date,
  curfew time,
  cutoff time,
  zone text,
  at_instant timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    at_instant >= (
      (night + case when curfew >= cutoff then 0 else 1 end) + curfew
    ) at time zone zone,
    false
  );
$$;

comment on function app.curfew_has_passed(date, time, time, text, timestamptz) is
  'Whether the curfew of a business night has passed at an instant: the curfew on the night''s own date, or on the next when it is earlier than the Property''s cutoff.';

grant execute on function app.curfew_has_passed(date, time, time, text, timestamptz)
  to ranza_app;

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------

-- A Resident's nights away. A night is the business night that begins on the
-- date, so a leave from the 3rd to the 5th is away on the nights of the 3rd,
-- 4th and 5th and back for the 6th.
--
-- `to_night` is the last night away. `planned_to_night` keeps what was first
-- granted, so a leave ended early still says how long it was meant to be.
create table public.attendance_leaves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  stay_id uuid not null,
  from_night date not null,
  to_night date not null,
  planned_to_night date not null,
  status text not null default 'granted',
  granted_by uuid not null references public.users (id) on delete restrict,
  granted_at timestamptz not null default current_timestamp,
  closed_by uuid references public.users (id) on delete restrict,
  closed_at timestamptz,
  constraint attendance_leaves_stay_fkey
    foreign key (stay_id, property_id, organization_id)
    references public.stays (id, property_id, organization_id)
    on delete restrict on update no action,
  constraint attendance_leaves_id_property_key
    unique (id, property_id, organization_id),
  constraint attendance_leaves_status_check
    check (status in ('granted', 'ended', 'cancelled')),
  constraint attendance_leaves_nights_check
    check (from_night <= to_night
           and to_night <= planned_to_night
           and planned_to_night - from_night < 366),
  -- Open while granted, closed by somebody when not. An ended leave is shorter
  -- than it was granted; a cancelled one is as granted and counts for nothing.
  constraint attendance_leaves_state_check
    check (case status
             when 'granted' then closed_at is null and closed_by is null
                                 and to_night = planned_to_night
             when 'ended' then closed_at is not null and closed_by is not null
                               and to_night < planned_to_night
             else closed_at is not null and closed_by is not null
                  and to_night = planned_to_night
           end),
  -- One Resident is away once on any night. A cancelled leave is not away.
  constraint attendance_leaves_one_at_a_time
    exclude using gist (
      stay_id with =,
      daterange(from_night, to_night + 1) with &&
    ) where (status <> 'cancelled')
);

comment on table public.attendance_leaves is
  'The nights a Resident is away. Never deleted: ended or cancelled, with who and when (LA-S1-*).';

create index attendance_leaves_property_nights_idx
  on public.attendance_leaves (property_id, from_night, to_night);

alter table public.attendance_leaves enable row level security;
alter table public.attendance_leaves force row level security;

-- Whoever calls the roll must know who is away; only `leave.grant` knows why.
create policy attendance_leaves_read_with_permission
  on public.attendance_leaves for select
  using (
    property_id in (select app.accessible_property_ids())
    and (
      app.has_organization_permission(organization_id, 'attendance.take')
      or app.has_organization_permission(organization_id, 'leave.grant')
    )
  );

create policy attendance_leaves_insert_leave_grant
  on public.attendance_leaves for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'leave.grant')
  );

create policy attendance_leaves_update_leave_grant
  on public.attendance_leaves for update
  using (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'leave.grant')
  )
  with check (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'leave.grant')
  );

-- The Resident and the nights are the caller's. Who granted it, when, what it
-- was planned as and its status are the database's; an UPDATE may only move
-- the status and the last night, and the trigger below decides to what.
revoke all on public.attendance_leaves from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.attendance_leaves to ranza_app;
grant insert (organization_id, property_id, stay_id, from_night, to_night)
  on public.attendance_leaves to ranza_app;
grant update (status, to_night) on public.attendance_leaves to ranza_app;

-- Leave is for a Resident whose Stay is coming or current, from the day the
-- Stay begins. Invoker: the Stay is read through its own policy, so a Stay the
-- caller does not reach is not found and is refused like any other.
create function app.leave_is_granted_for_a_resident()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resident public.stays%rowtype;
begin
  select * into resident from public.stays as stay where stay.id = new.stay_id;

  if not found
     or resident.stay_type <> 'resident'
     or resident.status not in ('reserved', 'in_house')
     or new.from_night < resident.starts_on then
    raise exception 'that Resident cannot be given leave on those nights'
      using errcode = 'RZL01';
  end if;

  new.status := 'granted';
  new.planned_to_night := new.to_night;
  new.granted_by := app.current_user_id();
  new.granted_at := current_timestamp;
  new.closed_by := null;
  new.closed_at := null;
  return new;
end;
$$;

create trigger attendance_leaves_granted
  before insert on public.attendance_leaves
  for each row execute function app.leave_is_granted_for_a_resident();

-- Closing a leave. Cancelled while no night of it has passed, ended once one
-- has — the nights already spent away are history, not a mistake. Ending
-- gives the last night spent away, which is shorter than it was and not
-- before the first.
create function app.leave_is_closed_by_a_rule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := app.property_today(old.property_id);
begin
  if old.status <> 'granted' then
    raise exception 'that leave is already over'
      using errcode = 'RZL02';
  end if;

  if new.status = 'cancelled' then
    if old.from_night < today then
      raise exception 'a night of that leave has passed, so it can only be ended'
        using errcode = 'RZL02';
    end if;
    new.to_night := old.to_night;
  elsif new.status = 'ended' then
    if old.from_night >= today
       or new.to_night >= old.to_night
       or new.to_night < old.from_night then
      raise exception 'that leave can be ended once it has begun, and only shorter'
        using errcode = 'RZL02';
    end if;
  else
    raise exception 'a leave is ended or cancelled'
      using errcode = 'RZL02';
  end if;

  new.closed_by := app.current_user_id();
  new.closed_at := current_timestamp;
  return new;
end;
$$;

create trigger attendance_leaves_closed
  before update of status, to_night on public.attendance_leaves
  for each row execute function app.leave_is_closed_by_a_rule();

create function app.attendance_row_is_never_rewritten()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'attendance is never rewritten or deleted'
    using errcode = '42501';
end;
$$;

-- For every role, the owner included, as audit.records and the business day
-- closes are: a grant says nothing to the role that runs migrations.
create trigger attendance_leaves_never_deleted
  before delete or truncate on public.attendance_leaves
  for each statement execute function app.attendance_row_is_never_rewritten();

-- ---------------------------------------------------------------------------
-- The reason for a leave
-- ---------------------------------------------------------------------------

create table public.attendance_leave_reasons (
  leave_id uuid primary key,
  organization_id uuid not null,
  property_id uuid not null,
  reason text not null,
  constraint attendance_leave_reasons_leave_fkey
    foreign key (leave_id, property_id, organization_id)
    references public.attendance_leaves (id, property_id, organization_id)
    on delete restrict on update no action,
  constraint attendance_leave_reasons_reason_check
    check (reason = btrim(reason) and char_length(reason) between 2 and 300)
);

comment on table public.attendance_leave_reasons is
  'Why a Resident is away. Read only with leave.grant, apart from the leave itself (LA-S1-*).';

alter table public.attendance_leave_reasons enable row level security;
alter table public.attendance_leave_reasons force row level security;

create policy attendance_leave_reasons_read_leave_grant
  on public.attendance_leave_reasons for select
  using (
    property_id in (select app.accessible_property_ids())
    and app.has_organization_permission(organization_id, 'leave.grant')
  );

create policy attendance_leave_reasons_insert_leave_grant
  on public.attendance_leave_reasons for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'leave.grant')
  );

revoke all on public.attendance_leave_reasons from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.attendance_leave_reasons to ranza_app;
grant insert (leave_id, organization_id, property_id, reason)
  on public.attendance_leave_reasons to ranza_app;

create trigger attendance_leave_reasons_append_only
  before update or delete or truncate on public.attendance_leave_reasons
  for each statement execute function app.attendance_row_is_never_rewritten();

-- A leave without a reason is unrepresentable, checked when the transaction
-- ends so the leave and its reason can be written in either order.
create function app.leave_has_a_reason()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.attendance_leave_reasons as reason
     where reason.leave_id = new.id
  ) then
    raise exception 'a leave is given a reason'
      using errcode = 'RZL03';
  end if;
  return null;
end;
$$;

create constraint trigger attendance_leaves_have_a_reason
  after insert on public.attendance_leaves
  deferrable initially deferred
  for each row execute function app.leave_has_a_reason();

-- ---------------------------------------------------------------------------
-- The roll call
-- ---------------------------------------------------------------------------

-- One row per answer. There is no header: the roll call of a Property for a
-- night is the marks sharing the two, and the latest of a Resident's is the
-- current one. The identity column orders revisions even when two Staff
-- Members answer in the same millisecond.
create table public.attendance_marks (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  property_id uuid not null,
  stay_id uuid not null,
  night date not null,
  status text not null,
  marked_by uuid not null references public.users (id) on delete restrict,
  marked_at timestamptz not null default current_timestamp,
  constraint attendance_marks_stay_fkey
    foreign key (stay_id, property_id, organization_id)
    references public.stays (id, property_id, organization_id)
    on delete restrict on update no action,
  constraint attendance_marks_status_check
    check (status in ('present', 'absent'))
);

comment on table public.attendance_marks is
  'Present or absent, one row per revision and never changed: the latest row of a Resident for a night is the current answer (LA-S1-*).';

create index attendance_marks_current_idx
  on public.attendance_marks (stay_id, night, id desc);

create index attendance_marks_night_idx
  on public.attendance_marks (property_id, night);

alter table public.attendance_marks enable row level security;
alter table public.attendance_marks force row level security;

create policy attendance_marks_read_with_permission
  on public.attendance_marks for select
  using (
    property_id in (select app.accessible_property_ids())
    and (
      app.has_organization_permission(organization_id, 'attendance.take')
      or app.has_organization_permission(organization_id, 'leave.grant')
    )
  );

create policy attendance_marks_insert_attendance_take
  on public.attendance_marks for insert
  with check (
    app.can_use_capability(property_id, 'front_office', 'attendance')
    and app.has_organization_permission(organization_id, 'attendance.take')
  );

revoke all on public.attendance_marks from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.attendance_marks to ranza_app;
grant insert (organization_id, property_id, stay_id, night, status)
  on public.attendance_marks to ranza_app;

-- A Resident is called on a night they were in the Stay: from the day it
-- began, not after the day it ended, and not on a night still to come — a
-- roll call that is late is still one, and a roll call for tomorrow is not.
create function app.mark_is_for_a_night_in_a_stay()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resident public.stays%rowtype;
begin
  select * into resident from public.stays as stay where stay.id = new.stay_id;

  if not found
     or resident.stay_type <> 'resident'
     or resident.status not in ('in_house', 'departed')
     or new.night < resident.starts_on
     or new.night > app.property_today(new.property_id)
     or (resident.status = 'departed' and new.night >= resident.ends_on) then
    raise exception 'that Resident cannot be called on that night'
      using errcode = 'RZA01';
  end if;

  new.marked_by := app.current_user_id();
  new.marked_at := current_timestamp;
  return new;
end;
$$;

create trigger attendance_marks_stamped
  before insert on public.attendance_marks
  for each row execute function app.mark_is_for_a_night_in_a_stay();

create trigger attendance_marks_append_only
  before update or delete or truncate on public.attendance_marks
  for each statement execute function app.attendance_row_is_never_rewritten();
