-- Reversing a charge is its own permission (FO-S4-10, ADR 0041).
--
-- Hand-written; this migration adds no column and no table.
--
-- ON THE NUMBER. 009600 to 009699 belong to decisions/folios.
--
-- Until now folio_lines_insert_finance asked finance.post_charge for every
-- line, so whoever could put a charge on a Folio could also take one off.
-- Voiding a charge is the classic fraud and error vector, and room nights
-- (ADR 0038) make reversals routine, so the two are separated: a reversal line
-- asks finance.reverse_charge, a charge still asks finance.post_charge.

-- ---------------------------------------------------------------------------
-- The permission
-- ---------------------------------------------------------------------------

-- First, because staff_roles_permissions_are_known refuses a key the
-- catalogue does not hold (20260916002300).
insert into public.staff_permissions (key, module_key)
values ('finance.reverse_charge', 'billing_folios')
on conflict (key) do nothing;

-- Every role that could reverse yesterday can reverse today. That is the
-- shipped Owner, Manager and Finance roles and any role an Organization wrote
-- that holds finance.post_charge — a "Night auditor" would otherwise lose an
-- ability silently, and an administrator can grant only what they hold
-- themselves (20260916007000), so nobody below the Owner could give it back.
-- An Organization that wants somebody who posts and does not reverse takes it
-- off afterwards; that is the choice this migration makes possible. Appended
-- rather than assigned, for the reason 20260916006000 gives.
update public.staff_roles
   set permissions = array_append(permissions, 'finance.reverse_charge'),
       updated_at = now()
 where 'finance.post_charge' = any (permissions)
   and not ('finance.reverse_charge' = any (permissions));

-- staff_roles is FORCE row level security and this migration brings no policy
-- for the statement above, so a migrating role that stopped bypassing it would
-- match nothing and say nothing. Asserted, as 20260916006000 does: the three
-- shipped roles hold it, and no role holds post_charge without it.
do $$
begin
  if (select count(*) from public.staff_roles
       where organization_id is null
         and key in ('owner', 'manager', 'finance')
         and 'finance.reverse_charge' = any (permissions)) <> 3 then
    raise exception 'finance.reverse_charge did not reach the shipped owner, manager and finance roles';
  end if;
  if exists (select 1 from public.staff_roles
              where 'finance.post_charge' = any (permissions)
                and not ('finance.reverse_charge' = any (permissions))) then
    raise exception 'a role holds finance.post_charge without finance.reverse_charge';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The policy
-- ---------------------------------------------------------------------------

-- From its latest definition (20260916002300), with the permission chosen by
-- the line's own type. Still one policy rather than a second one beside it:
-- permissive policies are OR-ed, so a reversal policy added next to this one
-- would let a post_charge holder through the first for a reversal line.
drop policy folio_lines_insert_finance on public.folio_lines;
create policy folio_lines_insert_finance
  on public.folio_lines for insert
  with check (
    app.can_use_capability(property_id, 'billing_folios', 'finance')
    and case when line_type = 'reversal'
             then app.has_organization_permission(organization_id, 'finance.reverse_charge')
             else app.has_organization_permission(organization_id, 'finance.post_charge')
        end
  );

comment on policy folio_lines_insert_finance on public.folio_lines is
  'A charge asks finance.post_charge and a reversal asks finance.reverse_charge (ADR 0041), behind the four gates can_use_capability carries (ADR 0012).';
