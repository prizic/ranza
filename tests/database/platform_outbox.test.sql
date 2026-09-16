-- The queue, and the role that drains it.
--
-- Two claims are under test and they pull in opposite directions. A request may
-- publish into its own Organization and may not read the queue at all; the
-- worker may read the queue across every Organization and may touch nothing else
-- in the database. The second is the single documented exception to "every
-- tenant query goes through a context" (ADR 0018), so it is the one that has to
-- be shown to be narrow rather than asserted to be.
--
-- Every assertion here was checked by breaking the thing it asserts — restoring
-- the execute grant on app.set_worker_context, widening a column grant to the
-- whole table, granting ranza_worker select on public.organizations, dropping
-- the deliveries policies — and confirming it went red.
begin;
select plan(34);

insert into public.users (id, email) values
  ('51111111-1111-4111-8111-111111111111', 'outbox-a@example.test'),
  ('52222222-2222-4222-8222-222222222222', 'outbox-b@example.test');

insert into public.organizations (id, name, status) values
  ('5a111111-1111-4111-8111-111111111111', 'Outbox Organization A', 'active'),
  ('5b111111-1111-4111-8111-111111111111', 'Outbox Organization B', 'active');

insert into public.organization_memberships
  (organization_id, user_id, role, access_scope) values
  ('5a111111-1111-4111-8111-111111111111',
   '51111111-1111-4111-8111-111111111111', 'manager', 'organization_wide');
-- The Staff Member of B deliberately gets no membership anywhere: they exist so
-- that "reaches nothing" is a statement about policies and not about an empty
-- table.

insert into outbox.events (id, organization_id, event_type, payload) values
  ('5e111111-1111-4111-8111-111111111111',
   '5a111111-1111-4111-8111-111111111111', 'stay.checked_in',
   '{"stayId": "5f111111-1111-4111-8111-111111111111"}'),
  ('5e222222-2222-4222-8222-222222222222',
   '5b111111-1111-4111-8111-111111111111', 'stay.checked_out',
   '{"stayId": "5f222222-2222-4222-8222-222222222222"}');

-- ---------------------------------------------------------------------------
-- What the queue will and will not hold
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into outbox.events (organization_id, event_type)
    values ('5a111111-1111-4111-8111-111111111111', 'CheckedIn')$$,
  '23514', NULL,
  'an event type is dotted and lower case, so the vocabulary stays queryable');

select throws_ok(
  $$insert into outbox.events (organization_id, event_type)
    values ('5a111111-1111-4111-8111-111111111111', 'stay')$$,
  '23514', NULL,
  'and has at least two parts, so it names a subject as well as a verb');

select throws_ok(
  $$update outbox.events
       set published_at = now(), dead_at = now()
     where id = '5e111111-1111-4111-8111-111111111111'$$,
  '23514', NULL,
  'an event is delivered or dead, never both');

-- ---------------------------------------------------------------------------
-- A request publishes, and cannot read what it published
-- ---------------------------------------------------------------------------

set local role ranza_app;

select throws_ok(
  $$insert into outbox.events (organization_id, event_type)
    values ('5a111111-1111-4111-8111-111111111111', 'stay.checked_in')$$,
  '42501', NULL,
  'without request context nothing may be published: a null acting user denies rather than widens');

select app.set_request_context('51111111-1111-4111-8111-111111111111');

select lives_ok(
  $$insert into outbox.events (organization_id, event_type, payload)
    values ('5a111111-1111-4111-8111-111111111111', 'stay.checked_in',
            '{"stayId": "5f333333-3333-4333-8333-333333333333"}')$$,
  'a Staff Member publishes into an Organization they reach');

select throws_ok(
  $$insert into outbox.events (organization_id, event_type)
    values ('5b111111-1111-4111-8111-111111111111', 'stay.checked_in')$$,
  '42501', NULL,
  'and not into one they do not');

-- The interesting half. The publisher cannot read the queue, so the one
-- cross-Organization read in this schema exists in the worker and nowhere else.
-- No select grant and no select policy: either alone would be enough, and both
-- are here because this is the boundary the exception rests on.
select throws_ok(
  $$select id from outbox.events$$,
  '42501', NULL,
  'a Staff Member cannot read the queue at all, not even their own events');

select throws_ok(
  $$update outbox.events set available_at = now()$$,
  '42501', NULL,
  'nor reschedule one');

select throws_ok(
  $$select consumer from outbox.deliveries$$,
  '42501', NULL,
  'nor see what has been delivered');

-- The whole separation rests on this. EXECUTE is granted to PUBLIC by default,
-- so a missing revoke would let a request set worker scope for any Organization
-- and read straight past its own policies.
select throws_ok(
  $$select app.set_worker_context('5b111111-1111-4111-8111-111111111111', 'probe')$$,
  '42501', NULL,
  'a Staff Member cannot give themselves worker scope');

reset role;

-- ---------------------------------------------------------------------------
-- The worker without context reaches nothing it is scoped by
-- ---------------------------------------------------------------------------

set local role ranza_worker;

select throws_ok(
  $$select app.set_request_context('51111111-1111-4111-8111-111111111111')$$,
  '42501', NULL,
  'the worker cannot become a Staff Member: an action it took would be attributed to one');

select is_empty('select consumer from outbox.deliveries',
  'without worker context it reaches no delivery');

select throws_ok(
  $$insert into outbox.deliveries (consumer, event_id, organization_id)
    values ('test.onAnything', '5e111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111')$$,
  '42501', NULL,
  'and records none: null scope denies rather than widens');

-- The queue itself is the exception, and it is visible without context because
-- finding out which Organizations have pending work is what the dispatcher does
-- before it can scope itself to one.
-- Scoped to this suite's own two Organizations, because the table is shared
-- with every other suite and with whatever a developer's database has in it.
-- Counting the whole queue passed only on a freshly reset database, which is a
-- test that reports the state of the machine rather than the state of the code.
select set_eq(
  $$select distinct organization_id from outbox.events
     where organization_id in ('5a111111-1111-4111-8111-111111111111',
                               '5b111111-1111-4111-8111-111111111111')$$,
  $$values ('5a111111-1111-4111-8111-111111111111'::uuid),
           ('5b111111-1111-4111-8111-111111111111'::uuid)$$,
  'but the queue is readable across Organizations, which is the documented exception');

-- ---------------------------------------------------------------------------
-- The worker reaches the queue and nothing else
-- ---------------------------------------------------------------------------

-- Every tenant-owned table in public is protected twice over: the Staff policies
-- resolve through app.current_user_id(), which is null here, and ranza_worker
-- holds no grant on any of them. The grant is what this asserts, because it is
-- the half that fails closed when somebody writes a policy with `using (true)`
-- for a reason that looked local at the time.
select throws_ok(
  $$select id from public.organizations$$,
  '42501', NULL,
  'the worker cannot read Organizations');

select throws_ok(
  $$select id from public.stays$$,
  '42501', NULL,
  'nor Stays');

select throws_ok(
  $$select id from public.folios$$,
  '42501', NULL,
  'nor anybody''s money');

select throws_ok(
  $$select id from audit.records$$,
  '42501', NULL,
  'nor the audit trail');

-- What the dispatcher actually does first. FOR UPDATE SKIP LOCKED is how two
-- workers claim disjoint batches without coordinating, and it needs the update
-- privilege — which the worker holds on six columns and not on the table, so
-- this is also evidence that a column-level grant is enough to lock a row.
select lives_ok(
  $$select id from outbox.events
     where published_at is null and dead_at is null
       and available_at <= now()
       and (claimed_until is null or claimed_until < now())
     order by occurred_at
     limit 10
     for update skip locked$$,
  'the worker claims a batch with for update skip locked');

select lives_ok(
  $$update outbox.events
       set claimed_until = now() + interval '2 minutes',
           attempts = attempts + 1,
           last_error = null,
           available_at = now(),
           published_at = null,
           dead_at = null
     where id = '5e111111-1111-4111-8111-111111111111'$$,
  'and may write every dispatch column');

-- A policy bounds rows; a grant bounds columns. The row is in reach and the
-- policy approves it — what refuses is that marking an event delivered is not
-- the same act as rewriting what it says.
select throws_ok(
  $$update outbox.events set payload = '{}'::jsonb$$,
  '42501', NULL,
  'a worker cannot rewrite what an event says');

select throws_ok(
  $$update outbox.events
       set organization_id = '5a111111-1111-4111-8111-111111111111'$$,
  '42501', NULL,
  'nor move one into another Organization');

select throws_ok(
  $$update outbox.events set event_type = 'stay.invented'$$,
  '42501', NULL,
  'nor change what happened');

select throws_ok(
  $$delete from outbox.events$$,
  '42501', NULL,
  'nor remove one: a dead letter is the only evidence of what went wrong');

-- ---------------------------------------------------------------------------
-- A delivery is scoped, because by then there is no reason not to be
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select app.set_worker_context('5a111111-1111-4111-8111-111111111111',
                                  'outbox.probe')$$,
  'the worker may scope itself to an Organization');

select results_eq(
  $$select app.worker_organization_id()$$,
  $$values ('5a111111-1111-4111-8111-111111111111'::uuid)$$,
  'and the scope is readable back inside the transaction');

select lives_ok(
  $$insert into outbox.deliveries (consumer, event_id, organization_id)
    values ('test.onCheckedIn', '5e111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111')$$,
  'a delivery is recorded in the scope it was set to');

select throws_ok(
  $$insert into outbox.deliveries (consumer, event_id, organization_id)
    values ('test.onCheckedOut', '5e222222-2222-4222-8222-222222222222',
            '5b111111-1111-4111-8111-111111111111')$$,
  '42501', NULL,
  'and not into another Organization, even though the event itself was readable');

select throws_ok(
  $$insert into outbox.deliveries (consumer, event_id, organization_id)
    values ('test.onCheckedIn', '5e111111-1111-4111-8111-111111111111',
            '5a111111-1111-4111-8111-111111111111')$$,
  '23505', NULL,
  'the same consumer cannot record the same event twice: this is what makes a redelivery a no-op');

-- The case the policy alone lets through. Organization B's event, claimed under
-- Organization A's id: the scope matches the worker's context, so the policy
-- approves it — and then B's consumer would never run, because a delivery row
-- already exists for that event. The composite foreign key is what refuses.
select throws_ok(
  $$insert into outbox.deliveries (consumer, event_id, organization_id)
    values ('test.onStolen', '5e222222-2222-4222-8222-222222222222',
            '5a111111-1111-4111-8111-111111111111')$$,
  '23503', NULL,
  'a delivery cannot claim another Organization''s event under its own scope');

select throws_ok(
  $$update outbox.deliveries set delivered_at = now()$$,
  '42501', NULL,
  'a delivery cannot be rewritten, and there is no policy to allow it either');

reset role;

-- ---------------------------------------------------------------------------
-- The grants say the same thing a second way
-- ---------------------------------------------------------------------------

select set_eq(
  $$select privilege_type from information_schema.role_table_grants
    where table_schema = 'outbox' and table_name = 'events'
      and grantee = 'ranza_app'$$,
  array['INSERT'],
  'the runtime role may only publish');

select set_eq(
  $$select column_name from information_schema.column_privileges
    where table_schema = 'outbox' and table_name = 'events'
      and grantee = 'ranza_worker' and privilege_type = 'UPDATE'$$,
  array['available_at', 'claimed_until', 'attempts', 'last_error',
        'published_at', 'dead_at'],
  'and the worker may update exactly the six dispatch columns');

-- Scoped to the roles the application actually connects as. The owner holds
-- every privilege by definition, which is why FORCE row level security and the
-- absent policies above are the half of this that binds it.
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'outbox' and privilege_type = 'DELETE'
      and grantee in ('ranza_app', 'ranza_worker', 'ranza_auth', 'PUBLIC')$$,
  'no runtime role holds a delete grant anywhere in the queue');

select * from finish();
rollback;
