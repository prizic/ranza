create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

comment on schema private is
  'Server-only Ranza data that must not be exposed through the Data API.';
