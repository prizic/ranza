-- A Guest booking has a departure (RG-S1-11, ADR 0024 amended 2026-09-29).
--
-- An open-ended booking is the Resident's case: somebody who lives here until
-- they give notice. A short-term Guest always has a planned departure, and
-- since ADR 0038 an open-ended priced Guest booking held its Unit forever and
-- was charged a room night every night until somebody noticed. The module
-- refuses one with its own sentence; this refuses it for every writer.
--
-- A finished booking — checked out, cancelled or a no-show, the states
-- app.a_finished_row_keeps_its_dates() calls finished — is excused. It holds no Unit
-- and is charged nothing more, and app.a_finished_row_keeps_its_dates() forbids
-- giving it a departure after the fact, so a hosted database holding one from
-- before this rule could never apply it. Every booking is taken confirmed, so
-- the rule binds each one from the moment it is taken; only a row that was
-- already finished when this was added can be excused by it.
--
-- A plain add, so it validates the rows already there: a hosted database with
-- an open-ended Guest booking still confirmed or in house fails this migration
-- loudly. Give that booking a departure first (Change booking or Change
-- departure, ADR 0039).

alter table public.reservations
  add constraint reservations_guest_has_a_departure
  check (
    stay_type = 'resident'
    or ends_on is not null
    or status in ('checked_out', 'cancelled', 'no_show')
  );
