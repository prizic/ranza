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
