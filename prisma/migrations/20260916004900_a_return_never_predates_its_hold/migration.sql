-- A return never predates the hold it ends (MT-S2-31).
--
-- Hand-written; this migration adds no column and no table.
--
-- A hold's since is the now() of the transaction that took the room out, and
-- its returned_at the now() of the transaction that returned it. now() is a
-- transaction's start, read from the database server's clock, and that clock
-- steps: NTP corrects a server by stepping as well as slewing, and a VM's
-- clock steps whenever its host adjusts it. A step back between the two made
-- the return earlier than the take, and maintenance_unit_holds_returned_after_taken
-- refused it, so returning a room within about a second of taking it out
-- could fail. The evidence run's integration suites (Z2) failed that way.
--
-- The constraint stays: a return before its hold is still not a state the
-- table can hold. The release stamp in app.maintenance_hold_is_stamped()
-- becomes greatest(now(), since) — the one writer of returned_at, since the
-- trigger overrides whatever a caller writes.
--
-- The worker matched a return to its event by returned_at = occurred_at, both
-- now() in the releasing transaction. A clamped return is later than its
-- event, so it now matches greatest(occurred_at, since), which is exactly what
-- the stamp wrote, and takes the release's own returned_at as the moment the
-- room came back. A forged event is no easier than before: its occurred_at is
-- its own transaction's now(), which no release shares.
--
-- A new migration, not an edit to 20260916004400: that migration is on a
-- pushed branch under review, and migrate deploy does not re-run an applied
-- migration or notice that it changed.

CREATE OR REPLACE FUNCTION app.maintenance_hold_is_stamped()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  acting uuid := app.current_user_id();
  request_status text;
  request_unit uuid;
  taking boolean;
begin
  if acting is null then
    raise exception 'taking a Unit out of order requires an acting Staff Member'
      using errcode = '42501';
  end if;

  taking := tg_op = 'INSERT'
    or (old.returned_at is not null and new.returned_at is null);

  if taking then
    perform pg_advisory_xact_lock(
      hashtextextended('maintenance_request:' || new.request_id::text, 0));

    select request.status, request.accommodation_unit_id
      into request_status, request_unit
      from public.maintenance_requests as request
     where request.id = new.request_id;

    if request_unit is null or request_status in ('done', 'cancelled') then
      raise exception using
        errcode = '55000',
        message = 'only an open request about a Unit takes it out of order';
    end if;

    new.since := now();
    new.taken_by := acting;
    new.returned_at := null;
    new.returned_by := null;
    new.returned_as := null;
  elsif old.returned_at is null and new.returned_at is not null then
    new.returned_at := greatest(now(), old.since);
    new.returned_by := acting;
    new.returned_as := coalesce(
      (select setting.return_as
         from public.maintenance_settings as setting
        where setting.property_id = new.property_id),
      (select setting.return_as
         from public.maintenance_settings as setting
        where setting.organization_id = new.organization_id
          and setting.property_id is null),
      'dirty');
  else
    new.returned_at := old.returned_at;
    new.returned_by := old.returned_by;
    new.returned_as := old.returned_as;
  end if;

  if new.expected_back_on is not null
     and new.returned_at is null
     and new.expected_back_on is distinct from (case when tg_op = 'UPDATE' then old.expected_back_on end)
     and new.expected_back_on < app.property_today(new.property_id) then
    raise exception using
      errcode = '23514',
      message = 'the expected-back date is before today';
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION app.mark_unit_returned_to_service(target_event_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  acting_organization uuid := app.worker_organization_id();
  event_organization uuid;
  event_kind text;
  return_moment timestamptz;
  returned_request uuid;
  return_status text;
  current_status text;
  holder uuid;
  holder_property uuid;
  written integer;
begin
  if acting_organization is null then
    raise exception 'returning a room requires a worker context'
      using errcode = '42501';
  end if;

  select event.organization_id, event.event_type, event.occurred_at,
         (event.payload ->> 'requestId')::uuid
    into event_organization, event_kind, return_moment, returned_request
    from outbox.events as event
   where event.id = target_event_id;

  if not found then
    return false;
  end if;

  if event_organization <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if event_kind <> 'unit.returned_to_service' or returned_request is null then
    return false;
  end if;

  select coalesce(unit.parent_id, unit.id), unit.property_id, hold.returned_as, hold.returned_at
    into holder, holder_property, return_status, return_moment
    from public.maintenance_unit_holds as hold
    join public.maintenance_requests as request
      on request.id = hold.request_id
    join public.accommodation_units as unit
      on unit.id = request.accommodation_unit_id
   where hold.request_id = returned_request
     and hold.organization_id = acting_organization
     and hold.returned_at = greatest(return_moment, hold.since);

  if not found then
    return false;
  end if;

  if not app.capability_is_available(holder_property, 'housekeeping', 'housekeeping') then
    return false;
  end if;

  select state.status
    into current_status
    from app.unit_housekeeping_state(holder) as state;

  insert into public.housekeeping_unit_status
    (accommodation_unit_id, property_id, organization_id, status)
  values (holder, holder_property, acting_organization,
          case
            when 'dirty' in (coalesce(current_status, 'clean'), return_status)
              then 'dirty'
            when 'clean' in (coalesce(current_status, 'clean'), return_status)
              then 'clean'
            else 'inspected'
          end)
  on conflict (accommodation_unit_id) do update
     set status = case
           when 'dirty' in (public.housekeeping_unit_status.status, excluded.status)
             then 'dirty'
           when 'clean' in (public.housekeeping_unit_status.status, excluded.status)
             then 'clean'
           else 'inspected'
         end
   where public.housekeeping_unit_status.status_changed_at < return_moment;

  get diagnostics written = row_count;
  return written > 0;
end;
$function$;
