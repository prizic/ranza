-- A timezone Postgres does not know is refused by properties_timezone_check,
-- not by an error inside close the day's guard (CF-S1-07, ADR 0036).
--
-- ON THE NUMBER. 006100, in the configuration range. A new migration rather
-- than an edit: 20260916005000 and 20260916006000 are both applied on the
-- hosted database, and an applied migration is never edited.
--
-- The two arrived on separate branches. Close the day's guard on properties
-- runs before the row's check constraints and hands the new timezone to
-- app.business_date(), whose `at time zone` raises 22023 for a zone it does
-- not know. So a Staff Member saving Mars/Olympus met that error rather than
-- the check that exists to refuse it. Nothing is closed in a zone that does
-- not exist, so the guard has nothing to protect there and steps aside, and
-- the check refuses the row as it always did.
--
-- Everything else is 20260916005000's body unchanged: the Property's advisory
-- lock first, then RZ001 when today would become a closed day.
create or replace function app.properties_keep_today_after_the_last_close()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(3, hashtext(new.id::text));
  if not app.is_valid_timezone(new.timezone) then
    return new;
  end if;
  if app.business_date(now(), new.timezone, new.business_date_cutoff)
     <= (select max(close.business_date)
           from public.business_day_closes as close
          where close.property_id = new.id) then
    raise exception 'this change would make today a business day that is already closed'
      using errcode = 'RZ001';
  end if;
  return new;
end;
$$;
