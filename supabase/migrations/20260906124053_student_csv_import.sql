create table private.roster_imports (
  id uuid primary key default gen_random_uuid(),operator_id uuid not null references public.operators(id) on delete restrict,
  branch_id uuid not null,import_key text not null check(import_key~'^[a-f0-9]{64}$'),
  status text not null default 'staged' check(status in ('staged','importing','committed','cancelled','failed')),
  row_count integer not null default 0 check(row_count>=0),valid_count integer not null default 0 check(valid_count>=0),
  error_count integer not null default 0 check(error_count>=0),imported_count integer not null default 0 check(imported_count>=0),
  created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,error_reference text,unique(operator_id,import_key),
  foreign key(branch_id,operator_id) references public.branches(id,operator_id) on delete restrict
);
create table private.roster_import_rows (
  import_id uuid not null references private.roster_imports(id) on delete cascade,row_number integer not null check(row_number>=2),
  external_reference text,display_name text,preferred_locale text,errors text[] not null default array[]::text[],
  primary key(import_id,row_number)
);
create index roster_imports_actor_created_idx on private.roster_imports(created_by,created_at desc);
alter table private.roster_imports enable row level security;
alter table private.roster_import_rows enable row level security;
revoke all on private.roster_imports,private.roster_import_rows from anon,authenticated;

create function private.actor_can_manage_roster(actor_id uuid,target_operator_id uuid,target_branch_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select actor_id is not null and exists(select 1 from public.operator_memberships membership
    join public.operators operator on operator.id=membership.operator_id and operator.status='active'
    join public.branches branch on branch.id=target_branch_id and branch.operator_id=membership.operator_id and branch.status='active'
    where membership.auth_user_id=actor_id and membership.operator_id=target_operator_id and membership.status='active'
      and membership.role in ('owner','manager') and (membership.access_scope='operator_wide' or exists(
        select 1 from public.branch_assignments assignment where assignment.membership_id=membership.id
          and assignment.branch_id=target_branch_id and assignment.status='active')))
    and not private.has_pending_session_revocation(actor_id);
$$;
create function private.roster_import_preview(target_import_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',batch.id,'status',batch.status,'row_count',batch.row_count,'valid_count',batch.valid_count,
    'error_count',batch.error_count,'imported_count',batch.imported_count,'error_reference',batch.error_reference,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('rowNumber',row.row_number,'externalReference',row.external_reference,
      'displayName',row.display_name,'preferredLocale',row.preferred_locale,'errors',to_jsonb(row.errors)) order by row.row_number)
      from private.roster_import_rows row where row.import_id=batch.id),'[]'::jsonb))
  from private.roster_imports batch where batch.id=target_import_id;
$$;
create function private.stage_student_roster_import(actor_id uuid,target_operator_id uuid,target_branch_id uuid,target_import_key text,submitted_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch private.roster_imports%rowtype;item jsonb;row_no integer;reference text;student_name text;locale text;row_errors text[];
begin
  if not private.actor_can_manage_roster(actor_id,target_operator_id,target_branch_id) then raise exception 'Roster import access denied' using errcode='42501';end if;
  if target_import_key!~'^[a-f0-9]{64}$' or jsonb_typeof(submitted_rows)<>'array' or jsonb_array_length(submitted_rows)>1000 then raise exception 'Invalid roster import payload' using errcode='22023';end if;
  select * into batch from private.roster_imports where operator_id=target_operator_id and import_key=target_import_key;
  if batch.id is not null then
    if batch.branch_id<>target_branch_id then raise exception 'Roster import key scope mismatch' using errcode='42501';end if;
    return private.roster_import_preview(batch.id);
  end if;
  insert into private.roster_imports(operator_id,branch_id,import_key,created_by) values(target_operator_id,target_branch_id,target_import_key,actor_id) returning * into batch;
  for item in select value from jsonb_array_elements(submitted_rows) loop
    row_no:=case when coalesce(item->>'rowNumber','')~'^[0-9]+$' then (item->>'rowNumber')::integer else 2+batch.row_count end;
    reference:=btrim(coalesce(item->>'externalReference',''));student_name:=btrim(coalesce(item->>'displayName',''));locale:=lower(btrim(coalesce(item->>'preferredLocale','')));row_errors:=array[]::text[];
    if row_no<2 then row_errors:=array_append(row_errors,'INVALID_ROW_NUMBER');row_no:=2+batch.row_count;end if;
    if char_length(reference) not between 1 and 120 then row_errors:=array_append(row_errors,'INVALID_EXTERNAL_REFERENCE');end if;
    if char_length(student_name) not between 2 and 120 then row_errors:=array_append(row_errors,'INVALID_DISPLAY_NAME');end if;
    if locale not in ('tr','en','ar') then row_errors:=array_append(row_errors,'INVALID_LOCALE');end if;
    if reference<>'' and exists(select 1 from public.students student where student.operator_id=target_operator_id and student.external_reference=reference) then row_errors:=array_append(row_errors,'EXISTING_EXTERNAL_REFERENCE');end if;
    insert into private.roster_import_rows(import_id,row_number,external_reference,display_name,preferred_locale,errors)
    values(batch.id,row_no,nullif(reference,''),nullif(student_name,''),nullif(locale,''),row_errors);batch.row_count:=batch.row_count+1;
  end loop;
  update private.roster_import_rows row set errors=array_append(row.errors,'DUPLICATE_EXTERNAL_REFERENCE') where row.import_id=batch.id and row.external_reference is not null
    and exists(select 1 from private.roster_import_rows duplicate where duplicate.import_id=row.import_id and duplicate.external_reference=row.external_reference and duplicate.row_number<>row.row_number);
  update private.roster_imports target set row_count=(select count(*) from private.roster_import_rows where import_id=batch.id),
    valid_count=(select count(*) from private.roster_import_rows where import_id=batch.id and cardinality(errors)=0),
    error_count=(select coalesce(sum(cardinality(errors)),0) from private.roster_import_rows where import_id=batch.id) where target.id=batch.id;
  return private.roster_import_preview(batch.id);
end;$$;
create function private.confirm_student_roster_import(actor_id uuid,target_operator_id uuid,target_import_key text,selected_rows integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch private.roster_imports%rowtype;row record;student_id uuid;import_total integer:=0;
begin
  select * into batch from private.roster_imports where operator_id=target_operator_id and import_key=target_import_key for update;
  if batch.id is null or not private.actor_can_manage_roster(actor_id,batch.operator_id,batch.branch_id) then raise exception 'Roster import access denied' using errcode='42501';end if;
  if batch.status='committed' then return private.roster_import_preview(batch.id);end if;
  if batch.status<>'staged' then raise exception 'Roster import is not staged' using errcode='22023';end if;
  selected_rows:=coalesce(selected_rows,array[]::integer[]);
  if cardinality(selected_rows)=0 then raise exception 'Select at least one valid row' using errcode='22023';end if;
  if (select count(*) from private.roster_import_rows where import_id=batch.id and row_number=any(selected_rows))<>cardinality(selected_rows)
    or exists(select 1 from private.roster_import_rows where import_id=batch.id and row_number=any(selected_rows) and cardinality(errors)>0)
    then raise exception 'Selected rows include validation errors' using errcode='22023';end if;
  update private.roster_imports set status='importing' where id=batch.id;
  begin
    for row in select * from private.roster_import_rows where import_id=batch.id and row_number=any(selected_rows) order by row_number loop
      insert into public.students(operator_id,external_reference,display_name,preferred_locale) values(batch.operator_id,row.external_reference,row.display_name,row.preferred_locale) returning id into student_id;
      insert into public.student_branch_history(operator_id,student_id,branch_id) values(batch.operator_id,student_id,batch.branch_id);import_total:=import_total+1;
    end loop;
  exception when others then
    update private.roster_imports set status='failed',completed_at=clock_timestamp(),error_reference=private.current_correlation_id() where id=batch.id;
    return private.roster_import_preview(batch.id);
  end;
  update private.roster_imports set status='committed',imported_count=import_total,completed_at=clock_timestamp() where id=batch.id;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(batch.operator_id,batch.branch_id,actor_id,'operator_staff','student.roster_imported','roster_import',batch.id,
    jsonb_build_object('import_id',batch.id,'imported_count',import_total,'row_count',batch.row_count),private.current_correlation_id());
  return private.roster_import_preview(batch.id);
end;$$;
create function private.cancel_student_roster_import(actor_id uuid,target_operator_id uuid,target_import_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare batch private.roster_imports%rowtype;
begin
  select * into batch from private.roster_imports where operator_id=target_operator_id and import_key=target_import_key for update;
  if batch.id is null or not private.actor_can_manage_roster(actor_id,batch.operator_id,batch.branch_id) then raise exception 'Roster import access denied' using errcode='42501';end if;
  if batch.status='staged' then update private.roster_imports set status='cancelled',completed_at=clock_timestamp() where id=batch.id;end if;
  return private.roster_import_preview(batch.id);
end;$$;

create view public.student_import_runs as select id,operator_id,branch_id,import_key,status,row_count,valid_count,error_count,imported_count,created_by,created_at,completed_at,error_reference
from private.roster_imports batch where private.actor_can_manage_roster(auth.uid(),batch.operator_id,batch.branch_id);
create function public.student_roster_import_preview(target_import_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare batch private.roster_imports%rowtype;begin select * into batch from private.roster_imports where id=target_import_id;
if batch.id is null or not private.actor_can_manage_roster(auth.uid(),batch.operator_id,batch.branch_id) then raise exception 'Roster import access denied' using errcode='42501';end if;
return private.roster_import_preview(batch.id);end;$$;
create function public.stage_student_roster_import(target_operator_id uuid,target_branch_id uuid,target_import_key text,submitted_rows jsonb) returns jsonb language sql security definer set search_path='' as $$select private.stage_student_roster_import(auth.uid(),target_operator_id,target_branch_id,target_import_key,submitted_rows);$$;
create function public.confirm_student_roster_import(target_operator_id uuid,target_import_key text,selected_rows integer[]) returns jsonb language sql security definer set search_path='' as $$select private.confirm_student_roster_import(auth.uid(),target_operator_id,target_import_key,selected_rows);$$;
create function public.cancel_student_roster_import(target_operator_id uuid,target_import_key text) returns jsonb language sql security definer set search_path='' as $$select private.cancel_student_roster_import(auth.uid(),target_operator_id,target_import_key);$$;
create function public.stage_student_roster_import_service(actor_id uuid,target_operator_id uuid,target_branch_id uuid,target_import_key text,submitted_rows jsonb) returns jsonb language sql security definer set search_path='' as $$select private.stage_student_roster_import(actor_id,target_operator_id,target_branch_id,target_import_key,submitted_rows);$$;
create function public.confirm_student_roster_import_service(actor_id uuid,target_operator_id uuid,target_import_key text,selected_rows integer[]) returns jsonb language sql security definer set search_path='' as $$select private.confirm_student_roster_import(actor_id,target_operator_id,target_import_key,selected_rows);$$;
create function public.cancel_student_roster_import_service(actor_id uuid,target_operator_id uuid,target_import_key text) returns jsonb language sql security definer set search_path='' as $$select private.cancel_student_roster_import(actor_id,target_operator_id,target_import_key);$$;
revoke all on public.student_import_runs from anon,authenticated;grant select on public.student_import_runs to authenticated;
revoke all on function public.student_roster_import_preview(uuid),public.stage_student_roster_import(uuid,uuid,text,jsonb),public.confirm_student_roster_import(uuid,text,integer[]),public.cancel_student_roster_import(uuid,text) from public,anon,authenticated;
grant execute on function public.student_roster_import_preview(uuid),public.stage_student_roster_import(uuid,uuid,text,jsonb),public.confirm_student_roster_import(uuid,text,integer[]),public.cancel_student_roster_import(uuid,text) to authenticated;
revoke all on function public.stage_student_roster_import_service(uuid,uuid,uuid,text,jsonb),public.confirm_student_roster_import_service(uuid,uuid,text,integer[]),public.cancel_student_roster_import_service(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.stage_student_roster_import_service(uuid,uuid,uuid,text,jsonb),public.confirm_student_roster_import_service(uuid,uuid,text,integer[]),public.cancel_student_roster_import_service(uuid,uuid,text) to service_role;
revoke all on function private.actor_can_manage_roster(uuid,uuid,uuid),private.roster_import_preview(uuid),
  private.stage_student_roster_import(uuid,uuid,uuid,text,jsonb),private.confirm_student_roster_import(uuid,uuid,text,integer[]),
  private.cancel_student_roster_import(uuid,uuid,text) from public,anon,authenticated,service_role;
