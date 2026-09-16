# @ranza/platform-outbox

Kept because a module is the unit of extraction: when this one is published or
ported, this file is what a new consumer reads first (blueprint 9.10).

Versions begin at the first publication, not before — see
[ADR 0011](../../../docs/adr/0011-module-anatomy-is-earned.md). Until then
everything lands under Unreleased.

## Unreleased

### Fixed

- `outbox.deliveries` references `outbox.events (id, organization_id)` rather
  than `id` alone. A worker holding one Organization's context could record a
  delivery for another's event — and that consumer would then never run, because
  a delivery row already existed. The composite key is the pattern every
  Property-scoped table here already uses, and it makes the mismatch
  unrepresentable rather than unlikely.

### Added

- The `outbox` schema: `outbox.events`, written inside the transaction that
  produced the fact, and `outbox.deliveries`, whose primary key is what makes a
  redelivered event a no-op rather than a second side effect
  ([ADR 0017](../../../docs/adr/0017-cross-module-facts-travel-through-a-transactional-outbox.md)).
- `publishWithin(tx, event)`: the only way to publish, and it takes the caller's
  transaction rather than opening one. There is deliberately no `publish()`.
- `ranza_worker`, `app.set_worker_context()` and `app.worker_organization_id()`
  ([ADR 0018](../../../docs/adr/0018-the-worker-has-its-own-role-and-its-own-context.md)).
  The worker is granted no execute on `app.set_request_context()`, so it cannot
  impersonate a Staff Member; `ranza_app` is granted none on
  `app.set_worker_context()`, so a request cannot acquire worker reach.

### Fixed

- `app.set_request_context(uuid)` was executable by `PUBLIC`. PostgreSQL grants
  `EXECUTE` on a new function to `PUBLIC`, and `20260916000100` granted it to
  `ranza_app` on top of that default without revoking it — so the explicit grant
  was decorative and any role with `usage` on schema `app` could publish an
  acting user. Revoked, and `ranza_app` now holds it by its own grant. Found by
  asserting in pgTAP that the worker cannot call it and watching the assertion
  fail.

- `createOutboxDispatcher({ db })`: claim with a lease and `for update skip
locked`, one transaction per event, the delivery row written inside the
  handler's own transaction, and failure bookkeeping written outside it. One
  transaction per event because Prisma's interactive transactions have no
  savepoints, so a batch-wide rollback would undo the events that had already
  succeeded.
- An event nothing subscribes to is published immediately rather than claimed on
  every pass forever.
