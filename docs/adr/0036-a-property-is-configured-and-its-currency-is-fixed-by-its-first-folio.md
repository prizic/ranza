# 0036. A Property is configured, and its currency is fixed by its first Folio

Date: 2026-09-25

Status: Accepted — applied in `20260916006000_a_property_is_configured`

Amends [ADR 0021](0021-a-business-date-is-the-day-a-property-is-working.md),
which said a cutoff was changed in SQL until a settings screen existed.

## Context

A Property's name, timezone, currency and business-day cutoff, and its
Organization's name, have existed as constrained columns since the first
migrations. Nothing but SQL could change them. The Configuration destination
(blueprint 5.1, `docs/features/configuration`) is the screen that does, and
writing `properties` and `organizations` from the application is a new write
path on the two tables every policy in the product reads.

Three questions had no answer yet:

- who may change a setting, and at which scope
- what a settings write may change, when a policy can only bound rows
- whether a currency is a setting at all, once money has been recorded in it

## Decision

### A new permission, and reach decides the scope

`configuration.manage`, Platform Core's, on the shipped Owner and Manager roles;
an Organization composes it into any other role (ADR 0026). The update policy on
`properties` is that permission and `app.can_use_capability(id, 'platform_core',
'configuration')` — the five gates of ADR 0012. The Organization's name governs
every Property, so its policy adds `app.has_organization_wide_reach()`, as the
housekeeping default does (HK-S3-05).

### A grant per column

`properties` grants `name, timezone, currency, business_date_cutoff`;
`organizations` grants `name`. Ownership, status and `default_locale` are not
settings. `default_locale` is stored and read by nothing, so it is not offered:
a control that changes nothing is not shown (CF-DEF-01).

`updated_at` is not granted. A trigger stamps it, strictly later than before
(`greatest(now(), old + 1µs)`), because it is also the version a form names.

### A save names the version it was read at

The update's `WHERE` carries `updated_at = <version>` and "something differs".
A stale form and a form that changes nothing both match no row, and the module
re-reads to tell refused, stale and unchanged apart — the policy refuses
quietly (ADR 0012). A concurrent save waits on the row lock and re-checks the
version against the row it waited for, so exactly one of two saves wins.

The version crosses the wire as ISO text to the microsecond, never as a
JavaScript `Date`: a `Date` keeps milliseconds, and a version that went through
one would never match again.

### A currency is fixed by the first Folio

Every Folio copies its Property's currency and its lines carry none of their
own (ADR 0015). Once a Folio exists, changing the Property's currency would
leave the Property trading in one currency with its money recorded in another.
Moving a trading Property to a new currency is a finance workflow, not a
setting. So a trigger refuses a currency change at a Property any Folio was
opened in (SQLSTATE 55000), with no reach gate, so it binds a privileged role
too.

A trigger on `properties` alone does not close the race with the first Folio.
Opening one reads the currency, and its foreign key takes only `KEY SHARE`,
which does not conflict with an update of a non-key column — a check-in and a
currency change could each commit. `app.folio_currency_is_its_propertys()`, a
`BEFORE INSERT` trigger on `folios`, takes the Property row `FOR SHARE`, which
does conflict. The two now serialise: a Folio first makes the currency change
see it and refuse; a currency change first makes the Folio see the new currency
and refuse. `tests/integration/configuration.test.ts` runs both orders on two
connections.

That trigger sits on a table `@ranza/folios` owns. It is here because the lock
means nothing without it, and it changes nothing a Folio may be: it refuses only
a Folio whose currency is not its Property's, which `openFolioWithin` never
writes.

### The preview asks the database

The form shows the business date a changed timezone or cutoff would make. It is
answered by `app.business_date()` — ADR 0021's only definition — through a
server action, not re-derived in the browser against a different copy of the
time zone database. A move backwards is said in words.

## What the breaks showed

Two breaks turned nothing red, and which reason binds is recorded rather than
left as "nothing to see":

- **Either `WITH CHECK` clause removed.** The key columns are not granted, so a
  row cannot be moved to where `WITH CHECK` alone would refuse it. The grant
  binds; the clause stays so that widening the grant later does not also widen
  what a row may become.
- **The currency lock made an invoker.** A Folio is read by reach, and
  configuring a Property needs reach, so nobody who may change a currency has a
  Folio hidden from them today. The definer is kept so that narrowing the Folio
  read policy later cannot quietly unfix a currency.

## Consequences

`ranza_app` can now update `properties` and `organizations`, within four and one
columns. Every date screen reads the timezone and cutoff through
`app.property_today()`, so a saved change moves them all at once — which is why
the save refreshes the whole workspace.

Changing the timezone or cutoff can move a Property's business date backwards.
What a closed business day refuses is close the day's to decide
([ADR 0034](0034-a-business-day-closes-after-its-cutoff.md)). Its guard on
`properties` takes the Property's advisory lock and raises `RZ001` when today
would become a closed day. The two features arrived on separate branches, and
meeting on `main` they needed three things, all made in the merge that brought
them together:

- `configureProperty` maps `RZ001` to a refusal of its own, worded on the
  cutoff field, rather than rethrowing it as a crash (CF-S1-21).
- `configureProperty` takes that advisory lock as its first statement.
  Check-in takes it shared and then this ADR's `FOR SHARE` on the Property row;
  an update locks its row before any trigger runs, so a save that reached the
  guard's exclusive lock second would hold the row a check-in was waiting for
  while waiting for the check-in. Taking the lock first puts the save in
  check-in's order (CF-S1-22). It is hashed from the id's canonical text, as the
  guard hashes `new.id::text`.
- The guard hands the new timezone to `app.business_date()` before the row's
  check constraints run, so an unknown zone raised inside it instead of being
  refused by `properties_timezone_check`. `20260916006100` has it step aside
  for a zone Postgres does not know (CF-S1-23).

`tests/database/configuration.test.sql` names every trigger on `properties`,
so a fourth arriving the same way fails a test rather than a deploy.
