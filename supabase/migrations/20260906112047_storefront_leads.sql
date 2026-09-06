create schema if not exists private;
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  fingerprint text not null check (length(fingerprint) = 64),
  name text not null check (length(name) between 1 and 100),
  contact text not null check (length(contact) between 1 and 200),
  operator_name text not null check (length(operator_name) between 1 and 160),
  approximate_beds integer not null check (approximate_beds between 1 and 100000),
  city text not null check (length(city) between 1 and 100),
  preferred_language text not null check (preferred_language in ('tr', 'en', 'ar')),
  message text not null default '' check (length(message) <= 2000),
  consent_version text not null,
  consent_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);
create index leads_created_at on public.leads (created_at desc);
alter table public.leads enable row level security;
revoke all on public.leads from public, anon, authenticated;
grant select on public.leads to authenticated;
grant update (status) on public.leads to authenticated;
grant all on public.leads to service_role;

-- Runtime lookup lets the independent Storefront migration precede the core
-- identity migration. No membership relation means no reviewer access.
create or replace function private.can_review_leads() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare allowed boolean;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal', '') <> 'aal2'
     or to_regclass('private.platform_memberships') is null then return false; end if;
  if not exists (select 1 from auth.sessions where id = nullif(auth.jwt()->>'session_id', '')::uuid and user_id = auth.uid()) then return false; end if;
  execute 'select exists (select 1 from private.platform_memberships where user_id = $1 and role in (''platform_admin'', ''support'') and status = ''active'')'
    into allowed using auth.uid();
  return allowed;
end;
$$;
revoke all on function private.can_review_leads() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_review_leads() to authenticated;
create policy lead_staff_read on public.leads for select to authenticated using ((select private.can_review_leads()));
create policy lead_staff_status on public.leads for update to authenticated using ((select private.can_review_leads())) with check ((select private.can_review_leads()));

create table public.lead_status_events (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id),
  actor_id uuid not null, previous_status text not null, status text not null, created_at timestamptz not null default now()
);
alter table public.lead_status_events enable row level security;
revoke all on public.lead_status_events from public, anon, authenticated;
grant select on public.lead_status_events to authenticated;
grant all on public.lead_status_events to service_role;
create policy lead_events_read on public.lead_status_events for select to authenticated using ((select private.can_review_leads()));
create function private.audit_lead_status() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    insert into public.lead_status_events(lead_id, actor_id, previous_status, status) values(new.id, auth.uid(), old.status, new.status);
  end if;
  return new;
end;
$$;
revoke all on function private.audit_lead_status() from public, anon, authenticated;
create trigger lead_status_audit after update of status on public.leads for each row execute function private.audit_lead_status();

create table public.lead_rate_buckets (bucket text primary key, window_start timestamptz not null, attempts integer not null);
alter table public.lead_rate_buckets enable row level security;
revoke all on public.lead_rate_buckets from public, anon, authenticated;
grant all on public.lead_rate_buckets to service_role;
create function public.consume_lead_rate(p_bucket text) returns boolean language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  if length(p_bucket) <> 64 then return false; end if;
  insert into public.lead_rate_buckets(bucket, window_start, attempts) values(p_bucket, now(), 1)
    on conflict (bucket) do update set
      attempts = case when lead_rate_buckets.window_start < now() - interval '1 hour' then 1 else lead_rate_buckets.attempts + 1 end,
      window_start = case when lead_rate_buckets.window_start < now() - interval '1 hour' then now() else lead_rate_buckets.window_start end
    returning attempts into total;
  delete from public.lead_rate_buckets where window_start < now() - interval '1 day';
  return total <= 10;
end;
$$;
create function public.lead_receipt(p_key uuid, p_fingerprint text) returns text language sql security invoker set search_path = '' as $$
  select coalesce((select case when fingerprint = p_fingerprint then 'accepted' else 'conflict' end from public.leads where idempotency_key = p_key), 'missing');
$$;
create function public.submit_lead(p_key uuid, p_fingerprint text, p_value jsonb, p_correlation_id uuid) returns text language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.leads(idempotency_key, fingerprint, name, contact, operator_name, approximate_beds, city, preferred_language, message, consent_version, correlation_id)
  values(p_key, p_fingerprint, p_value->>'name', p_value->>'contact', p_value->>'operator', (p_value->>'beds')::integer, p_value->>'city', p_value->>'language', p_value->>'message', '2026-09-06', p_correlation_id)
  on conflict (idempotency_key) do nothing;
  return public.lead_receipt(p_key, p_fingerprint);
end;
$$;
revoke all on function public.consume_lead_rate(text), public.lead_receipt(uuid,text), public.submit_lead(uuid,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.consume_lead_rate(text), public.lead_receipt(uuid,text), public.submit_lead(uuid,text,jsonb,uuid) to service_role;
