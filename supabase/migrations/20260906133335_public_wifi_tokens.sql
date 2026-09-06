create table private.wifi_public_tokens (
  branch_id uuid primary key references public.branches(id),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, issued_at timestamptz not null default clock_timestamp(), revoked_at timestamptz
);
create table private.wifi_public_rate_limits (
  network_hash text primary key check(network_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null, attempts integer not null
);
alter table private.wifi_public_tokens enable row level security;
alter table private.wifi_public_rate_limits enable row level security;
revoke all on private.wifi_public_tokens,private.wifi_public_rate_limits from public,anon,authenticated;

create function private.issue_public_wifi_link(target_branch_id uuid,new_token_hash text,exposure_accepted boolean) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare branch public.branches%rowtype; expiry timestamptz; previous boolean;
begin
  select * into branch from public.branches where id=target_branch_id for update;
  if auth.uid() is null or branch.id is null or branch.status<>'active' or not private.is_operator_owner(branch.operator_id)
    or exposure_accepted is distinct from true then raise exception 'Public Wi-Fi change denied' using errcode='42501'; end if;
  if not exists(select 1 from public.wifi_access where branch_id=branch.id) then raise exception 'Wi-Fi details are required' using errcode='22023'; end if;
  -- The standard configuration trigger enforces current entitlements and allowed modes.
  insert into public.feature_configurations(operator_id,branch_id,capability_key,mode)
  values(branch.operator_id,branch.id,'wifi','public_qr')
  on conflict(operator_id,branch_id,capability_key) where branch_id is not null do update set mode=excluded.mode;
  expiry:=clock_timestamp()+interval '90 days';
  select exists(select 1 from private.wifi_public_tokens where branch_id=branch.id) into previous;
  insert into private.wifi_public_tokens(branch_id,token_hash,expires_at)
  values(branch.id,new_token_hash,expiry)
  on conflict(branch_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,issued_at=clock_timestamp(),revoked_at=null;
  update public.wifi_access set mode='public_qr' where branch_id=branch.id;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(branch.operator_id,branch.id,auth.uid(),'operator_staff',case when previous then 'wifi.link_rotated' else 'wifi.link_issued' end,'branch',branch.id,
    jsonb_build_object('mode','public_qr','expires_at',expiry,'exposure_accepted',true),private.current_correlation_id());
  return expiry;
end;
$$;
create function public.issue_public_wifi_link(target_branch_id uuid,new_token_hash text,exposure_accepted boolean) returns timestamptz
language sql security invoker set search_path='' as $$select private.issue_public_wifi_link(target_branch_id,new_token_hash,exposure_accepted);$$;

create function private.revoke_public_wifi_link(target_branch_id uuid,restore_protected boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare branch public.branches%rowtype;
begin
  select * into branch from public.branches where id=target_branch_id for update;
  if auth.uid() is null or branch.id is null or not private.is_operator_owner(branch.operator_id) then raise exception 'Public Wi-Fi change denied' using errcode='42501'; end if;
  update private.wifi_public_tokens set revoked_at=clock_timestamp() where branch_id=branch.id;
  if restore_protected then
    insert into public.feature_configurations(operator_id,branch_id,capability_key,mode)
    values(branch.operator_id,branch.id,'wifi','protected')
    on conflict(operator_id,branch_id,capability_key) where branch_id is not null do update set mode=excluded.mode;
    update public.wifi_access set mode='protected' where branch_id=branch.id;
  end if;
  insert into public.audit_events(operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,after_summary,correlation_id)
  values(branch.operator_id,branch.id,auth.uid(),'operator_staff','wifi.link_revoked','branch',branch.id,
    jsonb_build_object('restored_protected',restore_protected),private.current_correlation_id());
end;
$$;
create function public.revoke_public_wifi_link(target_branch_id uuid,restore_protected boolean default false) returns void
language sql security invoker set search_path='' as $$select private.revoke_public_wifi_link(target_branch_id,restore_protected);$$;
revoke all on function private.issue_public_wifi_link(uuid,text,boolean),public.issue_public_wifi_link(uuid,text,boolean),private.revoke_public_wifi_link(uuid,boolean),public.revoke_public_wifi_link(uuid,boolean) from public,anon;
grant execute on function private.issue_public_wifi_link(uuid,text,boolean),public.issue_public_wifi_link(uuid,text,boolean),private.revoke_public_wifi_link(uuid,boolean),public.revoke_public_wifi_link(uuid,boolean) to authenticated;

-- Called only by the server resolver using the service key. No customer-table
-- anonymous policy or public execution privilege is introduced.
create function public.resolve_public_wifi(token_hash text,network_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare attempts integer; payload jsonb;
begin
  if resolve_public_wifi.network_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  delete from private.wifi_public_rate_limits where window_start<clock_timestamp()-interval '1 day';
  insert into private.wifi_public_rate_limits(network_hash,window_start,attempts)
  values(resolve_public_wifi.network_hash,clock_timestamp(),1)
  on conflict on constraint wifi_public_rate_limits_pkey do update set
    attempts=case when wifi_public_rate_limits.window_start<clock_timestamp()-interval '1 minute' then 1 else wifi_public_rate_limits.attempts+1 end,
    window_start=case when wifi_public_rate_limits.window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else wifi_public_rate_limits.window_start end
  returning wifi_public_rate_limits.attempts into attempts;
  if attempts>120 or resolve_public_wifi.token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  select jsonb_build_object('branch_id',w.branch_id,'encrypted_payload',w.encrypted_payload,'key_version',w.key_version) into payload
  from private.wifi_public_tokens t join public.branches b on b.id=t.branch_id
  join public.operators o on o.id=b.operator_id join public.wifi_access w on w.branch_id=b.id
  where t.token_hash=resolve_public_wifi.token_hash and t.revoked_at is null and t.expires_at>clock_timestamp()
    and b.status='active' and o.status='active' and w.mode='public_qr'
    and private.capability_state(o.id,'wifi',b.id)->>'available'='true'
    and private.capability_state(o.id,'wifi',b.id)->>'mode'='public_qr';
  return payload;
end;
$$;
revoke all on function public.resolve_public_wifi(text,text) from public,anon,authenticated;
grant execute on function public.resolve_public_wifi(text,text) to service_role;

create function private.revoke_wifi_link_on_mode_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.capability_key='wifi' and new.mode<>'public_qr' then
    update private.wifi_public_tokens t set revoked_at=clock_timestamp()
    from public.branches b where b.id=t.branch_id and b.operator_id=new.operator_id
      and (new.branch_id is null or b.id=new.branch_id) and t.revoked_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.revoke_wifi_link_on_mode_change() from public,anon,authenticated;
create trigger wifi_link_mode_revocation after insert or update of mode on public.feature_configurations
for each row execute function private.revoke_wifi_link_on_mode_change();
