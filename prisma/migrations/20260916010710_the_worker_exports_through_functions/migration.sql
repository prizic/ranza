-- The worker produces an export through single-purpose functions and holds no
-- grant on any table it touches (RANZ-48, ADR 0043, ADR 0027, ADR 0018).
--
-- ranza_worker has nothing on data_exports, export_schedules or the tables an
-- export reads. What it can say is:
--
--   which exports are waiting, stalled or past their retention   the lists
--   claim this one                                               pending -> processing
--   give me this export's guests / reservations / rooms / folio
--     lines / audit records                                      five readers
--   this export is finished / failed / past its retention        three writers
--   run this schedule                                            one writer
--
-- A reader answers for the REQUESTER, as they are when it is asked and not as
-- they were when they asked: membership, reach per Property, the permission
-- each dataset needs, and the commercial gates of the Property each row is at.
-- It returns the rows that requester could read in the workspace and nothing
-- else. A requester who has lost the permission gets a refusal, not data — a
-- scheduled export a revoked Staff Member left behind produces a failed export
-- the next morning, which is the evidence, and not a file.
--
-- Every function checks that the worker's Organization is the export's before
-- it reads or writes anything, and a reader refuses an export that is not
-- being processed: a job cannot ask for rows on behalf of a request nobody
-- claimed.

-- ---------------------------------------------------------------------------
-- The requester, as the database sees them now
-- ---------------------------------------------------------------------------

-- The helpers below are called from the definers further down and from nowhere
-- else: executable by the owner alone. They are invokers; a definer calling one
-- runs it as the owner, which is the only role that reads the memberships and
-- roles they ask about.

-- The Organization of the export a job is working on, or an error. "Working
-- on" is processing: the job claimed it, in this Organization's context.
create function app.data_export_in_progress(target_export_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  export_organization uuid;
begin
  if acting_organization is null then
    raise exception 'exporting requires a worker context'
      using errcode = '42501';
  end if;

  select export.organization_id
    into export_organization
    from public.data_exports as export
   where export.id = target_export_id
     and export.status = 'processing';

  -- The same answer for an export that does not exist, is not processing, or
  -- belongs to somebody else: a job learns nothing about which.
  if export_organization is distinct from acting_organization then
    raise exception 'that export is not being processed here'
      using errcode = '42501';
  end if;
  return export_organization;
end;
$$;

-- Whether the requester still holds what exporting this dataset needs: an
-- active membership, an active role, data_export.create, and one of the
-- permissions the dataset asks for (none, for rooms).
create function app.export_requester_may(target_export_id uuid, resource text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.data_exports as export
    join public.organization_memberships as membership
      on membership.organization_id = export.organization_id
     and membership.user_id = export.requester_id
    join public.staff_roles as role
      on role.scope_id = membership.role_scope_id
     and role.key = membership.role
    where export.id = target_export_id
      and membership.status = 'active'
      and role.status = 'active'
      and 'data_export.create' = any (role.permissions)
      and (cardinality(app.data_export_resource_permissions(resource)) = 0
           or role.permissions && app.data_export_resource_permissions(resource))
  );
$$;

-- The Properties the requester reaches: the same question
-- app.accessible_property_ids() answers for the acting user and
-- app.audit_reachable_locations() answers for history, asked of somebody who is
-- not the caller. An archived Property is reached for history and not for
-- operating, as in the audit log (ADR 0031), hence the flag.
create function app.export_requester_properties(
  target_export_id uuid,
  include_archived boolean default false
)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select property.id
  from public.data_exports as export
  join public.properties as property
    on property.organization_id = export.organization_id
  join public.organization_memberships as membership
    on membership.organization_id = export.organization_id
   and membership.user_id = export.requester_id
  where export.id = target_export_id
    and membership.status = 'active'
    and (property.status = 'active' or include_archived)
    and (
      membership.access_scope = 'organization_wide'
      or exists (
        select 1
        from public.property_assignments as assignment
        where assignment.property_id = property.id
          and assignment.user_id = membership.user_id
          and assignment.status = 'active'
      )
    );
$$;

create function app.export_requester_is_organization_wide(target_export_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.data_exports as export
    join public.organization_memberships as membership
      on membership.organization_id = export.organization_id
     and membership.user_id = export.requester_id
    where export.id = target_export_id
      and membership.status = 'active'
      and membership.access_scope = 'organization_wide'
  );
$$;

-- The check every reader starts with: the export is being processed in the
-- worker's Organization, and its requester may export this dataset now.
-- Returns the Organization. The refusal carries its reason in the message,
-- after a prefix the worker reads, and nothing else about the requester.
create function app.data_export_requires(target_export_id uuid, resource text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  export_organization uuid := app.data_export_in_progress(target_export_id);
begin
  if not app.export_requester_may(target_export_id, resource) then
    raise exception 'export_refused:requester_not_permitted'
      using errcode = '42501';
  end if;
  return export_organization;
end;
$$;

revoke execute on function app.data_export_in_progress(uuid) from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.export_requester_may(uuid, text) from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.export_requester_properties(uuid, boolean) from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.export_requester_is_organization_wide(uuid) from public, ranza_app, ranza_auth, ranza_worker;
revoke execute on function app.data_export_requires(uuid, text) from public, ranza_app, ranza_auth, ranza_worker;

-- ---------------------------------------------------------------------------
-- The lists: which exports need the worker, across Organizations
-- ---------------------------------------------------------------------------

-- The same chicken-and-egg as every list before them (ADR 0018): the worker
-- must learn which Organizations have work before it can set context for one.
-- Ids and nothing else. app.pending_data_exports() is 20260916010100's and
-- unchanged; these are its two siblings.

-- Processing for longer than any export takes: the worker that claimed it died.
create function app.stalled_data_exports()
returns table (export_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select id as export_id, organization_id
    from public.data_exports
   where status = 'processing'
     and updated_at < now() - interval '30 minutes'
   order by updated_at asc
   limit 50;
$$;

-- Ready, and past the retention the worker gave it.
create function app.expired_data_exports()
returns table (export_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select id as export_id, organization_id
    from public.data_exports
   where status = 'ready'
     and expires_at <= now()
   order by expires_at asc
   limit 50;
$$;

comment on function app.stalled_data_exports() is
  'Exports a worker claimed and never finished, across Organizations: ids only. The worker fails them so the queue shows what happened.';
comment on function app.expired_data_exports() is
  'Ready exports past their retention, across Organizations: ids only. The worker clears their content.';

-- ---------------------------------------------------------------------------
-- Claiming one
-- ---------------------------------------------------------------------------

-- pending -> processing, atomically: two replicas claiming the same export get
-- one row between them. Returns what the job needs to know — which datasets,
-- in what format — and nothing about the requester.
create function app.claim_data_export(target_export_id uuid)
returns table (resource_types text[], format text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
begin
  if acting_organization is null then
    raise exception 'claiming an export requires a worker context'
      using errcode = '42501';
  end if;

  return query
    update public.data_exports as export
       set status = 'processing',
           updated_at = now()
     where export.id = target_export_id
       and export.organization_id = acting_organization
       and export.status = 'pending'
    returning export.resource_types, export.format;
end;
$$;

comment on function app.claim_data_export(uuid) is
  'Moves one pending export of the worker''s Organization to processing, and says which datasets and format. No row when it was not pending (another replica has it).';

-- ---------------------------------------------------------------------------
-- The five readers
-- ---------------------------------------------------------------------------

-- A dataset is capped at 100,000 rows (the readers return one more, so the
-- worker can tell "exactly 100,000" from "more"). An export that would be
-- truncated fails as too_large rather than handing over a file that looks
-- complete and is not.
--
-- #variable_conflict use_column: the output columns are variables in a plpgsql
-- body, and several share a name with a table column. Every column below is
-- qualified anyway; this makes a slip resolve to the column rather than fail.

-- Guests belong to the Organization, not to a Property. The workspace reads
-- them on membership alone; the commercial gate is that the front desk is on
-- somewhere the requester reaches.
create function app.export_guests(target_export_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  export_organization uuid := app.data_export_requires(target_export_id, 'residents_guests');
begin
  return query
    select guest.id, guest.full_name, guest.email, guest.phone, guest.created_at
      from public.guests as guest
     where guest.organization_id = export_organization
       and exists (
         select 1
           from app.export_requester_properties(target_export_id) as reached(property_id)
          where app.capability_is_available(reached.property_id, 'front_office', 'front_desk'))
     order by guest.created_at desc, guest.id
     limit 100001;
end;
$$;

-- A row per Reservation and Stay: a booking with no Stay yet, a booking and
-- each Stay it has had (a withdrawn check-in keeps its row, ADR 0022), and a
-- Stay that began without a booking.
create function app.export_reservations(target_export_id uuid)
returns table (
  reservation_id uuid,
  reference text,
  reservation_status text,
  stay_type text,
  property_id uuid,
  unit_id uuid,
  unit_name text,
  guest_id uuid,
  guest_name text,
  starts_on date,
  ends_on date,
  nightly_rate_minor bigint,
  rate_currency text,
  stay_id uuid,
  stay_status text,
  stay_unit_id uuid,
  stay_starts_on date,
  stay_ends_on date,
  departed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  export_organization uuid := app.data_export_requires(target_export_id, 'reservations_stays');
begin
  return query
    select combined.*
      from (
        select reservation.id as reservation_id, reservation.reference, reservation.status,
               reservation.stay_type, reservation.property_id,
               reservation.accommodation_unit_id, unit.name,
               reservation.guest_id, guest.full_name,
               reservation.starts_on, reservation.ends_on,
               reservation.nightly_rate_minor, reservation.rate_currency::text,
               stay.id as stay_id, stay.status, stay.accommodation_unit_id,
               stay.starts_on, stay.ends_on, stay.departed_at,
               reservation.created_at
          from public.reservations as reservation
          join public.accommodation_units as unit
            on unit.id = reservation.accommodation_unit_id
          join public.guests as guest
            on guest.id = reservation.guest_id
          left join public.stays as stay
            on stay.reservation_id = reservation.id
         where reservation.organization_id = export_organization
           and reservation.property_id in (
                 select app.export_requester_properties(target_export_id))
           and app.capability_is_available(reservation.property_id, 'front_office', 'front_desk')
        union all
        select null::uuid, null::text, null::text,
               stay.stay_type, stay.property_id,
               stay.accommodation_unit_id, unit.name,
               null::uuid, null::text,
               null::date, null::date,
               null::bigint, null::text,
               stay.id, stay.status, stay.accommodation_unit_id,
               stay.starts_on, stay.ends_on, stay.departed_at,
               stay.created_at
          from public.stays as stay
          join public.accommodation_units as unit
            on unit.id = stay.accommodation_unit_id
         where stay.organization_id = export_organization
           and stay.reservation_id is null
           and stay.property_id in (
                 select app.export_requester_properties(target_export_id))
           and app.capability_is_available(stay.property_id, 'front_office', 'front_desk')
      ) as combined
     order by combined.created_at desc, combined.reservation_id desc nulls last, combined.stay_id desc nulls last
     limit 100001;
end;
$$;

-- Units need only reach and the front desk being on; no permission is asked
-- beyond data_export.create.
create function app.export_units(target_export_id uuid)
returns table (
  id uuid,
  property_id uuid,
  parent_id uuid,
  name text,
  unit_type text,
  building text,
  floor integer,
  capacity integer,
  status text,
  status_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  export_organization uuid := app.data_export_requires(target_export_id, 'rooms_beds');
begin
  return query
    select unit.id, unit.property_id, unit.parent_id, unit.name, unit.unit_type,
           unit.building, unit.floor, unit.capacity, unit.status,
           unit.status_reason, unit.created_at
      from public.accommodation_units as unit
     where unit.organization_id = export_organization
       and unit.property_id in (select app.export_requester_properties(target_export_id))
       and app.capability_is_available(unit.property_id, 'front_office', 'front_desk')
     order by unit.property_id, unit.name, unit.id
     limit 100001;
end;
$$;

-- A row per Folio line, and one with the line columns empty for a Folio that
-- has none yet. Money is integer minor units beside its currency (ADR 0015).
create function app.export_folio_lines(target_export_id uuid)
returns table (
  folio_id uuid,
  property_id uuid,
  stay_id uuid,
  currency text,
  folio_status text,
  folio_closed_at timestamptz,
  line_id uuid,
  line_type text,
  description text,
  amount_minor bigint,
  payment_method text,
  reverses_line_id uuid,
  source text,
  business_date date,
  posted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  export_organization uuid := app.data_export_requires(target_export_id, 'folios_payments');
begin
  return query
    select folio.id, folio.property_id, folio.stay_id, folio.currency::text,
           folio.status, folio.closed_at,
           line.id, line.line_type, line.description, line.amount_minor,
           line.payment_method, line.reverses_line_id, line.source,
           line.business_date, line.posted_at
      from public.folios as folio
      left join public.folio_lines as line
        on line.folio_id = folio.id
     where folio.organization_id = export_organization
       and folio.property_id in (select app.export_requester_properties(target_export_id))
       and app.capability_is_available(folio.property_id, 'billing_folios', 'finance')
     order by folio.created_at desc, folio.id, line.posted_at, line.id
     limit 100001;
end;
$$;

-- The audit log as ADR 0031 reads it: a record the requester wrote, one about
-- the whole Organization when their reach is the whole Organization, or one at
-- a Property they reach — an archived one included, because history outlives
-- operating. audit.read is asked by data_export_requires().
create function app.export_audit_records(target_export_id uuid)
returns table (
  id uuid,
  occurred_at timestamptz,
  location_id uuid,
  actor_id uuid,
  action text,
  subject_type text,
  subject_id uuid,
  reason text,
  context jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  export_organization uuid := app.data_export_requires(target_export_id, 'audit_log');
  requester uuid;
begin
  select export.requester_id
    into requester
    from public.data_exports as export
   where export.id = target_export_id;

  return query
    select record.id, record.occurred_at, record.location_id, record.actor_id,
           record.action, record.subject_type, record.subject_id,
           record.reason, record.context
      from audit.records as record
     where record.organization_id = export_organization
       and (
         record.actor_id = requester
         or (record.location_id is null
             and app.export_requester_is_organization_wide(target_export_id))
         or record.location_id in (
              select app.export_requester_properties(target_export_id, true))
       )
     order by record.occurred_at desc, record.id desc
     limit 100001;
end;
$$;

-- ---------------------------------------------------------------------------
-- The three terminal transitions, and the schedule
-- ---------------------------------------------------------------------------

-- processing -> ready. The file's name, size and expiry are the database's:
-- the worker says what the content is and the counts it has, nothing more. The
-- retention is seven days. Published for whoever wants to hear it (ADR 0017)
-- with ids and counts, never a name or a row.
create function app.complete_data_export(
  target_export_id uuid,
  target_content text,
  target_record_counts jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  finished record;
begin
  if acting_organization is null then
    raise exception 'finishing an export requires a worker context'
      using errcode = '42501';
  end if;

  update public.data_exports as export
     set status = 'ready',
         file_name = 'export-' || left(export.id::text, 8) || '.' || export.format,
         file_content = target_content,
         file_size_bytes = octet_length(target_content),
         record_counts = target_record_counts,
         completed_at = now(),
         expires_at = now() + interval '7 days',
         updated_at = now()
   where export.id = target_export_id
     and export.organization_id = acting_organization
     and export.status = 'processing'
  returning export.id, export.format, export.resource_types into finished;

  if not found then
    raise exception 'that export is not being processed'
      using errcode = '55000';
  end if;

  insert into outbox.events (organization_id, event_type, payload)
  values (
    acting_organization,
    'data_export.completed',
    jsonb_build_object(
      'exportId', finished.id,
      'format', finished.format,
      'resourceTypes', to_jsonb(finished.resource_types),
      'recordCounts', target_record_counts
    )
  );
end;
$$;

-- pending | processing -> failed, with a reason from a fixed set; anything else
-- is recorded as internal_error and the detail stays in the worker's log. A
-- schedule whose creator can no longer export is paused: the same refusal every
-- morning is noise, and resuming it is somebody's decision. False when the
-- export had already finished, so a retry of this call is harmless.
create function app.fail_data_export(target_export_id uuid, target_reason text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  failed record;
  reason text := case
    when target_reason in ('requester_not_permitted', 'too_large', 'worker_stopped')
      then target_reason
    else 'internal_error'
  end;
begin
  if acting_organization is null then
    raise exception 'failing an export requires a worker context'
      using errcode = '42501';
  end if;

  update public.data_exports as export
     set status = 'failed',
         error = reason,
         completed_at = now(),
         updated_at = now()
   where export.id = target_export_id
     and export.organization_id = acting_organization
     and export.status in ('pending', 'processing')
  returning export.id, export.schedule_id into failed;

  if not found then
    return false;
  end if;

  if reason = 'requester_not_permitted' and failed.schedule_id is not null then
    update public.export_schedules as schedule
       set status = 'paused',
           updated_at = now()
     where schedule.id = failed.schedule_id
       and schedule.status = 'active';
  end if;

  insert into outbox.events (organization_id, event_type, payload)
  values (
    acting_organization,
    'data_export.failed',
    jsonb_build_object(
      'exportId', failed.id,
      'reason', reason,
      'scheduleId', failed.schedule_id
    )
  );
  return true;
end;
$$;

-- ready -> expired, and the content goes. The row stays: who asked, for what,
-- and when it ended are the record, and the file was only ever the means.
create function app.expire_data_export(target_export_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  expired_id uuid;
begin
  if acting_organization is null then
    raise exception 'expiring an export requires a worker context'
      using errcode = '42501';
  end if;

  update public.data_exports as export
     set status = 'expired',
         file_content = null,
         updated_at = now()
   where export.id = target_export_id
     and export.organization_id = acting_organization
     and export.status = 'ready'
     and export.expires_at <= now()
  returning export.id into expired_id;

  if expired_id is null then
    return false;
  end if;

  insert into outbox.events (organization_id, event_type, payload)
  values (acting_organization, 'data_export.expired',
          jsonb_build_object('exportId', expired_id));
  return true;
end;
$$;

-- A due schedule becomes a pending export, requested by the schedule's creator
-- and checked as them when it runs, and the schedule moves one step on. The
-- next run is one step after the last scheduled one, so a run does not drift by
-- however long the worker took to notice it; after an outage it is one step
-- from now, not a burst of catch-up runs. Null when the schedule is not due,
-- not active, or another replica has it.
create function app.run_export_schedule(target_schedule_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  due record;
  started uuid;
begin
  if acting_organization is null then
    raise exception 'running a schedule requires a worker context'
      using errcode = '42501';
  end if;

  select schedule.id, schedule.organization_id, schedule.created_by,
         schedule.created_by_name, schedule.resource_types, schedule.format,
         schedule.frequency, schedule.next_run_at
    into due
    from public.export_schedules as schedule
   where schedule.id = target_schedule_id
     and schedule.organization_id = acting_organization
     and schedule.status = 'active'
     and schedule.next_run_at <= now()
     for update skip locked;

  if not found then
    return null;
  end if;

  insert into public.data_exports
    (organization_id, requester_id, requester_name, resource_types, format,
     trigger_type, schedule_id)
  values
    (due.organization_id, due.created_by, due.created_by_name, due.resource_types,
     due.format, 'scheduled', due.id)
  returning id into started;

  update public.export_schedules as schedule
     set last_run_at = now(),
         next_run_at = case
           when due.next_run_at + app.export_step(due.frequency) > now()
             then due.next_run_at + app.export_step(due.frequency)
           else now() + app.export_step(due.frequency)
         end,
         updated_at = now()
   where schedule.id = due.id;

  return started;
end;
$$;

-- ---------------------------------------------------------------------------
-- The download: one function, and it asks the downloader
-- ---------------------------------------------------------------------------

-- ranza_app cannot select the file. This returns it to the person who may have
-- it, and to nobody else, with the same empty answer for an export that does
-- not exist, is not theirs, has not finished or has expired:
--
--   - the export is ready and has not passed its expiry, whether or not the
--     worker has cleared it yet;
--   - the downloader is its requester, or has the whole Organization in reach;
--   - and holds data_export.read (or, as the requester, data_export.create),
--     and every permission the datasets in the file need — asked of the
--     downloader as they are now, so a Staff Member who lost audit.read cannot
--     fetch an audit export they made last week.
create function app.read_data_export_file(target_export_id uuid)
returns table (
  organization_id uuid,
  file_name text,
  format text,
  file_content text,
  resource_types text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  acting_user uuid := app.current_user_id();
begin
  if acting_user is null then
    return;
  end if;

  return query
    select export.organization_id, export.file_name, export.format,
           export.file_content, export.resource_types
      from public.data_exports as export
     where export.id = target_export_id
       and export.organization_id in (select app.accessible_organization_ids())
       and export.status = 'ready'
       and export.expires_at > now()
       and (app.has_organization_permission(export.organization_id, 'data_export.read')
            or (export.requester_id = acting_user
                and app.has_organization_permission(export.organization_id, 'data_export.create')))
       and (export.requester_id = acting_user
            or app.has_organization_wide_reach(export.organization_id))
       and app.may_export(export.organization_id, export.resource_types);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

comment on function app.export_guests(uuid) is
  'The Guests of a processing export''s Organization that its requester could read now: their permission, and the front desk on at a Property they reach. Refuses (export_refused:requester_not_permitted) when they no longer may export them.';
comment on function app.export_reservations(uuid) is
  'The Reservations and Stays at the Properties the export''s requester reaches, front desk on. Same refusal.';
comment on function app.export_units(uuid) is
  'The Accommodation Units at the Properties the export''s requester reaches, front desk on. Same refusal.';
comment on function app.export_folio_lines(uuid) is
  'The Folios and their lines at the Properties the export''s requester reaches, finance on, when they hold finance.manage_folio. Same refusal.';
comment on function app.export_audit_records(uuid) is
  'The audit records the export''s requester could read in the log (ADR 0031), when they hold audit.read. Same refusal.';
comment on function app.complete_data_export(uuid, text, jsonb) is
  'processing -> ready, with the content and its counts; the name, size and seven-day expiry are the database''s. Publishes data_export.completed.';
comment on function app.fail_data_export(uuid, text) is
  'pending | processing -> failed with a reason from a fixed set. Pauses the schedule of a requester who may no longer export. Publishes data_export.failed. False when already finished.';
comment on function app.expire_data_export(uuid) is
  'ready -> expired once past expires_at, and clears the content. Publishes data_export.expired.';
comment on function app.run_export_schedule(uuid) is
  'A due, active schedule of the worker''s Organization becomes a pending export requested by its creator, and moves one step on. Null when not due or taken by another replica.';
comment on function app.read_data_export_file(uuid) is
  'The one way ranza_app reaches an export''s content: a ready, unexpired file, to its requester or somebody whose reach is the whole Organization, who still holds every permission its datasets need.';

revoke execute on function app.stalled_data_exports() from public, ranza_app, ranza_auth;
revoke execute on function app.expired_data_exports() from public, ranza_app, ranza_auth;
revoke execute on function app.claim_data_export(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.export_guests(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.export_reservations(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.export_units(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.export_folio_lines(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.export_audit_records(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.complete_data_export(uuid, text, jsonb) from public, ranza_app, ranza_auth;
revoke execute on function app.fail_data_export(uuid, text) from public, ranza_app, ranza_auth;
revoke execute on function app.expire_data_export(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.run_export_schedule(uuid) from public, ranza_app, ranza_auth;
revoke execute on function app.read_data_export_file(uuid) from public, ranza_worker, ranza_auth;

grant execute on function app.stalled_data_exports() to ranza_worker;
grant execute on function app.expired_data_exports() to ranza_worker;
grant execute on function app.claim_data_export(uuid) to ranza_worker;
grant execute on function app.export_guests(uuid) to ranza_worker;
grant execute on function app.export_reservations(uuid) to ranza_worker;
grant execute on function app.export_units(uuid) to ranza_worker;
grant execute on function app.export_folio_lines(uuid) to ranza_worker;
grant execute on function app.export_audit_records(uuid) to ranza_worker;
grant execute on function app.complete_data_export(uuid, text, jsonb) to ranza_worker;
grant execute on function app.fail_data_export(uuid, text) to ranza_worker;
grant execute on function app.expire_data_export(uuid) to ranza_worker;
grant execute on function app.run_export_schedule(uuid) to ranza_worker;
grant execute on function app.read_data_export_file(uuid) to ranza_app;
