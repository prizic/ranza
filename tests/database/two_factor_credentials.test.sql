-- The second factor is a credential, and the boundary around it is role grants.
--
-- The auth_ tables deliberately carry no row-level security: authentication
-- happens before any identity is known, so there is no context to filter on
-- (AGENTS.md). That makes grants the whole boundary rather than a backstop,
-- which is worth asserting out loud — a blanket grant added later would
-- otherwise widen it silently.
begin;
select plan(6);

-- ---------------------------------------------------------------------------
-- Who may reach a credential
-- ---------------------------------------------------------------------------

select table_privs_are(
  'public', 'auth_two_factor', 'ranza_app', '{}'::text[],
  'the tenant query path holds no privilege on the TOTP secret'
);

-- Stated beside it because they are one boundary, not two: a defect in the
-- tenant path must reach neither password hashes nor second factors.
select table_privs_are(
  'public', 'auth_account', 'ranza_app', '{}'::text[],
  'the tenant query path holds no privilege on password hashes'
);

select table_privs_are(
  'public', 'auth_two_factor', 'ranza_auth',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'the authentication role reaches the second factor and nothing more'
);

-- ---------------------------------------------------------------------------
-- Invariants that decide whether anyone can still sign in
-- ---------------------------------------------------------------------------

-- Every account that existed before this migration has no second factor. If the
-- column defaulted to true they would all be locked out at deploy time, which is
-- the kind of outage a default value can cause quietly.
select col_default_is(
  'public', 'auth_user', 'twoFactorEnabled', 'false',
  'an existing account is not suddenly required to produce a second factor'
);

select col_not_null(
  'public', 'auth_two_factor', 'secret',
  'a second-factor row without a secret is not representable'
);

-- ---------------------------------------------------------------------------
-- A removed account leaves no credential behind
-- ---------------------------------------------------------------------------

insert into public.auth_user (id, name, email)
values ('mfa-cascade-user', 'Cascade', 'mfa-cascade@example.test');

insert into public.auth_two_factor (id, secret, "backupCodes", "userId")
values ('mfa-cascade-factor', 'encrypted', 'encrypted', 'mfa-cascade-user');

delete from public.auth_user where id = 'mfa-cascade-user';

select is_empty(
  $$select id from public.auth_two_factor where id = 'mfa-cascade-factor'$$,
  'removing an account takes its second factor with it'
);

select * from finish();
rollback;
