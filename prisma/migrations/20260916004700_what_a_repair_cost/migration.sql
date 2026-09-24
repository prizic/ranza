-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "cost_minor" BIGINT,
ADD COLUMN     "vendor" TEXT;

-- CreateTable
CREATE TABLE "maintenance_request_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "folio_id" UUID NOT NULL,
    "folio_line_id" UUID NOT NULL,
    "charged_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_request_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_request_charges_request_id_idx" ON "maintenance_request_charges"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_request_charges_folio_line_id_folio_id_key" ON "maintenance_request_charges"("folio_line_id", "folio_id");

-- AddForeignKey
ALTER TABLE "maintenance_request_charges" ADD CONSTRAINT "maintenance_request_charges_request_id_property_id_organiz_fkey" FOREIGN KEY ("request_id", "property_id", "organization_id") REFERENCES "maintenance_requests"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_request_charges" ADD CONSTRAINT "maintenance_request_charges_folio_id_property_id_organizat_fkey" FOREIGN KEY ("folio_id", "property_id", "organization_id") REFERENCES "folios"("id", "property_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_request_charges" ADD CONSTRAINT "maintenance_request_charges_folio_line_id_folio_id_fkey" FOREIGN KEY ("folio_line_id", "folio_id") REFERENCES "folio_lines"("id", "folio_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down (RANZ-33 slice 5, docs/features/maintenance)
-- ---------------------------------------------------------------------------

-- What a repair cost, and charging a Guest for damage (MT-S5-*).
--
-- ON THE NUMBER. 004700, after 004600 in the same change.
--
-- Money stays the Folio's. A damage charge is a Folio line posted through the
-- Folios module's write contract, under folio_lines' own policy — so it needs
-- finance.post_charge, whatever maintenance permission the actor holds — and
-- this table only says which request the line was for. A mistake is a
-- reversal line on the Folio, never an edit here (ADR 0015).

-- MT-S5-01, MT-S5-02: what it cost is whole minor units of the Property's
-- currency, and a repair may have cost nothing.
alter table public.maintenance_requests
  add constraint maintenance_requests_cost_check
    check (cost_minor is null or cost_minor >= 0),
  add constraint maintenance_requests_vendor_check
    check (vendor is null or char_length(btrim(vendor)) between 1 and 120);

-- The update policy is maintenance.manage's (20260916004300); these join the
-- columns it may touch.
grant update (cost_minor, vendor) on public.maintenance_requests to ranza_app;

comment on table public.maintenance_request_charges is
  'Which request a damage charge on a Folio was for (RANZ-33 slice 5). The '
  'line is the Folio''s; reversing it happens there. Never deleted.';

alter table public.maintenance_request_charges enable row level security;
alter table public.maintenance_request_charges force row level security;

create policy maintenance_request_charges_read_accessible_property
  on public.maintenance_request_charges for select
  using (property_id in (select app.accessible_property_ids()));

grant select on public.maintenance_request_charges to ranza_app;

-- Linking is part of charging: both capabilities, and the permission that
-- posts the line (MT-S5-05).
create policy maintenance_request_charges_insert_post_charge
  on public.maintenance_request_charges for insert
  with check (
    app.can_use_capability(property_id, 'maintenance', 'maintenance')
    and app.can_use_capability(property_id, 'billing_folios', 'finance')
    and app.has_organization_permission(organization_id, 'finance.post_charge')
  );

-- No update and no delete: a link is what happened.
grant insert (organization_id, property_id, request_id, folio_id, folio_line_id)
  on public.maintenance_request_charges to ranza_app;

-- Who charged it is the database's to say, and the Folio is one the request's
-- room was used on: a Stay in the Unit, or in a bed under it (MT-S5-07). An
-- invoker: the Staff Member charging reaches the Folio and the Stay, or the
-- line could not have been posted.
--
-- And the line is the damage charge itself: a charge, posted in this
-- transaction. Without that a room-night on the same Folio, or a reversal,
-- could be linked and read on the request as damage. `posted_at` is not in
-- ranza_app's insert grant, so it is always the transaction's `now()`, and
-- equality with it says the line was posted alongside the link.
create function app.maintenance_charge_is_for_the_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acting uuid := app.current_user_id();
begin
  if acting is null then
    raise exception 'charging a Guest requires an acting Staff Member'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.folios as folio
      join public.stays as stay
        on stay.id = folio.stay_id
      join public.accommodation_units as unit
        on unit.id = stay.accommodation_unit_id
      join public.maintenance_requests as request
        on request.id = new.request_id
     where folio.id = new.folio_id
       and request.accommodation_unit_id in (unit.id, unit.parent_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'a damage charge is on a Folio of a Stay in the request''s room';
  end if;

  if not exists (
    select 1
      from public.folio_lines as line
     where line.id = new.folio_line_id
       and line.folio_id = new.folio_id
       and line.line_type = 'charge'
       and line.posted_at = now()
  ) then
    raise exception using
      errcode = '23514',
      message = 'a damage charge links the charge posted with it';
  end if;

  new.charged_by := acting;
  new.created_at := now();
  return new;
end;
$$;

create trigger maintenance_request_charges_for_the_room
  before insert on public.maintenance_request_charges
  for each row execute function app.maintenance_charge_is_for_the_room();
