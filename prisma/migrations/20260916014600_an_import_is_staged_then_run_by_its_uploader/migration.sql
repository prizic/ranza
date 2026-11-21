-- Guided import (blueprint 19.1, IMP-S1-*, ADR 0065 Proposed).
--
-- A spreadsheet of rooms, and later of the people who live in them, becomes
-- records. The import itself writes none of them. It is a record of what a
-- file held and what became of each row; every room, booking and Guest is made
-- by the command a person would have used by hand, under the session of
-- whoever uploaded the file. So an import can do nothing its uploader could
-- not, by construction, and there is no second way into any table.
--
-- Two tables, because two sets of people read them:
--
--   imports       who uploaded what, when, its state and its counts; read by
--                 whoever holds `import.run` at the Property. Never deleted.
--   import_rows   what the file held, row by row, and what became of each;
--                 read and settled by the uploader alone, because slice 2's
--                 rows hold identity numbers. Forgotten after seven days.
--
-- The counts live on the import, kept by a trigger, so they outlive the rows.
--
-- SQLSTATEs, Ranza's own class (see 20260916005000):
--   RZI01  that import cannot move to that state
--   RZI02  that row cannot be settled so

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------

insert into public.staff_permissions (key, module_key) values
  ('import.run', 'platform_core');

-- An owner and a manager. Not the desk: an import adds rooms by the hundred,
-- and the desk adds them, where it may at all, one screen at a time.
update public.staff_roles
   set permissions = array_append(permissions, 'import.run'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('import.run' = any (permissions));

-- ---------------------------------------------------------------------------
-- The import
-- ---------------------------------------------------------------------------

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  kind text not null,
  status text not null default 'staged',
  file_name text not null,
  uploaded_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default current_timestamp,
  started_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.users (id) on delete restrict,
  -- The last time anything happened to it. The sweep counts seven days from
  -- here, so an import somebody is still working through is left alone.
  touched_at timestamptz not null default current_timestamp,
  rows_forgotten_at timestamptz,
  ready_count integer not null default 0,
  wrong_count integer not null default 0,
  skipped_count integer not null default 0,
  imported_count integer not null default 0,
  refused_count integer not null default 0,
  left_count integer not null default 0,
  constraint imports_property_fkey
    foreign key (property_id, organization_id)
    references public.properties (id, organization_id)
    on delete restrict on update no action,
  constraint imports_id_property_key
    unique (id, property_id, organization_id),
  constraint imports_kind_check check (kind in ('rooms', 'people')),
  constraint imports_status_check
    check (status in ('staged', 'importing', 'finished', 'discarded')),
  constraint imports_file_name_check
    check (file_name = btrim(file_name)
           and char_length(file_name) between 1 and 200),
  constraint imports_counts_check
    check (least(ready_count, wrong_count, skipped_count, imported_count,
                 refused_count, left_count) >= 0),
  constraint imports_state_check
    check (case status
             when 'staged' then started_at is null and closed_at is null
             when 'importing' then started_at is not null and closed_at is null
             when 'finished' then started_at is not null and closed_at is not null
             else started_at is null and closed_at is not null
           end)
);

comment on table public.imports is
  'An uploaded file and what became of it. Never deleted; its rows are forgotten after seven days and its counts stay (IMP-S1-*).';

-- One import runs at a Property at a time (IMP-S1-07). Two people starting at
-- once end with one import running, whichever asked first.
create unique index imports_one_running_per_property
  on public.imports (property_id) where status = 'importing';

create index imports_property_created_idx
  on public.imports (property_id, created_at desc);

alter table public.imports enable row level security;
alter table public.imports force row level security;

create policy imports_read_importers
  on public.imports for select
  to ranza_app
  using (
    property_id in (select app.accessible_property_ids())
    and app.has_organization_permission(organization_id, 'import.run')
  );

create policy imports_insert_importers
  on public.imports for insert
  to ranza_app
  with check (
    property_id in (select app.accessible_property_ids())
    and app.has_organization_permission(organization_id, 'import.run')
    and uploaded_by = app.current_user_id()
  );

-- Any importer at the Property may reach the row to stop it; which move each
-- may make is the trigger's, since a policy cannot compare old with new.
create policy imports_update_importers
  on public.imports for update
  to ranza_app
  using (
    property_id in (select app.accessible_property_ids())
    and app.has_organization_permission(organization_id, 'import.run')
  )
  with check (
    property_id in (select app.accessible_property_ids())
    and app.has_organization_permission(organization_id, 'import.run')
  );

revoke all on public.imports from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.imports to ranza_app;
grant insert (organization_id, property_id, kind, file_name, uploaded_by)
  on public.imports to ranza_app;
grant update (status) on public.imports to ranza_app;

create function app.import_is_stamped()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.uploaded_by := coalesce(app.current_user_id(), new.uploaded_by);
  new.status := 'staged';
  new.created_at := current_timestamp;
  new.touched_at := current_timestamp;
  return new;
end;
$$;

create trigger imports_stamped
  before insert on public.imports
  for each row execute function app.import_is_stamped();

-- staged -> importing     its uploader, with a ready row
-- staged -> discarded     its uploader, or the sweep
-- importing -> finished   its last row settling, anybody stopping it, the sweep
-- Nothing else, for anybody: finished and discarded are final.
--
-- "Its uploader" is asked of `ranza_app` only. The sweep and the trigger that
-- finishes an import run as the owner of their definer functions and have no
-- person behind them.
create function app.import_moves_forward()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  by_a_person boolean := current_user = 'ranza_app';
  acting uuid := app.current_user_id();
begin
  if new.status = old.status then
    new.touched_at := current_timestamp;
    return new;
  end if;

  if old.status = 'staged' and new.status = 'importing' then
    if by_a_person and acting is distinct from old.uploaded_by then
      raise exception 'only its uploader starts an import' using errcode = 'RZI01';
    end if;
    if old.ready_count = 0 then
      raise exception 'an import with no ready row has nothing to import'
        using errcode = 'RZI01';
    end if;
    new.started_at := current_timestamp;
  elsif old.status = 'staged' and new.status = 'discarded' then
    if by_a_person and acting is distinct from old.uploaded_by then
      raise exception 'only its uploader discards an import' using errcode = 'RZI01';
    end if;
    new.closed_at := current_timestamp;
    new.closed_by := acting;
  elsif old.status = 'importing' and new.status = 'finished' then
    new.closed_at := current_timestamp;
    new.closed_by := acting;
  else
    raise exception 'an import does not move from % to %', old.status, new.status
      using errcode = 'RZI01';
  end if;

  new.touched_at := current_timestamp;
  return new;
end;
$$;

create trigger imports_move_forward
  before update on public.imports
  for each row execute function app.import_moves_forward();

create function app.import_is_never_deleted()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'an import is a record and is never deleted'
    using errcode = '42501';
end;
$$;

create trigger imports_never_deleted
  before delete on public.imports
  for each row execute function app.import_is_never_deleted();

-- ---------------------------------------------------------------------------
-- Its rows
-- ---------------------------------------------------------------------------

-- `cells` is what the file said, by column key; `problems` is why a row is
-- wrong, as codes the screen words in the viewer's language. `outcome` is the
-- code of what happened at the commit, and `result_id` the record it made.
create table public.import_rows (
  import_id uuid not null,
  row_number integer not null,
  organization_id uuid not null,
  property_id uuid not null,
  state text not null,
  cells jsonb not null,
  problems jsonb not null default '[]'::jsonb,
  outcome text,
  result_id uuid,
  settled_at timestamptz,
  primary key (import_id, row_number),
  constraint import_rows_import_fkey
    foreign key (import_id, property_id, organization_id)
    references public.imports (id, property_id, organization_id)
    on delete restrict on update no action,
  constraint import_rows_row_number_check check (row_number between 1 and 100000),
  constraint import_rows_state_check
    check (state in ('ready', 'wrong', 'skipped', 'imported', 'refused', 'left')),
  constraint import_rows_cells_check check (jsonb_typeof(cells) = 'object'),
  constraint import_rows_problems_check check (jsonb_typeof(problems) = 'array'),
  constraint import_rows_outcome_check
    check (outcome is null or outcome ~ '^[a-z_]{1,60}$')
);

comment on table public.import_rows is
  'What an uploaded file held and what became of each row. Read by its uploader alone and forgotten after seven days (IMP-S1-04, IMP-S1-15).';

alter table public.import_rows enable row level security;
alter table public.import_rows force row level security;

-- The uploader's own, while they still hold `import.run` there: the policy
-- reads the import through the importers' policy above, so reach or the
-- permission taken away takes the rows with it.
create policy import_rows_read_uploader
  on public.import_rows for select
  to ranza_app
  using (
    exists (select 1 from public.imports as import
             where import.id = import_rows.import_id
               and import.uploaded_by = app.current_user_id())
  );

create policy import_rows_insert_uploader
  on public.import_rows for insert
  to ranza_app
  with check (
    exists (select 1 from public.imports as import
             where import.id = import_rows.import_id
               and import.property_id = import_rows.property_id
               and import.organization_id = import_rows.organization_id
               and import.uploaded_by = app.current_user_id()
               and import.status = 'staged')
  );

create policy import_rows_update_uploader
  on public.import_rows for update
  to ranza_app
  using (
    exists (select 1 from public.imports as import
             where import.id = import_rows.import_id
               and import.uploaded_by = app.current_user_id())
  )
  with check (
    exists (select 1 from public.imports as import
             where import.id = import_rows.import_id
               and import.uploaded_by = app.current_user_id())
  );

revoke all on public.import_rows from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.import_rows to ranza_app;
grant insert (import_id, row_number, organization_id, property_id, state, cells, problems)
  on public.import_rows to ranza_app;
grant update (state, outcome, result_id) on public.import_rows to ranza_app;

-- A row arrives ready, wrong or already there, and nothing else: what happened
-- at the commit is not something a preview can say.
create function app.import_row_arrives()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.state not in ('ready', 'wrong', 'skipped') then
    raise exception 'a row arrives ready, wrong or already there'
      using errcode = 'RZI02';
  end if;
  new.outcome := null;
  new.result_id := null;
  new.settled_at := null;
  return new;
end;
$$;

create trigger import_rows_arrive
  before insert on public.import_rows
  for each row execute function app.import_row_arrives();

-- A ready row is settled once: imported, already there or refused while its
-- import is running; left unimported once the import is closed. No other row
-- moves at all.
create function app.import_row_settles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  import_status text;
begin
  if new.state = old.state then
    raise exception 'a row is settled once' using errcode = 'RZI02';
  end if;
  if old.state <> 'ready' then
    raise exception 'a % row is not settled again', old.state
      using errcode = 'RZI02';
  end if;

  select status into import_status
    from public.imports where id = old.import_id;

  if new.state in ('imported', 'skipped', 'refused') then
    if import_status is distinct from 'importing' then
      raise exception 'a row is settled only while its import is running'
        using errcode = 'RZI02';
    end if;
  elsif new.state = 'left' then
    if import_status is null or import_status not in ('finished', 'discarded') then
      raise exception 'a row is left unimported only once its import is closed'
        using errcode = 'RZI02';
    end if;
  else
    raise exception 'a ready row does not become %', new.state
      using errcode = 'RZI02';
  end if;

  new.settled_at := current_timestamp;
  return new;
end;
$$;

create trigger import_rows_settle
  before update on public.import_rows
  for each row execute function app.import_row_settles();

-- The counts, and the finish. A definer, because `ranza_app` is granted
-- `status` on an import and nothing else: the counts are the rows' own and no
-- caller writes them.
create function app.import_counts_follow_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
  running boolean;
begin
  update public.imports
     set ready_count    = ready_count
                          + (new.state = 'ready')::int
                          - coalesce((tg_op = 'UPDATE' and old.state = 'ready'), false)::int,
         wrong_count    = wrong_count    + (tg_op = 'INSERT' and new.state = 'wrong')::int,
         skipped_count  = skipped_count
                          + (new.state = 'skipped'
                             and (tg_op = 'INSERT' or old.state <> 'skipped'))::int,
         imported_count = imported_count + (tg_op = 'UPDATE' and new.state = 'imported')::int,
         refused_count  = refused_count  + (tg_op = 'UPDATE' and new.state = 'refused')::int,
         left_count     = left_count     + (tg_op = 'UPDATE' and new.state = 'left')::int
   where id = new.import_id
     and (organization_id = app.worker_organization_id()
          or property_id in (select app.accessible_property_ids()))
   returning ready_count, status = 'importing' into remaining, running;

  -- Nobody who reaches the import moved this row. The policies on import_rows
  -- already refuse that, so this binds only for a write no policy saw: it is
  -- refused rather than left with counts that no longer match the rows.
  if not found then
    raise exception 'that import is out of reach' using errcode = '42501';
  end if;

  if running and remaining = 0 then
    update public.imports set status = 'finished' where id = new.import_id;
  end if;
  return null;
end;
$$;

revoke execute on function app.import_counts_follow_rows() from public;

create trigger import_rows_counted
  after insert or update of state on public.import_rows
  for each row execute function app.import_counts_follow_rows();

-- Closing an import leaves its ready rows unimported. A definer, because
-- whoever stops somebody else's import cannot see its rows.
create function app.import_closing_leaves_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Asked here although the update of the import was already allowed: this
  -- function writes rows its caller may not see, and a definer that writes
  -- asks who is calling (IG-12).
  if new.organization_id is distinct from app.worker_organization_id()
     and new.property_id not in (select app.accessible_property_ids()) then
    raise exception 'that import is out of reach' using errcode = '42501';
  end if;

  update public.import_rows
     set state = 'left'
   where import_id = new.id and state = 'ready';
  return null;
end;
$$;

revoke execute on function app.import_closing_leaves_rows() from public;

create trigger imports_closing_leaves_rows
  after update of status on public.imports
  for each row
  when (new.status in ('finished', 'discarded') and old.status <> new.status)
  execute function app.import_closing_leaves_rows();

-- ---------------------------------------------------------------------------
-- The sweep (ADR 0018): the worker forgets what a file held after seven days
-- ---------------------------------------------------------------------------

create function app.imports_past_retention()
returns table (import_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select id as import_id, organization_id
    from public.imports
   where rows_forgotten_at is null
     and touched_at < now() - interval '7 days'
   order by touched_at asc
   limit 100;
$$;

comment on function app.imports_past_retention() is
  'Imports untouched for seven days whose rows are still held, across Organizations: ids only.';

-- Closes it if it is still open, so it stops holding the Property, then
-- deletes its rows. The import and its counts stay.
create function app.forget_import_rows(target_import_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  found_status text;
begin
  select status into found_status
    from public.imports
   where id = target_import_id
     and organization_id = app.worker_organization_id()
     and rows_forgotten_at is null
     and touched_at < now() - interval '7 days'
     for update;
  if found_status is null then
    return false;
  end if;

  if found_status = 'staged' then
    update public.imports set status = 'discarded' where id = target_import_id;
  elsif found_status = 'importing' then
    update public.imports set status = 'finished' where id = target_import_id;
  end if;

  delete from public.import_rows where import_id = target_import_id;
  update public.imports
     set rows_forgotten_at = current_timestamp
   where id = target_import_id;
  return true;
end;
$$;

comment on function app.forget_import_rows(uuid) is
  'Deletes the rows of one import of the worker''s Organization that has been untouched for seven days, closing it first if it was open. False when it is not such an import.';

revoke execute on function app.imports_past_retention() from public, ranza_app, ranza_auth;
revoke execute on function app.forget_import_rows(uuid) from public, ranza_app, ranza_auth;
grant execute on function app.imports_past_retention() to ranza_worker;
grant execute on function app.forget_import_rows(uuid) to ranza_worker;
