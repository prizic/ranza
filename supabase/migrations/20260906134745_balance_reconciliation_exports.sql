create function private.list_branch_balances(
  target_operator_id uuid,
  target_branch_id uuid,
  minimum_remaining numeric default null,
  maximum_remaining numeric default null,
  overdue_only boolean default false
) returns table(
  student_id uuid, display_name text, account_id uuid, currency text,
  remaining_balance numeric, overdue_balance numeric
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null
    or not private.can_manage_student_balance(target_operator_id,target_branch_id) then
    raise exception 'Balance list denied' using errcode='42501';
  end if;
  return query
    select summary.student_id,summary.display_name,summary.account_id,summary.currency,
      summary.remaining_balance,summary.overdue_balance
    from public.branch_student_balance_summary summary
    where summary.operator_id=target_operator_id and summary.branch_id=target_branch_id
      and (minimum_remaining is null or summary.remaining_balance>=minimum_remaining)
      and (maximum_remaining is null or summary.remaining_balance<=maximum_remaining)
      and (not overdue_only or summary.overdue_balance>0)
    order by summary.display_name,summary.student_id;
end;
$$;

create function public.list_branch_balances(
  target_operator_id uuid,
  target_branch_id uuid,
  minimum_remaining numeric default null,
  maximum_remaining numeric default null,
  overdue_only boolean default false
) returns table(
  student_id uuid, display_name text, account_id uuid, currency text,
  remaining_balance numeric, overdue_balance numeric
) language sql stable security invoker set search_path='' as $$
  select * from private.list_branch_balances(
    target_operator_id,target_branch_id,minimum_remaining,maximum_remaining,overdue_only
  );
$$;

create function private.export_branch_balances(target_operator_id uuid,target_branch_id uuid)
returns table(
  account_id uuid, student_id uuid, student_name text, currency text,
  remaining_balance numeric, entry_id uuid, entry_type text, amount numeric,
  effective_date date, due_date date, reversal_of uuid, created_by uuid,
  created_at timestamptz, description text
) language plpgsql security definer set search_path='' as $$
declare exported_rows integer;
begin
  if auth.uid() is null
    or not private.can_manage_student_balance(target_operator_id,target_branch_id) then
    raise exception 'Balance export denied' using errcode='42501';
  end if;
  return query
    select account.id,student.id,student.display_name,account.currency,
      coalesce(summary.remaining_balance,0::numeric),entry.id,entry.entry_type,entry.amount,
      entry.effective_date,entry.due_date,entry.reversal_of,entry.created_by,
      entry.created_at,entry.description
    from public.student_balance_entries entry
    join public.student_balance_accounts account on account.id=entry.account_id
    join public.students student on student.id=entry.student_id
    left join public.student_balance_summary summary on summary.account_id=account.id
    where entry.operator_id=target_operator_id and entry.branch_id=target_branch_id
    order by student.display_name,account.id,entry.effective_date,entry.created_at,entry.id;
  get diagnostics exported_rows = row_count;
  insert into public.audit_events(
    operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,
    after_summary,correlation_id
  ) values (
    target_operator_id,target_branch_id,auth.uid(),'operator_staff','balance.exported',
    'branch',target_branch_id,jsonb_build_object('format','csv','row_count',exported_rows),
    private.current_correlation_id()
  );
end;
$$;

create function public.export_branch_balances(target_operator_id uuid,target_branch_id uuid)
returns table(
  account_id uuid, student_id uuid, student_name text, currency text,
  remaining_balance numeric, entry_id uuid, entry_type text, amount numeric,
  effective_date date, due_date date, reversal_of uuid, created_by uuid,
  created_at timestamptz, description text
) language sql security invoker set search_path='' as $$
  select * from private.export_branch_balances(target_operator_id,target_branch_id);
$$;

revoke all on function private.list_branch_balances(uuid,uuid,numeric,numeric,boolean),
  private.export_branch_balances(uuid,uuid),
  public.list_branch_balances(uuid,uuid,numeric,numeric,boolean),
  public.export_branch_balances(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_branch_balances(uuid,uuid,numeric,numeric,boolean),
  public.export_branch_balances(uuid,uuid) to authenticated;
