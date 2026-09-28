-- A Folio stays open while its Guest is in house (ADR 0038, FO-S5-01).
--
-- Hand-written; this migration adds no column and no table.
--
-- Found in review of RANZ-31. Finance could close the Folio of a Guest still in
-- house, which was harmless while nothing was charged by the night. Now every
-- later night of that Stay is listed by the close as `folio_closed` and never
-- charged, and nothing can reopen a Folio. So closing is refused while the
-- Stay is in house, for every role — finance.manage_folio included — after the
-- Stay's lock and before the permission is asked. Every other rule of the
-- closure is 20260916004800's, unchanged.
--
-- The check-out closes a settled Folio in the same transaction that has just
-- made the Stay departed, and a withdrawn check-in closes the empty Folio of a
-- Stay it has just cancelled; both read their own write, so neither is refused.
create or replace function app.front_desk_closes_only_a_settled_folio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stay_status text;
  lines integer;
  balance bigint;
begin
  if new.status <> 'closed' or old.status <> 'open' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(new.stay_id::text));

  select stay.status into stay_status
  from public.stays as stay
  where stay.id = new.stay_id;

  if stay_status = 'in_house' then
    raise exception 'a Folio stays open while its Guest is in house'
      using errcode = '55000';
  end if;

  if app.has_organization_permission(new.organization_id, 'finance.manage_folio') then
    return new;
  end if;

  select count(*), coalesce(sum(line.amount_minor), 0)
    into lines, balance
  from public.folio_lines as line
  where line.folio_id = new.id;

  if not ((stay_status = 'departed' and balance = 0)
          or (stay_status = 'cancelled' and lines = 0)) then
    raise exception 'only a settled Folio of a Stay that has ended may be closed from the front desk'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

comment on function app.front_desk_closes_only_a_settled_folio() is
  'Every closure of a Folio takes its Stay''s advisory lock, so it serialises with a charge (MT-S5-10). A Folio whose Guest is in house is not closed by anybody (FO-S5-01, ADR 0038). Without finance.manage_folio, a Folio may be closed only when its Stay has departed and its balance is zero, or its Stay was withdrawn and it has no lines (PRE-03).';
