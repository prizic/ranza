-- A busy hotel, for looking at the Workspace as each role would see it.
--
-- Fills one Property with about forty rooms, guests in house, arrivals and
-- departures today, an overdue departure, bookings ahead, a fortnight of finished
-- stays, Folios with charges and payments, a mixed housekeeping board, repairs
-- and guest requests. Every date is relative to the Property's own business date,
-- so the hotel is busy on whatever day this is run.
--
--   psql "$URL" -1 -v ON_ERROR_STOP=1 \
--     -v org=<organization id> -v property=<property id> -f scripts/demo-hotel.sql
--
-- Run as the database owner, in one transaction (-1): a reservation and its stay
-- must agree by commit, and a failure leaves nothing behind.
--
-- Demo data only. It writes rows the application would have written through its
-- commands (bookings, check-ins, charges), so there are no audit records and no
-- ledger postings for them, and the audit log stays as it was. It takes only
-- rooms with no booking today or ahead, so it never disturbs real data, and it
-- refuses to run twice. Every guest it makes has an address ending
-- @demo-hotel.test, which is how to find what it made.

\set ON_ERROR_STOP on

-- psql does not substitute its variables inside the dollar-quoted block below,
-- so they travel in as settings, for this transaction only.
select set_config('demo.org', :'org', true),
       set_config('demo.property', :'property', true) \gset

do $seed$
declare
  v_org       uuid := current_setting('demo.org')::uuid;
  v_property  uuid := current_setting('demo.property')::uuid;
  v_tz        text;
  cutoff      time;
  v_currency  text;
  b           date;
  actor       uuid;
  helper      uuid;
  total       integer;
  in_house_to integer;
  leaving_to  integer;
  arriving_to integer;
  ahead_to    integer;
  open_from   date;
begin
  select p.timezone, p.business_date_cutoff, p.currency::text
    into v_tz, cutoff, v_currency
    from public.properties p
   where p.id = v_property and p.organization_id = v_org;
  if v_tz is null then
    raise exception 'no such Property in that Organization';
  end if;
  if exists (select 1 from public.guests
              where organization_id = v_org and email like '%@demo-hotel.test') then
    raise notice 'the demo hotel is already here; nothing to do';
    return;
  end if;

  b := app.business_date(now(), v_tz, cutoff);
  -- Nothing may begin on or before a day that has been closed, so the history
  -- starts the day after the last close.
  select coalesce(max(c.business_date) + 1, b - 30) into open_from
    from public.business_day_closes c where c.property_id = v_property;

  -- Somebody to have reported things, and somebody to give work to.
  select user_id into actor from public.organization_memberships
   where organization_id = v_org and status = 'active' order by created_at limit 1;
  select m.user_id into helper
    from public.organization_memberships m
    join public.property_assignments a
      on a.user_id = m.user_id and a.property_id = v_property and a.status = 'active'
   where m.organization_id = v_org and m.status = 'active'
   order by (m.role = 'housekeeping') desc, m.created_at limit 1;
  helper := coalesce(helper, actor);

  -- What a night costs, by kind, where the Property has not said.
  insert into public.property_rates (organization_id, property_id, unit_type, amount_minor, currency)
  select v_org, v_property, r.kind, r.amount, v_currency
    from (values ('room', 280000), ('suite', 560000), ('apartment', 420000))
         as r(kind, amount)
   where not exists (select 1 from public.property_rates x
                      where x.property_id = v_property and x.unit_type = r.kind);

  -- Rooms: four floors, suites on the top one. Names that exist are left alone.
  insert into public.accommodation_units
    (property_id, organization_id, name, unit_type, capacity, floor)
  select v_property, v_org, n.name,
         case when n.floor = 4 then 'suite' else 'room' end,
         case when n.floor = 4 then 4 else 2 end, n.floor
    from (
      select (f * 100 + r)::text as name, f as floor
        from generate_series(1, 3) f, generate_series(1, 12) r
      union all
      select (400 + r)::text, 4 from generate_series(1, 6) r
    ) n
   where not exists (select 1 from public.accommodation_units u
                      where u.property_id = v_property and u.name = n.name);

  -- Guests.
  insert into public.guests (organization_id, full_name, email, phone)
  select v_org, g.name,
         lower(translate(replace(g.name, ' ', '.'), 'ıİşŞğĞüÜöÖçÇ', 'iissggyuoocc'))
           || '@demo-hotel.test',
         '+90 5' || lpad(((row_number() over (order by g.name) * 7919) % 100000000)::text, 9, '0')
    from unnest(array[
      'Ayşe Demir','Mehmet Kaya','Elif Şahin','Mustafa Yıldız','Zeynep Arslan','Ahmet Çelik',
      'Fatma Aydın','Emre Özdemir','Selin Kurt','Burak Koç','Derya Polat','Can Aksoy',
      'Hannah Müller','Lukas Schmidt','Sophie Laurent','Pierre Dubois','Giulia Rossi','Marco Bianchi',
      'Emma Johnson','Oliver Smith','Charlotte Brown','James Wilson','Amelia Taylor','Henry Davies',
      'Olga Ivanova','Dmitri Petrov','Anna Kowalska','Piotr Nowak','Maria Garcia','Carlos Lopez',
      'Yuki Tanaka','Kenji Sato','Mei Lin','Wei Zhang','Priya Sharma','Arjun Mehta',
      'Layla Hassan','Omar Farouk','Noor Al-Sayed','Khalid Mansour','Ingrid Larsen','Erik Johansson',
      'Sara Cohen','Daniel Levi','Nadia Benali','Youssef Amrani','Elena Popescu','Andrei Ionescu',
      'Isabel Costa','Rui Santos','Katja Novak','Marek Horvat','Aisha Okafor','Tunde Bello',
      'Camila Torres','Mateo Rivera','Freya Andersen','Jonas Becker','Leyla Aliyeva','Rauf Mammadov',
      'Tomás Silva','Beatriz Alves','Hiroshi Mori','Aiko Nakamura','Sven Eriksson','Linnea Berg'
    ]) as g(name)
  on conflict do nothing;

  -- Every room with nothing booked from yesterday on, in name order. A room a
  -- real booking holds is left to it.
  create temporary table seat on commit drop as
  select (row_number() over (order by u.name))::integer as n, u.id as unit_id, u.name, u.unit_type
    from public.accommodation_units u
   where u.property_id = v_property and u.unit_type in ('room', 'suite', 'apartment')
     and u.status = 'available'
     and not exists (select 1 from public.reservations r
                      where r.accommodation_unit_id = u.id
                        and r.status in ('requested', 'confirmed', 'checked_in'))
     and not exists (select 1 from public.stays s
                      where s.accommodation_unit_id = u.id
                        and s.status in ('reserved', 'in_house'));
  select count(*) into total from seat;
  if total < 20 then
    raise exception 'only % free rooms: too few to make a busy hotel', total;
  end if;
  -- About half the rooms are occupied tonight, a seventh leave today, a sixth
  -- arrive, a tenth are booked ahead and the rest are empty.
  in_house_to := greatest(total * 52 / 100, 12);
  leaving_to  := in_house_to + greatest(total * 14 / 100, 3);
  arriving_to := leaving_to + greatest(total * 16 / 100, 4);
  ahead_to    := arriving_to + greatest(total * 10 / 100, 3);

  create temporary table guest_seat on commit drop as
  select row_number() over (order by g.email) as n, g.id as guest_id, g.full_name
    from public.guests g
   where g.organization_id = v_org and g.email like '%@demo-hotel.test';

  -- What each room is doing: in_house, leaving, arriving, ahead or empty.
  create temporary table plan on commit drop as
  select s.n, s.unit_id, s.name, s.unit_type,
         case when s.n <= in_house_to then 'in_house'
              when s.n <= leaving_to  then 'leaving'
              when s.n <= arriving_to then 'arriving'
              when s.n <= ahead_to    then 'ahead'
              else 'empty' end as kind
    from seat s;

  -- Today's guests and the stays of tomorrow. Dates are offsets from the business
  -- date: the guest in house arrived one to five days ago and leaves in one to
  -- five; the one in the third room should have left yesterday.
  create temporary table booked on commit drop as
  select gen_random_uuid() as reservation_id, p.n, p.unit_id, p.kind, gs.guest_id,
         greatest(case p.kind
           when 'in_house' then b - (1 + p.n % 5)
           when 'leaving'  then b - (2 + p.n % 3)
           when 'arriving' then b
           else b + (1 + p.n % 4)
         end, open_from) as starts_on,
         case p.kind
           when 'in_house' then case when p.n = 3 then b - 1 else b + (1 + (p.n * 2) % 5) end
           when 'leaving'  then b
           when 'arriving' then b + (1 + p.n % 4)
           else b + (3 + p.n % 4) + (p.n % 3)
         end as ends_on,
         case when p.kind = 'arriving'
              then (time '12:00' + ((p.n % 6) * interval '1 hour 30 minutes'))::time end as expected
    from plan p
    join guest_seat gs on gs.n = ((p.n * 5) % (select count(*) from guest_seat)) + 1
   where p.kind <> 'empty';

  insert into public.reservations
    (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
     status, starts_on, ends_on, expected_arrival_time)
  select reservation_id, v_org, v_property, unit_id, guest_id, 'guest',
         case kind when 'in_house' then 'checked_in' when 'leaving' then 'checked_in'
                   else 'confirmed' end,
         starts_on, ends_on, expected
    from booked;

  insert into public.stays
    (organization_id, property_id, accommodation_unit_id, reservation_id, stay_type,
     status, starts_on, ends_on)
  select v_org, v_property, unit_id, reservation_id, 'guest', 'in_house', starts_on, ends_on
    from booked where kind in ('in_house', 'leaving');

  -- A fortnight of stays that are over, in the rooms they were in. They end before
  -- anything above begins, so nothing overlaps.
  create temporary table finished on commit drop as
  select gen_random_uuid() as reservation_id, p.unit_id,
         gs.guest_id,
         greatest(b - (6 + p.n % 7) - (1 + p.n % 4), open_from) as starts_on,
         b - (6 + p.n % 7) as ends_on
    from plan p
    join guest_seat gs on gs.n = ((p.n * 11 + 3) % (select count(*) from guest_seat)) + 1
   where p.kind <> 'empty' and p.n % 2 = 0 and p.n <= 30
     and b - (6 + p.n % 7) > open_from;

  insert into public.reservations
    (id, organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
     status, starts_on, ends_on)
  select reservation_id, v_org, v_property, unit_id, guest_id, 'guest', 'checked_out',
         starts_on, ends_on
    from finished;

  insert into public.stays
    (organization_id, property_id, accommodation_unit_id, reservation_id, stay_type,
     status, starts_on, ends_on, departed_at)
  select v_org, v_property, unit_id, reservation_id, 'guest', 'departed',
         starts_on, ends_on, (ends_on + time '11:00') at time zone v_tz
    from finished;

  -- A few that did not come to be.
  insert into public.reservations
    (organization_id, property_id, accommodation_unit_id, guest_id, stay_type,
     status, starts_on, ends_on)
  select v_org, v_property, p.unit_id, gs.guest_id, 'guest', c.status,
         b + c.offset_, b + c.offset_ + 2
    from (values (1, 'cancelled', 4), (2, 'cancelled', 9), (3, 'no_show', -1), (4, 'requested', 5))
         as c(k, status, offset_)
    join plan p on p.n = (select max(n) from plan) - c.k
    join guest_seat gs on gs.n = ((p.n * 3 + c.k) % (select count(*) from guest_seat)) + 1;

  -- Folios: one for every stay that is or was, in the Property's currency.
  insert into public.folios (organization_id, property_id, stay_id, currency, status)
  select v_org, v_property, s.id, v_currency, 'open'
    from public.stays s
    join public.reservations r on r.id = s.reservation_id
    join public.guests g on g.id = r.guest_id
   where s.property_id = v_property and g.email like '%@demo-hotel.test'
     and not exists (select 1 from public.folios f where f.stay_id = s.id);

  -- What guests spent. Amounts are minor units; the overdue guest owes the most,
  -- and a third of those in house have paid on account.
  insert into public.folio_lines
    (organization_id, property_id, folio_id, line_type, description, amount_minor)
  select v_org, v_property, f.id, 'charge', c.description, c.amount
    from public.folios f
    join public.stays s on s.id = f.stay_id
    join public.reservations r on r.id = s.reservation_id
    join public.guests g on g.id = r.guest_id
    cross join lateral (
      select * from (values
        (1, 'Restaurant — dinner', 185000),
        (2, 'Minibar', 42000),
        (3, 'Spa — massage', 320000),
        (4, 'Laundry', 36000),
        (5, 'Airport transfer', 150000),
        (6, 'Restaurant — breakfast', 64000)
      ) as menu(k, description, amount)
      where menu.k <= 1 + (abs(hashtext(f.id::text)) % 4)
         or (s.status = 'in_house' and s.ends_on < b and menu.k <= 5)
    ) c
   where f.property_id = v_property and g.email like '%@demo-hotel.test';

  -- Settled: the finished stays pay what they spent, the departed folio closes;
  -- a third of those still in house have paid on account.
  insert into public.folio_lines
    (organization_id, property_id, folio_id, line_type, description, amount_minor, payment_method)
  select v_org, v_property, f.id, 'payment',
         case when s.status = 'departed' then 'Payment at check-out' else 'Deposit on arrival' end,
         -sum(l.amount_minor) filter (where l.line_type = 'charge')
           * case when s.status = 'departed' then 1 else 0.5 end,
         case abs(hashtext(f.id::text)) % 3 when 0 then 'card' when 1 then 'cash' else 'bank_transfer' end
    from public.folios f
    join public.stays s on s.id = f.stay_id
    join public.folio_lines l on l.folio_id = f.id
   where f.property_id = v_property
     and (s.status = 'departed' or (s.status = 'in_house' and abs(hashtext(f.id::text)) % 3 = 0
                                    and s.ends_on >= b))
   group by f.id, s.status
  having sum(l.amount_minor) filter (where l.line_type = 'charge') > 0;

  update public.folios f
     set status = 'closed', closed_at = (s.ends_on + time '11:05') at time zone v_tz
    from public.stays s
   where s.id = f.stay_id and s.status = 'departed' and f.property_id = v_property
     and f.status = 'open'
     and exists (select 1 from public.guests g join public.reservations r on r.guest_id = g.id
                  where r.id = s.reservation_id and g.email like '%@demo-hotel.test');

  -- The housekeeping board: leaving rooms are dirty, arrivals mostly ready with a
  -- couple still being turned, the rest a mix.
  insert into public.housekeeping_unit_status
    (accommodation_unit_id, property_id, organization_id, status)
  select p.unit_id, v_property, v_org,
         case p.kind
           when 'leaving' then 'dirty'
           when 'arriving' then case when p.n % 3 = 0 then 'dirty'
                                     when p.n % 3 = 1 then 'inspected' else 'clean' end
           when 'in_house' then case when p.n % 4 = 0 then 'dirty' else 'clean' end
           else case when p.n % 5 = 0 then 'dirty' else 'inspected' end
         end
    from plan p
  on conflict (accommodation_unit_id) do update set status = excluded.status;

  -- A repair and a request are stamped with who acted, as the application's own
  -- request context would say.
  perform set_config('app.user_id', actor::text, true);

  -- Repairs, in every state a maintenance board has. A request is stamped new
  -- when it is made, so each is made and then moved, as staff would.
  create temporary table repair_plan on commit drop as
  select * from (values
    (1, 'Air conditioning does not cool', 2, 'urgent', 'new'),
    (2, 'Dripping tap in the bathroom', 5, 'this_week', 'in_progress'),
    (3, 'Wardrobe door off its hinge', 8, 'can_wait', 'new'),
    (4, 'Television has no signal', 11, 'this_week', 'waiting_for_parts'),
    (5, 'Balcony light flickers', 14, 'can_wait', 'done'),
    (6, 'Hot water slow in the shower', 17, 'this_week', 'done'),
    (7, 'Window will not close fully', 20, 'urgent', 'in_progress'),
    (8, 'Smoke alarm chirps', 23, 'this_week', 'cancelled')
  ) as m(k, title, room, priority, status)
  where m.room <= total;

  insert into public.maintenance_requests
    (organization_id, property_id, number, title, details, accommodation_unit_id,
     priority, reported_by, kind)
  select v_org, v_property,
         coalesce((select max(number) from public.maintenance_requests m
                    where m.property_id = v_property), 0) + row_number() over (order by r.k),
         r.title, 'Demo data (scripts/demo-hotel.sql).',
         (select unit_id from plan where n = r.room), r.priority, actor, 'fault'
    from repair_plan r;

  update public.maintenance_requests m
     set assignee_id = case when r.status in ('in_progress', 'waiting_for_parts', 'done')
                            then helper end,
         status = r.status,
         cancel_reason = case when r.status = 'cancelled'
                              then 'Fixed itself before anyone came' end
    from repair_plan r
   where m.property_id = v_property and m.title = r.title
     and m.details = 'Demo data (scripts/demo-hotel.sql).' and r.status <> 'new';

  -- Guests asking for things, made the same way.
  create temporary table request_plan on commit drop as
  select * from (values
    (1, 'Two extra towels', 'amenities', 'low', 'new', null::text),
    (2, 'Room is too cold at night', 'maintenance', 'normal', 'in_progress', null),
    (3, 'Late check-out at 14:00', 'front_desk', 'high', 'new', null),
    (4, 'Feather-free pillows', 'amenities', 'normal', 'resolved', 'Brought two, they were happy.'),
    (5, 'Room not cleaned today', 'housekeeping', 'high', 'in_progress', null),
    (6, 'Taxi to the airport at 05:30', 'front_desk', 'normal', 'new', null),
    (7, 'Baby cot', 'amenities', 'normal', 'resolved', 'Cot in the room before arrival.'),
    (8, 'Noise from the corridor', 'other', 'urgent', 'new', null)
  ) as q(k, title, category, priority, status, note);

  insert into public.service_requests
    (organization_id, property_id, number, title, details, category, priority,
     accommodation_unit_id, stay_id, guest_id, reported_by_user_id)
  select v_org, v_property,
         coalesce((select max(number) from public.service_requests x
                    where x.property_id = v_property), 0) + row_number() over (order by q.k),
         q.title, 'Demo data (scripts/demo-hotel.sql).', q.category, q.priority,
         s.accommodation_unit_id, s.id, r.guest_id, actor
    from request_plan q
    join (select row_number() over (order by st.accommodation_unit_id) as rn, st.*
            from public.stays st
            join public.reservations rr on rr.id = st.reservation_id
            join public.guests gg on gg.id = rr.guest_id
           where st.property_id = v_property and st.status = 'in_house'
             and gg.email like '%@demo-hotel.test') s on s.rn = q.k
    join public.reservations r on r.id = s.reservation_id;

  update public.service_requests x
     set status = q.status,
         assigned_to_user_id = case when q.status = 'in_progress' then helper end,
         resolution_notes = q.note
    from request_plan q
   where x.property_id = v_property and x.title = q.title
     and x.details = 'Demo data (scripts/demo-hotel.sql).' and q.status <> 'new';

  raise notice 'demo hotel made: % rooms used, business date %', (select count(*) from plan), b;
end
$seed$;
