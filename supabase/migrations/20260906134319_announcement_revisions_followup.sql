alter table public.announcement_revisions add column target_scope text not null default 'branches' check(target_scope in ('operator','branches'));
alter table public.announcement_recipients add column display_name text not null default '';
update public.announcement_revisions r set target_scope=a.target_scope from public.announcements a where a.id=r.announcement_id;
update public.announcement_recipients r set display_name=s.display_name from public.students s where s.id=r.student_id;
create table public.announcement_revision_targets (
  revision_id uuid not null,operator_id uuid not null,branch_id uuid not null,
  primary key(revision_id,branch_id),
  foreign key(revision_id,operator_id) references public.announcement_revisions(id,operator_id),
  foreign key(branch_id,operator_id) references public.branches(id,operator_id)
);
insert into public.announcement_revision_targets(revision_id,operator_id,branch_id)
select r.id,r.operator_id,t.branch_id from public.announcement_revisions r join public.announcement_targets t on t.announcement_id=r.announcement_id;
alter table public.announcement_revision_targets enable row level security;
revoke all on public.announcement_revision_targets from public,anon,authenticated;
grant select on public.announcement_revision_targets to authenticated;

create function private.snapshot_announcement_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_when='BEFORE' then
    select target_scope into new.target_scope from public.announcements where id=new.announcement_id;
  else
    insert into public.announcement_revision_targets(revision_id,operator_id,branch_id)
    select new.id,new.operator_id,branch_id from public.announcement_targets where announcement_id=new.announcement_id;
  end if;
  return new;
end;
$$;
create trigger announcement_revision_scope before insert on public.announcement_revisions for each row execute function private.snapshot_announcement_revision();
create trigger announcement_revision_targets after insert on public.announcement_revisions for each row execute function private.snapshot_announcement_revision();
create function private.snapshot_announcement_recipient_name() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select display_name into new.display_name from public.students where id=new.student_id and operator_id=new.operator_id;
  return new;
end;
$$;
create trigger announcement_recipient_name before insert on public.announcement_recipients for each row execute function private.snapshot_announcement_recipient_name();

create function private.can_manage_announcement_revision(target_revision_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.announcement_revisions r where r.id=target_revision_id
    and private.has_active_operator_access(r.operator_id) and private.capability_enabled(r.operator_id,'announcements')
    and case when r.target_scope='operator' then exists(select 1 from public.operator_memberships m
      where m.operator_id=r.operator_id and m.auth_user_id=auth.uid() and m.status='active' and m.access_scope='operator_wide' and m.role in ('owner','manager'))
    else exists(select 1 from public.announcement_revision_targets t where t.revision_id=r.id)
      and not exists(select 1 from public.announcement_revision_targets t where t.revision_id=r.id
        and not private.can_manage_student_branch(r.operator_id,t.branch_id)) end);
$$;
create function private.revision_recipient_active(target_revision_id uuid,target_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.announcement_revisions r join public.students s on s.operator_id=r.operator_id
    join public.operators o on o.id=r.operator_id join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
    join public.branches b on b.id=h.branch_id where r.id=target_revision_id and s.id=target_student_id and s.status='active'
    and o.status='active' and b.status='active' and h.started_at<=statement_timestamp()
    and private.capability_enabled(r.operator_id,'announcements',b.id)
    and (r.target_scope='operator' or exists(select 1 from public.announcement_revision_targets t where t.revision_id=r.id and t.branch_id=b.id)));
$$;
create or replace function private.can_read_announcement_revision(target_revision_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_manage_announcement_revision(target_revision_id) or exists(
    select 1 from public.announcement_revisions r join public.announcements a on a.id=r.announcement_id
    join public.announcement_recipients recipient on recipient.revision_id=r.id and recipient.student_id=private.current_student_id()
    where r.id=target_revision_id and a.status='published' and a.current_revision=r.revision_number
      and private.revision_recipient_active(r.id,recipient.student_id));
$$;
revoke all on function private.can_manage_announcement_revision(uuid),private.revision_recipient_active(uuid,uuid),private.snapshot_announcement_revision(),private.snapshot_announcement_recipient_name() from public,anon,authenticated;
grant execute on function private.can_manage_announcement_revision(uuid),private.revision_recipient_active(uuid,uuid) to authenticated;
create policy revision_targets_read on public.announcement_revision_targets for select to authenticated using(private.can_manage_announcement_revision(revision_id));
drop policy announcement_recipient_read on public.announcement_recipients;
create policy announcement_recipient_read on public.announcement_recipients for select to authenticated using(
  private.can_manage_announcement_revision(revision_id) or (student_id=private.current_student_id() and private.can_read_announcement_revision(revision_id)));
drop policy announcement_ack_read on public.announcement_acknowledgements;
create policy announcement_ack_read on public.announcement_acknowledgements for select to authenticated using(
  private.can_manage_announcement_revision(revision_id) or (student_id=private.current_student_id() and private.can_read_announcement_revision(revision_id)));
create or replace view public.announcement_recipient_status with(security_invoker=true) as
select recipient.revision_id,recipient.student_id,recipient.operator_id,recipient.display_name,recipient.resolved_at,ack.acknowledged_at,
  case when not private.revision_recipient_active(recipient.revision_id,recipient.student_id) then 'inactive'
    when ack.acknowledged_at is not null then 'acknowledged' else 'unacknowledged' end as status
from public.announcement_recipients recipient
left join public.announcement_acknowledgements ack on ack.revision_id=recipient.revision_id and ack.student_id=recipient.student_id;

create function private.revise_announcement(target_id uuid,target_scope text,target_branches uuid[],source_locale text,source_content text,translations jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.announcements%rowtype; draft_id uuid; revision_id uuid; next_revision integer; old_targets uuid[]; new_targets uuid[];
begin
  select * into a from public.announcements where id=target_id for update;
  if a.id is null or not private.can_manage_announcement(a.id) then raise exception 'Announcement access denied' using errcode='42501'; end if;
  if a.status<>'published' then raise exception 'Only published Announcements can be revised' using errcode='55000'; end if;
  -- Reuse the Draft validator for source/translation sizes and every new target.
  -- This temporary Draft exists only within this atomic transaction.
  draft_id:=private.save_announcement_draft(a.operator_id,null,target_scope,target_branches,source_locale,source_content,translations);
  select coalesce(array_agg(t.branch_id order by t.branch_id),'{}'::uuid[]) into old_targets from public.announcement_targets t where t.announcement_id=a.id;
  select coalesce(array_agg(t.branch_id order by t.branch_id),'{}'::uuid[]) into new_targets from public.announcement_targets t where t.announcement_id=draft_id;
  if a.target_scope=revise_announcement.target_scope and a.source_locale=revise_announcement.source_locale
    and a.source_content=btrim(revise_announcement.source_content) and a.draft_translations=translations and old_targets=new_targets then
    raise exception 'A material change is required' using errcode='22023'; end if;
  next_revision:=a.current_revision+1;
  update public.announcements set target_scope=revise_announcement.target_scope,source_locale=revise_announcement.source_locale,
    source_content=btrim(revise_announcement.source_content),draft_translations=translations,current_revision=next_revision where id=a.id;
  delete from public.announcement_targets where announcement_id=a.id;
  insert into public.announcement_targets(announcement_id,operator_id,branch_id)
  select a.id,a.operator_id,t.branch_id from public.announcement_targets t where t.announcement_id=draft_id;
  delete from public.announcement_targets where announcement_id=draft_id;
  delete from public.announcements where id=draft_id;
  insert into public.announcement_revisions(announcement_id,operator_id,revision_number,source_locale,source_content,published_by)
  values(a.id,a.operator_id,next_revision,revise_announcement.source_locale,btrim(revise_announcement.source_content),auth.uid()) returning id into revision_id;
  insert into public.announcement_translations(revision_id,operator_id,locale,content)
  select revision_id,a.operator_id,key,value from jsonb_each_text(translations);
  insert into public.announcement_recipients(revision_id,operator_id,student_id,branch_id)
  select revision_id,a.operator_id,s.id,h.branch_id from public.students s join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
  where s.operator_id=a.operator_id and private.revision_recipient_active(revision_id,s.id);
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,before_summary,after_summary,correlation_id)
  values(a.operator_id,auth.uid(),'operator_staff','announcement.revised','announcement',a.id,
    jsonb_build_object('revision',a.current_revision,'scope',a.target_scope,'targets',old_targets),
    jsonb_build_object('revision',next_revision,'scope',revise_announcement.target_scope,'targets',new_targets,'content_changed',a.source_content is distinct from btrim(revise_announcement.source_content) or a.draft_translations is distinct from translations or a.source_locale is distinct from revise_announcement.source_locale),private.current_correlation_id());
  return revision_id;
end;
$$;
create function public.revise_announcement(target_id uuid,target_scope text,target_branches uuid[],source_locale text,source_content text,translations jsonb) returns uuid
language sql security invoker set search_path='' as $$select private.revise_announcement(target_id,target_scope,target_branches,source_locale,source_content,translations);$$;

create function private.announcement_followup(target_revision_id uuid,target_status text default 'all',record_export boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.announcement_revisions%rowtype; a public.announcements%rowtype; recipients jsonb;
begin
  if not private.can_manage_announcement_revision(target_revision_id) then raise exception 'Announcement follow-up denied' using errcode='42501'; end if;
  if target_status is null or target_status not in ('all','acknowledged','unacknowledged','inactive') then raise exception 'Invalid follow-up filter' using errcode='22023'; end if;
  select * into r from public.announcement_revisions where id=target_revision_id;
  select * into a from public.announcements where id=r.announcement_id;
  select coalesce(jsonb_agg(jsonb_build_object('student_id',s.student_id,'display_name',s.display_name,'status',s.status,'resolved_at',s.resolved_at,'acknowledged_at',s.acknowledged_at) order by s.display_name,s.student_id),'[]'::jsonb)
  into recipients from public.announcement_recipient_status s where s.revision_id=r.id and (target_status='all' or s.status=target_status);
  if record_export then
    insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
    values(r.operator_id,auth.uid(),'operator_staff','announcement.followup_exported','announcement',a.id,
      jsonb_build_object('revision',r.revision_number,'filter',target_status,'count',jsonb_array_length(recipients)),private.current_correlation_id());
  end if;
  return jsonb_build_object('revision_number',r.revision_number,'published_at',r.published_at,'archived_at',a.archived_at,
    'source_locale',r.source_locale,'source_content',r.source_content,'target_scope',r.target_scope,'recipients',recipients);
end;
$$;
create function public.announcement_followup(target_revision_id uuid,target_status text default 'all',record_export boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select private.announcement_followup(target_revision_id,target_status,record_export);$$;
revoke all on function private.revise_announcement(uuid,text,uuid[],text,text,jsonb),public.revise_announcement(uuid,text,uuid[],text,text,jsonb),private.announcement_followup(uuid,text,boolean),public.announcement_followup(uuid,text,boolean) from public,anon;
grant execute on function private.revise_announcement(uuid,text,uuid[],text,text,jsonb),public.revise_announcement(uuid,text,uuid[],text,text,jsonb),private.announcement_followup(uuid,text,boolean),public.announcement_followup(uuid,text,boolean) to authenticated;

create function private.guard_announcement_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Announcement history is immutable' using errcode='55000'; end;
$$;
create trigger immutable_announcement_revision before update or delete on public.announcement_revisions for each row execute function private.guard_announcement_history();
create trigger immutable_announcement_translation before update or delete on public.announcement_translations for each row execute function private.guard_announcement_history();
create trigger immutable_announcement_targets before update or delete on public.announcement_revision_targets for each row execute function private.guard_announcement_history();
create trigger immutable_announcement_recipients before update or delete on public.announcement_recipients for each row execute function private.guard_announcement_history();
create trigger immutable_announcement_acknowledgements before update or delete on public.announcement_acknowledgements for each row execute function private.guard_announcement_history();
