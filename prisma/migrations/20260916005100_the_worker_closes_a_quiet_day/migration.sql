-- The worker closes a quiet day (RANZ-26 slice 2, ADR 0034, ADR 0018 amended).
--
-- Hand-written; this migration adds no column and no table.
--
-- ranza_worker holds nothing on business_day_closes and is given nothing here.
-- It reaches a close through two functions, each executable by it alone:
--
--   app.properties_due_for_close()          which days are due, across
--                                           Organizations — the second
--                                           cross-Organization read ADR 0018
--                                           names, returning ids and a date
--   app.close_business_day_automatically()  one day, inside one Organization's
--                                           worker context, and only when
--                                           nothing is open
--
-- The close itself is the same insert a Staff Member's is, stamped by the same
-- trigger, so the two cannot record different things. What differs is who is
-- named: the trigger finds no acting user and records the job that
-- app.set_worker_context() was given.

-- ---------------------------------------------------------------------------
-- Which days are due
-- ---------------------------------------------------------------------------

-- A definer, because answering needs every active Property's clock and last
-- close before any Organization's context can be set: the chicken-and-egg ADR
-- 0018 describes for the outbox, a second time. Narrowed the same way: one
-- function, ids and a date and nothing else — no name, no count, nothing about
-- what is open — and nobody but ranza_worker may call it.
--
-- The next due day is the day after the last close, or the day before today
-- when a Property has never closed one (the first close, ADR 0034), and only
-- while it is before today: a day is never due until its cutoff has passed.
-- Where the front desk is not available — a lapsed Subscription, no
-- Entitlement, the capability off — nothing is due.
-- capability_is_available rather than can_use_capability, whose fourth gate
-- needs a Staff Member and is always false here.
create function app.properties_due_for_close()
returns table (organization_id uuid, property_id uuid, business_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select property.organization_id, property.id, due.day
    from public.properties as property
    cross join lateral (
      select app.property_today(property.id) as today
    ) as clock
    cross join lateral (
      select max(close.business_date) as last
        from public.business_day_closes as close
       where close.property_id = property.id
    ) as history
    cross join lateral (
      select coalesce(history.last + 1, clock.today - 1) as day
    ) as due
   where property.status = 'active'
     and due.day < clock.today
     and app.capability_is_available(property.id, 'front_office', 'front_desk');
$$;

comment on function app.properties_due_for_close() is
  'The next business day due to close at every active Property where the front desk is available. The worker''s second cross-Organization read (ADR 0018): ids and a date, and executable by ranza_worker alone.';

revoke execute on function app.properties_due_for_close() from public;
revoke execute on function app.properties_due_for_close() from ranza_app;
revoke execute on function app.properties_due_for_close() from ranza_auth;
grant execute on function app.properties_due_for_close() to ranza_worker;

-- ---------------------------------------------------------------------------
-- Closing one
-- ---------------------------------------------------------------------------

-- In order:
--   - no worker context is refused, before anything is read (CD-S2-10);
--   - a Property outside the context's Organization is refused, with the same
--     answer as one that does not exist (CD-S2-10);
--   - an archived Property, or one where the front desk is not available, is
--     not closed (CD-S2-08) — discovery skips both, and either can change
--     between discovery and this call;
--   - then the insert. The stamp refuses a day that has not ended or waits
--     for another, the unique key a day already closed, and the reason
--     constraint a day with anything open — the worker never gives a reason,
--     so an open item is exactly that refusal (CD-S2-02). Each is caught and
--     answered, because a Property waiting on its desk is the normal case and
--     not an error. `object_not_in_prerequisite_state` names all of class 55,
--     so only 55000 itself is "not due": a lock timeout or an object in use is
--     raised, and reported as the failure it is rather than as a day waiting.
--   - the same business_day.closed a Staff Member's close publishes
--     (CD-S2-14).
-- Returns what happened: closed, open_items, already_closed, not_due or
-- unavailable.
create function app.close_business_day_automatically(
  target_property_id uuid,
  target_business_date date
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  property_organization uuid;
  property_status text;
  closed_id uuid;
  refused_by text;
begin
  if acting_organization is null then
    raise exception 'closing a business day automatically requires a worker context'
      using errcode = '42501';
  end if;

  select property.organization_id, property.status
    into property_organization, property_status
    from public.properties as property
   where property.id = target_property_id;

  if property_organization is distinct from acting_organization then
    raise exception 'that business day cannot be closed'
      using errcode = '42501';
  end if;

  if property_status <> 'active'
     or not app.capability_is_available(target_property_id, 'front_office', 'front_desk') then
    return 'unavailable';
  end if;

  begin
    insert into public.business_day_closes
      (organization_id, property_id, business_date)
    values (acting_organization, target_property_id, target_business_date)
    returning id into closed_id;
  exception
    when unique_violation then
      return 'already_closed';
    when object_not_in_prerequisite_state then
      get stacked diagnostics refused_by = returned_sqlstate;
      if refused_by = '55000' then
        return 'not_due';
      end if;
      raise;
    when check_violation then
      get stacked diagnostics refused_by = constraint_name;
      if refused_by = 'business_day_closes_exceptions_need_a_reason' then
        return 'open_items';
      end if;
      raise;
  end;

  insert into outbox.events (organization_id, event_type, payload)
  values (
    acting_organization,
    'business_day.closed',
    jsonb_build_object(
      'closeId', closed_id,
      'propertyId', target_property_id,
      'businessDate', to_char(target_business_date, 'YYYY-MM-DD')
    )
  );

  return 'closed';
end;
$$;

comment on function app.close_business_day_automatically(uuid, date) is
  'Closes one business day inside the worker''s Organization context, only when nothing is open, and publishes business_day.closed. The whole of what ranza_worker may do to business_day_closes (ADR 0034).';

revoke execute on function app.close_business_day_automatically(uuid, date) from public;
revoke execute on function app.close_business_day_automatically(uuid, date) from ranza_app;
revoke execute on function app.close_business_day_automatically(uuid, date) from ranza_auth;
grant execute on function app.close_business_day_automatically(uuid, date) to ranza_worker;
