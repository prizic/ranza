create table public.wifi_access (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null,
  branch_id uuid not null,
  encrypted_payload text not null check (
    encrypted_payload ~ '^aes-256-gcm-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
  ),
  key_version integer not null check (key_version > 0),
  mode text not null default 'protected' check (mode in ('protected','public_qr')),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(branch_id,operator_id) references public.branches(id,operator_id) on delete restrict,
  unique(branch_id)
);

create index wifi_access_operator_branch_idx
on public.wifi_access(operator_id,branch_id,mode);

alter table public.wifi_access enable row level security;
revoke all on public.wifi_access from public,anon,authenticated;

create function private.can_view_protected_wifi(target_operator_id uuid,target_branch_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (private.capability_state(target_operator_id,'wifi',target_branch_id)->>'available')::boolean
    and private.capability_state(target_operator_id,'wifi',target_branch_id)->>'mode'='protected'
    and (
      private.has_active_branch_access(target_operator_id,target_branch_id)
      or private.is_active_student_in_branch(target_operator_id,target_branch_id)
    );
$$;

create policy "Protected Wi-Fi ciphertext follows live Branch access"
on public.wifi_access for select to authenticated
using (mode='protected' and private.can_view_protected_wifi(operator_id,branch_id));

create function private.store_protected_wifi(
  target_branch_id uuid,
  protected_payload text,
  protected_key_version integer,
  requested_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_branch public.branches%rowtype; previous_revision integer; saved public.wifi_access%rowtype;
begin
  select * into target_branch from public.branches where id=target_branch_id for update;
  if (select auth.uid()) is null or target_branch.id is null
    or not private.can_manage_student_branch(target_branch.operator_id,target_branch.id) then
    raise exception 'Wi-Fi change denied' using errcode='42501';
  end if;
  if requested_mode<>'protected'
    or private.capability_state(target_branch.operator_id,'wifi',target_branch.id)->>'available'<>'true'
    or private.capability_state(target_branch.operator_id,'wifi',target_branch.id)->>'mode'<>requested_mode then
    raise exception 'Wi-Fi mode unavailable' using errcode='42501';
  end if;
  if protected_key_version<>1 or protected_payload is null
    or protected_payload !~ '^aes-256-gcm-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
    or char_length(protected_payload)>4096 then
    raise exception 'Invalid protected Wi-Fi payload' using errcode='22023';
  end if;
  select revision into previous_revision from public.wifi_access where branch_id=target_branch.id for update;
  insert into public.wifi_access(operator_id,branch_id,encrypted_payload,key_version,mode,updated_by)
  values(target_branch.operator_id,target_branch.id,protected_payload,protected_key_version,requested_mode,auth.uid())
  on conflict(branch_id) do update set encrypted_payload=excluded.encrypted_payload,
    key_version=excluded.key_version,mode=excluded.mode,revision=wifi_access.revision+1,
    updated_by=auth.uid(),updated_at=clock_timestamp()
  returning * into saved;
  insert into public.audit_events(
    operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,
    before_summary,after_summary,correlation_id
  ) values (
    saved.operator_id,saved.branch_id,auth.uid(),'operator_staff','wifi.changed','wifi_access',saved.id,
    case when previous_revision is null then null else jsonb_build_object('revision',previous_revision,'mode','protected','secret','[REDACTED]') end,
    jsonb_build_object('revision',saved.revision,'mode',saved.mode,'secret','[REDACTED]'),
    private.current_correlation_id()
  );
  return jsonb_build_object('branch_id',saved.branch_id,'mode',saved.mode,'revision',saved.revision,'updated_at',saved.updated_at);
end;
$$;

create function private.read_protected_wifi(target_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare saved public.wifi_access%rowtype; branch_name text;
begin
  select * into saved from public.wifi_access
  where branch_id=target_branch_id and mode='protected';
  if saved.id is null or not private.can_view_protected_wifi(saved.operator_id,saved.branch_id) then
    raise exception 'Protected Wi-Fi access denied' using errcode='42501';
  end if;
  select name into branch_name from public.branches where id=saved.branch_id;
  return jsonb_build_object(
    'branch_id',saved.branch_id,'branch_name',branch_name,'encrypted_payload',saved.encrypted_payload,
    'key_version',saved.key_version,'mode',saved.mode,'revision',saved.revision,'updated_at',saved.updated_at
  );
end;
$$;

create function public.store_protected_wifi(
  target_branch_id uuid,protected_payload text,protected_key_version integer,requested_mode text default 'protected'
) returns jsonb language sql security invoker set search_path='' as $$
  select private.store_protected_wifi(target_branch_id,protected_payload,protected_key_version,requested_mode);
$$;

create function public.read_protected_wifi(target_branch_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_protected_wifi(target_branch_id);
$$;

revoke all on function private.can_view_protected_wifi(uuid,uuid),
  private.store_protected_wifi(uuid,text,integer,text),private.read_protected_wifi(uuid),
  public.store_protected_wifi(uuid,text,integer,text),public.read_protected_wifi(uuid)
from public,anon,authenticated;
grant execute on function private.can_view_protected_wifi(uuid,uuid),
  private.store_protected_wifi(uuid,text,integer,text),private.read_protected_wifi(uuid),
  public.store_protected_wifi(uuid,text,integer,text),public.read_protected_wifi(uuid)
to authenticated;
