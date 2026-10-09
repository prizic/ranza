-- An export is a record with a requester and a state, not a file somebody made
-- once (RANZ-48, ADR 0043).
--
-- 20260916010100 created the record and could not produce a file. This is the
-- half that makes the record true:
--
--   - a state machine the database draws and refuses to leave, for every role;
--   - a request that carries only what the requester may say. The runtime role
--     inserts the request fields and nothing else, so it cannot forge a ready
--     export, set a status, or put a file where none was made;
--   - no table grant for ranza_worker at all. The worker reaches an export
--     through single-purpose functions (the next migration), the pattern ADR
--     0027 set for sessions;
--   - the file's content unreadable by SELECT. The list of exports never
--     carries a body, and a download goes through one function that asks the
--     downloader's permissions again.
--
-- Hand-written, in the order the pieces depend on each other.

-- ---------------------------------------------------------------------------
-- Who asked: a display name, or an address with its domain dropped
-- ---------------------------------------------------------------------------

-- Masked here and not by callers: the label ships in rows any exporter reads,
-- and a promise a client makes about its own input cannot be enforced. A name
-- is kept; anything holding an @ becomes `local@***`; control characters are
-- stripped. The local part is the memorable half of an address, the domain is
-- the part that identifies a person outside this product.
create function app.requester_label(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when cleaned = '' then 'unknown'
    when cleaned ~ '^[^@]+@\*\*\*$' then left(cleaned, 200)
    when position('@' in cleaned) > 0
      then left(coalesce(nullif(btrim(split_part(cleaned, '@', 1)), ''), 'unknown'), 150) || '@***'
    else left(cleaned, 200)
  end
  from (
    select btrim(regexp_replace(coalesce(raw, ''), '[[:cntrl:]]', '', 'g')) as cleaned
  ) as stripped;
$$;

comment on function app.requester_label(text) is
  'A requester''s name as an export records it: the name kept, an address cut to local@*** , control characters removed. Stamped at insert, never by the caller.';

revoke execute on function app.requester_label(text) from public, ranza_app, ranza_auth, ranza_worker;
grant execute on function app.requester_label(text) to ranza_app;

-- ---------------------------------------------------------------------------
-- Existing rows, brought to what the constraints below say
-- ---------------------------------------------------------------------------

-- The module this replaces never produced a file, so rows that break these
-- rules are not expected. This is for a database that has some anyway: each
-- row becomes the nearest honest state instead of stopping the migration.
--   - excel was offered and never implemented; whatever was written was CSV;
--   - a ready export with no content has nothing to download: it is expired;
--   - only a failed export has an error, and only a ready one has a file;
--   - the requester label never holds a whole address.
update public.data_exports
   set format = case when format = 'excel' then 'csv' else format end,
       status = case when status = 'ready' and file_content is null
                     then 'expired' else status end,
       file_content = case when status = 'ready' then file_content end,
       file_name = case when status = 'ready' and file_content is not null
                        then coalesce(file_name, 'export-' || left(id::text, 8) || '.'
                                      || case when format = 'json' then 'json' else 'csv' end)
                        else file_name end,
       file_size_bytes = case when status = 'ready' and file_content is not null
                              then coalesce(file_size_bytes, octet_length(file_content))
                              else file_size_bytes end,
       expires_at = case when status = 'ready' and file_content is not null
                         then coalesce(expires_at, coalesce(completed_at, updated_at) + interval '7 days')
                         else expires_at end,
       error = case when status = 'failed' then 'internal_error' end,
       completed_at = case when status in ('ready', 'failed')
                           then coalesce(completed_at, updated_at) end,
       requester_name = app.requester_label(requester_name);

update public.export_schedules
   set format = 'csv'
 where format = 'excel';

-- A schedule's runs name who made it, as an on-demand export names who asked.
alter table public.export_schedules add column created_by_name text;

update public.export_schedules as schedule
   set created_by_name = app.requester_label(creator.email)
  from public.users as creator
 where creator.id = schedule.created_by;

alter table public.export_schedules alter column created_by_name set not null;

-- ---------------------------------------------------------------------------
-- What a row may hold
-- ---------------------------------------------------------------------------

alter table public.data_exports
  drop constraint data_exports_status_check,
  drop constraint data_exports_format_check,
  add constraint data_exports_status_check
    check (status in ('pending', 'processing', 'ready', 'failed', 'expired')),
  add constraint data_exports_format_check
    check (format in ('csv', 'json')),
  add constraint data_exports_resource_types_are_known
    check (resource_types <@ array['residents_guests', 'reservations_stays', 'rooms_beds',
                                   'folios_payments', 'audit_log']::text[]),
  -- A reason is a code the screen can say in the reader's language. The raw
  -- exception goes to the worker's log, never into a row anyone reads.
  add constraint data_exports_failure_has_a_reason
    check ((status = 'failed') = (error is not null)
           and (error is null
                or error in ('requester_not_permitted', 'too_large', 'worker_stopped', 'internal_error'))),
  add constraint data_exports_a_file_exists_only_while_ready
    check ((file_content is not null) = (status = 'ready')),
  add constraint data_exports_ready_describes_its_file
    check (status <> 'ready'
           or (file_name is not null and file_size_bytes is not null and expires_at is not null)),
  add constraint data_exports_finished_has_a_time
    check ((status in ('ready', 'failed', 'expired')) = (completed_at is not null)),
  add constraint data_exports_file_is_bounded
    check (file_content is null or octet_length(file_content) <= 26214400),
  add constraint data_exports_requester_is_a_name_not_an_address
    check (char_length(btrim(requester_name)) between 1 and 200
           and (position('@' in requester_name) = 0 or requester_name ~ '^[^@]+@\*\*\*$'));

alter table public.export_schedules
  drop constraint export_schedules_format_check,
  add constraint export_schedules_format_check
    check (format in ('csv', 'json')),
  add constraint export_schedules_resource_types_are_known
    check (resource_types <@ array['residents_guests', 'reservations_stays', 'rooms_beds',
                                   'folios_payments', 'audit_log']::text[]),
  add constraint export_schedules_name_is_present
    check (char_length(btrim(name)) between 1 and 200),
  add constraint export_schedules_creator_is_a_name_not_an_address
    check (char_length(btrim(created_by_name)) between 1 and 200
           and (position('@' in created_by_name) = 0 or created_by_name ~ '^[^@]+@\*\*\*$'));

-- ---------------------------------------------------------------------------
-- The state machine, for every role
-- ---------------------------------------------------------------------------

-- 23514 like a check constraint, because that is what this is: a rule about
-- the row's own values that a check constraint cannot state, since it needs the
-- old row. The owner is held to it as well; a trigger fires for everybody.
--
--   pending -> processing | failed      a job claims it, or is refused it
--   processing -> ready | failed        it finishes, or does not
--   ready -> expired                    its retention ends
--
-- failed and expired are final. An update must move the export: nothing here
-- touches a row that stays where it is.
create function app.data_export_is_drawn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'an export is requested pending, not %', new.status
        using errcode = '23514';
    end if;
    new.requester_name := app.requester_label(new.requester_name);
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.requester_id is distinct from old.requester_id
     or new.requester_name is distinct from old.requester_name
     or new.resource_types is distinct from old.resource_types
     or new.format is distinct from old.format
     or new.trigger_type is distinct from old.trigger_type
     or new.schedule_id is distinct from old.schedule_id
     or new.requested_at is distinct from old.requested_at then
    raise exception 'what an export asked for, and who asked, is never rewritten'
      using errcode = '23514';
  end if;

  if not (
       (old.status = 'pending' and new.status in ('processing', 'failed'))
    or (old.status = 'processing' and new.status in ('ready', 'failed'))
    or (old.status = 'ready' and new.status = 'expired')
  ) then
    raise exception 'an export cannot go from % to %', old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function app.data_export_is_drawn() is
  'Refuses every export state change not drawn in docs/features/data-export/states.mmd, and any rewrite of the request, for every role. Masks the requester label at insert.';

create trigger data_exports_are_drawn
  before insert or update on public.data_exports
  for each row execute function app.data_export_is_drawn();

-- ---------------------------------------------------------------------------
-- A schedule's run time and creator label are the database's to set
-- ---------------------------------------------------------------------------

create function app.export_step(frequency text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case frequency
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '1 month'
  end;
$$;

revoke execute on function app.export_step(text) from public, ranza_app, ranza_auth, ranza_worker;
-- The stamp below runs as whoever inserts, and reads the step.
grant execute on function app.export_step(text) to ranza_app;

create function app.export_schedule_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by_name := app.requester_label(new.created_by_name);
  new.next_run_at := now() + app.export_step(new.frequency);
  return new;
end;
$$;

comment on function app.export_schedule_is_stamped() is
  'A schedule''s first run is one step from now and its creator label is masked, whatever the insert said.';

create trigger export_schedules_are_stamped
  before insert on public.export_schedules
  for each row execute function app.export_schedule_is_stamped();

-- ---------------------------------------------------------------------------
-- Which permission each dataset needs (ADR 0043)
-- ---------------------------------------------------------------------------

-- The one place the mapping is written. An export of a dataset needs what
-- reading that dataset in the workspace would, and the workspace asks for no
-- permission to read Guests, Reservations, Stays or Units — only reach and the
-- front desk being on — so a front-desk permission stands in for "may work at
-- the desk". Units need nothing more than reach. Folio lines are finance's;
-- the audit log is audit.read (ADR 0031).
--
-- Null for a name that is no dataset, which no caller treats as permitted.
create function app.data_export_resource_permissions(resource text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case resource
    when 'residents_guests' then array['front_desk.book', 'front_desk.check_in',
      'front_desk.check_out', 'front_desk.cancel', 'front_desk.amend', 'front_desk.close_day']
    when 'reservations_stays' then array['front_desk.book', 'front_desk.check_in',
      'front_desk.check_out', 'front_desk.cancel', 'front_desk.amend', 'front_desk.close_day']
    when 'rooms_beds' then array[]::text[]
    when 'folios_payments' then array['finance.manage_folio']
    when 'audit_log' then array['audit.read']
  end;
$$;

comment on function app.data_export_resource_permissions(text) is
  'Any one of these permissions lets a dataset be exported, on top of data_export.create. Empty: reach alone. Null: not a dataset.';

revoke execute on function app.data_export_resource_permissions(text) from public, ranza_app, ranza_auth, ranza_worker;
grant execute on function app.data_export_resource_permissions(text) to ranza_app;

-- Whether the acting Staff Member may export every dataset named: the policy
-- below asks it of a request, and a download asks it again of the downloader.
create function app.may_export(target_organization_id uuid, wanted_resources text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(bool_and(
           needed.permissions is not null
           and (cardinality(needed.permissions) = 0
                or exists (
                     select 1
                     from unnest(needed.permissions) as permission
                     where app.has_organization_permission(target_organization_id, permission)))
         ), false)
  from (
    select app.data_export_resource_permissions(resource) as permissions
    from unnest(wanted_resources) as resource
  ) as needed;
$$;

comment on function app.may_export(uuid, text[]) is
  'Whether the acting Staff Member holds, for every dataset named, one of the permissions the mapping asks. False for an empty list.';

revoke execute on function app.may_export(uuid, text[]) from public, ranza_app, ranza_auth, ranza_worker;
grant execute on function app.may_export(uuid, text[]) to ranza_app;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- The worker had a policy per command and a grant to match. It holds neither
-- now; the next migration gives it functions.
drop policy data_exports_read_worker on public.data_exports;
drop policy data_exports_insert_worker on public.data_exports;
drop policy data_exports_update_worker on public.data_exports;
drop policy export_schedules_read_worker on public.export_schedules;
drop policy export_schedules_update_worker on public.export_schedules;

-- A Staff Member never changes an export: it moves because a job moved it.
drop policy data_exports_update_app on public.data_exports;

-- Reading is data_export.read, and a requester always reads their own request:
-- a role composed with data_export.create alone must be able to see what it
-- just asked for, or the insert's RETURNING would be refused by this very
-- policy.
drop policy data_exports_read_app on public.data_exports;
create policy data_exports_read_app on public.data_exports
  for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and (
      app.has_organization_permission(organization_id, 'data_export.read')
      or (requester_id = app.current_user_id()
          and app.has_organization_permission(organization_id, 'data_export.create'))
    )
  );

-- A request names datasets, and the requester must be able to export each of
-- them: asking for what you could not read is refused now rather than failing
-- later in a queue.
drop policy data_exports_insert_app on public.data_exports;
create policy data_exports_insert_app on public.data_exports
  for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and requester_id = app.current_user_id()
    and app.has_organization_permission(organization_id, 'data_export.create')
    and app.may_export(organization_id, resource_types)
  );

drop policy export_schedules_insert_app on public.export_schedules;
create policy export_schedules_insert_app on public.export_schedules
  for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and created_by = app.current_user_id()
    and app.has_organization_permission(organization_id, 'data_export.create')
    and app.may_export(organization_id, resource_types)
  );

-- ---------------------------------------------------------------------------
-- Grants (ADR 0012): a policy bounds rows, a grant bounds columns
-- ---------------------------------------------------------------------------

revoke all on public.data_exports from ranza_app;
revoke all on public.data_exports from ranza_worker;

-- Every column but the file. A list of exports must not carry fifty bodies, and
-- the policy that lets somebody see an export is not the question "may they
-- have the file".
grant select (id, organization_id, requester_id, requester_name, resource_types,
              format, status, trigger_type, schedule_id, file_name, file_size_bytes,
              record_counts, error, expires_at, requested_at, completed_at,
              created_at, updated_at)
  on public.data_exports to ranza_app;

-- The request and nothing else. Status, trigger, schedule, file, counts and
-- times are the database's and the worker's, never the requester's.
grant insert (organization_id, requester_id, requester_name, resource_types, format)
  on public.data_exports to ranza_app;

revoke all on public.export_schedules from ranza_app;
revoke all on public.export_schedules from ranza_worker;

grant select on public.export_schedules to ranza_app;
grant insert (organization_id, created_by, created_by_name, name, resource_types,
              format, frequency)
  on public.export_schedules to ranza_app;
-- Pausing and resuming. A schedule's datasets and cadence are not edited:
-- changing what it exports would need the permission check an insert has.
grant update (status, updated_at) on public.export_schedules to ranza_app;
