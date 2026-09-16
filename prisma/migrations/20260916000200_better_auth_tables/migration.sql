-- Better Auth tables.
--
-- Two deliberate departures from Better Auth's defaults:
--
-- 1. Tables are prefixed auth_. Better Auth's default table is named `user`,
--    one character from Ranza's `users`, and the two are different things:
--    `users` is Ranza identity that policies resolve against, `auth_user` is a
--    credential record. Confusing them would be easy and costly.
--
-- 2. They are owned by a separate role. These tables hold password hashes and
--    session tokens. ranza_app is the tenant query path, and RLS exists because
--    application defects happen — so a defect there must not also be able to
--    read every credential in the system. ranza_app is granted nothing here.
--
-- RLS is not used on these tables. Authentication happens before any user
-- identity is known, so there is no context to filter on; the boundary is role
-- grants instead. Tenant isolation is unaffected: nothing here is tenant-owned.

create table public.auth_user (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.auth_session (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references public.auth_user (id) on delete cascade
);

create index auth_session_user_idx on public.auth_session ("userId");

create table public.auth_account (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references public.auth_user (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index auth_account_user_idx on public.auth_account ("userId");

create table public.auth_verification (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index auth_verification_identifier_idx
  on public.auth_verification (identifier);

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- Better Auth connects as this role. Like ranza_app it is not an owner and has
-- no BYPASSRLS; each environment sets its own password.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'ranza_auth') then
    create role ranza_auth login;
  end if;
end
$$;

grant usage on schema public to ranza_auth;
grant select, insert, update, delete on
  public.auth_user,
  public.auth_session,
  public.auth_account,
  public.auth_verification
to ranza_auth;

-- ranza_auth needs to create the Ranza user and identity a new sign-up maps to.
grant select, insert on public.users, public.auth_identities to ranza_auth;

-- The tenant query path gets nothing on the credential tables. Stated
-- explicitly so a future blanket grant does not silently widen it.
revoke all on
  public.auth_user,
  public.auth_session,
  public.auth_account,
  public.auth_verification
from ranza_app;

-- ---------------------------------------------------------------------------
-- Policies for the authentication role
-- ---------------------------------------------------------------------------

-- users and auth_identities have FORCE row level security, so grants alone are
-- not enough — without a policy an insert is denied.
--
-- These are scoped `to ranza_auth`, so they widen nothing for ranza_app. Sign-up
-- is not a tenant-scoped operation: a new user belongs to no Organization yet,
-- so there is no context to filter on. The containment is that ranza_auth holds
-- no grant on any tenant-owned table, so reading every identity row still
-- reveals no Organization's data.

create policy users_managed_by_auth_role
  on public.users for insert to ranza_auth
  with check (true);

create policy users_readable_by_auth_role
  on public.users for select to ranza_auth
  using (true);

create policy auth_identities_managed_by_auth_role
  on public.auth_identities for insert to ranza_auth
  with check (true);

create policy auth_identities_readable_by_auth_role
  on public.auth_identities for select to ranza_auth
  using (true);
