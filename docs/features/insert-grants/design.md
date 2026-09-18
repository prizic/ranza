# A write grant is a column list

Design only. **The seven column lists are approved; IG-13 and IG-14 are not, and are questions rather than changes.**

## The defect

`grant insert on public.<table> to ranza_app` covers every column the table has
**and every column it ever gains**. The grant is written once, years before the
column, and silently widens the day somebody adds one.

This is not hypothetical. `20260916002000` granted `select, insert` on
`public.guests` at table level. `20260916003100` added `status` and
`merged_into_id` for the merge, and both became insertable by the runtime role —
which is the thing `RG-S2-25` forbids, with `UPDATE` deliberately withheld and
`INSERT` wide open. A tombstone written at INSERT time is just as much a
tombstone. It was caught only because `RG-S1-21` asserts the grant column by
column and went red on the count.

`information_schema.column_privileges` cannot see this. It expands a table-level
grant into one row per column, so a table-level grant and an exhaustive column
list are byte-identical in that view. Every audit that has been run against this
schema used it, which is why the shape survived six migrations.

## The rule

**A write privilege is granted by column, never at table level.** `SELECT` is
unaffected: a read grant that widens with a new column is a column the reader
can see, which is what row-level security is for. `INSERT`, `UPDATE` and
`DELETE` name their columns.

Columns are withheld by default. A column earns its way onto a grant by being
written by a statement somebody can point at.

## The tables, and what each is for

Read from the code that writes them, not from what looks reasonable. Every
withheld column below is nullable or has a default, so withholding it breaks no
statement that exists.

Five are written by raw SQL and have narrow lists. Two — `public.users` and
`public.auth_identities` — are written through Prisma's model API and have wide
ones, for the reason the section after them gives.

### `public.stays` — the sharpest one

```sql
grant insert (organization_id, property_id, accommodation_unit_id,
              reservation_id, stay_type, status, starts_on, ends_on)
  on public.stays to ranza_app;
```

**Withheld: `id`, `user_id`, `created_at`, `updated_at`.**

`user_id` is the whole reason this table is first. It is the nullable fact that
gives somebody a Portal (ADR 0009), and it is read by
`app.resident_stay_property_ids()` and
`app.resident_stay_accommodation_unit_ids()` to decide which Property and which
Unit a Resident reaches. **Nothing in the product writes it** — `grep` finds no
INSERT or UPDATE naming it anywhere under `packages/`. So today the runtime role
can insert a Stay naming any user id, and that person gains a Resident's reach
over that Property and that Unit immediately, through policies that are working
exactly as designed.

`status` is granted because check-in writes it and `stays_insert_front_desk`
already constrains it — `status <> 'in_house' or starts_on <= property_today`.

### `public.folio_lines` — money, and it cannot be corrected

```sql
grant insert (organization_id, property_id, folio_id, line_type,
              description, amount_minor, reverses_line_id)
  on public.folio_lines to ranza_app;
```

**Withheld: `id`, `posted_at`.**

`folio_lines_forbid_rewrite()` raises on UPDATE and DELETE, so whatever INSERT
writes is permanent. A caller-chosen `posted_at` backdates a charge into a
period that has been reported on, and there is no correction path — only a
reversal, which carries its own date and does not move the original.

### `public.folios`

```sql
grant insert (organization_id, property_id, stay_id, currency)
  on public.folios to ranza_app;
```

**Withheld: `id`, `status`, `closed_at`, `created_at`, `updated_at`.**

A Folio inserted with `status = 'closed'` and `closed_at` set satisfies
`folios_closed_at_check` and has never been settled. Closing is a command with
its own policy and its own column grant; INSERT must not be a second way to
perform it.

### `public.reservations`

```sql
grant insert (organization_id, property_id, accommodation_unit_id,
              guest_id, stay_type, status, starts_on, ends_on)
  on public.reservations to ranza_app;
```

**Withheld: `id`, `created_at`, `updated_at`.**

The smallest correct list rather than a discovered hole. `status` is granted
because `createReservation` writes it, and a Reservation born `confirmed` is
exactly the case `reservations_no_double_booking` exists to refuse.

### `public.users` — ours, not Better Auth's

```sql
grant insert (email, status, created_at, updated_at)
  on public.users to ranza_auth;
```

**Withheld: `id`, and only `id`.**

Measured, not reasoned. `grant insert (email)` alone fails sign-up with 42501,
and so does `(id, email, created_at, updated_at)`. The statement Prisma actually
emits, captured from `log_statement`, is:

```sql
INSERT INTO "public"."users" ("email","status","created_at","updated_at")
VALUES ($1,$2,$3,$4) RETURNING "public"."users"."id"
```

With the four-column grant the auth-flow suite passes 7 of 7 and
`has_table_privilege('ranza_auth','public.users','INSERT')` goes false.

**Why this list is so much wider than the others, and it matters for reading
them.** `public.users` is the one table in this slice written through Prisma's
**model API** rather than raw SQL, and Prisma sends client-side values for every
`@default` and `@updatedAt` field. The five tables above are written by
`$queryRaw`, which names only the columns it names — which is why their lists are
genuinely narrow and this one is not. The narrowing here buys exactly one column
today. It still buys the thing the slice is for: the **next** column added to
`public.users` is not writable until somebody says so.

**Two write paths, and the grant binds one of them.**

1. `ranza_auth` at sign-up, through `linkRanzaUser()`. This is the one the grant
   binds.
2. `app.identify_staff_user()`, which arrives with `feat/staff-and-permissions`
   and is not on `main`. It is `SECURITY DEFINER`, so it runs as its owner and
   **this grant does not bind it at all**.

The second is not an argument against the first. It is the reason
`20260916002700` made that function check its own caller before either of its
side effects — returning whether an address is already known, and writing a row.
A definer that creates rows is a writer no column list can reach, and it carries
its own gate instead. When that branch lands, this row and that function are the
two places that decide who may put a person into `public.users`.

### `public.auth_identities` — the one the rule found

```sql
grant insert (user_id, issuer, subject, created_at)
  on public.auth_identities to ranza_auth;
```

**Withheld: `id`.** From `log_statement`, same as IG-10:
`INSERT INTO "public"."auth_identities" ("user_id","issuer","subject","created_at")`.

**Not part of what was approved.** `public.users` was agreed as the sixth table;
this is a seventh, and it exists because the model-API rule above was written
down and then applied. It belongs with `public.users` rather than with `auth_*`:
Better Auth does not own this table — ADR 0005 does. It is the provider-subject
mapping this repository keeps in one place so the provider stays replaceable,
and `20260916000200` grants it in the same statement as `public.users` for
exactly that reason. The argument that protects `auth_*` from a column list does
not reach it.

### `outbox.events`

```sql
grant insert (id, organization_id, event_type, payload)
  on outbox.events to ranza_app;
```

**Withheld: `occurred_at`, `available_at`, `claimed_until`, `attempts`,
`last_error`, `published_at`, `dead_at`.**

Everything withheld is the worker's bookkeeping. An event born with
`published_at` set is never delivered; one born with `available_at` in the
future is a delivery silently deferred; `attempts`, `last_error` and `dead_at`
are the delivery record, and a publisher writing its own is a publisher marking
its own homework. `id` **is** granted, because `publish.ts` names it.

## Where the next wide grant will be: the ORM writes more than you named

A column list is only as narrow as the statement it serves, and **how the
statement is written decides how narrow it can be.**

- **Raw SQL — `$queryRaw`, `$executeRaw` — names exactly the columns it names.**
  Nothing else reaches the INSERT, so the grant can be the same list, and
  withholding anything the statement does not mention costs nothing.
- **Prisma's model API — `tx.thing.create()` — sends a client-side value for
  every `@default` and `@updatedAt` column, whether or not the caller supplied
  one.** `create({ data: { email } })` on a model with `@default("active")`,
  `@default(now())` and `@updatedAt` emits four columns, not one. The grant has
  to allow all four or sign-up fails 42501.

So the rule predicts where a wide grant appears: **it appears wherever a table
is written through the model API**, and nowhere else. That is checkable rather
than a feeling —

```sh
grep -rnoE '(tx|prisma|db|deps\.db)\.[a-zA-Z]+\.(create|createMany|upsert)\(' \
  packages/*/src packages/*/*/src apps/*/src
```

On `main` today that returns exactly two hits, both inside `linkRanzaUser()`:
`user.create` and `authIdentity.create`. Which is why `public.users` (IG-10)
has a four-column list where the five raw-SQL tables have narrow ones — and why
`public.auth_identities` is IG-11, a table the rule found that nobody had
listed. The other five are all `$queryRaw`.

Two consequences worth stating, because they are what the rule is for:

- **A new `@default` column on a model-API table silently widens its statement.**
  The grant will not widen with it — that is the whole point — so the write
  starts failing 42501 instead of quietly writing a column nobody granted. That
  is the correct direction to fail in, and it is why the list is worth having
  even where it withholds only `id`.
- **Do not reason about what the ORM sends. Ask.** `alter system set
log_statement='all'`, run the one test, read the statement, reset it. Two
  reasoned guesses at `public.users` were both wrong (IG-10 records which), and
  the database answered in one run.

## The instrument

The rule holds because a test says so, not because the next person remembers.

```sql
-- No table-level write grant, anywhere the runtime role can reach.
--
-- Read from pg_class.relacl through aclexplode(), and NOT from
-- information_schema.column_privileges. That view expands a table-level grant
-- into one row per column, so `grant insert on t` and
-- `grant insert (every, column) on t` are indistinguishable in it — which is
-- exactly the distinction this test exists to make, and why every earlier audit
-- of this schema missed the defect. relacl carries the table-level grant;
-- pg_attribute.attacl carries the column-level ones; only the first is wrong.
--
-- SELECT is deliberately not checked. A read grant that widens with a new
-- column is a column the reader may see, and row-level security is what bounds
-- that. Only writes name their columns.
select is_empty(
  $$select n.nspname || '.' || c.relname || ' ' || a.privilege_type
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) as a
     where c.relkind = 'r'
       and n.nspname in ('public', 'outbox')
       and a.grantee = 'ranza_app'::regrole
       and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'ranza_app holds no table-level write grant: a write names its columns');
```

Run as the owner. `aclexplode` on `relacl` needs no privilege, but reading
`pg_class` for tables the role cannot see would narrow the sweep silently —
which is the same failure mode `RG-S2-32`'s coverage assertion had when it was
run as `ranza_app` and quietly returned nothing.

Its output against a database carrying the current schema, today:

```
outbox.events       | INSERT
public.folio_lines  | INSERT
public.folios       | INSERT
public.guest_emails | INSERT      <- feat/guest-profile, fixed there
public.reservations | INSERT
public.stays        | INSERT
```

`public.guests` is absent because it was corrected in `20260916003100`. That is
the only evidence that the column-list form is what this check wants.

**The test file is not in this branch.** It is red until the migration lands,
and a red test on a branch is not a design document. It arrives in the same
commit as the grants.

## The second instrument: a definer that writes must check its caller

A `SECURITY DEFINER` function runs as its owner. The policies it would have
obeyed do not apply to it, so whatever gate those policies carried, the function
carries itself or it carries nothing. That is ADR 0027's shape and
`app.guest_stay_summary()` already follows it.

Two functions in flight create rows and both carry their own gate —
`app.identify_staff_user()` on `feat/staff-and-permissions`, after
`20260916002700` found it creating `public.users` rows for any caller, and
`app.merge_guests()` on `feat/guest-profile`. Both got there by somebody
noticing. That is the thing worth failing a build over.

**The rule is in two parts, because one blanket rule would be false.**

### Part A — a definer whose body writes must mention a gate

```sql
select is_empty(
  $$select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.prosecdef
       and p.prosrc ~* '(insert|update|delete)\s'
       and p.prosrc !~* '(current_user_id|accessible_|can_use_capability|has_organization_permission)'$$,
  'every security definer function in app that writes also checks its caller');
```

**Today this passes with nothing to check, and the test has to say so.** There
are 11 definer functions in `app` on `main` and **none of them writes** — the
two that do are on branches that have not merged. A coverage assertion that
quietly matches nothing is the failure `RG-S2-32` had, so the assertion above
travels with a second one that pins the inventory it swept:

```sql
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef),
  11,
  'the definer sweep looked at 11 functions; change this number deliberately');
```

That number is expected to move when `feat/staff-and-permissions` and
`feat/guest-profile` land, and moving it is how somebody notices that Part A has
stopped being vacuous.

### Part B — a definer that does not write is named, with a reason

Part A says nothing about the other eleven, and "every definer checks its
caller" would be simply untrue of them: six **are** the check, and five answer a
question rather than act on one. So they are listed, and a twelfth is a red test
and a one-line decision.

| Function                                 | Why it carries no caller check                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessible_organization_ids()`          | It **is** the check. Resolves through `app.current_user_id()`; requiring it to check a caller is circular.                                                                               |
| `accessible_property_ids()`              | The same, for Properties.                                                                                                                                                                |
| `resident_stay_property_ids()`           | The same, for a Resident's own reach (ADR 0009).                                                                                                                                         |
| `resident_stay_accommodation_unit_ids()` | The same, for a Resident's Unit.                                                                                                                                                         |
| `can_use_capability()`                   | Gates 1–4 for a Property. The thing policies consult.                                                                                                                                    |
| `can_use_capability_in_organization()`   | Gates 1–4 for an Organization-scoped row.                                                                                                                                                |
| `capability_is_available()`              | Gates 1–3 without reach — a question about a **Property**, not about the caller, and `can_use_capability()` is what adds the caller to it.                                               |
| `resident_can_use_capability()`          | The same composition for a Resident.                                                                                                                                                     |
| `property_today()`                       | Returns a date. Definer because `properties.timezone` may be out of reach. It does confirm a Property id exists, which is a caller's own id, and that is the whole of what it discloses. |
| `unit_has_no_current_occupant()`         | A trigger body. It has no caller to check: it runs inside a write the policy already admitted, and cannot be invoked as a step.                                                          |
| `unit_is_sellable()`                     | The same.                                                                                                                                                                                |

Two of these are worth a second look whenever somebody is in here, and they are
**IG-13** and **IG-14** rather than sentences in this table — a caveat inside a
list of eleven is a caveat nobody reads. `property_today()` is the only definer
that takes an id and answers about a row the caller may not reach;
`capability_is_available()` is the only gate component exposed without its reach
half, one word away from the complete one. Neither is a finding today. Both are
the sort of thing that becomes one.

## `ranza_auth` and the `auth_*` tables — settled, and nothing changes

`ranza_auth` holds table-level `INSERT` **and `UPDATE`** on `auth_user`,
`auth_session`, `auth_account`, `auth_verification`, `auth_two_factor` and
`auth_rate_limit`, plus table-level `INSERT` on `public.users` and
`auth_identities`.

The case that it is the intended boundary:

- Better Auth owns those tables and their columns. It writes whatever its schema
  says, and a column list here is a list this repository does not control — the
  next `better-auth` upgrade adds a column and authentication stops working, in
  production, at sign-in.
- `AGENTS.md` is explicit that row-level security is deliberately **not** used
  there, because authentication happens before any identity is known, and that
  **role grants are the boundary**. The boundary is `ranza_auth` being a separate
  role that `ranza_app` is granted nothing of — not which columns it may write.
- Nothing in those tables is tenant-owned, so a widened column carries no other
  Organization's data.

The case that it is the same defect:

- `public.users` is not a Better Auth table. It is the list of people the
  application treats as real, it is referenced by `organization_memberships`,
  `property_assignments`, `auth_identities` and `stays.user_id`, and `ranza_auth`
  holding table-level INSERT on it means a column added there is writable by the
  credential role without anybody deciding so. It is separated out as IG-10.

**Settled: leave `auth_*` alone, for the reasons above.** `public.users` is the
exception and is the sixth table of this slice — it has its own section and its
own row (IG-10), because it is ours rather than Better Auth's.

## What this slice does not touch

`public.guest_emails` carries the same defect and is **not** on `main`; it
arrived with `feat/guest-profile`. It is fixed on that branch, with the same
column list and a comment citing this slice, because a migration for a table
that does not exist on `main` cannot live here.
