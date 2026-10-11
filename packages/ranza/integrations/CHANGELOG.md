# Changelog

All notable changes to `@ranza/integrations` will be documented in this file.

## Unreleased

- The first integration: an outbound webhook (ADR 0045). Endpoints, signed
  deliveries sent by the worker with a bounded retry schedule, failures shown with
  what the receiver answered, and Retry, Stop retrying and Mark resolved that
  record who and why. An address is refused at registration and again at
  connection time.
- Removed: the Property-scoped `integrations` table and `connectIntegration`,
  `recordFailure` and the old `retryOperation`, which marked a failure resolved
  without sending anything.

## 0.0.0

- Initial release: integrations catalogue, failed operations tracking, and operational retry.
