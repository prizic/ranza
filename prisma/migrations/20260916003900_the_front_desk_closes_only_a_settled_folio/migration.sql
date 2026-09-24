-- The front desk closes only a settled Folio (RANZ-23; PRE-03).
--
-- Hand-written; this migration adds no column and no table.
--
-- 20260916003600 let a front-desk role close a Folio, because the two commands
-- that end a Stay each close one: check-out a settled Folio, withdrawing a
-- check-in the empty one it opened. The policy can say the new status is
-- closed; it cannot say which Folio, because that is a question about the
-- lines, and about the Stay. Without this, a front-desk role could close an
-- in-house Guest's Folio with money on it, and every later charge would be
-- refused until somebody from finance reopened it.
--
-- security definer to read the lines and the Stay whatever the actor's
-- policies show. It takes the Stay's advisory lock (namespace 1) before
-- reading, like every other check on this Folio's lines, so a charge being
-- posted at this moment is either seen or waits and is then refused because
-- the Folio is closed (CO-S1-15).
--
-- finance.manage_folio is untouched by it: closing and reopening a Folio for
-- any reason is still that permission's, and blueprint 5.9's closure rules
-- remain its own concern.
create function app.front_desk_closes_only_a_settled_folio()
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
  if new.status <> 'closed' or old.status <> 'open'
     or app.has_organization_permission(new.organization_id, 'finance.manage_folio') then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1, pg_catalog.hashtext(new.stay_id::text));

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
  'Without finance.manage_folio, a Folio may be closed only when its Stay has departed and its balance is zero, or its Stay was withdrawn and it has no lines (PRE-03).';

create trigger folios_front_desk_closes_only_a_settled_folio
  before update of status on public.folios
  for each row execute function app.front_desk_closes_only_a_settled_folio();
