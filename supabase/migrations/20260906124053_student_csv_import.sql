create table public.student_import_runs (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete restrict,
  branch_id uuid not null,
  import_key text not null check (char_length(import_key) = 64),
  mode text not null check (mode in ('dry_run', 'commit')),
  status text not null default 'pending' check (status in ('pending', 'validated', 'committed', 'failed')),
  row_count integer not null default 0 check (row_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (operator_id, import_key),
  foreign key (branch_id, operator_id) references public.branches (id, operator_id) on delete restrict
);
create index student_import_runs_operator_created_idx on public.student_import_runs (operator_id, created_at desc);
alter table public.student_import_runs enable row level security;
revoke all on public.student_import_runs from anon, authenticated;
grant select, insert, update on public.student_import_runs to authenticated;
create policy student_import_runs_staff on public.student_import_runs for all to authenticated
using ((select private.has_active_branch_access(operator_id, branch_id)))
with check ((select private.has_active_branch_access(operator_id, branch_id)));
