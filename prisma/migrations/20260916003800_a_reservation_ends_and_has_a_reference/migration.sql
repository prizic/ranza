-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "reference" TEXT;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-23; CO-S1-26, CO-S1-29, CO-S1-35)
-- ---------------------------------------------------------------------------

-- A Reservation that ended. Until now check-out moved the Stay to departed and
-- left its Reservation at checked_in forever, so every departed Guest still
-- read as arrived and the pair disagreed in every row check-out had touched
-- (CO-DIFF-02). checked_out is the state the design drew for it; nothing else
-- about the machine changes, and reservation_transition_is_drawn already
-- allows checked_in to checked_out.
alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('requested', 'confirmed', 'cancelled', 'no_show',
                    'checked_in', 'checked_out'));

-- Every Reservation whose Guest has already left moves on, before the rule
-- below is in place to object to the rows as they are (CO-S1-26). Only where
-- nobody from it is still in house: a Reservation with a withdrawn Stay and a
-- live one keeps checked_in.
update public.reservations as reservation
   set status = 'checked_out', updated_at = now()
 where reservation.status = 'checked_in'
   and exists (select 1 from public.stays as stay
                where stay.reservation_id = reservation.id
                  and stay.status = 'departed')
   and not exists (select 1 from public.stays as stay
                    where stay.reservation_id = reservation.id
                      and stay.status = 'in_house');

-- ---------------------------------------------------------------------------
-- A Stay and its Reservation say the same thing (CO-S1-29)
-- ---------------------------------------------------------------------------

-- The pairs states.mmd draws, and only those: in house with checked in,
-- departed with checked out, and for every other Reservation state no Stay
-- that is either. A withdrawn check-in — a cancelled Stay behind a confirmed
-- Reservation — is a pair the rule has no opinion about, and neither is a
-- Stay with no Reservation.
--
-- Checked at commit, not per statement: check-out moves two rows, and whichever
-- it moves first leaves them disagreeing until it moves the second (CO-S1-35).
--
-- security definer, like the occupancy trigger and for the same reason: a
-- check that could only see the rows the actor may read would find nothing to
-- disagree with.
create function app.stay_and_reservation_agree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  reservation_status text;
  staying integer;
  left_ integer;
  agree boolean;
begin
  -- An IF rather than a CASE: PL/pgSQL resolves every field an expression
  -- names, so a CASE naming reservation_id fails on a reservations row even in
  -- the branch it does not take.
  if tg_table_name = 'stays' then
    target := new.reservation_id;
  else
    target := new.id;
  end if;
  if target is null then
    return null;
  end if;

  select reservation.status into reservation_status
  from public.reservations as reservation
  where reservation.id = target;

  select count(*) filter (where stay.status = 'in_house'),
         count(*) filter (where stay.status = 'departed')
    into staying, left_
  from public.stays as stay
  where stay.reservation_id = target;

  -- Assigned rather than written inside the IF: PL/pgSQL ends an IF's
  -- condition at the first THEN, including one inside a CASE.
  agree := case reservation_status
             when 'checked_in'  then staying = 1
             when 'checked_out' then staying = 0 and left_ >= 1
             else staying = 0 and left_ = 0
           end;

  if not agree then
    raise exception 'Reservation % is % but its Stays are % in house and % departed',
      target, reservation_status, staying, left_
      using errcode = '23514';
  end if;

  return null;
end;
$$;

comment on function app.stay_and_reservation_agree() is
  'At commit, refuses a Reservation and its Stays that disagree: checked_in needs one in-house Stay, checked_out a departed one and none in house, anything else neither (CO-S1-29).';

create constraint trigger stays_agree_with_their_reservation
  after insert or update of status, reservation_id on public.stays
  deferrable initially deferred
  for each row execute function app.stay_and_reservation_agree();

create constraint trigger reservations_agree_with_their_stays
  after insert or update of status on public.reservations
  deferrable initially deferred
  for each row execute function app.stay_and_reservation_agree();

-- ---------------------------------------------------------------------------
-- A reference somebody can read aloud
-- ---------------------------------------------------------------------------

-- The screens showed the first six characters of a UUID. Two Reservations
-- could share them, and arrivals and departures took them from different ids,
-- so one Guest had two references depending on the screen.
--
-- A sequence, so no two Reservations are ever given the same one — a random
-- value checked for uniqueness is a race between two bookings. Its values are
-- then scrambled by multiplying by an odd number modulo 2^30, which visits
-- every value exactly once before repeating, so consecutive bookings do not
-- read as a count of the business. Not a secret: anybody who saw several could
-- work the order out, and nothing relies on them not doing so.
--
-- Written as `R` and six characters of Crockford's base 32, which has no I, L,
-- O or U: nothing a front desk reads down a telephone is mistaken for a digit.
-- 2^30 of them, about a billion, before the sequence wraps and the unique
-- index refuses.
create sequence public.reservation_reference_seq as bigint minvalue 1 maxvalue 1073741823;

create function app.reservation_reference(serial bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R' || string_agg(
           substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                  ((scrambled >> (5 * (5 - place))) & 31)::int + 1, 1),
           '' order by place)
  from (select (serial * 49722787 + 316930417) % 1073741824 as scrambled) as mixed,
       generate_series(0, 5) as place;
$$;

comment on function app.reservation_reference(bigint) is
  'The reference a Guest is given for a Reservation: R and six Crockford base-32 characters, a bijection of the sequence value.';

-- Every Reservation already written gets one, in the order it was made.
update public.reservations as reservation
   set reference = app.reservation_reference(numbered.serial)
  from (select id, nextval('public.reservation_reference_seq') as serial
        from (select id from public.reservations order by created_at, id) as ordered)
       as numbered
 where numbered.id = reservation.id;

alter table public.reservations alter column reference set not null;

create unique index reservations_reference_key on public.reservations (reference);

-- Always the trigger's, whatever the insert said: a reference a caller could
-- choose is one a caller could choose to collide. Not in ranza_app's insert
-- grant either, which is the same decision made twice.
create function app.reservation_gets_a_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reference := app.reservation_reference(
    pg_catalog.nextval('public.reservation_reference_seq'));
  return new;
end;
$$;

create trigger reservations_get_a_reference
  before insert on public.reservations
  for each row execute function app.reservation_gets_a_reference();

grant usage on sequence public.reservation_reference_seq to ranza_app;
grant execute on function app.reservation_reference(bigint) to ranza_app;
