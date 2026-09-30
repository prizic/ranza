-- CreateTable
CREATE TABLE "property_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_type" TEXT NOT NULL,
    "amount_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "property_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_rates_property_id_unit_type_key" ON "property_rates"("property_id", "unit_type");

-- AddForeignKey
ALTER TABLE "property_rates" ADD CONSTRAINT "property_rates_property_id_organization_id_fkey" FOREIGN KEY ("property_id", "organization_id") REFERENCES "properties"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "property_rates" ADD CONSTRAINT "property_rates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-31, ADR 0038, docs/features/rates)
-- ---------------------------------------------------------------------------

-- ON THE NUMBER. 008000 to 008499 belong to feat/rates; 008500 onwards to
-- fix/invitation-bounds. A gap is cheaper than two branches renumbering each
-- other.
--
-- What a night costs at a Property, by the kind of Unit it is spent in. The
-- smallest price blueprint 15.10 lets a feature decide: rate plans, seasons
-- and restrictions are Distribution and Revenue's (blueprint 5.16), discounts
-- and taxes are Billing's (5.9), and none of them is here (RT-DEF-*).

-- ---------------------------------------------------------------------------
-- The row
-- ---------------------------------------------------------------------------

alter table public.property_rates
  -- The kinds accommodation_units_unit_type_check allows. A price for a kind
  -- of Unit that cannot exist would be a price nobody can be charged.
  add constraint property_rates_unit_type_check
    check (unit_type in ('room', 'bed', 'apartment', 'suite')),
  -- Positive, and below a ceiling that stays an exact JavaScript number when
  -- multiplied by a year of nights: 10^11 minor units is a billion in any
  -- currency with a hundredth. A cleared price has no amount, never 0, so a
  -- night is never "free" by accident (RT-S1-04). Cleared rather than deleted,
  -- because nothing in this product deletes a row: ranza_app holds no DELETE
  -- anywhere (insert_grants IG-01), and the audit record keeps what it was.
  add constraint property_rates_amount_check
    check (amount_minor is null
           or (amount_minor > 0 and amount_minor <= 100000000000)),
  add constraint property_rates_currency_check
    check (currency ~ '^[A-Z]{3}$');

comment on table public.property_rates is
  'A nightly price per Property and unit type (ADR 0038). No row, or no amount, means that type is unpriced. The currency and stamps are the database''s; a row whose currency is not the Property''s is stale and prices nothing.';

-- ---------------------------------------------------------------------------
-- The stamp
-- ---------------------------------------------------------------------------

-- Every write, for every role. The currency is the Property's at the moment
-- of writing, never the caller's: a caller that could name a currency could
-- state a price in money the Property does not trade in, and a booking would
-- then carry it into a Folio in another (RT-S1-06). Setting an amount again
-- is how a stale price is made current, which is why an update re-stamps it.
--
-- Security invoker. The Property is read through its own policy, which admits
-- whoever reaches it, and the write policy below has already required reach.
create function app.property_rate_is_stamped()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select property.currency
    into new.currency
    from public.properties as property
   where property.id = new.property_id;

  if new.currency is null then
    raise exception 'that Property cannot be priced'
      using errcode = '42501';
  end if;

  new.updated_by := app.current_user_id();
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger property_rates_stamped
  before insert or update on public.property_rates
  for each row
  execute function app.property_rate_is_stamped();

-- ---------------------------------------------------------------------------
-- Who may set a price
-- ---------------------------------------------------------------------------

-- Platform Core's, beside configuration.manage, because the price list is
-- edited on the Configuration screen. A permission of its own rather than
-- configuration.manage: pricing is commercial authority, and an Organization
-- may want somebody who sets prices and not time zones (RT-S1-08). Appended
-- rather than assigned, for the reason 006000 gives.
insert into public.staff_permissions (key, module_key)
values ('rates.manage', 'platform_core')
on conflict (key) do nothing;

update public.staff_roles
   set permissions = array_append(permissions, 'rates.manage'),
       updated_at = now()
 where organization_id is null
   and key in ('owner', 'manager')
   and not ('rates.manage' = any (permissions));

-- staff_roles is FORCE row level security and nothing here brings a policy
-- for the statement above; asserted, as 006000 does, so a migrating role that
-- stopped bypassing it would fail rather than match nothing.
do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager')
         and 'rates.manage' = any (permissions)) <> 2 then
    raise exception 'rates.manage did not reach the shipped owner and manager roles';
  end if;
end;
$$;

alter table public.property_rates enable row level security;
alter table public.property_rates force row level security;

-- Whoever reaches the Property reads its prices: the front desk quotes them,
-- and a booking is stamped from them in the booker's own transaction.
create policy property_rates_read_accessible_property
  on public.property_rates for select
  using (property_id in (select app.accessible_property_ids()));

-- All five gates (ADR 0012): the four of blueprint 3.5 through
-- can_use_capability at this Property, and the permission. The same pair for
-- both writes, so a price that may be set may also be cleared — which is an
-- update to no amount. There is no delete policy and no delete grant.
create policy property_rates_insert_manage
  on public.property_rates for insert
  with check (
    app.has_organization_permission(organization_id, 'rates.manage')
    and app.can_use_capability(property_id, 'platform_core', 'configuration')
  );

create policy property_rates_update_manage
  on public.property_rates for update
  using (
    app.has_organization_permission(organization_id, 'rates.manage')
    and app.can_use_capability(property_id, 'platform_core', 'configuration')
  )
  with check (
    app.has_organization_permission(organization_id, 'rates.manage')
    and app.can_use_capability(property_id, 'platform_core', 'configuration')
  );

-- A policy bounds rows; a grant bounds columns (ADR 0012). The caller names
-- the Property, the type and the amount; the currency and the stamps are the
-- trigger's. Only the amount changes after — to another, or to none: a price
-- moved to another type or Property is a different price, so one is cleared
-- and the other set.
revoke all on public.property_rates from public, ranza_app, ranza_auth, ranza_worker;
grant select on public.property_rates to ranza_app;
grant insert (organization_id, property_id, unit_type, amount_minor)
  on public.property_rates to ranza_app;
grant update (amount_minor) on public.property_rates to ranza_app;
