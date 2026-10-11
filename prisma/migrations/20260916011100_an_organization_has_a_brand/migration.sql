-- An Organization has a brand: one colour and one logo (RANZ-47, ADR 0046).
--
-- Hand-written. 20260916011100 to 20260916011199 belong to the branding lane.
--
-- Blueprint 8 says white-labelling is configuration, not a fork, and lists what
-- it must not do: change security rules, bypass Entitlements, introduce code
-- branches, allow arbitrary executable code. This is the smallest piece of it
-- that reaches a person: the colour and the logo of the Portal a Guest opens.
--
--   1. A permission, `branding.manage`, held by the shipped Owner role.
--   2. Two tables: the brand (one colour) and its logo (the bytes), each
--      read and written by whoever holds the permission across the whole
--      Organization, behind blueprint 3.5's gates (ADR 0012).
--   3. A Resident reads the brand of an Organization they have a current Stay
--      with, through policies of their own (ADR 0009), and no other.
--   4. The database refuses what the module refuses: a colour that is not
--      `#rrggbb`, a logo whose bytes do not start the way its type says, one
--      that is too large or too small, and one whose recorded hash or size is
--      not the bytes'.
--
-- Nothing is ever deleted. "Reset to default" is an update that empties the
-- colour and the logo; the audit record keeps what they were (a hash and a
-- size for the logo, never its bytes), and ranza_app is therefore granted no
-- DELETE, as it is granted none anywhere (tests/database/insert_grants.test.sql).

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- First, because staff_roles_permissions_are_known refuses a key the catalogue
-- does not hold (20260916002300). Under platform_core: white-label
-- presentation controls are Platform Core, every Subscription includes them
-- (blueprint 3.1), so there is no module to buy it with.
insert into public.staff_permissions (key, module_key)
values ('branding.manage', 'platform_core')
on conflict (key) do nothing;

-- The Owner only. A brand is how the Organization presents itself to its
-- guests, which is the Owner's to decide and not a day-to-day task of a
-- Manager; an Organization that wants a Manager to hold it composes it into a
-- role on purpose (ADR 0026). Appended rather than assigned, for the reason
-- 20260916004200 gives.
update public.staff_roles
   set permissions = array_append(permissions, 'branding.manage'),
       updated_at = now()
 where organization_id is null
   and key = 'owner'
   and not ('branding.manage' = any (permissions));

-- staff_roles is FORCE row level security and this migration brings no policy
-- for the statement above, so a migrating role that stopped bypassing it would
-- match nothing and say nothing. Asserted, as 20260916009600 does.
do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key = 'owner'
         and 'branding.manage' = any (permissions)) <> 1 then
    raise exception 'branding.manage did not reach the shipped owner role';
  end if;
  if exists (select 1 from public.staff_roles
              where organization_id is null
                and key <> 'owner'
                and 'branding.manage' = any (permissions)) then
    raise exception 'branding.manage reached a shipped role that is not the owner';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The brand: one colour
-- ---------------------------------------------------------------------------

create table public.organization_brands (
  organization_id uuid primary key
    references public.organizations (id) on delete restrict on update no action,
  -- Lower-case `#rrggbb` and nothing else. The foreground is derived from it
  -- when it is read (white or black, whichever reaches 4.5:1 against it), so
  -- there is exactly one fact to keep and no pair that could disagree.
  primary_color text,
  updated_by uuid not null
    references public.users (id) on delete restrict on update no action,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_brands_primary_color_format
    check (primary_color ~ '^#[0-9a-f]{6}$')
);

comment on table public.organization_brands is
  'An Organization''s white-label presentation (blueprint 8): one colour, and a logo in organization_brand_logos. A row with no colour and no logo is the default theme. Nothing is deleted: a reset empties it.';
comment on column public.organization_brands.primary_color is
  'Lower-case #rrggbb. The Portal''s --primary; its foreground is derived by WCAG contrast when read, never stored.';

-- ---------------------------------------------------------------------------
-- The logo: the bytes, apart from the colour
-- ---------------------------------------------------------------------------

-- Its own table so that reading the brand never reads the bytes: a policy
-- bounds rows, and a `select *` on a table holding half a megabyte per row is
-- a cost nobody chose.
create table public.organization_brand_logos (
  organization_id uuid primary key
    references public.organization_brands (organization_id)
    on delete cascade on update no action,
  content bytea,
  content_type text,
  content_hash text,
  size_bytes integer,
  width integer,
  height integer,
  updated_by uuid not null
    references public.users (id) on delete restrict on update no action,
  updated_at timestamptz not null default now(),

  -- A logo is whole or it is absent: a row whose bytes are gone keeps none of
  -- the facts about them.
  constraint organization_brand_logos_whole_or_absent
    check (
      (content is null and content_type is null and content_hash is null
         and size_bytes is null and width is null and height is null)
      or
      (content is not null and content_type is not null
         and content_hash is not null and size_bytes is not null
         and width is not null and height is not null)
    ),
  -- SVG is not on this list and never will be: it can carry script (blueprint
  -- 8, "no arbitrary executable code").
  constraint organization_brand_logos_type
    check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint organization_brand_logos_size
    check (size_bytes between 1 and 524288),
  -- The type is whatever the bytes say, not what a browser or a file name
  -- claimed: the signature of each format, read from the bytes themselves.
  constraint organization_brand_logos_type_is_the_bytes
    check (
      content is null
      or case content_type
           when 'image/png'
             then substring(content from 1 for 8) = '\x89504e470d0a1a0a'::bytea
           when 'image/jpeg'
             then substring(content from 1 for 3) = '\xffd8ff'::bytea
           when 'image/webp'
             then substring(content from 1 for 4) = '\x52494646'::bytea
              and substring(content from 9 for 4) = '\x57454250'::bytea
           else false
         end
    ),
  -- The hash and the size are the bytes', checked here and not trusted from a
  -- caller: the hash is what a URL is versioned by and what the audit record
  -- names the logo with.
  constraint organization_brand_logos_hash_is_the_bytes
    check (content is null or content_hash = encode(sha256(content), 'hex')),
  constraint organization_brand_logos_size_is_the_bytes
    check (content is null or size_bytes = octet_length(content)),
  -- At least 128 px tall, so a logo is not a favicon stretched; at most 4096
  -- either way, so a small file cannot unpack to something a phone cannot draw.
  constraint organization_brand_logos_dimensions
    check (height between 128 and 4096 and width between 1 and 4096)
);

comment on table public.organization_brand_logos is
  'The bytes of an Organization''s logo and what is known of them. PNG, JPEG or WebP, at most 512 KB, at least 128 px tall. Absent facts mean no logo.';
comment on column public.organization_brand_logos.content_hash is
  'Hex SHA-256 of content. Versions the URL the Portal serves the logo at, and is how the audit record names it.';

-- ---------------------------------------------------------------------------
-- Who is a Resident of an Organization
-- ---------------------------------------------------------------------------

-- The Resident's sibling of app.accessible_organization_ids() (ADR 0009): an
-- Organization is reached through a current Stay and through no membership.
-- Only a current Stay counts, so a departed Resident keeps their own Stay and
-- stops reading the brand around it.
create function app.resident_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct stay.organization_id
  from public.stays as stay
  where stay.user_id = app.current_user_id()
    and stay.status in ('reserved', 'in_house');
$$;

comment on function app.resident_organization_ids() is
  'The Organizations the acting user has a current Stay with (ADR 0009). The Resident''s equivalent of accessible_organization_ids(); never widened to admit Staff.';

revoke execute on function app.resident_organization_ids() from public;
grant execute on function app.resident_organization_ids() to ranza_app;

-- ---------------------------------------------------------------------------
-- Grants: a write names its columns
-- ---------------------------------------------------------------------------

grant select on public.organization_brands, public.organization_brand_logos
  to ranza_app;

grant insert (organization_id, primary_color, updated_by)
  on public.organization_brands to ranza_app;
grant update (primary_color, updated_by, updated_at)
  on public.organization_brands to ranza_app;

grant insert (organization_id, content, content_type, content_hash,
              size_bytes, width, height, updated_by)
  on public.organization_brand_logos to ranza_app;
grant update (content, content_type, content_hash, size_bytes, width, height,
              updated_by, updated_at)
  on public.organization_brand_logos to ranza_app;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.organization_brands enable row level security;
alter table public.organization_brands force row level security;
alter table public.organization_brand_logos enable row level security;
alter table public.organization_brand_logos force row level security;

-- Five conjuncts on every Staff policy, in the policy and not beside it (ADR
-- 0012):
--
--   membership         accessible_organization_ids(), as every read has.
--   reach              the WHOLE Organization. A brand has no Property to
--                      narrow to, and a Staff Member assigned to one Property
--                      deciding how every Property presents itself is not a
--                      reach the data can honour (ADR 0031).
--   permission         branding.manage.
--   commercial gates   can_use_capability_in_organization() on Configuration:
--                      a suspended or cancelled Subscription denies, past_due
--                      does not (ADR 0040).
--   the actor          a write names the acting user as its author.
--
-- Reading is gated by the permission as well: the Workspace's Branding screen
-- is the only Staff reader, and the Portal reads through the Resident policy.
create policy organization_brands_read_staff
  on public.organization_brands for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
  );

create policy organization_brands_read_resident
  on public.organization_brands for select
  to ranza_app
  using (organization_id in (select app.resident_organization_ids()));

create policy organization_brands_insert
  on public.organization_brands for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
    and updated_by = app.current_user_id()
  );

create policy organization_brands_update
  on public.organization_brands for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
    and updated_by = app.current_user_id()
  );

create policy organization_brand_logos_read_staff
  on public.organization_brand_logos for select
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
  );

create policy organization_brand_logos_read_resident
  on public.organization_brand_logos for select
  to ranza_app
  using (organization_id in (select app.resident_organization_ids()));

create policy organization_brand_logos_insert
  on public.organization_brand_logos for insert
  to ranza_app
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
    and updated_by = app.current_user_id()
  );

create policy organization_brand_logos_update
  on public.organization_brand_logos for update
  to ranza_app
  using (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
  )
  with check (
    organization_id in (select app.accessible_organization_ids())
    and app.has_organization_wide_reach(organization_id)
    and app.has_organization_permission(organization_id, 'branding.manage')
    and app.can_use_capability_in_organization(
          organization_id, 'platform_core', 'configuration')
    and updated_by = app.current_user_id()
  );

comment on policy organization_brands_read_resident on public.organization_brands is
  'A Resident reads the brand of an Organization they have a current Stay with and no other (ADR 0009). A policy of its own, never a widening of the Staff one.';
comment on policy organization_brands_update on public.organization_brands is
  'Membership, whole-Organization reach, branding.manage, the Configuration capability, and the author named (ADR 0012).';
