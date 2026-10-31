-- The identity document a Guest registers with (RANZ-81, PA-S2-*).
--
-- A hotel asks for it at the desk and a dormitory at registration: the
-- nationality, which kind of document, and its number. Nothing here reads
-- `operating_model` (ADR 0057). Kimlik submission (KBS) is out of scope and a
-- deferred row; this is only what the desk records and who may read it.
--
-- Behind the same permission as the rest of a Guest's particulars (ADR 0058):
-- housekeeping reads Guests, not their identity, and the person may be a minor
-- (KVKK). The table's row policy already says so, so the three columns join
-- `guest_particulars` rather than opening a second table with a second policy
-- that could drift from the first.
--
-- The number is the one value that is worse to leak than to hide, so the
-- runtime role is no longer granted the table whole. It reads every column but
-- `document_number`, and `document_last_four`, a generated column, is what the
-- screen shows. The number in full leaves the database only through
-- `app.reveal_guest_identity_document`, which asks the same permission and
-- whose caller records that somebody looked. A policy bounds rows and a grant
-- bounds columns (ADR 0012): the mask is a boundary here, not a courtesy of
-- the screen.
--
-- A T.C. kimlik number is eleven digits whose last two follow from the first
-- nine; the check is in the database so a mistyped one is refused wherever it
-- is written from. Every other kind is six to twenty letters and digits,
-- stored upper case, because a passport number is read aloud and typed from a
-- photograph and "ab123456" and "AB123456" are one document.

-- The official checksum. The tenth digit is seven times the sum of the odd
-- positions among the first nine, less the sum of the even ones, modulo ten;
-- the eleventh is the sum of the first ten, modulo ten. The first digit is
-- never zero.
create function app.is_tc_kimlik(candidate text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digit int[];
  odd_sum int;
  even_sum int;
begin
  if candidate is null or candidate !~ '^[1-9][0-9]{10}$' then
    return false;
  end if;
  digit := array(
    select substr(candidate, position, 1)::int
      from generate_series(1, 11) as position
     order by position
  );
  odd_sum := digit[1] + digit[3] + digit[5] + digit[7] + digit[9];
  even_sum := digit[2] + digit[4] + digit[6] + digit[8];
  return ((odd_sum * 7 - even_sum) % 10 + 10) % 10 = digit[10]
     and (odd_sum + even_sum + digit[10]) % 10 = digit[11];
end;
$$;

revoke execute on function app.is_tc_kimlik(text) from public;

alter table public.guest_particulars
  add column nationality text,
  add column document_type text,
  add column document_number text,
  add column document_last_four text
    generated always as (right(document_number, 4)) stored,
  -- ISO 3166-1 alpha-2. Which two letters are a country is the screen's list;
  -- the database refuses what cannot be a code.
  add constraint guest_particulars_nationality_check
    check (nationality is null or nationality ~ '^[A-Z]{2}$'),
  add constraint guest_particulars_document_type_check
    check (document_type is null
           or document_type in
              ('tc_kimlik', 'passport', 'residence_permit', 'other')),
  -- A number with no kind cannot be checked, and a kind with no number is a
  -- document nobody holds.
  add constraint guest_particulars_document_pair_check
    check ((document_type is null) = (document_number is null)),
  add constraint guest_particulars_document_number_check
    check (document_number is null
           or case document_type
                when 'tc_kimlik' then app.is_tc_kimlik(document_number)
                else document_number ~ '^[A-Z0-9]{6,20}$'
              end);

comment on column public.guest_particulars.nationality is
  'ISO 3166-1 alpha-2 country code of the Guest''s nationality (PA-S2-*).';
comment on column public.guest_particulars.document_type is
  'tc_kimlik, passport, residence_permit or other; null with no document (PA-S2-*).';
comment on column public.guest_particulars.document_number is
  'The document number, upper case. Not granted to the runtime role: read in full only through app.reveal_guest_identity_document (PA-S2-*).';
comment on column public.guest_particulars.document_last_four is
  'The last four characters of document_number: what a screen shows by default (PA-S2-*).';

-- Every column but the number. A column added later is granted when it is
-- added, deliberately: the default is not readable.
revoke select on public.guest_particulars from ranza_app;
grant select (
  guest_id, organization_id, date_of_birth, institution, study_year,
  guardian_name, guardian_phone, emergency_name, emergency_phone,
  created_at, updated_at,
  nationality, document_type, document_last_four
) on public.guest_particulars to ranza_app;

-- The record function grows three arguments, and a function is its signature,
-- so the old one goes: leaving it would keep a second writer that knows
-- nothing of the document.
drop function app.record_guest_particulars(
  uuid, date, text, smallint, text, text, text, text);

-- As before, a blank keeps what is on file. The kind and the number are a pair:
-- typing a number replaces both, typing neither keeps both, and a kind alone
-- or a number alone is refused by the pair check on the row that would be
-- written.
create function app.record_guest_particulars(
  target_guest uuid,
  wanted_date_of_birth date,
  wanted_institution text,
  wanted_study_year smallint,
  wanted_guardian_name text,
  wanted_guardian_phone text,
  wanted_emergency_name text,
  wanted_emergency_phone text,
  wanted_nationality text,
  wanted_document_type text,
  wanted_document_number text
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
     guardian_name, guardian_phone, emergency_name, emergency_phone,
     nationality, document_type, document_number)
  values
    (target_guest, guest_organization, wanted_date_of_birth,
     wanted_institution, wanted_study_year, wanted_guardian_name,
     wanted_guardian_phone, wanted_emergency_name, wanted_emergency_phone,
     upper(btrim(wanted_nationality)), wanted_document_type,
     upper(btrim(wanted_document_number)))
  on conflict (guest_id) do update set
    date_of_birth = coalesce(excluded.date_of_birth, particulars.date_of_birth),
    institution = coalesce(excluded.institution, particulars.institution),
    study_year = coalesce(excluded.study_year, particulars.study_year),
    guardian_name = coalesce(excluded.guardian_name, particulars.guardian_name),
    guardian_phone = coalesce(excluded.guardian_phone, particulars.guardian_phone),
    emergency_name = coalesce(excluded.emergency_name, particulars.emergency_name),
    emergency_phone = coalesce(excluded.emergency_phone, particulars.emergency_phone),
    nationality = coalesce(excluded.nationality, particulars.nationality),
    document_type = case
      when excluded.document_number is not null then excluded.document_type
      else particulars.document_type
    end,
    document_number = coalesce(excluded.document_number, particulars.document_number),
    updated_at = current_timestamp;
end;
$$;

revoke execute on function app.record_guest_particulars(
  uuid, date, text, smallint, text, text, text, text, text, text, text)
  from public;
grant execute on function app.record_guest_particulars(
  uuid, date, text, smallint, text, text, text, text, text, text, text)
  to ranza_app;

-- The number in full, for somebody who holds the permission, once, for the
-- Guest asked about. Nothing is returned for a Guest with no document, for one
-- out of reach and for a caller who may not read particulars: those are one
-- answer, as the table's policy gives. The caller records that the number was
-- shown, in the same transaction, so a number that could not be recorded as
-- seen is not shown.
create function app.reveal_guest_identity_document(target_guest uuid)
returns table (
  holder_organization_id uuid,
  held_document_type text,
  held_document_number text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  held public.guest_particulars%rowtype;
begin
  select particulars.* into held
    from public.guest_particulars as particulars
   where particulars.guest_id = target_guest;

  if not found
     or held.document_number is null
     or held.organization_id not in (select app.accessible_organization_ids())
     or not app.has_organization_permission(
              held.organization_id, 'guests.read_particulars') then
    return;
  end if;

  holder_organization_id := held.organization_id;
  held_document_type := held.document_type;
  held_document_number := held.document_number;
  return next;
end;
$$;

revoke execute on function app.reveal_guest_identity_document(uuid) from public;
grant execute on function app.reveal_guest_identity_document(uuid) to ranza_app;
