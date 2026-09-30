-- past_due is a grace period (OA-S1-14, ADR 0040).
--
-- Gate 1 used to admit trialing and active only, so a card that failed locked
-- a front desk out of its in-house Guests mid-shift. past_due now admits as
-- well; the grace period ends when the Control Plane moves the Subscription to
-- suspended, which is a billing decision rather than a change to this gate.
-- suspended and cancelled still deny.
--
-- The body is 20260916000500's, unchanged except for the list of statuses.
-- Its signature, owner and grants are unchanged, so every caller — Staff,
-- Resident and the worker's writers alike — gets the same answer from the one
-- statement, which is why the gate was extracted in the first place.
create or replace function app.capability_is_available(
  target_property_id uuid,
  target_module_key text,
  target_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- gate 1: the Organization holds an active Subscription, or one in its
    -- grace period
    exists (
      select 1
      from public.properties as property
      join public.subscriptions as subscription
        on subscription.organization_id = property.organization_id
      where property.id = target_property_id
        and subscription.status in ('trialing', 'active', 'past_due')
    )
    -- gate 2: the Subscription includes the Entitlement
    and exists (
      select 1
      from public.properties as property
      join public.entitlements as entitlement
        on entitlement.organization_id = property.organization_id
      where property.id = target_property_id
        and entitlement.module_key = target_module_key
        and entitlement.status = 'active'
    )
    -- gate 3: the capability is enabled for this Property
    and exists (
      select 1
      from public.property_capabilities as capability
      where capability.property_id = target_property_id
        and capability.capability_key = target_capability_key
        and capability.enabled
    );
$$;
