-- An export can be cut to a range of dates, and its file says what it is
-- (RANZ-74, DX-05 and DX-08 of the 2026-10-11 UX audit, ADR 0043).
--
-- Two things the export record lacked:
--
--   - a way to make a too-large export smaller. A hotel's folio lines and audit
--     log reach 100,000 rows, the export then fails `too_large`, and the only
--     remedy left was to ask for fewer datasets. A request now may name a first
--     and a last day; the readers cut the datasets that are made of dated rows.
--     Guests and rooms are not: a guest list is a list, and a range over it
--     would silently drop people who booked last year;
--   - a file name worth keeping. It was `export-` and the first eight
--     characters of the id, so twenty exports a quarter were twenty
--     indistinguishable files. It is now the Organization, what is in it, the
--     range if there is one, and the day it was made.
--
-- Hand-written. Every function replaced here keeps its signature, its owner,
-- its search_path and the grants 20260916010710 gave it: `create or replace`
-- changes the body and nothing else.

-- ---------------------------------------------------------------------------
-- The request may name a range
-- ---------------------------------------------------------------------------

-- Calendar days, both included. Either end may be missing ("everything since",
-- "everything up to"). `range_timezone` is the clock the days mean for rows that
-- are instants (the audit log), taken from the Property the request is made
-- from, so that "the 1st to the 31st" is the same days the audit screen shows.
alter table public.data_exports
  add column range_from date,
  add column range_to date,
  add column range_timezone text,
  add constraint data_exports_range_is_ordered
    check (range_from is null or range_to is null or range_from <= range_to),
  add constraint data_exports_range_is_a_real_span
    check ((range_from is null or range_from between date '1900-01-01' and date '2200-12-31')
           and (range_to is null or range_to between date '1900-01-01' and date '2200-12-31')),
  add constraint data_exports_range_has_a_clock
    check ((range_from is null and range_to is null) = (range_timezone is null)
           and (range_timezone is null or char_length(range_timezone) between 1 and 64));

comment on column public.data_exports.range_from is
  'First day included in the dated datasets of this export, in range_timezone. Null: no lower bound.';
comment on column public.data_exports.range_to is
  'Last day included in the dated datasets of this export, in range_timezone. Null: no upper bound.';
comment on column public.data_exports.range_timezone is
  'The IANA zone the range''s days mean for instants. Present exactly when a range is.';

-- The request and the range, and nothing else; the range is read back by the
-- list so a row can say what it covers.
grant select (range_from, range_to, range_timezone) on public.data_exports to ranza_app;
grant insert (range_from, range_to, range_timezone) on public.data_exports to ranza_app;

-- The state machine as 20260916010700 drew it, with the range as part of what
-- was asked for: never rewritten, and a zone that is no zone is refused at the
-- door rather than failing the worker on the day.
create or replace function app.data_export_is_drawn()
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
    if new.range_timezone is not null
       and not exists (select 1 from pg_catalog.pg_timezone_names as zone
                        where zone.name = new.range_timezone) then
      raise exception 'that is not a time zone'
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
     or new.range_from is distinct from old.range_from
     or new.range_to is distinct from old.range_to
     or new.range_timezone is distinct from old.range_timezone
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

-- ---------------------------------------------------------------------------
-- The readers cut what is dated
-- ---------------------------------------------------------------------------

-- The export's range, read where the reader already knows the export is being
-- processed. An invoker, called from the definers below as their owner (the
-- same arrangement as the helpers of 20260916010710).
create function app.data_export_range(target_export_id uuid)
returns table (range_from date, range_to date, range_timezone text)
language sql
stable
set search_path = ''
as $$
  select export.range_from, export.range_to, export.range_timezone
    from public.data_exports as export
   where export.id = target_export_id;
$$;

revoke execute on function app.data_export_range(uuid) from public, ranza_app, ranza_auth, ranza_worker;

-- A booking is in the range when any of its nights is: it starts on or before
-- the last day and ends on or after the first, an open end being never.
-- A Stay with no booking behind it is read the same way by its own dates.
create or replace function app.export_reservations(target_export_id uuid)
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
  first_day date;
  last_day date;
begin
  select cut.range_from, cut.range_to
    into first_day, last_day
    from app.data_export_range(target_export_id) as cut;

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
           and (last_day is null or reservation.starts_on <= last_day)
           and (first_day is null or coalesce(reservation.ends_on, date '9999-12-31') >= first_day)
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
           and (last_day is null or stay.starts_on <= last_day)
           and (first_day is null or coalesce(stay.ends_on, date '9999-12-31') >= first_day)
      ) as combined
     order by combined.created_at desc, combined.reservation_id desc nulls last, combined.stay_id desc nulls last
     limit 100001;
end;
$$;

-- A line is in the range by the day it counts to: its business date when it has
-- one (a room night), otherwise the day it was posted on the range's clock (a
-- charge or a payment typed in by hand carries no business date). A Folio with
-- no line yet has no day, so a range leaves it out.
create or replace function app.export_folio_lines(target_export_id uuid)
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
  first_day date;
  last_day date;
  clock text;
begin
  select cut.range_from, cut.range_to, cut.range_timezone
    into first_day, last_day, clock
    from app.data_export_range(target_export_id) as cut;

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
       and (first_day is null
            or coalesce(line.business_date, (line.posted_at at time zone clock)::date) >= first_day)
       and (last_day is null
            or coalesce(line.business_date, (line.posted_at at time zone clock)::date) <= last_day)
     order by folio.created_at desc, folio.id, line.posted_at, line.id
     limit 100001;
end;
$$;

-- A record is in the range by the day it happened on the range's clock, both
-- ends included, the same reading the audit screen's date filter gives.
create or replace function app.export_audit_records(target_export_id uuid)
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
  first_instant timestamptz;
  last_instant timestamptz;
begin
  select export.requester_id,
         (export.range_from::timestamp at time zone export.range_timezone),
         ((export.range_to + 1)::timestamp at time zone export.range_timezone)
    into requester, first_instant, last_instant
    from public.data_exports as export
   where export.id = target_export_id;

  return query
    select record.id, record.occurred_at, record.location_id, record.actor_id,
           record.action, record.subject_type, record.subject_id,
           record.reason, record.context
      from audit.records as record
     where record.organization_id = export_organization
       and (first_instant is null or record.occurred_at >= first_instant)
       and (last_instant is null or record.occurred_at < last_instant)
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
-- A file named for what it holds
-- ---------------------------------------------------------------------------

-- `acme-hotels-guests-reservations-2026-10-19.csv`, or with a range
-- `acme-hotels-folios-2026-01-01-to-2026-03-31-2026-10-19.csv`. Letters and
-- digits only, so the name is safe in a header and on every file system: the
-- Turkish and common Latin accents are folded to their plain letter first, so
-- "Örnek Otel" is `ornek-otel` and not `rnek-otel`, and an Organization named
-- in a script with no Latin letters at all is `ranza`. Three or more datasets
-- are `data`: a name that long is no longer a name.
create function app.export_file_name(
  organization_name text,
  resources text[],
  file_format text,
  first_day date,
  last_day date,
  made_on date
)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(slug.organization, ''), 'ranza')
         || '-' || what.words
         || case
              when first_day is not null and last_day is not null
                then '-' || first_day::text || '-to-' || last_day::text
              when first_day is not null then '-from-' || first_day::text
              when last_day is not null then '-until-' || last_day::text
              else ''
            end
         || '-' || made_on::text
         || '.' || file_format
    from (
      select btrim(left(btrim(regexp_replace(
                    translate(lower(organization_name),
                              'çğıöşüâîûéèêëäáàñï', 'cgiosuaiueeeeaaani'),
                    '[^a-z0-9]+', '-', 'g'), '-'), 40), '-')
             as organization
    ) as slug,
    lateral (
      select case
               when cardinality(resources) > 2 then 'data'
               else coalesce(
                      (select string_agg(
                                case dataset
                                  when 'residents_guests' then 'guests'
                                  when 'reservations_stays' then 'reservations'
                                  when 'rooms_beds' then 'rooms'
                                  when 'folios_payments' then 'folios'
                                  when 'audit_log' then 'audit-log'
                                end, '-' order by position(dataset in
                                  'residents_guests reservations_stays rooms_beds folios_payments audit_log'))
                         from unnest(resources) as dataset),
                      'data')
             end as words
    ) as what;
$$;

revoke execute on function app.export_file_name(text, text[], text, date, date, date)
  from public, ranza_app, ranza_auth, ranza_worker;

-- processing -> ready as 20260916010710 wrote it, naming the file by what it
-- holds. The size, the expiry and the event are unchanged.
create or replace function app.complete_data_export(
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
         file_name = app.export_file_name(
           (select organization.name from public.organizations as organization
             where organization.id = export.organization_id),
           export.resource_types, export.format, export.range_from, export.range_to,
           (now() at time zone 'utc')::date),
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
