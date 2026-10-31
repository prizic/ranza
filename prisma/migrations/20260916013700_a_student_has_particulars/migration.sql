-- What a dormitory needs to know about a student, readable only by the people
-- whose job needs it (RANZ-110, RANZ-99, GP-S1-*).
--
-- A yurt cannot register a student with a name, an email and a telephone. It
-- needs a date of birth, a university and year, a guardian (veli) and somebody
-- to call in an emergency. A hotel's long stay needs the last two as well, so
-- nothing here reads `operating_model` (ADR 0057).
--
-- In a table of its own, not columns on `guests`, because the two are read by
-- different people. Every Staff Member of an Organization reads its Guests —
-- housekeeping needs a name on a room — and these are personal data of people
-- who may be seventeen (KVKK). A column grant cannot vary by role under one
-- runtime role and a read check in the application is not a boundary, so the
-- boundary is a row policy carrying a permission, `guests.read_particulars`,
-- held by the shipped Owner, Manager and Front desk roles. An Organization can
-- give it to a role of its own, or take it from one.
--
-- Written only through `app.record_guest_particulars`, by whoever may take a
-- booking. A plain upsert would need the writer to pass the read policy too —
-- PostgreSQL applies SELECT policies to the row an ON CONFLICT DO UPDATE
-- touches — and a role allowed to book but not to read would then fail on
-- every returning student.

insert into public.staff_permissions (key, module_key)
values ('guests.read_particulars', 'front_office');

update public.staff_roles
   set permissions = array_append(permissions, 'guests.read_particulars'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager', 'front_desk')
   and not ('guests.read_particulars' = any (permissions));

create table public.guest_particulars (
  guest_id uuid primary key,
  organization_id uuid not null,
  date_of_birth date,
  institution text,
  study_year smallint,
  guardian_name text,
  guardian_phone text,
  emergency_name text,
  emergency_phone text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint guest_particulars_guest_fkey
    foreign key (guest_id, organization_id)
    references public.guests (id, organization_id)
    on delete restrict on update no action,
  -- The future is refused by the writer, which knows what day it is; a check
  -- constraint may not ask.
  constraint guest_particulars_date_of_birth_check
    check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  constraint guest_particulars_institution_check
    check (institution is null
           or (institution = btrim(institution)
               and char_length(institution) between 2 and 120)),
  constraint guest_particulars_study_year_check
    check (study_year is null or study_year between 1 and 8),
  constraint guest_particulars_guardian_name_check
    check (guardian_name is null
           or (guardian_name = btrim(guardian_name)
               and char_length(guardian_name) between 2 and 120)),
  constraint guest_particulars_emergency_name_check
    check (emergency_name is null
           or (emergency_name = btrim(emergency_name)
               and char_length(emergency_name) between 2 and 120)),
  -- As `guests_phone_check`: a telephone is what somebody wrote down.
  constraint guest_particulars_guardian_phone_check
    check (guardian_phone is null
           or (guardian_phone = btrim(guardian_phone)
               and char_length(guardian_phone) between 1 and 40)),
  constraint guest_particulars_emergency_phone_check
    check (emergency_phone is null
           or (emergency_phone = btrim(emergency_phone)
               and char_length(emergency_phone) between 1 and 40))
);

comment on table public.guest_particulars is
  'A Guest''s date of birth, studies, guardian and emergency contact. Read only with guests.read_particulars; written only through app.record_guest_particulars (GP-S1-*).';

create index guest_particulars_organization_idx
  on public.guest_particulars (organization_id);

alter table public.guest_particulars enable row level security;
alter table public.guest_particulars force row level security;

create policy guest_particulars_read_with_permission
  on public.guest_particulars for select
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_permission(
          organization_id, 'guests.read_particulars')
  );

-- No INSERT, UPDATE or DELETE grant and no policy for them: the function below
-- is the one writer, and a person's particulars are not deleted (blueprint
-- 18.7 asks for anonymization under a retention policy, a workflow).
grant select on public.guest_particulars to ranza_app;

-- Records what the desk typed for a Guest. A blank keeps what is on file: a
-- returning student re-booked with nothing typed loses nothing, and what is
-- typed replaces what was. A Guest out of reach, an Organization without a
-- front desk, and a caller who may not take bookings are one refusal.
create function app.record_guest_particulars(
  target_guest uuid,
  wanted_date_of_birth date,
  wanted_institution text,
  wanted_study_year smallint,
  wanted_guardian_name text,
  wanted_guardian_phone text,
  wanted_emergency_name text,
  wanted_emergency_phone text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  guest_organization uuid;
begin
  select guest.organization_id into guest_organization
    from public.guests as guest
   where guest.id = target_guest;

  if guest_organization is null
     or guest_organization not in (select app.accessible_organization_ids())
     or not app.can_use_capability_in_organization(
              guest_organization, 'front_office', 'front_desk')
     or not app.has_organization_permission(
              guest_organization, 'front_desk.book') then
    raise exception 'those particulars cannot be recorded'
      using errcode = '42501';
  end if;

  if wanted_date_of_birth > current_date then
    raise exception 'a date of birth is not in the future'
      using errcode = '23514',
            constraint = 'guest_particulars_date_of_birth_check';
  end if;

  insert into public.guest_particulars as particulars
    (guest_id, organization_id, date_of_birth, institution, study_year,
     guardian_name, guardian_phone, emergency_name, emergency_phone)
  values
    (target_guest, guest_organization, wanted_date_of_birth,
     wanted_institution, wanted_study_year, wanted_guardian_name,
     wanted_guardian_phone, wanted_emergency_name, wanted_emergency_phone)
  on conflict (guest_id) do update set
    date_of_birth = coalesce(excluded.date_of_birth, particulars.date_of_birth),
    institution = coalesce(excluded.institution, particulars.institution),
    study_year = coalesce(excluded.study_year, particulars.study_year),
    guardian_name = coalesce(excluded.guardian_name, particulars.guardian_name),
    guardian_phone = coalesce(excluded.guardian_phone, particulars.guardian_phone),
    emergency_name = coalesce(excluded.emergency_name, particulars.emergency_name),
    emergency_phone = coalesce(excluded.emergency_phone, particulars.emergency_phone),
    updated_at = current_timestamp;
end;
$$;

revoke execute on function app.record_guest_particulars(
  uuid, date, text, smallint, text, text, text, text) from public;
grant execute on function app.record_guest_particulars(
  uuid, date, text, smallint, text, text, text, text) to ranza_app;
