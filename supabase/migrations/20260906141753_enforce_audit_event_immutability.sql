create function private.reject_audit_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Audit events are append-only' using errcode = '55000';
end;
$$;

revoke all on function private.reject_audit_event_mutation()
from public, anon, authenticated;

create trigger audit_events_reject_row_mutation
before update or delete on public.audit_events
for each row execute function private.reject_audit_event_mutation();

create trigger audit_events_reject_truncate
before truncate on public.audit_events
for each statement execute function private.reject_audit_event_mutation();
