-- platform/audit — the record of what was done, by whom, and why.
--
-- Owned by packages/platform/audit (ADR 0008). It is a reusable module, so it
-- knows nothing about what it is recording: a subject is an opaque type and id
-- supplied by the caller, and the scope is an opaque organization_id. A host
-- adapter gives those identifiers meaning.
--
-- Records are append-only. Blueprint 7.4 and AGENTS.md both require that
-- operational history is corrected by adding a record, never by changing one,
-- and an audit trail that can be edited is not evidence of anything.

create schema audit;

comment on schema audit is
  'Owned by packages/platform/audit. Append-only. No other module is granted anything here.';

create table audit.records (
  id uuid primary key default gen_random_uuid(),

  -- Opaque tenancy scope. The module never learns what it names.
  organization_id uuid not null,

  -- Who acted. Not null: an unattributed record is not evidence. A system
  -- actor will need its own identity rather than a null here.
  actor_id uuid not null,

  -- Dotted and lower case, e.g. 'organization.created'. Constrained so the
  -- vocabulary stays queryable instead of drifting into free text.
  action text not null
    check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),

  -- What was acted on, as an opaque type name and identifier.
  subject_type text not null check (subject_type ~ '^[a-z][a-z0-9_]*$'),
  subject_id uuid not null,

  -- Why. Nullable here because only some actions require one; the caller that
  -- owns a high-risk action is what makes it mandatory (blueprint 4.4).
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 2000),

  -- Whatever else the caller needs to explain the action later.
  context jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now()
);

create index records_scope_idx
  on audit.records (organization_id, occurred_at desc);

create index records_subject_idx
  on audit.records (subject_type, subject_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Append-only, and scoped
-- ---------------------------------------------------------------------------

alter table audit.records enable row level security;
alter table audit.records force row level security;

-- There is deliberately no UPDATE or DELETE policy. Under FORCE row level
-- security an absent policy denies, so the table cannot be rewritten even by
-- its owner. The revoked grants below say the same thing a second way, because
-- this is the invariant the whole record depends on.
create policy records_read_own_scope
  on audit.records for select
  using (organization_id in (select app.accessible_organization_ids()));

-- A record may only be written into a scope the actor reaches, and only in
-- their own name: nobody can attribute an action to somebody else.
create policy records_append_own_scope
  on audit.records for insert
  with check (
    organization_id in (select app.accessible_organization_ids())
    and actor_id = app.current_user_id()
  );

-- Row level security binds the runtime role. It does not bind a superuser, and
-- FORCE does not either — locally the migration role is the superuser, and a
-- hosted one may carry BYPASSRLS. A policy alone would therefore leave the one
-- table whose whole value is that it cannot be edited editable by the role that
-- runs migrations. A trigger fires for everybody.
--
-- This is not absolute: a superuser can disable or drop the trigger. Nothing in
-- a database survives a determined administrator, and defending against one is
-- an operational control — restricted access, and retained backups — not a
-- constraint. What this does guarantee is that no ordinary statement, from any
-- role, can quietly rewrite history.
create function audit.forbid_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'audit.records is append-only'
    using errcode = '42501';
end;
$$;

create trigger records_append_only
  before update or delete on audit.records
  for each statement
  execute function audit.forbid_rewrite();

grant usage on schema audit to ranza_app;
grant select, insert on audit.records to ranza_app;
revoke update, delete on audit.records from ranza_app;

-- The credential role has no business here, stated rather than assumed.
revoke all on schema audit from ranza_auth;
