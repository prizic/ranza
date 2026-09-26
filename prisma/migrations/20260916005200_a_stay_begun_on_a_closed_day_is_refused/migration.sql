-- A Stay begun on a closed day is refused (RANZ-26, ADR 0034).
--
-- 20260916005000's guard dated every status change it knew of except the one
-- that begins a Stay: reserved -> in_house. No role can take it today —
-- stays_update_front_desk refuses in_house in its WITH CHECK — but
-- app.stay_transition_is_drawn() allows it and 20260916003600 expects a later
-- command to, and that command would have begun a Stay on a closed day with
-- nothing going red. A new migration rather than an edit to 005000, which has
-- been applied beyond this branch.

create or replace function app.stays_keep_closed_days()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dated date;
begin
  if tg_op = 'INSERT' then
    dated := new.starts_on;
  else
    if new.status is distinct from old.status then
      dated := case
        when new.status = 'in_house' then new.starts_on
        when new.status = 'departed' then new.ends_on
        when old.status = 'in_house' and new.status = 'cancelled' then old.starts_on
        when old.status = 'departed' then old.ends_on
      end;
    end if;
    -- least() skips nulls, so each of these only ever narrows the date.
    if new.starts_on is distinct from old.starts_on then
      dated := least(dated, old.starts_on, new.starts_on);
    end if;
    if old.status = 'departed' and new.status = 'departed'
       and new.ends_on is distinct from old.ends_on then
      dated := least(dated, old.ends_on, new.ends_on);
    end if;
  end if;

  if dated is null then
    return new;
  end if;

  perform pg_advisory_xact_lock_shared(3, hashtext(new.property_id::text));
  if exists (
    select 1
      from public.business_day_closes as close
     where close.property_id = new.property_id
       and close.business_date >= dated
  ) then
    raise exception 'business day % is closed at this Property', dated
      using errcode = 'RZ001';
  end if;
  return new;
end;
$$;
