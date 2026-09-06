create table public.announcements (
  id uuid primary key default gen_random_uuid(), operator_id uuid not null references public.operators(id),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  target_scope text not null check(target_scope in ('operator','branches')),
  source_locale text not null check(source_locale in ('tr','en','ar')),
  source_content text not null check(char_length(btrim(source_content)) between 1 and 10000),
  draft_translations jsonb not null default '{}'::jsonb,
  current_revision integer not null default 0, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(), archived_at timestamptz,
  unique(id,operator_id)
);
create table public.announcement_targets (
  announcement_id uuid not null, operator_id uuid not null, branch_id uuid not null,
  primary key(announcement_id,branch_id),
  foreign key(announcement_id,operator_id) references public.announcements(id,operator_id),
  foreign key(branch_id,operator_id) references public.branches(id,operator_id)
);
create table public.announcement_revisions (
  id uuid primary key default gen_random_uuid(), announcement_id uuid not null, operator_id uuid not null,
  revision_number integer not null check(revision_number>0),
  source_locale text not null check(source_locale in ('tr','en','ar')),
  source_content text not null check(char_length(btrim(source_content)) between 1 and 10000),
  published_by uuid not null references auth.users(id), published_at timestamptz not null default clock_timestamp(),
  unique(announcement_id,revision_number), unique(id,operator_id),
  foreign key(announcement_id,operator_id) references public.announcements(id,operator_id)
);
create table public.announcement_translations (
  revision_id uuid not null, operator_id uuid not null, locale text not null check(locale in ('tr','en','ar')),
  content text not null check(char_length(btrim(content)) between 1 and 10000),
  primary key(revision_id,locale), foreign key(revision_id,operator_id) references public.announcement_revisions(id,operator_id)
);
create table public.announcement_recipients (
  revision_id uuid not null, operator_id uuid not null, student_id uuid not null, branch_id uuid not null,
  resolved_at timestamptz not null default clock_timestamp(), primary key(revision_id,student_id),
  unique(revision_id,student_id,operator_id),
  foreign key(revision_id,operator_id) references public.announcement_revisions(id,operator_id),
  foreign key(student_id,operator_id) references public.students(id,operator_id),
  foreign key(branch_id,operator_id) references public.branches(id,operator_id)
);
create table public.announcement_acknowledgements (
  revision_id uuid not null, student_id uuid not null, operator_id uuid not null,
  acknowledged_at timestamptz not null default clock_timestamp(), primary key(revision_id,student_id),
  foreign key(revision_id,student_id,operator_id) references public.announcement_recipients(revision_id,student_id,operator_id)
);
create index announcements_operator_idx on public.announcements(operator_id,status);
create index announcement_recipients_student_idx on public.announcement_recipients(student_id,revision_id);
create index announcement_targets_branch_idx on public.announcement_targets(branch_id,announcement_id);

create function private.can_manage_announcement(target_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.announcements a where a.id=target_id
    and private.has_active_operator_access(a.operator_id)
    and private.capability_enabled(a.operator_id,'announcements')
    and case when a.target_scope='operator' then exists(select 1 from public.operator_memberships m
      where m.operator_id=a.operator_id and m.auth_user_id=auth.uid() and m.status='active'
        and m.access_scope='operator_wide' and m.role in ('owner','manager'))
    else exists(select 1 from public.announcement_targets t where t.announcement_id=a.id)
      and not exists(select 1 from public.announcement_targets t where t.announcement_id=a.id
        and not private.can_manage_student_branch(a.operator_id,t.branch_id)) end);
$$;
create function private.announcement_recipient_active(target_announcement_id uuid,target_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.announcements a join public.students s on s.operator_id=a.operator_id
    join public.operators o on o.id=a.operator_id
    join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
    join public.branches b on b.id=h.branch_id
    where a.id=target_announcement_id and s.id=target_student_id and s.status='active'
      and o.status='active' and b.status='active' and h.started_at<=statement_timestamp()
      and private.capability_enabled(a.operator_id,'announcements',b.id)
      and (a.target_scope='operator' or exists(select 1 from public.announcement_targets t where t.announcement_id=a.id and t.branch_id=b.id)));
$$;
create function private.can_read_announcement_revision(target_revision_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.announcement_revisions r join public.announcements a on a.id=r.announcement_id
    where r.id=target_revision_id and (private.can_manage_announcement(a.id) or
      (a.status='published' and a.current_revision=r.revision_number
      and exists(select 1 from public.announcement_recipients recipient where recipient.revision_id=r.id
        and recipient.student_id=private.current_student_id()
        and private.announcement_recipient_active(a.id,recipient.student_id)))));
$$;
revoke all on function private.can_manage_announcement(uuid),private.announcement_recipient_active(uuid,uuid),private.can_read_announcement_revision(uuid) from public,anon;
grant execute on function private.can_manage_announcement(uuid),private.announcement_recipient_active(uuid,uuid),private.can_read_announcement_revision(uuid) to authenticated;

alter table public.announcements enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.announcement_revisions enable row level security;
alter table public.announcement_translations enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.announcement_acknowledgements enable row level security;
revoke all on public.announcements,public.announcement_targets,public.announcement_revisions,public.announcement_translations,public.announcement_recipients,public.announcement_acknowledgements from anon,authenticated;
grant select on public.announcements,public.announcement_targets,public.announcement_revisions,public.announcement_translations,public.announcement_recipients,public.announcement_acknowledgements to authenticated;
create policy announcement_staff on public.announcements for select to authenticated using(private.can_manage_announcement(id));
create policy announcement_targets_staff on public.announcement_targets for select to authenticated using(private.can_manage_announcement(announcement_id));
create policy announcement_revision_read on public.announcement_revisions for select to authenticated using(private.can_read_announcement_revision(id));
create policy announcement_translation_read on public.announcement_translations for select to authenticated using(private.can_read_announcement_revision(revision_id));
create policy announcement_recipient_read on public.announcement_recipients for select to authenticated using(
  exists(select 1 from public.announcement_revisions r where r.id=revision_id and private.can_manage_announcement(r.announcement_id))
  or (student_id=private.current_student_id() and private.can_read_announcement_revision(revision_id)));
create policy announcement_ack_read on public.announcement_acknowledgements for select to authenticated using(
  exists(select 1 from public.announcement_revisions r where r.id=revision_id and private.can_manage_announcement(r.announcement_id))
  or (student_id=private.current_student_id() and private.can_read_announcement_revision(revision_id)));

create function private.save_announcement_draft(target_operator_id uuid,target_id uuid,target_scope text,target_branches uuid[],source_locale text,source_content text,translations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid; branch_id uuid;
begin
  if auth.uid() is null or not private.has_active_operator_access(target_operator_id)
    or not private.capability_enabled(target_operator_id,'announcements') then raise exception 'Announcement access denied' using errcode='42501'; end if;
  if target_scope not in ('operator','branches') or source_locale not in ('tr','en','ar') or source_locale is null
    or source_content is null or char_length(btrim(source_content)) not between 1 and 10000
    or jsonb_typeof(translations) is distinct from 'object' then raise exception 'Invalid Announcement draft' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(translations) t where t.key not in ('tr','en','ar') or t.key=source_locale
    or jsonb_typeof(t.value)<>'string' or char_length(btrim(t.value#>>'{}')) not between 1 and 10000) then
    raise exception 'Invalid translations' using errcode='22023'; end if;
  if target_scope='operator' then
    if coalesce(cardinality(target_branches),0)<>0 or not exists(select 1 from public.operator_memberships m
      where m.operator_id=target_operator_id and m.auth_user_id=auth.uid() and m.status='active'
        and m.access_scope='operator_wide' and m.role in ('owner','manager')) then raise exception 'Announcement access denied' using errcode='42501'; end if;
  else
    if coalesce(cardinality(target_branches),0)=0 then raise exception 'Select Branch targets' using errcode='22023'; end if;
    foreach branch_id in array target_branches loop
      if branch_id is null or not private.can_manage_student_branch(target_operator_id,branch_id)
        or not private.capability_enabled(target_operator_id,'announcements',branch_id) then raise exception 'Announcement access denied' using errcode='42501'; end if;
    end loop;
  end if;
  if target_id is null then
    insert into public.announcements(operator_id,target_scope,source_locale,source_content,draft_translations,created_by)
    values(target_operator_id,target_scope,source_locale,btrim(source_content),translations,auth.uid()) returning id into saved_id;
  else
    perform 1 from public.announcements where id=target_id and operator_id=target_operator_id and status='draft' for update;
    if not found or not private.can_manage_announcement(target_id) then raise exception 'Announcement access denied' using errcode='42501'; end if;
    update public.announcements a set target_scope=save_announcement_draft.target_scope,source_locale=save_announcement_draft.source_locale,
      source_content=btrim(save_announcement_draft.source_content),draft_translations=translations where a.id=target_id;
    saved_id:=target_id;
    delete from public.announcement_targets where announcement_id=saved_id;
  end if;
  insert into public.announcement_targets(announcement_id,operator_id,branch_id)
  select saved_id,target_operator_id,branch from unnest(coalesce(target_branches,'{}'::uuid[])) branch on conflict do nothing;
  return saved_id;
end;
$$;
create function public.save_announcement_draft(target_operator_id uuid,target_id uuid,target_scope text,target_branches uuid[],source_locale text,source_content text,translations jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.save_announcement_draft(target_operator_id,target_id,target_scope,target_branches,source_locale,source_content,translations);$$;

create function private.publish_announcement(target_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.announcements%rowtype; revision_id uuid;
begin
  select * into a from public.announcements where id=target_id for update;
  if not private.can_manage_announcement(target_id) then raise exception 'Announcement access denied' using errcode='42501'; end if;
  if a.status<>'draft' then raise exception 'Only Drafts can be published' using errcode='55000'; end if;
  insert into public.announcement_revisions(announcement_id,operator_id,revision_number,source_locale,source_content,published_by)
  values(a.id,a.operator_id,1,a.source_locale,a.source_content,auth.uid()) returning id into revision_id;
  insert into public.announcement_translations(revision_id,operator_id,locale,content)
  select revision_id,a.operator_id,key,value from jsonb_each_text(a.draft_translations);
  insert into public.announcement_recipients(revision_id,operator_id,student_id,branch_id)
  select revision_id,a.operator_id,s.id,h.branch_id from public.students s
  join public.student_branch_history h on h.student_id=s.id and h.ended_at is null
  where s.operator_id=a.operator_id and private.announcement_recipient_active(a.id,s.id);
  update public.announcements set status='published',current_revision=1 where id=a.id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(a.operator_id,auth.uid(),'operator_staff','announcement.published','announcement',a.id,
    jsonb_build_object('revision',1,'target_scope',a.target_scope),private.current_correlation_id());
  return revision_id;
end;
$$;
create function public.publish_announcement(target_id uuid) returns uuid
language sql security invoker set search_path='' as $$select private.publish_announcement(target_id);$$;

create function private.archive_announcement(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.announcements%rowtype;
begin
  select * into a from public.announcements where id=target_id for update;
  if not private.can_manage_announcement(target_id) then raise exception 'Announcement access denied' using errcode='42501'; end if;
  if a.status='archived' then return; end if;
  update public.announcements set status='archived',archived_at=clock_timestamp() where id=a.id;
  insert into public.audit_events(operator_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(a.operator_id,auth.uid(),'operator_staff','announcement.archived','announcement',a.id,'{}'::jsonb,private.current_correlation_id());
end;
$$;
create function public.archive_announcement(target_id uuid) returns void
language sql security invoker set search_path='' as $$select private.archive_announcement(target_id);$$;

create function private.acknowledge_announcement(target_revision_id uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare r public.announcement_revisions%rowtype; current_student_id uuid; recorded_at timestamptz;
begin
  select * into r from public.announcement_revisions where id=target_revision_id;
  perform 1 from public.announcements where id=r.announcement_id for update;
  current_student_id:=private.current_student_id();
  if current_student_id is null or not private.can_read_announcement_revision(target_revision_id)
    or not exists(select 1 from public.announcement_recipients recipient where recipient.revision_id=target_revision_id and recipient.student_id=current_student_id) then
    raise exception 'Acknowledgment denied' using errcode='42501'; end if;
  insert into public.announcement_acknowledgements(revision_id,student_id,operator_id)
  values(r.id,current_student_id,r.operator_id) on conflict do nothing;
  select a.acknowledged_at into recorded_at from public.announcement_acknowledgements a
  where a.revision_id=r.id and a.student_id=current_student_id;
  return recorded_at;
end;
$$;
create function public.acknowledge_announcement(target_revision_id uuid) returns timestamptz
language sql security invoker set search_path='' as $$select private.acknowledge_announcement(target_revision_id);$$;

revoke all on function private.save_announcement_draft(uuid,uuid,text,uuid[],text,text,jsonb),public.save_announcement_draft(uuid,uuid,text,uuid[],text,text,jsonb),private.publish_announcement(uuid),public.publish_announcement(uuid),private.archive_announcement(uuid),public.archive_announcement(uuid),private.acknowledge_announcement(uuid),public.acknowledge_announcement(uuid) from public,anon;
grant execute on function private.save_announcement_draft(uuid,uuid,text,uuid[],text,text,jsonb),public.save_announcement_draft(uuid,uuid,text,uuid[],text,text,jsonb),private.publish_announcement(uuid),public.publish_announcement(uuid),private.archive_announcement(uuid),public.archive_announcement(uuid),private.acknowledge_announcement(uuid),public.acknowledge_announcement(uuid) to authenticated;

create view public.announcement_recipient_status with(security_invoker=true) as
select recipient.revision_id,recipient.student_id,recipient.operator_id,s.display_name,recipient.resolved_at,ack.acknowledged_at,
  case when not private.announcement_recipient_active(r.announcement_id,s.id) then 'inactive'
    when ack.acknowledged_at is not null then 'acknowledged' else 'unacknowledged' end as status
from public.announcement_recipients recipient join public.students s on s.id=recipient.student_id
join public.announcement_revisions r on r.id=recipient.revision_id
left join public.announcement_acknowledgements ack on ack.revision_id=recipient.revision_id and ack.student_id=recipient.student_id;
grant select on public.announcement_recipient_status to authenticated;
create view public.announcement_followup_counts with(security_invoker=true) as
select revision_id,operator_id,count(*) filter(where status='acknowledged') as acknowledged,
  count(*) filter(where status='unacknowledged') as unacknowledged,count(*) filter(where status='inactive') as inactive
from public.announcement_recipient_status group by revision_id,operator_id;
grant select on public.announcement_followup_counts to authenticated;

-- Return only the current Student's authorized publication, with the Operator's
-- current default locale. No broad Operator-table read privilege is necessary.
create function private.student_announcement_feed() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(item order by published_at desc),'[]'::jsonb) from (
    select r.published_at,jsonb_build_object('id',r.id,'source_locale',r.source_locale,'source_content',r.source_content,
      'operator_locale',o.default_locale,'published_at',r.published_at,'acknowledged_at',ack.acknowledged_at,
      'translations',coalesce((select jsonb_object_agg(t.locale,t.content) from public.announcement_translations t where t.revision_id=r.id),'{}'::jsonb)) item
    from public.announcement_revisions r join public.operators o on o.id=r.operator_id
    join public.announcement_recipients recipient on recipient.revision_id=r.id and recipient.student_id=private.current_student_id()
    left join public.announcement_acknowledgements ack on ack.revision_id=r.id and ack.student_id=recipient.student_id
    where private.can_read_announcement_revision(r.id)
  ) authorized;
$$;
create function public.student_announcement_feed() returns jsonb
language sql security invoker set search_path='' as $$select private.student_announcement_feed();$$;
revoke all on function private.student_announcement_feed(),public.student_announcement_feed() from public,anon;
grant execute on function private.student_announcement_feed(),public.student_announcement_feed() to authenticated;
