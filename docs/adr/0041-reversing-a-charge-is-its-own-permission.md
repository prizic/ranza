# 0041. Reversing a charge is its own permission

Date: 2026-09-29

Status: Accepted — applied in
`20260916009600_reversing_a_charge_is_its_own_permission`

Builds on [ADR 0015](0015-money-is-an-integer-a-balance-is-a-sum-and-a-correction-is-a-line.md),
[ADR 0012](0012-a-write-is-bounded-by-a-policy-not-a-check.md) and
[ADR 0026](0026-a-role-is-a-named-set-of-permissions-and-reach-is-taken-away-for-free.md).

## Context

A correction to a Folio is a reversal line that cancels a charge exactly
(ADR 0015). Until now `folio_lines_insert_finance` asked
`finance.post_charge` for every line, so whoever could put a charge on a Folio
could also take one off.

Voiding a charge is the classic fraud and error vector in hotel billing, and
every mainstream PMS separates posting from adjusting or voiding. Room nights
([ADR 0038](0038-a-night-is-priced-by-its-unit-type-and-fixed-when-booked.md))
put a charge on every in-house Folio every night, so reversals became routine,
and the question of who may make them arose with them. Organizations compose
their own roles (ADR 0026), so a separate permission costs nothing to an
Organization that does not want the split and is the only way to have it for
one that does (FO-S4-10).

## Decision

**A reversal line asks `finance.reverse_charge`; a charge still asks
`finance.post_charge`.** One insert policy chooses by the line's own type,
behind the same four gates `app.can_use_capability()` carries. It is one policy
with a `case` rather than a second policy beside the first, because permissive
policies are OR-ed: a reversal policy added next to the charge policy would let
a `post_charge` holder through the charge policy with a reversal line.

**The shipped Owner, Manager and Finance roles hold it.** Front desk and
Housekeeping do not, as they do not hold `post_charge`.

**Every role that could reverse keeps reversing.** The migration appends
`finance.reverse_charge` to every role holding `finance.post_charge`, shipped or
written by an Organization. A custom "Night auditor" would otherwise lose the
ability silently on deploy, and because an administrator may grant only what
they hold themselves (20260916007000), nobody below the Owner could give it
back. An Organization that wants somebody who posts and does not reverse takes
the permission off afterwards; making that possible is the point of the split.
The migration asserts afterwards that no role holds `post_charge` without
`reverse_charge`.

**The Finance screen offers Reverse only to a viewer holding the permission at
the Folio's Property.** That hides a button the policy would refuse; it decides
nothing. The key is exported as `REVERSE_CHARGE_PERMISSION` from
`@ranza/folios`, so the screen asks the same key the policy names.

## Consequences

- A role holding only `post_charge` posts and cannot reverse; one holding only
  `reverse_charge` reverses and cannot post
  (`tests/database/reversing_a_charge.test.sql`).
- Nothing already deployed loses an ability: on hosted staging only the three
  shipped roles held `post_charge` (preflight, 2026-09-29), and the data
  migration covers any custom role anyway.
- Room nights are posted as charges, so the worker's posting is unaffected.
  Reversing a room night is a reversal like any other and asks the new
  permission.
- The permission catalogue in `features/staff/labels.ts` and its TR, EN and AR
  labels gain the key, so the People screen can offer it.
