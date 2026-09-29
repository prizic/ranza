# Decision sheet 2026-09-29: front-desk lane, sabotage record

Every boundary test this lane added was run with the thing it guards broken.
Each entry names what was broken, shows the altered object as printed at the
time (a catalogue read, or the diff of the source file), and shows the test
output. Afterwards the object was restored, and the restored object was
printed or the file compared byte for byte. The three functions replaced by
`create or replace` were compared with their saved `pg_get_functiondef` after
the runs and are identical.

Runner: pgTAP suites directly through `psql -f`; vitest with
`-t <test name>` for the integration (`vitest.integration.mts`) and unit
(`vitest.config.mts`) suites. Database: the lane's own, port 54492.

## Results that are not a plain red

- **CI-S2-04, the charges check made security invoker: stays green, as
  expected.** `folio_lines_read_accessible_property` is reach-based, so a
  Staff Member holding `front_desk` and not `finance` can still read the line,
  and an invoker check finds it. The two never diverge today. What binds is
  the catalogue assertion in `reservations_and_check_in.test.sql` ("the
  charges check on a withdrawal is security definer"), which goes red under
  the same sabotage. The integration test goes red when the trigger is
  dropped.
- **CI-S1-07, reach and other Organizations.** The early-arrival re-read runs
  under the caller's policies and carries `app.can_use_capability`. For
  another Organization and for a Property the caller is not assigned to, the
  SELECT policy and the capability clause both hide the row. Removing the
  clause alone leaves the policy holding, so those two sub-cases stay green.
  They diverge where the row is readable but the front desk is off, and that
  sub-case is what goes red. The `front_desk.check_in` clause diverges for
  the shipped Housekeeping role, which can read the row and cannot check
  anyone in; that also goes red.
- **RG-S1-28 / CI-S1-14.** Reach is held twice: by the read policies and by
  `app.can_use_capability`. Both read `app.accessible_property_ids()`, so the
  sabotage widens that function, and both tests go red.
- **RG-S1-11.** Removing the module's check turns its sentence into the
  constraint's raw 23514, and the test goes red on the error type. The
  constraint's own red is in the pgTAP section.

## Record

### RG-S1-11 drop the departure constraint

```
-- sabotage: alter table public.reservations drop constraint reservations_guest_has_a_departure
-- altered object:
<no reservations_guest_has_a_departure>
-- restored object:
reservations_guest_has_a_departure
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=2
not ok 35 - a Guest booking without a departure is refused
not ok 45 - the departure constraint excuses the Resident and nobody else
```

### RG-S1-08 drop the closed-day trigger on bookings

```
-- sabotage: drop trigger reservations_want_an_open_day on public.reservations
-- altered object:
<no trigger calling app.reservations_keep_closed_days>
-- restored object:
reservations_want_an_open_day
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=5
not ok 41 - a booking cannot be taken on a closed business day
not ok 42 - a booking on the first open day is taken
not ok 43 - and a writer that bypasses policies is refused a closed day too
not ok 46 - the closed-day trigger on bookings is security invoker
not ok 47 - the closed-day trigger fires after the Unit's lock is taken
```

### RG-S1-08 lock order: rename the trigger to sort before the occupancy trigger

```
-- sabotage: alter trigger reservations_want_an_open_day on public.reservations rename to reservations_a_want_an_open_day
-- altered object:
reservations_a_want_an_open_day,reservations_unit_holds_one_occupancy
-- restored object:
reservations_unit_holds_one_occupancy,reservations_want_an_open_day
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=2
not ok 46 - the closed-day trigger on bookings is security invoker
not ok 47 - the closed-day trigger fires after the Unit's lock is taken
```

### RG-S1-08 make the closed-day function security definer

```
-- sabotage: alter function app.reservations_keep_closed_days() security definer
-- altered object:
prosecdef=true
-- restored object:
prosecdef=false
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=1
not ok 46 - the closed-day trigger on bookings is security invoker
```

### RG-S1-33 drop front_desk.book from the Guest insert policy

```
-- sabotage: alter policy guests_insert_front_desk on public.guests with check (app.can_use_capability_in_organization(organization_id, 'front_office', 'front_desk'))
-- altered object:
app.can_use_capability_in_organization(organization_id, 'front_office'::text, 'front_desk'::text)
-- restored object:
(app.can_use_capability_in_organization(organization_id, 'front_office'::text, 'front_desk'::text) AND app.has_organization_permission(organization_id, 'front_desk.book'::text))
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=1
not ok 39 - a role without front_desk.book records no Guest, with every gate open
```

### RG-S1-19 make the email unique across Organizations

```
-- sabotage: create unique index sabotage_guests_email_global on public.guests (email) where email is not null
-- altered object:
CREATE UNIQUE INDEX sabotage_guests_email_global ON public.guests USING btree (email) WHERE (email IS NOT NULL)
-- restored object:
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=2
not ok 38 - an address Organization B holds is recorded again in Organization A
not ok 44 - one address is two Guests in two Organizations
```

### RG-S1-40 drop the stay-type check

```
-- sabotage: alter table public.reservations drop constraint reservations_stay_type_check
-- altered object:
<no reservations_stay_type_check>
-- restored object:
reservations_stay_type_check
```

Result:

```
-- guests_and_reservation_creation.test.sql: not ok=1
not ok 37 - a stay type other than guest or resident is refused
```

### CI-S2-04 make the withdrawal's charges check security invoker

```
-- sabotage: alter function public.stay_may_be_withdrawn() security invoker
-- altered object:
prosecdef=false
-- restored object:
prosecdef=true
```

Result:

```
-- reservations_and_check_in.test.sql: not ok=1
not ok 44 - the charges check on a withdrawal is security definer
```

### RG-S1-11 module: drop the Guest-departure check

In `packages/ranza/reservations/src/module.ts`, replaced

```
    if (endsOn === null && booking.stayType === "guest") {
      throw new ReservationPeriodError("a Guest booking needs a departure date");
    }
```

with

```
(nothing; the lines were deleted)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× refuses a Guest booking with no departure, and writes nothing 419ms
Tests  1 failed | 20 skipped (21)
```

### RG-S1-10 module: measure the booking against the calendar date, not the business date

In `packages/ranza/reservations/src/module.ts`, replaced

```
          to_char(app.property_today(unit.property_id),
                  'YYYY-MM-DD')                            as "today"
```

with

```
          to_char((now() at time zone (select p.timezone from public.properties as p where p.id = unit.property_id))::date,
                  'YYYY-MM-DD')                            as "today"
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-10: takes a booking in the small hours for the business date, yesterday's calendar date 184ms
Tests  1 failed | 20 skipped (21)
```

### CI-S1-06 module: check-in's window uses the calendar date

In `packages/ranza/reservations/src/module.ts`, replaced

```
           and starts_on <= app.property_today(property_id)
           and (ends_on is null or ends_on > app.property_today(property_id))
        returning
```

with

```
           and starts_on <= app.property_today(property_id)
           and (ends_on is null or ends_on > (now() at time zone (select p.timezone from public.properties as p where p.id = property_id))::date)
        returning
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× CI-S1-06: checks in a booking for the business date in the small hours 732ms
Tests  1 failed | 20 skipped (21)
```

### CI-S1-08 module: refuse a booking that starts today

In `packages/ranza/reservations/src/module.ts`, replaced

```
      if (startsOn < unit.today) {
```

with

```
      if (startsOn <= unit.today) {
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× is booked from today and checked in at once 140ms
Tests  1 failed | 20 skipped (21)
```

### CI-S1-19 module: ask about readiness before opening the Stay (the old order)

In `packages/ranza/reservations/src/module.ts`, replaced

```
      // Every value comes from the row the update returned, never from the
      // caller.
```

with

```
      if (!reservation.unitIsReady && !options.readinessAcknowledged) {
        throw new UnitNotReadyError();
      }
      // Every value comes from the row the update returned, never from the
      // caller.
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× is refused as occupied without asking about readiness, and writes nothing 291ms
Tests  1 failed | 1 passed | 19 skipped (21)
```

### RG-S1-39 module: put the Guest's name in reservation.created

In `packages/ranza/reservations/src/module.ts`, replaced

```
          guestId: guest.guestId,
          propertyId: unit.propertyId,
          accommodationUnitId: booking.accommodationUnitId,
        },
      });
```

with

```
          guestId: guest.guestId,
          propertyId: unit.propertyId,
          accommodationUnitId: booking.accommodationUnitId,
          guestName: booking.guestName,
        },
      });
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-39: publishes reservation.created with ids and nothing else 272ms
Tests  1 failed | 20 skipped (21)
```

### RG-S1-18 guests: match a returning Guest on the telephone too

In `packages/ranza/guests/src/write.ts`, replaced

```
  const rows = await tx.$queryRaw<{ id: string; created: boolean }[]>`
    insert into public.guests (organization_id, full_name, email, phone)
```

with

```
  const byPhone = phone
    ? await tx.$queryRaw<{ id: string }[]>`
        select id from public.guests
         where organization_id = ${details.organizationId}::uuid and phone = ${phone}
         limit 1`
    : [];
  if (byPhone[0]) return { guestId: byPhone[0].id, created: false };
  const rows = await tx.$queryRaw<{ id: string; created: boolean }[]>`
    insert into public.guests (organization_id, full_name, email, phone)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-18: a shared name and telephone with no email, or another email, is a second Guest 1342ms
Tests  1 failed | 20 skipped (21)
```

### RG-S1-20 guests: select the address first, then insert (the race the comment names)

In `packages/ranza/guests/src/write.ts`, replaced

```
  const rows = await tx.$queryRaw<{ id: string; created: boolean }[]>`
    insert into public.guests (organization_id, full_name, email, phone)
```

with

```
  const found = email
    ? await tx.$queryRaw<{ id: string }[]>`
        select id from public.guests
         where organization_id = ${details.organizationId}::uuid and email = ${email}`
    : [];
  if (found[0]) return { guestId: found[0].id, created: false };
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    insert into public.guests (organization_id, full_name, email, phone)
    values (${details.organizationId}::uuid, ${fullName}, ${email}, ${phone})
    returning id`;
  if (inserted[0]) return { guestId: inserted[0].id, created: true };
  const rows = await tx.$queryRaw<{ id: string; created: boolean }[]>`
    insert into public.guests (organization_id, full_name, email, phone)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-20: one new address booked twice at once is one Guest and two Reservations 814ms
Tests  1 failed | 20 skipped (21)
```

### RG-S1-19 database: make an email unique across Organizations

```
-- sabotage sql: create unique index sabotage_guests_email_global on public.guests (email) where email is not null
-- altered object: CREATE UNIQUE INDEX sabotage_guests_email_global ON public.guests USING btree (email) WHERE (email IS NOT NULL)
-- restored object: <gone>
```

Result:

```
× RG-S1-19: one address in two Organizations is two Guests, each in the Unit's Organization 1494ms
Tests  1 failed | 20 skipped (21)
```

### RG-S1-28 / CI-S1-14 database: assigned_properties reaches every Property of the Organization (first run)

Both tests went red, but the printout showed only the function's first line. Rerun below with the altered clause printed.

### CI-S1-15 database: gate 1 admits a suspended Subscription

```
-- sabotage sql: CREATE OR REPLACE FUNCTION app.capability_is_available(target_property_id uuid, target_module_key text, target_capability_key text)
-- altered object: subscription.status in ('trialing', 'active', 'suspended')
-- restored object: subscription.status in ('trialing', 'active')
```

Result:

```
× CI-S1-15: refuses a check-in under a suspended Subscription by matching nothing 1860ms
Tests  1 failed | 2 passed | 18 skipped (21)
```

### CI-S1-15 database: gate 2 ignores the Entitlement's status

```
-- sabotage sql: CREATE OR REPLACE FUNCTION app.capability_is_available(target_property_id uuid, target_module_key text, target_capability_key text)
-- altered object: entitlement.module_key = target_module_key
        and true
-- restored object: entitlement.module_key = target_module_key
        and entitlement.status = 'active'
```

Result:

```
× CI-S1-15: refuses a check-in under a revoked Entitlement by matching nothing 326ms
Tests  1 failed | 2 passed | 18 skipped (21)
```

### CI-S1-15 database: gate 3 ignores whether the capability is enabled

```
-- sabotage sql: CREATE OR REPLACE FUNCTION app.capability_is_available(target_property_id uuid, target_module_key text, target_capability_key text)
-- altered object: capability.capability_key = target_capability_key
        and true
-- restored object: capability.capability_key = target_capability_key
        and capability.enabled
```

Result:

```
× CI-S1-15: refuses a check-in under the front desk switched off by matching nothing 178ms
Tests  1 failed | 2 passed | 18 skipped (21)
```

### CI-S1-09 database: drop the occupancy trigger on bookings

```
-- sabotage sql: drop trigger reservations_unit_holds_one_occupancy on public.reservations
-- altered object: <no reservations_unit_holds_one_occupancy>
-- restored object: reservations_unit_holds_one_occupancy
```

Result:

```
× holds the Unit from arrival onwards, so a later booking is refused 485ms
Tests  1 failed | 20 skipped (21)
```

### RG-S3-02 module: drop cancelled bookings from the list

In `packages/ranza/reservations/src/module.ts`, replaced

```
          and (reservation.ends_on is null
               or reservation.ends_on >= today.day
               or reservation.status in ('requested', 'confirmed'))
```

with

```
          and reservation.status <> 'cancelled'
          and (reservation.ends_on is null
               or reservation.ends_on >= today.day
               or reservation.status in ('requested', 'confirmed'))
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-02: keeps a cancelled booking and one departing today on the list 566ms
Tests  1 failed | 20 skipped (21)
```

### RG-S3-02 module: a booking departing today leaves the list (> rather than >=)

In `packages/ranza/reservations/src/module.ts`, replaced

```
               or reservation.ends_on >= today.day
               or reservation.status in ('requested', 'confirmed'))
```

with

```
               or reservation.ends_on > today.day
               or reservation.status in ('requested', 'confirmed'))
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-02: keeps a cancelled booking and one departing today on the list 481ms
Tests  1 failed | 20 skipped (21)
```

### RG-S3-07 module: stop telling a booked Unit apart (no 23P01 mapping in createReservation) (not applied)

The anchor matched twice (createReservation and amendBooking share the mapping) and the runner refuses an ambiguous edit. Rerun below with an anchor unique to createReservation.

### RG-S3-07 module: stop telling a booked Unit apart (no 23P01 mapping in createReservation)

In `packages/ranza/reservations/src/module.ts`, replaced

```
        // on that Unit. The one refusal a front desk can act on — every other
        // one here is "you cannot".
        if (raised(error, EXCLUSION_VIOLATION)) {
          throw new UnitUnavailableError(
            "that Accommodation Unit is booked for those nights",
          );
        }
```

with

```
        // on that Unit. The one refusal a front desk can act on — every other
        // one here is "you cannot".
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-07: two bookings over the same nights, and somebody in house, are two different refusals 414ms
Tests  1 failed | 20 skipped (21)
```

### RG-S1-28 / CI-S1-14 database: assigned_properties reaches every Property of the Organization

```
-- sabotage sql: CREATE OR REPLACE FUNCTION app.accessible_property_ids()
-- altered object: where membership.user_id = app.current_user_id() and membership.status = 'active' and property.status = 'active' and ( true or exists ( select 1 from public.property_assignments as assignment where assignment.property_id = property.id and assignment.user_id = membership.user_id and assignment.status = 'active' ) );
-- restored object: where membership.user_id = app.current_user_id() and membership.status = 'active' and property.status = 'active' and ( membership.access_scope = 'organization_wide' or exists ( select 1 from public.property_assignments as assignment where assignment.property_id = property.id and assignment.user_id = membership.user_id and assignment.status = 'active' ) );
```

Result:

```
× RG-S1-28: refuses a booking at a Property of their Organization they are not assigned to 461ms
× CI-S1-14: refuses a check-in at a Property of their Organization they are not assigned to 485ms
Tests  2 failed | 19 skipped (21)
```

### CI-S1-07 module: no early-arrival answer (every refusal is the generic one)

In `packages/ranza/reservations/src/module.ts`, replaced

```
        if (early) throw new CheckInTooEarlyError(early.startsOn);
```

with

```
(nothing; the lines were deleted)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× CI-S1-07: tells the desk a booking from the new calendar day starts on the next business date 407ms
Tests  1 failed | 20 skipped (21)
```

### CI-S1-07 module: the early-arrival read forgets the commercial gates and reach

In `packages/ranza/reservations/src/module.ts`, replaced

```
            and starts_on > app.property_today(property_id)
            and app.can_use_capability(
              property_id,
              ${FRONT_DESK_CAPABILITY.moduleKey},
              ${FRONT_DESK_CAPABILITY.capabilityKey}
            )
            and app.has_organization_permission(
```

with

```
            and starts_on > app.property_today(property_id)
            and app.has_organization_permission(
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× CI-S1-07: says nothing about an early booking to somebody who could not check it in 502ms
Tests  1 failed | 20 skipped (21)
```

### CI-S1-07 module: the early-arrival read forgets front_desk.check_in

In `packages/ranza/reservations/src/module.ts`, replaced

```
            )
            and app.has_organization_permission(
              organization_id, 'front_desk.check_in')
        `;
        if (early)
```

with

```
            )
        `;
        if (early)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× CI-S1-07: says nothing about an early booking to somebody who could not check it in 451ms
Tests  1 failed | 20 skipped (21)
```

### CI-S2-04 database: drop the charges check on a withdrawal

```
-- sabotage sql: drop trigger stays_withdrawal_is_free_of_charges on public.stays
-- altered object: <no stays_withdrawal_is_free_of_charges>
-- restored object: stays_withdrawal_is_free_of_charges
```

Result:

```
× refuses a Front desk withdrawal of a Stay whose Folio carries a line 544ms
Tests  1 failed | 11 skipped (12)
```

### CI-S2-04 database: make the charges check security invoker (expected to stay green: folio_lines reads are reach-based, so the two never diverge today)

```
-- sabotage sql: alter function public.stay_may_be_withdrawn() security invoker
-- altered object: prosecdef=false
-- restored object: prosecdef=true
```

Result:

```
Tests  1 passed | 11 skipped (12)
```

### CI-S2-14 database: bound withdrawal to the day the Stay began

```
-- sabotage sql: CREATE OR REPLACE FUNCTION public.stay_may_be_withdrawn()
-- altered object: if old.starts_on < app.property_today(old.property_id) then
      raise exception 'sabotage: only on the day' using errcode = '55000';
-- restored object:
```

Result:

```
× withdraws a check-in from a business day that is still open, with nothing posted 278ms
Tests  1 failed | 11 skipped (12)
```

### RG-S1-11/RG-S3-11 dialog: let a Guest booking submit without a departure

In `apps/operator-workspace/src/features/front-office/components/new-reservation-dialog.tsx`, replaced

```
disabled={pending || (departureRequired && !dates.to)}
```

with

```
disabled={pending}
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× a_guest_booking_is_not_taken_without_a_departure 5807ms
Tests  1 failed | 8 skipped (9)
```

### RG-S3-11 dialog: submit through action (React resets the form and the Select)

In `apps/operator-workspace/src/features/front-office/components/new-reservation-dialog.tsx`, replaced

```
<form className="grid gap-4" onSubmit={submitWithoutReset(act)}>
```

with

```
<form action={act} className="grid gap-4">
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× a_refusal_keeps_the_stay_type_the_desk_chose 2648ms
Tests  1 failed | 8 skipped (9)
```

### RG-S3-12 catalogue: the Arabic submit label falls back to English (superseded)

The sabotage wrote "Take booking", which is not the English label ("Create reservation"), so it altered nothing the test compares and stayed green. It proved nothing either way; the rerun below uses the real English string.

### RG-S3-12 date field: the calendar stops mirroring: green, so the assertion was too weak

`[dir="rtl"]` anywhere in the document was satisfied by the Radix Select trigger as well, so the calendar losing its direction went unnoticed. The test now asserts `dir` on `[data-slot="calendar"]` and on the stay-type combobox; rerun below.

### RG-S3-12 catalogue: the Arabic submit label falls back to the English string

In `apps/operator-workspace/src/messages.ts`, replaced

```
takeBooking: "إنشاء الحجز"
```

with

```
takeBooking: "Create reservation"
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× the_booking_form_reads_in_arabic_and_mirrors 638ms
Tests  1 failed | 8 skipped (9)
```

### RG-S3-12 date field: the calendar stops mirroring

In `packages/ui/src/components/date-range-field.tsx`, replaced

```
              dir={directionFor(locale)}
```

with

```
              dir="ltr"
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× the_booking_form_reads_in_arabic_and_mirrors 952ms
Tests  1 failed | 8 skipped (9)
```

### RG-S3-12 layout: no direction provided to the dialog's pickers

In `tests/unit/new-reservation.test.tsx`, replaced

```
<DirectionProvider dir={directionFor("ar")}>
```

with

```
<DirectionProvider dir="ltr">
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× the_booking_form_reads_in_arabic_and_mirrors 1272ms
Tests  1 failed | 8 skipped (9)
```

### CI-S3-15: poll every minute

In `apps/operator-workspace/src/features/front-office/components/live-arrivals.tsx`, replaced

```
refetchInterval: 30_000,
```

with

```
refetchInterval: 60_000,
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× arrivals_are_read_again_every_30_seconds_while_visible 43ms
Tests  1 failed | 1 skipped (2)
```

### CI-S3-15: poll while the tab is hidden

In `apps/operator-workspace/src/features/front-office/components/live-arrivals.tsx`, replaced

```
refetchInterval: 30_000,
```

with

```
refetchInterval: 30_000,
    refetchIntervalInBackground: true,
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× arrivals_are_not_polled_while_the_tab_is_hidden 48ms
Tests  1 failed | 1 skipped (2)
```

### RG-S1-10 page: hand the form the calendar date

In `apps/operator-workspace/src/app/[locale]/(workspace)/reservations/page.tsx`, replaced

```
units.length > 0 ? await bookingDay(property.propertyId) : null;
```

with

```
units.length > 0 ? new Date().toISOString().slice(0, 10) : null;
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-10: hands the booking form the Property's business date 372ms
Tests  1 failed | 4 skipped (5)
```

### RG-S3-04 page: hide New reservation when nothing can be sold

In `apps/operator-workspace/src/app/[locale]/(workspace)/reservations/page.tsx`, replaced

```
<NoBookableUnit roomsHref={roomsHref} />
```

with

```
null
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-04: with no Unit to sell, New reservation is disabled and says why 635ms
× RG-S3-04: somebody who may manage rooms is sent to Rooms, keeping the Property 201ms
Tests  2 failed | 1 passed | 2 skipped (5)
```

### RG-S3-04 page: offer Rooms whatever the viewer may do

In `apps/operator-workspace/src/app/[locale]/(workspace)/reservations/page.tsx`, replaced

```
    units.length === 0 &&
    (await permittedProperties(MANAGES_ROOMS)).some(
      (permitted) => permitted.propertyId === property.propertyId,
    )
```

with

```
    units.length === 0
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-04: with no Unit to sell, New reservation is disabled and says why 371ms
× RG-S3-04: somebody who may manage rooms is sent to Rooms, keeping the Property 45ms
× RG-S3-04: may manage rooms somewhere else is not a link here 49ms
Tests  3 failed | 2 skipped (5)
```

### RG-S3-03 table: the empty state loses its title

In `apps/operator-workspace/src/features/front-office/components/reservations-table.tsx`, replaced

```
title={t("noReservationsTitle")}
```

with

```
title={t("reservationsAt")}
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-03: says nothing is booked ahead when the list is empty 376ms
Tests  1 failed | 4 skipped (5)
```

### RG-S1-40 action: accept any stay type

In `apps/operator-workspace/src/server/front-office.ts`, replaced

```
return value === "guest" || value === "resident" ? value : null;
```

with

```
return typeof value === "string" ? (value as ReservationStayType) : null;
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-40: refuses a stay type that is neither guest nor resident, before the module 15ms
Tests  1 failed | 4 skipped (5)
```

### RG-S3-07 action: word somebody in house as a generic refusal

In `apps/operator-workspace/src/server/front-office.ts`, replaced

```
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof UnitHasOccupantError) return "occupied";
    if (error instanceof ReservationPeriodError) return "invalidPeriod";
```

with

```
    if (error instanceof UnitUnavailableError) return "unavailable";
    if (error instanceof ReservationPeriodError) return "invalidPeriod";
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-07: words a booked Unit and a Unit with somebody in it differently 13ms
Tests  1 failed | 4 skipped (5)
```

### RG-S3-09 action: log the module's own refusal as unexpected

In `apps/operator-workspace/src/server/front-office.ts`, replaced

```
    if (error instanceof ReservationRefusedError) return "refused";
```

with

```
(nothing; the lines were deleted)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S3-09: an unexpected failure is refused and recorded; the module's refusal only refused 13ms
Tests  1 failed | 4 skipped (5)
```

### CI-S1-20 action: an unexpected check-in failure is swallowed

In `apps/operator-workspace/src/server/front-office.ts`, replaced

```
    if (!(error instanceof CheckInError)) {
      console.error(
        "checkInReservation failed unexpectedly",
        { reservationId },
        error,
      );
    }
```

with

```
(nothing; the lines were deleted)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× CI-S1-20: an unexpected failure is refused and recorded; the module's refusal only refused 9ms
Tests  1 failed | 4 skipped (5)
```

### CI-S1-07 action: an early arrival is the generic refusal

In `apps/operator-workspace/src/server/front-office.ts`, replaced

```
    if (error instanceof CheckInTooEarlyError) return "tooEarly";
```

with

```
(nothing; the lines were deleted)
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× CI-S1-07: an early arrival is its own answer, and not an incident 16ms
Tests  1 failed | 4 skipped (5)
```

### RG-S1-10 module: bookingDay answers the calendar date

In `packages/ranza/reservations/src/module.ts`, replaced

```
select to_char(app.property_today(property.id), 'YYYY-MM-DD') as day
```

with

```
select to_char((now() at time zone property.timezone)::date, 'YYYY-MM-DD') as day
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-10: the booking form is given the business date, and an outsider nothing 134ms
Tests  1 failed | 21 skipped (22)
```

### RG-S1-08 module: a closed-day refusal at booking is not mapped (review finding 1)

In `packages/ranza/reservations/src/module.ts`, deleted from `createReservation`'s catch:

```
        if (raised(error, BUSINESS_DAY_CLOSED)) {
          throw new ReservationPeriodError(
            "the business day closed while the booking was taken",
          );
        }
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× is refused as a date to fix, and writes nothing
Tests  1 failed | 22 skipped (23)
```

### RG-S1-08 database: the booking trigger is dropped (closed-day race test)

```
-- sabotage sql: drop trigger reservations_want_an_open_day on public.reservations
-- altered object: <no reservations_want_an_open_day>
-- restored object: reservations_want_an_open_day
```

Result:

```
× is refused as a date to fix, and writes nothing
Tests  1 failed | 22 skipped (23)
```

### RG-S1-10 module: bookingDay forgets the commercial gates (grill Q2)

The outsider half of the test was held by the Property's read policy and the
capability clause at once, so deleting the clause alone could not go red. An
assertion was added where they diverge: the Property readable, its front desk
off. In `packages/ranza/reservations/src/module.ts`, deleted from `bookingDay`:

```
          and app.can_use_capability(
            property.id,
            ${FRONT_DESK_CAPABILITY.moduleKey},
            ${FRONT_DESK_CAPABILITY.capabilityKey}
          )
```

Printed as a diff against the file as it stood; restored byte for byte after the run.

Result:

```
× RG-S1-10: the booking form is given the business date, and an outsider nothing
Tests  1 failed | 22 skipped (23)
```
