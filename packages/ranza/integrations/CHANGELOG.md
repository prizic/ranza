# Changelog

All notable changes to `@ranza/integrations` will be documented in this file.

## Unreleased

- The first integration: an outbound webhook (ADR 0045). Endpoints, signed
  deliveries sent by the worker with a bounded retry schedule, failures shown with
  what the receiver answered, and Retry, Stop retrying and Mark resolved that
  record who and why. An address is refused at registration and again at
  connection time.
- A review of the first version found and fixed: what is sent is read from the
  row an event names and not from its payload (a mismatch is a failed delivery
  nobody can retry); the connection-time address guard is tested through an
  injected resolver, and `::/96` is blocked; an attempt is recorded by the lease
  it was given, so one that outlived its lease cannot write over its replacement;
  an endpoint has one delivery on the wire at a time; `attempt()` never throws;
  every command writes its own audit record and refuses a missing reason inside
  its function; failures from before deliveries existed can be closed; refusals
  are read from the SQLSTATE; a viewer reads an address without its query
  string; the endpoint cap is counted under a lock.
- Failures are listed a page at a time, the closed ones are a list of their own,
  Retry all sends every stopped delivery again, and an endpoint says how many
  deliveries have waited more than five minutes.
- Removed: the Property-scoped `integrations` table and `connectIntegration`,
  `recordFailure` and the old `retryOperation`, which marked a failure resolved
  without sending anything.

## 0.0.0

- Initial release: integrations catalogue, failed operations tracking, and operational retry.
