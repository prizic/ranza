-- The ledger is read by permission and posted by the worker alone (RANZ-41, ADR 0042).
--
-- Hand-written; this migration adds no column and no table.
--
-- ON THE NUMBER. 010600 to 010699 belong to the ledger lane.
--
-- 20260916010300 gave the ledger tables the policies of a table nobody had
-- thought about yet: membership, and nothing else. Reading was open to every
-- active member of the Organization (a housekeeper read every journal entry),
-- and writing was too, because ranza_app held INSERT on all three tables. The
-- books were therefore forgeable and readable by exactly the people who have
-- no business with either.
--
-- Three things change, and each is the repository's own rule applied to a place
-- that was missed.
--
--   1. Reading is a permission (ADR 0026) behind the commercial gates (ADR 0012)
--      and a reach the data can honour (ADR 0031).
--   2. Nothing but the worker writes the ledger, and it writes through one
--      function and no table grant (ADR 0027).
--   3. That function derives the entry from the Folio line, never from the
--      outbox payload.
--
-- On the third, which is the one that decides whether the first two mean
-- anything. The worker used to post whatever the `folio.line_posted` payload
-- said, and ranza_app may insert into outbox.events with any payload for its
-- own Organization (events_publish_own_scope). Closing the ledger's own grants
-- would have moved the forgery one table over: a forged event, then a forged
-- entry, by anybody the application role can speak for. folio_lines is
-- append-only (folio_lines_append_only), so a posting derived from the row can
-- only ever be the entry that line owes; a forged event can at worst name a
-- real line, and posting a real line early is the same entry it would have
-- produced late.

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- First, because staff_roles_permissions_are_known refuses a key the catalogue
-- does not hold (20260916002300).
--
-- Under billing_folios because that is the Entitlement the ledger is fed from
-- and gated by below: there is no accounting Entitlement yet, and inventing one
-- would leave every Organization unable to read its own books until somebody
-- inserted rows for it. An Accounting module that is sold separately
-- (blueprint 3.3, 5.10) takes its own key in its own migration.
insert into public.staff_permissions (key, module_key)
values ('finance.view_ledger', 'billing_folios')
on conflict (key) do nothing;

-- Owner, Manager and Finance: the three shipped roles that already handle money
-- (finance.reverse_payment, 20260916009800). Not Front desk, which takes
-- payments but does not audit them, and not Housekeeping. Appended rather than
-- assigned, for the reason 20260916004200 gives. A custom role is not given it:
-- this is a new right to read, not a rename of one it already held, so an
-- Organization composes it into a role on purpose (ADR 0026).
update public.staff_roles
   set permissions = array_append(permissions, 'finance.view_ledger'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'finance')
   and not ('finance.view_ledger' = any (permissions));

-- staff_roles is FORCE row level security and this migration brings no policy
-- for the statement above, so a migrating role that stopped bypassing it would
-- match nothing and say nothing. Asserted, as 20260916009600 does.
do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager', 'finance')
         and 'finance.view_ledger' = any (permissions)) <> 3 then
    raise exception 'finance.view_ledger did not reach the shipped owner, manager and finance roles';
  end if;
  if exists (select 1 from public.staff_roles
              where organization_id is null
                and key in ('front_desk', 'housekeeping')
                and 'finance.view_ledger' = any (permissions)) then
    raise exception 'finance.view_ledger reached a shipped role that must not read the ledger';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- Four conjuncts, in the policy and not beside it (ADR 0012):
--
--   membership         accessible_organization_ids(), as every read has.
--   reach              the WHOLE Organization. A journal entry carries no
--                      Property (blueprint 9.8 forbids the module the word), so
--                      a reader assigned to one Property would read every
--                      Property's revenue. That is ADR 0031's rule for an
--                      audit record with no location, and it is the same
--                      answer here: no location, whole-Organization reach.
--                      Narrowing the ledger to a Property is a column and a
--                      decision (ACC-DEF-01), not a widening of this clause.
--   permission         finance.view_ledger.
--   commercial gates   can_use_capability_in_organization() on the Folio
--                      finance capability, which asks gates 1 to 3 at some
--                      Property of the Organization and the caller's reach to
--                      it. It is the closest existing Organization-level gate:
--                      there is no accounting capability to ask, and every
--                      entry in the ledger exists because a Folio line did.
--                      A suspended or cancelled Subscription denies; past_due
--                      does not (ADR 0040).
drop policy accounts_read_app on finance.accounts;
create policy accounts_read_app
  on finance.accounts for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'finance.view_ledger')
    and app.can_use_capability_in_organization(
          organization_id, 'billing_folios', 'finance')
  );

drop policy entries_read_app on finance.journal_entries;
create policy entries_read_app
  on finance.journal_entries for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'finance.view_ledger')
    and app.can_use_capability_in_organization(
          organization_id, 'billing_folios', 'finance')
  );

drop policy lines_read_app on finance.journal_lines;
create policy lines_read_app
  on finance.journal_lines for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'finance.view_ledger')
    and app.can_use_capability_in_organization(
          organization_id, 'billing_folios', 'finance')
  );

comment on policy entries_read_app on finance.journal_entries is
  'Membership, whole-Organization reach, finance.view_ledger, and the Folio finance capability (ADR 0012, ADR 0031). An entry has no Property to narrow to.';

-- ---------------------------------------------------------------------------
-- Writing: nobody, except the function below
-- ---------------------------------------------------------------------------

-- Nothing in apps/ or packages/ writes the ledger as ranza_app: the only writer
-- was the worker's handler, reaching the tables through the adapter. So the
-- policies that let either role insert go, and so do the grants they sat on. A
-- policy with no grant under it is not a boundary, only a line that reads like
-- one.
drop policy accounts_insert_app on finance.accounts;
drop policy entries_insert_app on finance.journal_entries;
drop policy lines_insert_app on finance.journal_lines;

drop policy accounts_read_worker on finance.accounts;
drop policy accounts_insert_worker on finance.accounts;
drop policy entries_read_worker on finance.journal_entries;
drop policy entries_insert_worker on finance.journal_entries;
drop policy lines_read_worker on finance.journal_lines;
drop policy lines_insert_worker on finance.journal_lines;

-- Stated as an end state rather than as the inverse of 010300 and 010400, so
-- the next reader does not have to replay two migrations to learn who holds
-- what. Revoking a table privilege takes the column privileges under it with
-- it, which is what the column-level INSERT grants of both migrations were.
revoke all on finance.accounts, finance.journal_entries, finance.journal_lines
  from ranza_app, ranza_worker;
grant select on finance.accounts, finance.journal_entries, finance.journal_lines
  to ranza_app;

-- ranza_worker is granted nothing on the ledger, as it is granted nothing on
-- auth_session (ADR 0027). The sequence is the entry number, drawn by the
-- function's owner.
revoke all on all sequences in schema finance from ranza_app, ranza_worker;
revoke usage on schema finance from ranza_worker;

-- ensure_default_accounts() is an invoker that writes accounts. Neither role
-- can any longer, and a function that can only fail is a trap; the function
-- below calls it as the owner.
revoke execute on function finance.ensure_default_accounts(uuid)
  from public, ranza_app, ranza_worker;
revoke execute on function finance.verify_entry_has_lines()
  from ranza_app, ranza_worker;

-- The two checks that run when an entry commits. Both are deferred constraint
-- triggers, and a deferred trigger runs as whoever is current at COMMIT, which
-- for a posting is ranza_worker: not the definer function that wrote the rows.
-- As invokers they read finance.journal_lines with the worker's privileges, so
-- once the worker holds nothing on the tables every posting would pass its
-- insert and then fail its own commit with "permission denied for schema
-- finance". Found by posting as ranza_worker and committing; a pgTAP run that
-- never commits as the worker does not see it.
--
-- Definers, then. They take no argument and read only the entry the trigger
-- names, and a trigger function cannot be called by anybody.
alter function finance.verify_entry_balanced() security definer;
alter function finance.verify_entry_has_lines() security definer;

-- ---------------------------------------------------------------------------
-- Posting: one function, and no table grant (ADR 0027)
-- ---------------------------------------------------------------------------

-- The whole of what the worker may do to the ledger is name a `folio.line_posted`
-- event and have the entry that line owes posted. It cannot state an amount, an
-- account, a date or a currency. Like app.mark_unit_dirty_after_check_out() it
-- takes the event rather than the line, so that the Organization it acts in is
-- the one the event was written under and the one the dispatcher set; the line
-- is then read from folio_lines, whose rows nothing can rewrite.
--
-- The mapping is ADR 0042's, unchanged:
--   charge    debit Accounts Receivable, credit Room Revenue for a room night
--             and Other Revenue for anything else
--   payment   debit the account the method settles into, credit Receivables
--   reversal  the mirror of the line it reverses
-- A payment's amount is negative on the Folio and a reversal's sign follows the
-- line it cancels, so a posting uses the magnitude and the direction comes
-- from the type.
--
-- Loud, on every path. A handler that returns quietly marks its event
-- delivered, so each refusal below is a raise that the dispatcher records in
-- outbox.events.last_error and retries, then leaves dead: an event with no line
-- to post is a publisher defect, and a ledger that silently misses an entry is
-- the failure this module exists to prevent.
--
-- No commercial gate. This is the bookkeeping of a fact that already happened,
-- and a lapsed Subscription must not leave the books missing a line the front
-- desk was allowed to write (the grace period of ADR 0040 applies to the
-- worker's writers for the same reason).
--
-- The entry is dated by the Folio line's business date when it has one (a room
-- night does), and otherwise by the business date its Property was working
-- when the line was posted (ADR 0021), not by the day the worker got to it.
create function app.post_folio_line_to_ledger(target_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_organization uuid := app.worker_organization_id();
  event_organization uuid;
  event_kind text;
  event_line text;
  posted record;
  reversed record;
  debit_code text;
  credit_code text;
  debit_account uuid;
  credit_account uuid;
  magnitude bigint;
  entry_id uuid;
begin
  if acting_organization is null then
    raise exception 'posting to the ledger requires a worker context'
      using errcode = '42501';
  end if;

  select event.organization_id, event.event_type, event.payload ->> 'lineId'
    into event_organization, event_kind, event_line
    from outbox.events as event
   where event.id = target_event_id;

  if not found then
    raise exception 'there is no outbox event %', target_event_id
      using errcode = 'P0002';
  end if;

  if event_organization <> acting_organization then
    raise exception 'that event belongs to another Organization'
      using errcode = '42501';
  end if;

  if event_kind <> 'folio.line_posted' then
    raise exception 'event % is a %, and only folio.line_posted is posted to the ledger',
      target_event_id, event_kind
      using errcode = '22023';
  end if;

  if event_line is null then
    raise exception 'folio.line_posted event % names no lineId to post', target_event_id
      using errcode = '22023';
  end if;

  select line.id, line.folio_id, line.line_type, line.description,
         line.amount_minor, line.payment_method, line.reverses_line_id,
         line.source, line.posted_at, line.business_date,
         folio.currency::text as currency,
         property.timezone, property.business_date_cutoff
    into posted
    from public.folio_lines as line
    join public.folios as folio on folio.id = line.folio_id
    join public.properties as property on property.id = line.property_id
   where line.id = event_line::uuid
     and line.organization_id = acting_organization;

  if not found then
    raise exception 'event % names Folio line %, which this Organization does not have',
      target_event_id, event_line
      using errcode = 'P0002';
  end if;

  magnitude := abs(posted.amount_minor);

  if posted.line_type = 'charge' then
    debit_code := '1200';
    credit_code := case when posted.source = 'room_night' then '4000' else '4100' end;
  elsif posted.line_type = 'payment' then
    debit_code := case posted.payment_method
                    when 'card' then '1020'
                    when 'bank_transfer' then '1010'
                    else '1000'
                  end;
    credit_code := '1200';
  elsif posted.line_type = 'reversal' then
    select original.line_type, original.payment_method, original.source
      into reversed
      from public.folio_lines as original
     where original.id = posted.reverses_line_id
       and original.folio_id = posted.folio_id;

    if reversed.line_type = 'payment' then
      debit_code := '1200';
      credit_code := case reversed.payment_method
                       when 'card' then '1020'
                       when 'bank_transfer' then '1010'
                       else '1000'
                     end;
    elsif reversed.line_type = 'charge' then
      debit_code := case when reversed.source = 'room_night' then '4000' else '4100' end;
      credit_code := '1200';
    else
      raise exception 'Folio line % reverses a % line, which has no ledger posting',
        posted.id, coalesce(reversed.line_type, 'missing')
        using errcode = '22023';
    end if;
  else
    raise exception 'Folio line % is a %, which has no ledger posting',
      posted.id, posted.line_type
      using errcode = '22023';
  end if;

  perform finance.ensure_default_accounts(acting_organization);

  select account.id into debit_account
    from finance.accounts as account
   where account.organization_id = acting_organization
     and account.code = debit_code
     and account.is_active;

  select account.id into credit_account
    from finance.accounts as account
   where account.organization_id = acting_organization
     and account.code = credit_code
     and account.is_active;

  if debit_account is null or credit_account is null then
    raise exception 'account % or % is missing or inactive for this Organization',
      debit_code, credit_code
      using errcode = '22023';
  end if;

  insert into finance.journal_entries
    (organization_id, entry_date, currency, description, source_type, source_id)
  values (
    acting_organization,
    coalesce(
      posted.business_date,
      app.business_date(posted.posted_at, posted.timezone, posted.business_date_cutoff)
    ),
    posted.currency,
    btrim(posted.description),
    'folio_line',
    posted.id
  )
  on conflict (organization_id, source_type, source_id) do nothing
  returning id into entry_id;

  -- Already posted: a redelivery, or a rival worker that got there first. The
  -- entry that exists is the one this line owes, so say so rather than fail.
  if entry_id is null then
    select entry.id into entry_id
      from finance.journal_entries as entry
     where entry.organization_id = acting_organization
       and entry.source_type = 'folio_line'
       and entry.source_id = posted.id;
    return entry_id;
  end if;

  insert into finance.journal_lines
    (organization_id, journal_entry_id, account_id, direction, amount_minor,
     description, line_number)
  values
    (acting_organization, entry_id, debit_account, 'debit', magnitude,
     btrim(posted.description), 1),
    (acting_organization, entry_id, credit_account, 'credit', magnitude,
     btrim(posted.description), 2);

  return entry_id;
end;
$$;

comment on function app.post_folio_line_to_ledger(uuid) is
  'Posts the journal entry a Folio line owes, derived from folio_lines and never from the event payload. The only way the ledger is written; ranza_worker alone may execute it (ADR 0027, ADR 0042).';

revoke execute on function app.post_folio_line_to_ledger(uuid)
  from public, ranza_app, ranza_auth;
grant execute on function app.post_folio_line_to_ledger(uuid) to ranza_worker;
