-- The Folios left open by check-ins that were withdrawn before the withdrawal
-- closed them.
--
-- Nothing could ever be posted to one — `folio_lines_postable` refuses a
-- cancelled Stay — so this loses nothing. They are rows on the Finance screen
-- for Guests who were never there, which nobody could act on and nobody could
-- close (ADR 0022).
--
-- One statement, deliberately. The guard and the close cannot be applied
-- separately, so there is no version of this that refuses and closes anyway.
--
-- The guard is for a state that should be unreachable: `folio_lines_postable`
-- refuses a line on a cancelled Stay, and `stays_withdrawal_is_free_of_charges`
-- refuses to cancel a Stay carrying one. "Should be unreachable" is exactly the
-- claim a backfill must not assume — this migration runs against databases
-- older than both rules. If money is found on a withdrawn Stay it stops, and
-- somebody decides whether that is a credit or a refund. It is never closed
-- quietly.
--
-- Safe to apply anywhere: a database with no ghosts closes nothing.

do $$
declare
  carrying integer;
  swept integer;
begin
  select count(*)
    into carrying
    from public.folios as folio
    join public.stays as stay on stay.id = folio.stay_id
   where folio.status = 'open'
     and stay.status = 'cancelled'
     and exists (
       select 1 from public.folio_lines as line where line.folio_id = folio.id
     );

  if carrying > 0 then
    raise exception
      'refusing: % open Folio(s) on cancelled Stays carry lines', carrying
      using hint =
        'money on a withdrawn Stay is a credit or a refund, not a backfill';
  end if;

  update public.folios as folio
     set status = 'closed',
         closed_at = now(),
         updated_at = now()
    from public.stays as stay
   where stay.id = folio.stay_id
     and folio.status = 'open'
     and stay.status = 'cancelled';

  get diagnostics swept = row_count;
  raise notice 'closed % Folio(s) left open by a withdrawn check-in', swept;
end $$;
