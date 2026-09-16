import type { TenantClient } from "@ranza/db";

/**
 * Opening a Folio, for a caller that owns the transaction.
 *
 * This module owns the `folios` table, and the tier rule is that no other
 * module writes to it. Front Office needs to — blueprint 6.1 step 5 has
 * Billing create the Folio as part of turning a Reservation into a Stay — so it
 * goes through this rather than issuing its own SQL, which is what keeps the
 * rule true rather than merely stated.
 *
 * It takes the transaction instead of opening one, for the same reason
 * `recordWithin` and `openStayWithin` do: a check-in creates the Stay, moves
 * the Reservation, opens the Folio and records the actor, and those four share
 * one fate.
 *
 * The caller is responsible for the request context. Without one the policies
 * see a null acting user and deny, which is the safe direction.
 */

/** The transaction surface this statement needs. */
export interface FolioWriteClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Opens the Folio a Stay will accrue against, when that Property does billing.
 *
 * Returns null rather than throwing when it does not, and that is the
 * interesting case. A Property whose Organization has no `billing_folios`
 * Entitlement, or which has not enabled `finance`, correctly holds no Folios —
 * and a check-in there must still work. Front Office is gated on `front_desk`,
 * which is a different key; coupling the two would make an unentitled billing
 * module break the front desk.
 *
 * The condition is `app.can_use_capability()`, the same function the insert
 * policy names, so there is exactly one definition of "may this Property hold
 * a Folio" and the policy still refuses independently if this is ever wrong.
 *
 * Every value written comes from the rows the database returned, never from
 * the caller — including the currency, which is read from the Property rather
 * than supplied. A caller that could name a currency could restate a Folio.
 */
export async function openFolioWithin(
  tx: FolioWriteClient,
  stayId: string,
): Promise<{ folioId: string } | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    insert into public.folios
      (organization_id, property_id, stay_id, currency)
    select
      stay.organization_id,
      stay.property_id,
      stay.id,
      property.currency
    from public.stays as stay
    join public.properties as property
      on property.id = stay.property_id
    where stay.id = ${stayId}::uuid
      and app.can_use_capability(stay.property_id, 'billing_folios', 'finance')
    returning id
  `;

  // No row means the Stay is out of reach or the Property does not do billing.
  // Both are "there is no Folio", which is a state and not a failure.
  return rows[0] ? { folioId: rows[0].id } : null;
}

/**
 * Closes the Folio of a Stay that has just been withdrawn.
 *
 * Deliberately not `closeFolio`. That opens its own `withOrganizationContext`
 * transaction, so it could not see the withdrawal that has not committed yet:
 * it would find the Stay still in house, or close the Folio in a transaction
 * that survives a withdrawal which then rolls back. A withdrawal and the
 * closing of its Folio share one fate, so they share one transaction.
 *
 * Only an `open` Folio moves, and only for a Stay that is `cancelled`. The
 * second is the whole safety of this: `stays_withdrawal_is_free_of_charges`
 * refuses to cancel a Stay with anything posted against it, so a Folio reached
 * through a cancelled Stay is provably empty and closing it can lose nothing.
 * It is a condition rather than a comment because a later change to the
 * withdrawal rule would otherwise make this silently wrong.
 *
 * Returns null when there is nothing to close — the Property does no billing,
 * or the Folio is already closed. Both are states, not failures.
 */
export async function closeFolioWithin(
  tx: FolioWriteClient,
  stayId: string,
): Promise<{ folioId: string } | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    update public.folios as folio
       set status = 'closed',
           closed_at = now(),
           updated_at = now()
      from public.stays as stay
     where stay.id = folio.stay_id
       and folio.stay_id = ${stayId}::uuid
       and folio.status = 'open'
       and stay.status = 'cancelled'
    returning folio.id
  `;

  return rows[0] ? { folioId: rows[0].id } : null;
}
