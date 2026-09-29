-- A Guest booking has a departure (RG-S1-11, ADR 0024 amended 2026-09-29).
--
-- An open-ended booking is the Resident's case: somebody who lives here until
-- they give notice. A short-term Guest always has a planned departure, and
-- since ADR 0038 an open-ended priced Guest booking held its Unit forever and
-- was charged a room night every night until somebody noticed. The module
-- refuses one with its own sentence; this refuses it for every writer.
--
-- A plain add, so it validates the rows already there: a hosted database with
-- an open-ended Guest booking fails this migration loudly rather than keeping
-- a row the rule says cannot exist. Give that Stay a departure first.

alter table public.reservations
  add constraint reservations_guest_has_a_departure
  check (stay_type = 'resident' or ends_on is not null);
