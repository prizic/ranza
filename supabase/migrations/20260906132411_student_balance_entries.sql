create table public.student_balance_accounts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  student_id uuid not null,
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (student_id, operator_id) references public.students(id, operator_id) on delete restrict,
  unique (student_id, operator_id, currency),
  unique (id, student_id, operator_id, currency)
);
create index student_balance_accounts_operator_student_idx on public.student_balance_accounts(operator_id, student_id);

create table public.student_balance_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  operator_id uuid not null,
  student_id uuid not null,
  branch_id uuid not null,
  entry_type text not null check (entry_type in ('charge','external_payment','credit','adjustment','reversal')),
  amount numeric(14,2) not null check (amount <> 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_date date not null,
  due_date date,
  description text not null check (char_length(btrim(description)) between 2 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 160),
  reversal_of uuid,
  foreign key (account_id, student_id, operator_id, currency)
    references public.student_balance_accounts(id, student_id, operator_id, currency) on delete restrict,
  foreign key (branch_id, operator_id) references public.branches(id, operator_id) on delete restrict,
  unique (id, account_id, operator_id, student_id, currency),
  unique (operator_id, idempotency_key)
);
alter table public.student_balance_entries add constraint student_balance_entries_reversal_fk
foreign key (reversal_of, account_id, operator_id, student_id, currency)
references public.student_balance_entries(id, account_id, operator_id, student_id, currency) on delete restrict;
create unique index student_balance_entries_one_reversal_idx on public.student_balance_entries(reversal_of) where reversal_of is not null;
create index student_balance_entries_account_date_idx on public.student_balance_entries(account_id, effective_date desc, created_at desc);
create index student_balance_entries_branch_date_idx on public.student_balance_entries(operator_id, branch_id, effective_date desc);
create index student_balance_entries_due_idx on public.student_balance_entries(operator_id, branch_id, due_date) where entry_type='charge';

alter table public.student_balance_accounts enable row level security;
alter table public.student_balance_entries enable row level security;
revoke all on public.student_balance_accounts, public.student_balance_entries from anon, authenticated;
grant select on public.student_balance_accounts, public.student_balance_entries to authenticated;

create function private.can_manage_student_balance(target_operator_id uuid, target_branch_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_active_branch_access(target_operator_id, target_branch_id)
    and exists (
      select 1 from public.operator_memberships membership
      where membership.operator_id=target_operator_id and membership.auth_user_id=(select auth.uid())
        and membership.status='active' and membership.role='owner'
    );
$$;
revoke all on function private.can_manage_student_balance(uuid,uuid) from public,anon;
grant execute on function private.can_manage_student_balance(uuid,uuid) to authenticated;

create policy "Students read own Balance Account and finance staff read managed Students"
on public.student_balance_accounts for select to authenticated using (
  student_id=private.current_student_id()
  or exists (
    select 1 from public.student_branch_history history
    where history.student_id=student_balance_accounts.student_id
      and history.operator_id=student_balance_accounts.operator_id and history.ended_at is null
      and private.can_manage_student_balance(student_balance_accounts.operator_id,history.branch_id)
  )
);
create policy "Students read own Balance Entries and finance staff read managed Branches"
on public.student_balance_entries for select to authenticated using (
  student_id=private.current_student_id()
  or private.can_manage_student_balance(operator_id,branch_id)
);

create function private.validate_balance_entry()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare original public.student_balance_entries%rowtype;
begin
  new.description:=btrim(new.description);
  new.idempotency_key:=btrim(new.idempotency_key);
  if (new.entry_type='charge' and new.amount<=0)
    or (new.entry_type in ('external_payment','credit') and new.amount>=0)
    or (new.entry_type<>'charge' and new.due_date is not null)
    or (new.entry_type='charge' and new.due_date is not null and new.due_date<new.effective_date)
    or (new.entry_type<>'reversal' and new.reversal_of is not null)
    or (new.entry_type='reversal' and new.reversal_of is null) then
    raise exception 'Balance entry sign, due date, or reversal link is invalid' using errcode='22023';
  end if;
  if new.entry_type='reversal' then
    select * into original from public.student_balance_entries where id=new.reversal_of for update;
    if original.id is null or original.entry_type='reversal' or original.account_id<>new.account_id
      or new.amount<>-original.amount or new.currency<>original.currency then
      raise exception 'Reversal must exactly offset one unreversed original entry' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_balance_entry before insert on public.student_balance_entries
for each row execute function private.validate_balance_entry();

create function private.guard_balance_append_only()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Balance entries are append-only' using errcode='55000'; end;
$$;
create trigger guard_balance_append_only before update or delete on public.student_balance_entries
for each row execute function private.guard_balance_append_only();

create function private.post_balance_entry(
  target_operator_id uuid,target_branch_id uuid,target_student_id uuid,target_currency text,
  target_entry_type text,target_amount numeric,target_effective_date date,target_due_date date,
  target_description text,target_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare student public.students%rowtype; current_branch uuid; account_id uuid; entry_id uuid; existing public.student_balance_entries%rowtype;
begin
  target_currency:=upper(btrim(coalesce(target_currency,'TRY')));
  select * into student from public.students where id=target_student_id and operator_id=target_operator_id for share;
  select history.branch_id into current_branch from public.student_branch_history history
    where history.student_id=student.id and history.ended_at is null and history.started_at<=statement_timestamp() for share;
  if auth.uid() is null or student.id is null or student.status<>'active' or current_branch is distinct from target_branch_id
    or not private.can_manage_student_balance(target_operator_id,target_branch_id) then
    raise exception 'Balance entry denied' using errcode='42501';
  end if;
  perform 1 from public.operator_entitlements entitlement
    where entitlement.operator_id=target_operator_id and entitlement.capability_key='balance' for share;
  if not found or not private.capability_enabled(target_operator_id,'balance',null) then
    raise exception 'Balance entry denied' using errcode='42501';
  end if;
  if target_entry_type not in ('charge','external_payment','credit','adjustment') then
    raise exception 'Unsupported Balance entry type' using errcode='22023';
  end if;
  insert into public.student_balance_accounts(operator_id,student_id,currency)
  values(target_operator_id,target_student_id,target_currency)
  on conflict(student_id,operator_id,currency) do nothing;
  select id into account_id from public.student_balance_accounts
    where operator_id=target_operator_id and student_id=target_student_id and currency=target_currency for update;
  insert into public.student_balance_entries(
    account_id,operator_id,student_id,branch_id,entry_type,amount,currency,effective_date,due_date,
    description,created_by,idempotency_key
  ) values (
    account_id,target_operator_id,target_student_id,target_branch_id,target_entry_type,target_amount,target_currency,
    target_effective_date,target_due_date,target_description,auth.uid(),target_idempotency_key
  ) on conflict(operator_id,idempotency_key) do nothing returning id into entry_id;
  if entry_id is null then
    select * into existing from public.student_balance_entries
      where operator_id=target_operator_id and idempotency_key=btrim(target_idempotency_key);
    if existing.student_id<>target_student_id or existing.branch_id<>target_branch_id
      or existing.entry_type<>target_entry_type or existing.amount<>target_amount
      or existing.currency<>target_currency or existing.effective_date<>target_effective_date
      or existing.due_date is distinct from target_due_date or existing.description<>btrim(target_description) then
      raise exception 'Idempotency key was already used for another Balance entry' using errcode='22023';
    end if;
    return existing.id;
  end if;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(target_operator_id,target_branch_id,auth.uid(),'operator_staff','balance_entry.posted','student_balance_entry',entry_id,
    jsonb_build_object('entry_type',target_entry_type,'amount',target_amount,'currency',target_currency,'effective_date',target_effective_date),
    private.current_correlation_id());
  return entry_id;
end;
$$;

create function public.post_balance_entry(
  target_operator_id uuid,target_branch_id uuid,target_student_id uuid,target_currency text default 'TRY',
  target_entry_type text default null,target_amount numeric default null,target_effective_date date default current_date,
  target_due_date date default null,target_description text default null,target_idempotency_key text default null
) returns uuid language sql security invoker set search_path='' as $$
  select private.post_balance_entry(target_operator_id,target_branch_id,target_student_id,target_currency,target_entry_type,
    target_amount,target_effective_date,target_due_date,target_description,target_idempotency_key);
$$;

create function private.reverse_balance_entry(target_entry_id uuid,target_description text,target_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.student_balance_entries%rowtype; reversal_id uuid; existing public.student_balance_entries%rowtype;
begin
  select * into original from public.student_balance_entries where id=target_entry_id for update;
  if original.id is null or original.entry_type='reversal'
    or not private.can_manage_student_balance(original.operator_id,original.branch_id) then
    raise exception 'Balance reversal denied' using errcode='42501';
  end if;
  perform 1 from public.operator_entitlements entitlement
    where entitlement.operator_id=original.operator_id and entitlement.capability_key='balance' for share;
  if not found or not private.capability_enabled(original.operator_id,'balance',null) then
    raise exception 'Balance reversal denied' using errcode='42501';
  end if;
  insert into public.student_balance_entries(
    account_id,operator_id,student_id,branch_id,entry_type,amount,currency,effective_date,description,
    created_by,idempotency_key,reversal_of
  ) values(original.account_id,original.operator_id,original.student_id,original.branch_id,'reversal',-original.amount,
    original.currency,current_date,target_description,auth.uid(),target_idempotency_key,original.id)
  on conflict(operator_id,idempotency_key) do nothing returning id into reversal_id;
  if reversal_id is null then
    select * into existing from public.student_balance_entries
      where operator_id=original.operator_id and idempotency_key=btrim(target_idempotency_key);
    if existing.reversal_of is distinct from original.id then
      raise exception 'Idempotency key was already used for another Balance entry' using errcode='22023';
    end if;
    return existing.id;
  end if;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(original.operator_id,original.branch_id,auth.uid(),'operator_staff','balance_entry.reversed','student_balance_entry',reversal_id,
    jsonb_build_object('reversal_of',original.id,'amount',-original.amount,'currency',original.currency),private.current_correlation_id());
  return reversal_id;
exception when unique_violation then
  raise exception 'Balance entry already has a reversal' using errcode='23505';
end;
$$;

create function public.reverse_balance_entry(target_entry_id uuid,target_description text,target_idempotency_key text)
returns uuid language sql security invoker set search_path='' as $$
  select private.reverse_balance_entry(target_entry_id,target_description,target_idempotency_key);
$$;

revoke all on function private.validate_balance_entry(),private.guard_balance_append_only(),
  private.post_balance_entry(uuid,uuid,uuid,text,text,numeric,date,date,text,text),
  private.reverse_balance_entry(uuid,text,text),
  public.post_balance_entry(uuid,uuid,uuid,text,text,numeric,date,date,text,text),
  public.reverse_balance_entry(uuid,text,text) from public,anon,authenticated;
grant execute on function public.post_balance_entry(uuid,uuid,uuid,text,text,numeric,date,date,text,text),
  public.reverse_balance_entry(uuid,text,text) to authenticated;

create view public.student_balance_summary with (security_invoker=true) as
select account.id as account_id,account.operator_id,account.student_id,account.currency,
  coalesce(sum(entry.amount),0::numeric)::numeric(14,2) as remaining_balance,
  max(entry.created_at) as last_entry_at
from public.student_balance_accounts account left join public.student_balance_entries entry on entry.account_id=account.id
group by account.id,account.operator_id,account.student_id,account.currency;

create view public.branch_student_balance_summary with (security_invoker=true) as
select history.operator_id,history.branch_id,student.id as student_id,student.display_name,
  account.id as account_id,coalesce(account.currency,'TRY') as currency,
  coalesce(summary.remaining_balance,0::numeric)::numeric(14,2) as remaining_balance,
  greatest(coalesce(sum(case
    when entry.entry_type='charge' and entry.due_date<current_date then entry.amount
    when entry.entry_type<>'charge' and entry.effective_date<=current_date then entry.amount
    else 0 end),0),0)::numeric(14,2) as overdue_balance
from public.student_branch_history history join public.students student on student.id=history.student_id and student.status='active'
left join public.student_balance_accounts account on account.operator_id=student.operator_id and account.student_id=student.id and account.currency='TRY'
left join public.student_balance_summary summary on summary.account_id=account.id
left join public.student_balance_entries entry on entry.account_id=account.id
where history.ended_at is null and history.started_at<=statement_timestamp()
group by history.operator_id,history.branch_id,student.id,student.display_name,account.id,account.currency,summary.remaining_balance;

revoke all on public.student_balance_summary,public.branch_student_balance_summary from anon,authenticated;
grant select on public.student_balance_summary,public.branch_student_balance_summary to authenticated;
