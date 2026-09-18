-- A write grant is a column list.
--
-- `grant insert on <table>` covers every column the table has AND every column
-- it ever gains. The grant is written once, sometimes years before the column,
-- and widens silently the day somebody adds one — and the column somebody adds
-- is exactly the kind that should not have been writable: a status, a
-- tombstone, a provenance timestamp.
--
-- Not hypothetical. `20260916002000` granted `select, insert` on `public.guests`
-- at table level. A later migration on another branch added `status` and
-- `merged_into_id` for a merge, and both became insertable by the runtime role
-- — which is the thing that branch's own rows forbid for UPDATE. A tombstone
-- written at INSERT time is just as much a tombstone.
--
-- `information_schema.column_privileges` cannot see this. It expands a
-- table-level grant into one row per column, so a table-level grant and an
-- exhaustive column list are byte-identical in it. Every audit run against this
-- schema used that view, which is how the shape survived six migrations.
--
-- THE RULE: a write privilege is granted BY COLUMN, never at table level, for
-- INSERT, UPDATE and DELETE. SELECT is unaffected — a read grant that widens
-- with a new column is a column the reader may see, and row-level security is
-- what bounds that. Columns are withheld by default and earn a place by being
-- written by a statement somebody can point at.
--
-- Every column granted below was read off the statement that writes it. Every
-- column withheld is nullable or has a default, so withholding breaks nothing
-- that exists — and `tests/database/insert_grants.test.sql` proves each refusal
-- individually rather than asserting the grants exist.
--
-- Design and decisions: docs/features/insert-grants/design.md, rows IG-01 to
-- IG-15. PostgreSQL cannot revoke one column out of a table-level grant, so
-- each table-level grant goes and a column list replaces it.
--
-- ON THE NUMBER. 002150 rather than 002200, because two branches in flight
-- already claim 002200 upward and a worktree isolates files and not the
-- migration number space. This sorts after main's last (002100) and before the
-- first of those, so it applies where it was written to apply whichever order
-- the branches land in.

-- ---------------------------------------------------------------------------
-- public.stays — the sharpest of the seven
-- ---------------------------------------------------------------------------

-- `user_id` is the nullable fact that gives somebody a Portal (ADR 0009). It is
-- read by `app.resident_stay_property_ids()` and
-- `app.resident_stay_accommodation_unit_ids()` to decide which Property and
-- which Unit a Resident reaches — and NOTHING under `packages/` writes it. So
-- before this migration the runtime role could insert a Stay naming any user
-- id, and that person gained a Resident's reach over that Property and that
-- Unit immediately, through policies working exactly as designed.
--
-- `status` IS granted: check-in writes it, and `stays_insert_front_desk`
-- already constrains it with `status <> 'in_house' or starts_on <= today`.
revoke insert on public.stays from ranza_app;
grant insert (organization_id, property_id, accommodation_unit_id,
              reservation_id, stay_type, status, starts_on, ends_on)
  on public.stays to ranza_app;

comment on column public.stays.user_id is
  'The Resident this Stay belongs to, and the whole of their reach (ADR 0009). '
  'Not writable by ranza_app on INSERT or UPDATE: nothing in the product sets '
  'it, and a Stay that could name any user would hand that user a Portal.';

-- ---------------------------------------------------------------------------
-- public.folio_lines — money, and it cannot be corrected
-- ---------------------------------------------------------------------------

-- `folio_lines_forbid_rewrite()` raises on UPDATE and DELETE, so whatever an
-- INSERT writes is permanent. A caller-chosen `posted_at` backdates a charge
-- into a period that has been reported on, and there is no correction path —
-- only a reversal, which carries its own date and does not move the original.
revoke insert on public.folio_lines from ranza_app;
grant insert (organization_id, property_id, folio_id, line_type, description,
              amount_minor, reverses_line_id)
  on public.folio_lines to ranza_app;

-- ---------------------------------------------------------------------------
-- public.folios
-- ---------------------------------------------------------------------------

-- A Folio inserted with `status = 'closed'` and `closed_at` set satisfies
-- `folios_closed_at_check` and has never been settled. Closing is a command
-- with its own policy and its own column grant; INSERT must not be a second way
-- to perform it.
revoke insert on public.folios from ranza_app;
grant insert (organization_id, property_id, stay_id, currency)
  on public.folios to ranza_app;

-- ---------------------------------------------------------------------------
-- public.reservations
-- ---------------------------------------------------------------------------

-- The rule applied rather than a hole repaired: `createReservation` writes
-- eight columns and this is those eight. What goes is the ability to restate
-- `created_at` — a Reservation that can look older than the one it
-- double-books is a Reservation arguing about who was first.
revoke insert on public.reservations from ranza_app;
grant insert (organization_id, property_id, accommodation_unit_id, guest_id,
              stay_type, status, starts_on, ends_on)
  on public.reservations to ranza_app;

-- ---------------------------------------------------------------------------
-- outbox.events
-- ---------------------------------------------------------------------------

-- Everything withheld is the worker's bookkeeping. An event born with
-- `published_at` set is never delivered; one born with `available_at` in the
-- future is a delivery silently deferred; `attempts`, `last_error` and
-- `dead_at` are the delivery record, and a publisher writing its own is a
-- publisher marking its own homework. `id` IS granted, because `publish.ts`
-- names it.
revoke insert on outbox.events from ranza_app;
grant insert (id, organization_id, event_type, payload)
  on outbox.events to ranza_app;

-- ---------------------------------------------------------------------------
-- public.users and public.auth_identities — ours, not Better Auth's
-- ---------------------------------------------------------------------------

-- These two are the only tables in the product written through Prisma's MODEL
-- API rather than raw SQL, and that is why their lists are wide: Prisma sends a
-- client-side value for every `@default` and `@updatedAt` column whether the
-- caller supplied one or not. `create({ data: { email } })` emits four columns.
-- Both lists were read from `log_statement` rather than reasoned about — two
-- reasoned attempts at `public.users` were wrong, and the database answered in
-- one run.
--
-- The Better Auth tables — `auth_user`, `auth_session`, `auth_account`,
-- `auth_verification`, `auth_two_factor`, `auth_rate_limit` — are deliberately
-- NOT touched (IG-08). Better Auth owns them and their columns; a list here is
-- a list this repository does not control, and the next upgrade that adds a
-- column would break sign-in in production. Role separation is already the
-- stated boundary there and nothing in them is tenant-owned.
--
-- These two are different. `public.users` is the list of people the application
-- treats as real, referenced by `organization_memberships`,
-- `property_assignments`, `auth_identities` and `stays.user_id`. And
-- `public.auth_identities` is created in `20260916000100` — Ranza's own
-- foundation migration, before the Better Auth tables exist in `…000200` — and
-- is ADR 0005's provider indirection. Both are ours.

revoke insert on public.users from ranza_auth;
grant insert (email, status, created_at, updated_at)
  on public.users to ranza_auth;

revoke insert on public.auth_identities from ranza_auth;
grant insert (user_id, issuer, subject, created_at)
  on public.auth_identities to ranza_auth;

-- ---------------------------------------------------------------------------
-- What is deliberately still wrong
-- ---------------------------------------------------------------------------

-- `public.guests` carries the same table-level INSERT and is NOT narrowed here.
-- It is IG-15: eight tables were not what was approved, and adding one quietly
-- is the decision this migration exists to stop. It was missed because the
-- survey that produced this slice ran against a branch where it had already
-- been fixed.
--
-- The instrument names it as a single dated exception and asserts the exception
-- set is exactly that one table, so a second one is a red test. When the branch
-- that narrows `guests` lands, that exception should be deleted.
