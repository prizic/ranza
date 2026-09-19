# How the 19 → 21 step was actually run

A record of one hosted catch-up, written on the day it happened
(2026-09-18) because the next one is twelve migrations rather than two and will
want this shape.

**This belongs merged into `docs/runbooks/hosted-catch-up.md`**, which plans
the step and lives on `design/rates`. It is a separate file only because that
branch was being committed to by another session while this ran, and editing a
file underneath a live session is how two people lose work. Fold the two when
`design/rates` lands; this one is the "what happened" half.

## What the blocker turned out to be

The plan said "6 pairs of confirmed Reservations overlapping on one Unit". That
is true and it is not the useful shape. The six pairs were **six Reservations on
two Units** — three confirmed on each, all over identical dates, so C(3,2) × 2.
Four rows had to move, not six, and the worksheet's "one option per pair" would
have had somebody deciding the same thing three times.

They were also not bookings. All fourteen Reservations on the hosted database
belonged to one Organization, `d7000002-0000-4000-8000-000000000001`
"Reversal Organization" — the fixture Organization of
`tests/integration/check-in-reversal.test.ts`, whose `ORG` constant is that
exact uuid. Two timestamp clusters on 2026-09-16, one test run each. Every Stay
already `cancelled`, which is that suite withdrawing a check-in and leaving
the Reservation arrivable behind it. Zero money on any of them.

**So the first question to ask is not "which side do we cancel" but "whose rows
are these".** One query against `organizations` answered it and turned a
commercial decision into a cleanup.

## The two parts worth copying

### 1. A snapshot that was checked, not just taken

```sh
docker exec -e PGURL="$DIRECT_URL" ranza-postgres-1 \
  sh -c 'pg_dump "$PGURL" --no-owner --no-privileges' > snapshot.sql
```

Through the container on purpose: the Homebrew client here is **pg_dump 14** and
Supabase runs **17.6**, and pg_dump refuses a server newer than itself. The
container's client is 17.11 and can reach the host. Finding that out after
deciding to snapshot would have meant deciding again.

Then it was **verified**, because a file existing is not a backup:

```sh
grep -c '^CREATE TABLE' snapshot.sql                 # 63
awk '/^COPY public.reservations /{f=1;next} f&&/^\\\.$/{exit} f{n++} END{print n}' snapshot.sql   # 14
tail -2 snapshot.sql                                  # ends cleanly
```

### 2. The commit gated by a check, not by a person reading output

Every statement in one transaction, and the `COMMIT` reached only if the
conditions hold — so the decision to commit is made by the database, not by
whoever is looking at the terminal at 4am.

```sql
begin;
update public.reservations set status='cancelled', updated_at=now() where id='…';  -- x4, one per id
do $$
declare pairs int; total int; cancelled_now int;
begin
  select count(*) into pairs from …overlap query…;
  if pairs <> 0 then raise exception 'REFUSING TO COMMIT: % overlapping pairs remain', pairs; end if;
  select count(*) into total from public.reservations;
  if total <> 14 then raise exception 'REFUSING TO COMMIT: count is %, was 14 — something was deleted', total; end if;
  select count(*) into cancelled_now from public.reservations where id in (…) and status='cancelled';
  if cancelled_now <> 4 then raise exception 'REFUSING TO COMMIT: % of 4 named rows cancelled', cancelled_now; end if;
end $$;
commit;
```

Three properties worth keeping:

- **It asserts the thing the migration will assert** — zero overlapping pairs —
  rather than asserting that four UPDATEs ran.
- **It asserts nothing was lost.** The count check is what turns "I only ran
  UPDATEs" from a claim into a fact.
- **It names the rows.** Four id-scoped statements, not one set-based one: four
  are reviewable, and a `WHERE` that matches five is not recoverable by
  re-running it.

Each `UPDATE` reported `UPDATE 1`. Inside the transaction: confirmed 9 → 5,
cancelled 0 → 4, overlapping pairs 0. Then `COMMIT`.

## The rest of it, in order

| Step               | Result                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Measure 1a         | 19 applied, none unfinished, none rolled back — so the plan's `migrate resolve` line was not needed                                                                                                          |
| Measure 1c         | **0** zero-night bookings; the tightened period check refused nothing                                                                                                                                        |
| Measure 1d         | **0** beds with capacity ≠ 1; 002100 had no blocker                                                                                                                                                          |
| Measure 1e         | 14 reservations, 14 stays, 3 folio lines, 12 units, 1 Organization                                                                                                                                           |
| Snapshot           | `/Users/seifelesllamseif/ranza-hosted-snapshots/hosted-before-002000-20260918T042411.sql`                                                                                                                    |
| Four cancellations | one gated transaction, committed                                                                                                                                                                             |
| `pnpm db:migrate`  | exit 0, 002000 and 002100 applied                                                                                                                                                                            |
| After              | 21 applied · `guests` exists with 8 rows · 0 Reservations without a `guest_id` · `guest_name` column gone · `reservations_no_double_booking` and `reservations_period_check` both present · counts unchanged |

## What the next one should do differently

- **Ask whose rows they are first.** It collapsed a commercial decision into a
  cleanup here, and twelve migrations will surface more of them.
- **Check the client version before planning the snapshot**, not after.
- **Expect the pair count to overstate the work.** N confirmed Reservations on
  one Unit are C(N,2) pairs and N−1 rows to move.
- **Twelve migrations will not fail in a way that names its cause.** The two
  here were chosen so a failure would. Whoever runs the next one should decide,
  in advance, which subset to apply first.

## Why this cannot recur the same way

`pnpm test:integration` had no local-only guard, which is how a test suite
reached a production database at all. It has one now — the same parsed-host
check `db:setup` and `db:drift` refuse with, covering all four connection
variables and `PGHOSTADDR`. That is the commit this file arrived with.
