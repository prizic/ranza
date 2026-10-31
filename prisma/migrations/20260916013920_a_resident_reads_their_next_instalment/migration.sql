-- What a student sees of their payment plan on My stay (RANZ-87, GP-S4-11 to
-- GP-S4-17, ADR 0060; the plan itself is ADR 0059).
--
-- The next instalment of the signed-in user's own current Stays: its number,
-- its due date, what is still owed on it, whether it is due, upcoming or
-- overdue, and how much is overdue in all.
--
-- A function and not a policy on plan_instalments: a policy bounds rows, and
-- a student has no reach, so the staff policies that read the plan return them
-- nothing. A policy of their own would also hand them withdrawn_reason, a
-- column a Staff Member's revision writes, and the Folio lines the standing is
-- worked out from, which carry descriptions the desk typed.
--
-- Where an instalment stands is app.payment_plan_standing(), the one
-- definition of overdue (PP-S1-*): this reads it and restates none of it, so
-- the student is told the same thing the close and the Today screen are. That
-- function is security invoker and reads through the caller's reach, which a
-- Resident does not have; called from here it runs as this function's owner,
-- like the balance function beside it, and what keeps it to one student is
-- this function and nothing else:
--
--   the user       stays.user_id is the signed-in user. The user is never an
--                  argument.
--   the booking    the standing of a Property with no booking named is the
--                  standing of every booking in it. A Stay with no booking
--                  (a walk-in) would ask for exactly that, so it is left out,
--                  and the rows returned are matched to the Stay's own booking
--                  as well. Either clause alone is enough: a sabotage of one
--                  stays green and of both goes red, and both stay so that a
--                  change to one cannot widen the other silently.
--   current        a reserved or in-house Stay, not a finished one. The gates
--                  below imply a current Stay in the Property, so this clause
--                  matters only to a student who holds a finished Stay and a
--                  current one in the same Property, and that is the case the
--                  suite asserts.
--   the gates      the Organization holds billing_folios and the Property has
--                  finance on, asked as the Portal asks them everywhere.
--
-- Nothing a Staff Member typed is returned: no reason, no note, no Folio line.
-- A plan with nothing left to pay, and a Stay with no plan, return no row.
create function app.resident_next_instalments()
returns table (
  stay_id uuid,
  currency text,
  instalment_number integer,
  instalments_total integer,
  due_on text,
  outstanding_minor text,
  state text,
  overdue_count integer,
  overdue_minor text
)
language sql
stable
security definer
set search_path = ''
as $$
  with own as (
    select stay.id as stay_id, stay.property_id, stay.reservation_id
      from public.stays as stay
     where stay.user_id = app.current_user_id()
       and stay.reservation_id is not null
       and stay.status in ('reserved', 'in_house')
       and app.resident_can_use_capability(
             stay.property_id, 'billing_folios', 'finance')
  ),
  standing as (
    select own.stay_id, plan.*
      from own
     cross join lateral app.payment_plan_standing(
            own.property_id, own.reservation_id) as plan
     where plan.reservation_id = own.reservation_id
  ),
  counted as (
    select standing.*,
           count(*) over (partition by standing.stay_id) as total,
           count(*) filter (where standing.state = 'overdue')
             over (partition by standing.stay_id) as late_count,
           coalesce(sum(standing.outstanding_minor) filter (
                      where standing.state = 'overdue')
                    over (partition by standing.stay_id), 0) as late_minor
      from standing
  )
  select distinct on (counted.stay_id)
         counted.stay_id,
         counted.currency,
         counted.number,
         counted.total::integer,
         to_char(counted.due_on, 'YYYY-MM-DD'),
         counted.outstanding_minor::text,
         counted.state,
         counted.late_count::integer,
         counted.late_minor::text
    from counted
   where counted.state in ('overdue', 'due', 'upcoming')
   order by counted.stay_id, counted.due_on, counted.number;
$$;

revoke execute on function app.resident_next_instalments() from public;
grant execute on function app.resident_next_instalments() to ranza_app;

comment on function app.resident_next_instalments() is
  'The next unpaid instalment of the acting user''s own current Stays, with how much is overdue, read from app.payment_plan_standing() and nothing a Staff Member typed (GP-S4-11 to GP-S4-17, ADR 0060).';
