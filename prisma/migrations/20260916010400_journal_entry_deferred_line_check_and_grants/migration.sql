-- 20260916010400_journal_entry_deferred_line_check_and_grants
--
-- 1. Grant insert on entry_date to ranza_app and ranza_worker so business date can be recorded.
-- 2. Add deferred constraint trigger on finance.journal_entries to prevent orphaned zero-line headers.

grant insert (entry_date) on finance.journal_entries to ranza_app, ranza_worker;

create function finance.verify_entry_has_lines()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from finance.journal_lines
  where journal_entry_id = NEW.id;

  if v_count < 2 then
    raise exception 'journal entry % must have at least two lines, found %',
      NEW.id, v_count
      using errcode = '23514';
  end if;

  return NEW;
end;
$$;

create constraint trigger journal_entry_has_lines_check
  after insert on finance.journal_entries
  deferrable initially deferred
  for each row
  execute function finance.verify_entry_has_lines();

grant execute on function finance.verify_entry_has_lines() to ranza_app, ranza_worker;
