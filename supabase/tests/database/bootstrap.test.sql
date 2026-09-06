begin;

select plan(1);

select has_schema(
  'private',
  'private server-only schema is created by the bootstrap migration'
);

select * from finish();

rollback;
