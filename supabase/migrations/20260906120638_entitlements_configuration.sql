create table public.feature_catalog (
  capability_key text not null,
  version integer not null check (version > 0),
  scopes text[] not null check (scopes <@ array['operator','branch'] and 'operator' = any(scopes)),
  modes text[] not null check (cardinality(modes) > 0),
  default_mode text not null check (default_mode = any(modes)),
  value_ranges jsonb not null default '{}' check (jsonb_typeof(value_ranges) = 'object'),
  default_values jsonb not null default '{}' check (jsonb_typeof(default_values) = 'object'),
  primary key (capability_key, version)
);
insert into public.feature_catalog (capability_key,version,scopes,modes,default_mode,value_ranges,default_values) values
('attendance',1,array['operator','branch'],array['standard'],'standard','{"cutoffMinute":{"min":0,"max":1439}}','{"cutoffMinute":1320}'),
('meals',1,array['operator','branch'],array['standard'],'standard','{"cutoffMinute":{"min":0,"max":1439}}','{"cutoffMinute":1200}'),
('announcements',1,array['operator','branch'],array['standard'],'standard','{}','{}'),
('balance',1,array['operator'],array['standard'],'standard','{}','{}'),
('wifi',1,array['operator','branch'],array['protected','public_qr'],'protected','{}','{}');

create table public.operator_entitlements (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete restrict,
  capability_key text not null,
  catalog_version integer not null,
  status text not null default 'granted' check (status in ('granted','revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz check (ends_at > starts_at),
  allowed_modes text[] not null check (cardinality(allowed_modes) > 0),
  constraints jsonb not null default '{}' check (jsonb_typeof(constraints) = 'object'),
  commercial_reference text check (char_length(commercial_reference) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, capability_key),
  foreign key (capability_key,catalog_version) references public.feature_catalog(capability_key,version) on delete restrict
);
create table public.feature_configurations (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators(id) on delete restrict,
  branch_id uuid,
  capability_key text not null,
  mode text not null,
  values jsonb not null default '{}' check (jsonb_typeof(values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id,operator_id) references public.branches(id,operator_id) on delete restrict,
  foreign key (operator_id,capability_key) references public.operator_entitlements(operator_id,capability_key) on delete restrict
);
create unique index operator_feature_configuration_unique on public.feature_configurations(operator_id,capability_key) where branch_id is null;
create unique index branch_feature_configuration_unique on public.feature_configurations(operator_id,branch_id,capability_key) where branch_id is not null;

alter table public.feature_catalog enable row level security;
alter table public.operator_entitlements enable row level security;
alter table public.feature_configurations enable row level security;
revoke all on public.feature_catalog, public.operator_entitlements, public.feature_configurations from anon, authenticated;
grant select on public.feature_catalog, public.operator_entitlements, public.feature_configurations to authenticated;
grant insert on public.operator_entitlements, public.feature_configurations to authenticated;
grant update (catalog_version,status,starts_at,ends_at,allowed_modes,constraints,commercial_reference) on public.operator_entitlements to authenticated;
grant update (mode,values) on public.feature_configurations to authenticated;
create policy "Authenticated catalog inspection" on public.feature_catalog for select to authenticated using (true);
create policy "Entitlement inspection" on public.operator_entitlements for select to authenticated using ((select private.is_platform_admin()) or private.has_active_operator_access(operator_id));
create policy "Admin entitlement grants" on public.operator_entitlements for insert to authenticated with check ((select private.is_platform_admin()));
create policy "Admin entitlement changes" on public.operator_entitlements for update to authenticated using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
create policy "Scoped configuration inspection" on public.feature_configurations for select to authenticated using (
  (select private.is_platform_admin()) or
  (branch_id is null and private.has_active_operator_access(operator_id)) or
  (branch_id is not null and private.has_active_branch_access(operator_id,branch_id))
);
create policy "Owners configure entitled features" on public.feature_configurations for insert to authenticated with check (private.is_operator_owner(operator_id));
create policy "Owners update feature settings" on public.feature_configurations for update to authenticated using (private.is_operator_owner(operator_id)) with check (private.is_operator_owner(operator_id));

create function private.configuration_values_valid(ranges jsonb, restrictions jsonb, configured jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item record; low numeric; high numeric; value numeric;
begin
  if jsonb_typeof(configured) <> 'object' then return false; end if;
  for item in select * from jsonb_each(configured) loop
    if not ranges ? item.key or jsonb_typeof(item.value) <> 'number' then return false; end if;
    value := item.value::text::numeric;
    low := greatest((ranges->item.key->>'min')::numeric, (restrictions->item.key->>'min')::numeric);
    high := least((ranges->item.key->>'max')::numeric, (restrictions->item.key->>'max')::numeric);
    if value <> trunc(value) or value < low or value > high then return false; end if;
  end loop;
  return true;
end; $$;

create function private.validate_entitlement()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare catalog public.feature_catalog; item record; range_min numeric; range_max numeric;
begin
  select * into strict catalog from public.feature_catalog where capability_key=new.capability_key and version=new.catalog_version;
  if not new.allowed_modes <@ catalog.modes or array_position(new.allowed_modes,null) is not null then raise exception 'Unsupported entitlement modes' using errcode='22023'; end if;
  for item in select * from jsonb_each(new.constraints) loop
    if not catalog.value_ranges ? item.key or jsonb_typeof(item.value) <> 'object'
       or jsonb_typeof(item.value->'min') is distinct from 'number' or jsonb_typeof(item.value->'max') is distinct from 'number'
       or (item.value - 'min' - 'max') <> '{}'::jsonb then
      raise exception 'Unsupported entitlement constraints' using errcode='22023';
    end if;
    range_min := (item.value->>'min')::numeric; range_max := (item.value->>'max')::numeric;
    if range_min < (catalog.value_ranges->item.key->>'min')::numeric or range_max > (catalog.value_ranges->item.key->>'max')::numeric or range_min > range_max or range_min <> trunc(range_min) or range_max <> trunc(range_max) then
      raise exception 'Unsupported entitlement constraints' using errcode='22023';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end; $$;
create trigger validate_entitlement before insert or update on public.operator_entitlements for each row execute function private.validate_entitlement();

-- Request-time commercial eligibility only. Module RLS must also enforce caller
-- role and tenant/Branch membership. This helper never grants that membership.
create function private.capability_state(target_operator_id uuid, requested_key text, target_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare entitlement public.operator_entitlements; catalog public.feature_catalog; configuration public.feature_configurations; reason text; resolved_mode text; resolved_values jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('available',false,'reason','unauthenticated','mode',null,'values','{}'::jsonb,'catalogVersion',null); end if;
  if not exists(select 1 from public.operators where id=target_operator_id and status='active') then reason := 'operator_inactive';
  elsif target_branch_id is not null and not exists(select 1 from public.branches where id=target_branch_id and operator_id=target_operator_id and status='active') then reason := 'branch_inactive'; end if;
  select * into entitlement from public.operator_entitlements where operator_id=target_operator_id and capability_key=requested_key;
  if not found then reason := coalesce(reason,'not_entitled');
  elsif entitlement.status='revoked' then reason := coalesce(reason,'revoked');
  elsif now() < entitlement.starts_at then reason := coalesce(reason,'scheduled');
  elsif now() >= entitlement.ends_at then reason := coalesce(reason,'expired'); end if;
  if reason is null then
    select * into strict catalog from public.feature_catalog where capability_key=requested_key and version=entitlement.catalog_version;
    select * into configuration from public.feature_configurations
      where operator_id=target_operator_id and capability_key=requested_key and (branch_id is null or branch_id=target_branch_id)
      order by branch_id nulls last limit 1;
    resolved_mode := coalesce(configuration.mode,catalog.default_mode);
    resolved_values := catalog.default_values || coalesce(configuration.values,'{}'::jsonb);
    if not (resolved_mode=any(entitlement.allowed_modes) and resolved_mode=any(catalog.modes))
      or (configuration.branch_id is not null and not 'branch'=any(catalog.scopes))
      or not private.configuration_values_valid(catalog.value_ranges,entitlement.constraints,resolved_values) then reason := 'configuration_unavailable'; end if;
  end if;
  return jsonb_build_object('available',reason is null,'reason',reason,'mode',case when reason is null then resolved_mode end,'values',case when reason is null then resolved_values else '{}'::jsonb end,'catalogVersion',entitlement.catalog_version);
end; $$;
create function private.capability_enabled(target_operator_id uuid, capability_key text, target_branch_id uuid default null)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (private.capability_state(target_operator_id,capability_key,target_branch_id)->>'available')::boolean;
$$;
create function public.resolve_capability(target_operator_id uuid, capability_key text, target_branch_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.is_platform_admin() and not (
    (target_branch_id is null and private.has_active_operator_access(target_operator_id))
    or (target_branch_id is not null and private.has_active_branch_access(target_operator_id,target_branch_id))
  ) then raise exception 'Operator access denied' using errcode='42501'; end if;
  return private.capability_state(target_operator_id,capability_key,target_branch_id);
end; $$;

create function private.validate_feature_configuration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare entitlement public.operator_entitlements; catalog public.feature_catalog;
begin
  if auth.uid() is null or not private.is_operator_owner(new.operator_id) then raise exception 'Operator access denied' using errcode='42501'; end if;
  -- Hold the grant row until this write commits; a racing revoke serializes.
  select * into entitlement from public.operator_entitlements where operator_id=new.operator_id and capability_key=new.capability_key for share;
  if not found or entitlement.status <> 'granted' or now() < entitlement.starts_at or now() >= entitlement.ends_at then raise exception 'Capability unavailable' using errcode='42501'; end if;
  select * into strict catalog from public.feature_catalog where capability_key=new.capability_key and version=entitlement.catalog_version;
  if new.branch_id is not null and (not 'branch'=any(catalog.scopes) or not private.has_active_branch_access(new.operator_id,new.branch_id)) then raise exception 'Unsupported configuration scope' using errcode='22023'; end if;
  if not (new.mode=any(catalog.modes) and new.mode=any(entitlement.allowed_modes)) then raise exception 'Unsupported configuration mode' using errcode='22023'; end if;
  if not private.configuration_values_valid(catalog.value_ranges,entitlement.constraints,catalog.default_values || new.values) then raise exception 'Unsupported configuration values' using errcode='22023'; end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger validate_feature_configuration before insert or update on public.feature_configurations for each row execute function private.validate_feature_configuration();

create function private.audit_feature_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous jsonb; current_value jsonb; target_branch uuid;
begin
  current_value := to_jsonb(new);
  if tg_op='UPDATE' then previous := to_jsonb(old); end if;
  target_branch := (current_value->>'branch_id')::uuid;
  insert into public.audit_events (operator_id,branch_id,actor_user_id,actor_type,action,target_type,target_id,before_summary,after_summary,correlation_id)
  values (new.operator_id,target_branch,auth.uid(),case when auth.uid() is null then 'system' when tg_table_name='operator_entitlements' then 'prizic_staff' else 'operator_staff' end,
    tg_table_name || '.' || lower(tg_op),case when tg_table_name='operator_entitlements' then 'operator_entitlement' else 'feature_configuration' end,new.id,previous,current_value,gen_random_uuid()::text);
  return new;
end; $$;
create trigger audit_entitlement after insert or update on public.operator_entitlements for each row execute function private.audit_feature_mutation();
create trigger audit_feature_configuration after insert or update on public.feature_configurations for each row execute function private.audit_feature_mutation();

revoke all on function private.configuration_values_valid(jsonb,jsonb,jsonb), private.validate_entitlement(), private.validate_feature_configuration(), private.audit_feature_mutation(), private.capability_state(uuid,text,uuid), private.capability_enabled(uuid,text,uuid), public.resolve_capability(uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.configuration_values_valid(jsonb,jsonb,jsonb), private.capability_state(uuid,text,uuid), private.capability_enabled(uuid,text,uuid), public.resolve_capability(uuid,text,uuid) to authenticated;
