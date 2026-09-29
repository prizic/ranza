# Decision sheet — access lane: sabotage record

Every boundary test this lane added or changed was seen red with the thing it
guards broken (AGENTS.md, "Testing security claims"). Each database sabotage ran
in the same transaction as its suite — sabotage, then a `select` printing the
altered object, then the suite, whose own `rollback` undoes both — against the
lane database on port 54494. Application sabotages edited the source, printed
the altered line, ran the suite and restored the file.

The printed object is quoted as it came back, so that a sabotage which silently
failed to apply cannot be mistaken for one that applied.

## OA-S1-14 — which Subscription statuses admit

Suite: `tests/database/organization_property_foundation.test.sql`, 35 assertions,
all green unsabotaged.

| sabotage                                    | printed                                                     | red                                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gate 1 back to the old list                 | `status in ('trialing', 'active')`                          | 19 `gate 1 admits a past_due Subscription: it is the grace period`; 20 `and so does the three-gate helper the worker's writers call`                                                                        |
| gate 1 admits `suspended` too               | `status in ('trialing', 'active', 'past_due', 'suspended')` | 16 `gate 1 denies when the Subscription is suspended`; 21 `gate 1 denies a suspended Subscription: the grace period is over`; 34 `when B's Subscription lapses, B's Property drops out of capability reads` |
| gate 1 without `trialing`, with `cancelled` | `status in ('active', 'past_due', 'cancelled')`             | 17 `gate 1 admits a trialing Subscription`; 22 `gate 1 denies a cancelled Subscription`                                                                                                                     |

The fixtures that meant "lapsed" were `past_due` in six pgTAP suites and one
integration suite; they are `suspended` now. Leaving one at `past_due` is itself
a sabotage of the new rule: `housekeeping.test.sql` with its old fixture goes red
on 24 `HK-S1-09: a departure at a lapsed Subscription marks nothing` (have
true, want false) and 46 `HK-S2-08: a lapsed Subscription cannot mark its own
rooms`.

The Owner's billing notice, `tests/integration/billing-notice.test.ts`, 4 tests:

| sabotage (packages/ranza/core/src/module.ts) | printed                                                               | red                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| a manager counts as an Owner                 | `243: and membership.role in ('owner', 'manager')`                    | `is not shown to a manager of the overdue Organization`                                                                                     |
| any status counts as past due                | `244: and subscription.status in ('past_due', 'active', 'suspended')` | `names the overdue Organization to its Owner, and not the paid one`; `ends with the grace period: a suspended Subscription is not past due` |

## OA-S1-16 — an archived Property

Same suite. The Property, its booking and its Stay are asserted in reach while
it is active, and a booking is taken there, before it is archived — without that
control the refusals would pass on fixtures nobody reaches.

| sabotage                                                   | printed                                     | red                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.accessible_property_ids()` admits archived Properties | `property.status in ('active', 'archived')` | 25 `an archived Property is out of an organization_wide Owner's reach`; 26 `and so are its bookings`; 27 `and its Stays`; 28 `the Owner cannot take a booking at an archived Property`; 29 `nor change a Stay there`; 30 `and no capability is available there` |

The first version of assertion 29 ran the update inside `results_eq`. Under this
sabotage the update became visible and its `WITH CHECK` raised 42501, which
aborted the transaction and silenced every assertion after it — fewer failures
than exist. It now runs in a `pg_temp` function that returns a refusal as -1,
and the sabotage run above is from after that change: six red, nothing aborted.

## OA-S1-19 — a Staff Member of two Organizations

Same suite.

| sabotage                                                                       | printed                                                                      | red                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| gate 1 asks about any of the caller's Organizations rather than the Property's | `subscription.organization_id in (select app.accessible_organization_ids())` | 34 `when B's Subscription lapses, B's Property drops out of capability reads` |

## SP-S1-33 — an expired invitation is no answer to a stranger

Suite: `tests/database/staff_and_permissions.test.sql`, 100 assertions, all
green unsabotaged. Both new assertions ask through `pg_temp.acceptance_answer()`,
which returns `'no row'`, `'a row'` or the SQLSTATE raised — a refusing guard
fails one assertion rather than aborting the suite.

| sabotage                                                                    | printed                                                    | red                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `app.accept_staff_invitation()` recreated exactly as 20260916002800 left it | `guard: invitation.status = 'pending';` (no expiry clause) | 92 `and so does an expired invitation, rather than a refusal` |

## IG-07, OA-S1-07, IG-12, IG-14 — the catalogue sweeps

Suite: `tests/database/insert_grants.test.sql`, 37 assertions, all green
unsabotaged. `platform_outbox.test.sql` (35) and the outbox and housekeeping
integration suites (40) stay green with the worker's delivery grant narrowed.

| row      | sabotage                                                                                             | printed                                                                                                       | red                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IG-07    | the worker's table-level insert restored: `grant insert on outbox.deliveries to ranza_worker`        | `relacl: {ranza=arwdDxtm/ranza,ranza_worker=ar/ranza}`                                                        | 1 `ranza_app holds no table-level write grant in any schema, nor does ranza_worker or PUBLIC`; 14 `outbox.deliveries: the three the dispatcher names`; 31 `and cannot say when the delivery happened` |
| IG-07    | a table-level write in the schema the old sweep missed: `grant insert on audit.records to ranza_app` | `relacl: {ranza=arwdDxtm/ranza,ranza_app=ar/ranza}`                                                           | 1 (the old `public`/`outbox` sweep reads this grant as nothing)                                                                                                                                       |
| OA-S1-07 | `grant select on public.reservations to ranza_auth`                                                  | `relacl: {ranza=arwdDxtm/ranza,ranza_app=r/ranza,ranza_auth=r/ranza}`                                         | 4 `ranza_auth holds no privilege on any relation but users, auth_identities and Better Auth's tables`                                                                                                 |
| OA-S1-07 | column-level: `grant select (name) on public.properties to ranza_auth`                               | `attacl: {ranza_app=w/ranza,ranza_auth=r/ranza}`                                                              | 4                                                                                                                                                                                                     |
| IG-14    | a stray caller, `app.stray_capability_probe(uuid)`                                                   | `select app.capability_is_available(target, 'front_office', 'front_desk');`                                   | 37 `app.capability_is_available() is called by exactly the functions that mean gates 1-3`                                                                                                             |
| IG-14    | a function that only mentions it in a comment, `app.comment_only_probe()`                            | `-- deliberately not app.capability_is_available(x, y, z): a comment, not a call / select true;`              | none — correctly: a comment is not a caller                                                                                                                                                           |
| IG-12    | a definer that writes and whose only "check" is a comment, `app.unchecked_writer_probe(uuid)`        | `-- asks app.current_user_id() about nothing … / update public.properties set name = name where id = target;` | 33 `every security definer function in app that writes also checks its caller` (and 34-36, the pinned inventory, as they should)                                                                      |
| IG-12    | a body holding `--` inside a string, `app.literal_probe()`                                           | `select 'a -- b';`                                                                                            | 32 `no function body holds "--" inside a string, so stripping comments hides no code`                                                                                                                 |

The IG-12 sabotage is the reason comments are stripped. Before this change,
`current_user_id` in a comment satisfied Part A, and nine definers carry
comments today — two of which match the write pattern (`identify_staff_user`'s
"the membership INSERT would apply", `amend_reservation`'s "UPDATE OF"). With
comments stripped the writer count is unchanged, so no existing definer was
passing on a comment.

## OA-S4-06 — a Stay nobody has signed in to

Suite: `tests/database/resident_access_path.test.sql`, 31 assertions, all green
unsabotaged. The manager sees the null-user Stay and its Unit — the control that
proves the fixture exists and is readable by somebody.

| sabotage                                        | printed                                                                                                                                  | red                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| the Resident policy matches null to null        | `stays_read_own: (NOT (user_id IS DISTINCT FROM app.current_user_id()))`                                                                 | 1 `without request context no Stay is visible`; 21 `a request with no acting user reads no Stay that has no user`        |
| the Resident Unit helper matches null to null   | `stay.user_id is not distinct from app.current_user_id()`                                                                                | 2 `without request context no Accommodation Unit is visible`; 22 `nor that Stay's Accommodation Unit`                    |
| both admit a null-user Stay to anyone signed in | `((user_id = app.current_user_id()) OR ((user_id IS NULL) AND (app.current_user_id() IS NOT NULL)))`, and the same `where` in the helper | 14 `a Stay nobody has signed in to is not a signed-in Resident's`; 15 `nor is its Accommodation Unit` (and 3, 7, 23, 25) |

## OA-S1-05 — the request hosts refuse a privileged connection

`tests/integration/request-host-startup.test.ts` (12, six per host) and
`tests/integration/worker-startup.test.ts` (6), all green unsabotaged. The owner
"whatever its URL" is the owner reached through `127.0.0.1` instead of
`localhost`: the equality refusal cannot see it.

| sabotage                                                 | printed                                   | red                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the Workspace's `verifyConnections` skips the role check | `73: void assertUnprivileged;`            | Workspace: `refuses a tenant connection whose role owns the tables, whatever its URL`; `and a credential connection whose role does`; `stops the process with the refusal, rather than serving on`                                                                                                                      |
| the Portal's, the same                                   | `72: void assertUnprivileged;`            | the same three, for the Portal                                                                                                                                                                                                                                                                                          |
| the Workspace refuses no URL by name                     | `52: if (false as boolean) {`             | `refuses DATABASE_URL set to the migration connection, by name`; `refuses AUTH_DATABASE_URL set to the migration connection, by name`                                                                                                                                                                                   |
| `@ranza/db`'s `assertUnprivileged` blind to ownership    | `61- false` in place of `role.ownsTables` | both hosts: `refuses a tenant connection whose role owns the tables…`; `and a credential connection whose role does`. The worker's own two tests stay green under this one, because the local owner is also a superuser and the worker's assertion matches `/row-level/` only; the host tests name the ownership fault. |

Seen outside the tests too, against the lane database with production builds:

- `next build` of each app with `DATABASE_URL`, `AUTH_DATABASE_URL`,
  `DIRECT_URL` and `WORKER_DATABASE_URL` unset, and no app-level `.env`: both
  succeed, and each emits `.next/server/instrumentation.js` — Next resolves
  `src/instrumentation.ts` for both apps.
- `next start` and the standalone `server.js` of the Workspace, and the
  standalone `server.js` of the Portal: with `DATABASE_URL=$DIRECT_URL` each
  printed `The Workspace will not start. DATABASE_URL must not be the migration
connection…` (the Portal's the same) and exited 1; with `AUTH_DATABASE_URL`
  set to the owner through `127.0.0.1` each printed `… AUTH_DATABASE_URL connects
as a role that is a superuser, has BYPASSRLS, owns tenant tables…` and exited
  1; with the lane's own URLs each answered `/en/sign-in` with 200.

## OA-S2-02 — two first sign-ins of one subject at once

`tests/integration/auth-flow.test.ts`, 8 tests. The new one races eight pairs
of `linkRanzaUser` calls at once, each pair on a fresh subject; one pair raced
alone and in sequence never reproduced it.

- **Before the fix** the race was red: the loser surfaced as
  `PrismaClientKnownRequestError` `P2002`, from Postgres 23505 on
  `users_email_lower_idx`, thrown out of `tx.user.create`. The re-check inside
  the transaction had read no identity, as the check before it had.
- **After** it is green three runs in a row on the same database.

| sabotage (packages/auth/src/module.ts) | printed                                                     | red                                                                 |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| the catch rethrows every error         | `110: if (isUniqueViolation(error) \|\| true) throw error;` | `gives two concurrent first sign-ins of one subject one Ranza user` |

## OA-S2-14 — one enrolment, both applications

`tests/integration/two-factor.test.ts`, 14 tests. Enrolment goes through one
`createAuthModule` instance, as the Workspace composes it, and the new test
signs in through a second over its own client, as the Portal does.

| sabotage (packages/auth/src/module.ts)                          | printed                                                      | red                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| only the first module composed carries the second-factor plugin | `44: plugins: instancesComposed++ === 0 ? [` … `57: ] : [],` | `challenges in the Portal too: one enrolment, both applications` — and nothing else |

A blunter sabotage, no plugin in any instance, turned ten of the fourteen red,
enrolment included, which says nothing about the second application; the one
above is the one that isolates it. The row is true by construction — both hosts
call the same module over the same tables — so a sabotage can only remove the
challenge from one of them.

## OA-S3-05, OA-S3-07 — the remembered Property and what the switcher lists

`tests/unit/property-choice.test.ts` (16), `tests/unit/front-desk-property.test.ts`
(9) and `tests/unit/property-switcher.test.tsx` (12), all green unsabotaged.
These are interface rows; the parent's browser run (G4) exercises the shell.

| sabotage                                                               | printed                                                         | red                                                                                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chooseProperty` ignores the remembered Property                       | `44: properties.find(() => false) ??`                           | `opens on the Property remembered on this device when the URL names none` (resolver and pure)                                                                              |
| the remembered Property wins over `?property=`                         | `40: if (requested && !remembered) {`                           | `lets ?property= win over the remembered one`; `lets ?property= win over the remembered choice`; `shows nothing for a ?property= it does not list, whatever is remembered` |
| switching always leaves the page                                       | `105: if (false && current) return current;`                    | `keeps the page being viewed when it is open at the chosen Property` (pure and switcher)                                                                                   |
| the switcher does not write the cookie                                 | `127: onClick={() => void rememberProperty}`                    | `remembers the choice on this device`                                                                                                                                      |
| the switcher lists only the first destination's (Today's) Properties   | `75: for (const destination of destinations.slice(0, 1)) {`     | `lists the union of every destination's Properties, each once, with what is open there`                                                                                    |
| the shell's default resolves against the union, not Today's list first | `67: return chooseProperty(switchable, undefined, remembered);` | `names Today's first, as a bare Today does, when Today is off at the remembered one`                                                                                       |

The last one is the reason `workingProperty` exists. Resolved against the union,
a Staff Member who last chose a Property where Today is off would sign in to a
bare Today showing another Property's day under a switcher naming the remembered
one — HK-S1-24 on the landing page.

## OA-S2-15 — where a second factor is set up

`tests/unit/security-placement.test.ts`, 3 tests, all green unsabotaged.

| sabotage                                                  | printed                                                  | red                                         |
| --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| the account menu's item links to Today instead            | `144: href={localizeHref(locale, "today")}`              | `security is reached from the account menu` |
| a rail destination named `security` is added to `SCREENS` | `82: { segment: "security", capability: "security", … }` | `and is not a rail destination`             |

## After the rebase onto `decisions/sheet`, and the review's findings

Every database sabotage above was re-run on the merged catalogue (51 definers,
13 writers, the same nine callers of `capability_is_available`; 009510's
`reservations_keep_closed_days()` is an invoker) with the same counts. The
review then found five gaps, each closed and seen red:

| finding                                                                            | sabotage                                          | printed                                                                              | red                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| the People page read the first Property's Organization whatever the switcher named | `const home = properties[0];` restored            | `65: const home = properties[0]; …`                                                  | `people-page.test.tsx`: `reads the roster of the Organization whose Property the URL names`; `reads no roster for a Property it does not list` |
| the billing notice took an authored role keyed `owner` for the shipped one         | the `role_scope_id` clause removed                | `249- and subscription.status = 'past_due'` follows the role line directly           | `billing-notice.test.ts`: `is not shown to a role the Organization authored and called Owner`                                                  |
| the write sweep ignored PUBLIC                                                     | `grant insert on public.guests to public`         | `relacl: {ranza=arwdDxtm/ranza,ranza_app=r/ranza,=a/ranza}`                          | 1 `ranza_app holds no table-level write grant in any schema, nor does ranza_worker or PUBLIC` (and 23-25, the guests refusals)                 |
| a block comment could stand in for a check                                         | `app.block_comment_probe()`                       | `begin /* current_user_id() */ return true; end`                                     | 32 `no function body holds "--" inside a string, a block comment, or a nested dollar quote…`                                                   |
| a nested dollar quote hid its text from the quote test                             | `app.dollar_probe()`                              | `begin execute $inner$ select 1 $inner$; end`                                        | 32                                                                                                                                             |
| a policy could call the three-gate helper unseen                                   | policy `stray_three_gate_probe` on `public.stays` | `app.capability_is_available(property_id, 'front_office'::text, 'front_desk'::text)` | 38 `and no policy or view calls it`                                                                                                            |

The null-user Stay fixture now dates itself from the Property's own today; its
sabotage (`stays_read_own` matching null to null) is still red on 1 and 21.

`rooms.test.ts`, merged from the rooms lane, shared its Organization and user
ids with housekeeping and room-calendar and left its Properties behind. On a
second `test:integration` run the worker's closer closed days at them and the
other suites' clean-up failed on the closes (23503) — on `decisions/sheet` too,
before this lane. With its own ids and a clean-up of its Organization, the full
suite is green twice in a row on one database.
