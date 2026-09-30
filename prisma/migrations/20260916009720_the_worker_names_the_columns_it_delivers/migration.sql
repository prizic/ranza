-- The worker names the columns it delivers (IG-07).
--
-- 20260916001400 granted ranza_worker INSERT on outbox.deliveries at table
-- level: every column the table has, and every column it ever gains. The
-- dispatcher writes three — packages/platform/outbox/src/dispatch.ts inserts
-- (consumer, event_id, organization_id) — and delivered_at is the table's own
-- record of when that happened, which a caller-chosen value would falsify.
--
-- The widened sweep in tests/database/insert_grants.test.sql now reads every
-- non-system schema for ranza_worker as well as ranza_app, and this is the one
-- table-level write it found. SELECT is untouched: the dispatcher's
-- ON CONFLICT (consumer, event_id) and RETURNING read those columns.
revoke insert on outbox.deliveries from ranza_worker;
grant insert (consumer, event_id, organization_id) on outbox.deliveries to ranza_worker;
