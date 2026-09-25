-- A Property's settings, and its Organization's name, are changed from the
-- workspace (ADR 0036, docs/features/configuration).
--
-- ON THE NUMBER. 006000: the configuration lane's range, clear of the ranges
-- the lanes open alongside it hold.
--
-- Nothing here adds a column. Name, timezone, currency and cutoff exist and
-- are already constrained: names are two to 120 trimmed characters, a
-- timezone is one Postgres knows (app.is_valid_timezone), a currency is three
-- capital letters, and a cutoff is between 03:00 and 12:00 (ADR 0021). Until
-- now nothing but SQL could change them. What this adds is the write path:
-- a permission, a policy per table, a grant per column, a stamp, and the one
-- rule the columns cannot state — a currency is fixed once money is recorded
-- in it.

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- Platform Core's, because configuration is (blueprint 5.1). Appended to the
-- two shipped roles that run a Property rather than assigned: another branch
-- appends its own permissions to the same arrays, and an assignment would
-- silently take theirs away depending on which migration ran last (CF-S1-19).
insert into public.staff_permissions (key, module_key)
values ('configuration.manage', 'platform_core')
on conflict (key) do nothing;

update public.staff_roles
   set permissions = array_append(permissions, 'configuration.manage'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('configuration.manage' = any (permissions));

-- staff_roles is FORCE row level security and this migration brings no policy
-- for the statement above. It works because the migrating role is a superuser
-- locally and carries BYPASSRLS on Supabase; if either stopped being true it
-- would match nothing and say nothing, so it is asserted.
do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager')
         and 'configuration.manage' = any (permissions)) <> 2 then
    raise exception 'configuration.manage did not reach the shipped owner and manager roles';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Changing a Property: five gates, and a grant per column
-- ---------------------------------------------------------------------------

-- The permission, and Platform Core's configuration capability at this
-- Property, which carries Subscription, Entitlement, capability and reach
-- (ADR 0012). A Property out of reach, in another Organization, or under a
-- lapsed Subscription matches no row (CF-S1-12 .. CF-S1-15).
create policy properties_update_configure
  on public.properties for update
  using (
    app.has_organization_permission(organization_id, 'configuration.manage')
    and app.can_use_capability(id, 'platform_core', 'configuration')
  )
  with check (
    app.has_organization_permission(organization_id, 'configuration.manage')
    and app.can_use_capability(id, 'platform_core', 'configuration')
  );

-- A policy bounds rows; a grant bounds columns. Which Organization owns the
-- Property and whether it trades are not settings (CF-S1-11), and when it
-- changed is the database's to say — the trigger below stamps it.
grant update (name, timezone, currency, business_date_cutoff)
  on public.properties to ranza_app;

-- ---------------------------------------------------------------------------
-- Renaming an Organization: its name governs every Property
-- ---------------------------------------------------------------------------

-- So renaming it takes reach to every Property, as the housekeeping default
-- does (HK-S3-05, CF-S2-02).
create policy organizations_update_configure
  on public.organizations for update
  using (
    app.has_organization_permission(id, 'configuration.manage')
    and app.has_organization_wide_reach(id)
    and app.can_use_capability_in_organization(id, 'platform_core', 'configuration')
  )
  with check (
    app.has_organization_permission(id, 'configuration.manage')
    and app.has_organization_wide_reach(id)
    and app.can_use_capability_in_organization(id, 'platform_core', 'configuration')
  );

-- Only the name. default_locale is read by nothing yet and is not offered
-- (CF-DEF-01); status is the Control Plane's (CF-S2-03).
grant update (name) on public.organizations to ranza_app;

-- ---------------------------------------------------------------------------
-- When it changed
-- ---------------------------------------------------------------------------

-- The stamp is also the version a form was read at, and a save names it to
-- say "what I saw is still what is there" (CF-S1-16). So it must move on every
-- change, even two in one transaction, where now() does not: a version that
-- could repeat would let a stale form overwrite a newer one.
create function app.configured_row_is_stamped()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := greatest(now(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

comment on function app.configured_row_is_stamped() is
  'Stamps a configured Property or Organization, strictly later than before, '
  'because the stamp is the version a stale form is refused by (ADR 0036).';

create trigger properties_stamped
  before update on public.properties
  for each row execute function app.configured_row_is_stamped();

create trigger organizations_stamped
  before update on public.organizations
  for each row execute function app.configured_row_is_stamped();

-- ---------------------------------------------------------------------------
-- A currency is fixed by the first Folio opened in it
-- ---------------------------------------------------------------------------

-- Every Folio copies its Property's currency and its lines carry none of their
-- own (ADR 0015), so a Property with a Folio has money recorded in its
-- currency. Changing it then is a finance workflow of its own, not a setting
-- (CF-S1-03, CF-S1-04).
--
-- A definer, because the question is whether ANY Folio exists, whatever the
-- caller may read. Today a Folio is read by reach and configuring needs reach,
-- so the two agree; the definer keeps a narrower Folio read policy later from
-- quietly unfixing a currency. No reach gate, so it binds a privileged role
-- too. plpgsql with the query inline rather than a stable
-- helper: after waiting on the row lock the check must see the Folio that
-- lock was waiting for.
create function app.property_currency_is_fixed_by_its_first_folio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.folios as folio
              where folio.property_id = new.id) then
    raise exception 'a Property''s currency is fixed once a Folio is opened there'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

comment on function app.property_currency_is_fixed_by_its_first_folio() is
  'Refuses a currency change at a Property any Folio was opened in (CF-S1-04).';

revoke execute on function app.property_currency_is_fixed_by_its_first_folio() from public;

-- WHEN, so a trading Property can still be renamed by a form that sends its
-- unchanged currency back.
create trigger properties_currency_is_fixed
  before update of currency on public.properties
  for each row
  when (old.currency is distinct from new.currency)
  execute function app.property_currency_is_fixed_by_its_first_folio();

-- The other half of the race (CF-S1-20). Opening a Folio reads the currency
-- and its foreign key takes only KEY SHARE, which does not conflict with
-- changing a non-key column; so a check-in and a currency change could each
-- commit, leaving a Folio in a currency its Property no longer trades in.
-- Taking the Property row FOR SHARE here conflicts with that update, so the
-- two serialise: a Folio first makes the currency change see it and refuse; a
-- currency change first makes this see the new currency and refuse the Folio.
--
-- Reach-gated, so it answers nothing about a Property the caller cannot see.
-- A malformed code is left to folios_currency_check, which refuses it for its
-- own reason.
create function app.folio_currency_is_its_propertys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trading text;
begin
  select property.currency::text into trading
    from public.properties as property
   where property.id = new.property_id
     and property.id in (select app.accessible_property_ids())
     for share;
  if found and new.currency ~ '^[A-Z]{3}$' and new.currency::text <> trading then
    raise exception 'a Folio opens in its Property''s currency'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function app.folio_currency_is_its_propertys() is
  'Holds the Property row while a Folio opens, so a concurrent currency change '
  'and a first Folio cannot both commit (CF-S1-20).';

revoke execute on function app.folio_currency_is_its_propertys() from public;

create trigger folios_open_in_the_propertys_currency
  before insert on public.folios
  for each row execute function app.folio_currency_is_its_propertys();

-- What the settings screen says about the currency before anybody tries.
-- A definer for the same reason as the lock, and reach-gated so it is not an
-- oracle for another Organization's books.
create function app.property_currency_is_fixed(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_property_id in (select app.accessible_property_ids())
     and exists (select 1 from public.folios as folio
                  where folio.property_id = target_property_id)
$$;

comment on function app.property_currency_is_fixed(uuid) is
  'Whether a Property the caller reaches has had a Folio opened, and so keeps '
  'its currency (CF-S1-04).';

revoke execute on function app.property_currency_is_fixed(uuid) from public;
grant execute on function app.property_currency_is_fixed(uuid) to ranza_app;
