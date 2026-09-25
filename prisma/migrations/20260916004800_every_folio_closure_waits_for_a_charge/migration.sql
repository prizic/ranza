-- Every closure of a Folio waits for a charge being posted to it (MT-S5-10).
--
-- Hand-written; this migration adds no column and no table.
--
-- 20260916003900 took the Stay's advisory lock (namespace 1) for a closure
-- from the front desk, and returned before taking it when the closer holds
-- finance.manage_folio. That left finance's closure the one writer to a
-- Folio's lines that did not serialise with a charge. A line's insert takes
-- only a key-share lock on its Folio, which a status update does not conflict
-- with, so a charge whose trigger had already found the Folio open could
-- commit after the closure: a closed Folio carrying a line the closure's
-- audited balance never counted. Maintenance made that ordinary, because a
-- damage charge (MT-S5-03) can land at any point while a Folio is open.
--
-- The lock is now taken for every open-to-closed transition, before the
-- permission decides anything. A charge already posting is committed before
-- the closure proceeds, so the closure's balance read sees it; a charge that
-- arrives after waits for the closure and is then refused because the Folio
-- is closed. The front-desk rule itself is unchanged.
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

  if app.has_organization_permission(new.organization_id, 'finance.manage_folio') then
    return new;
  end if;

  select stay.status into stay_status
  from public.stays as stay
  where stay.id = new.stay_id;

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
  'Every closure of a Folio takes its Stay''s advisory lock, so it serialises with a charge (MT-S5-10). Without finance.manage_folio, a Folio may be closed only when its Stay has departed and its balance is zero, or its Stay was withdrawn and it has no lines (PRE-03).';
