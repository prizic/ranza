import type { TenantClient } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import { FolioAmountError, FolioWriteError, type Charge } from "./contracts";

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
 * Closes the empty Folio of a Stay that has just been withdrawn.
 *
 * `Empty` is in the name because this is not the general "close a Folio" that
 * check-out needs. It takes no per-Stay advisory lock and checks no balance; it
 * leans entirely on the Stay being `cancelled`. Check-out's version has to do
 * both — see PRE-03 in docs/features/check-out/edge-cases.csv — and naming this
 * one `closeFolioWithin` would have made that prerequisite look done.
 *
 * Deliberately not `closeFolio`. That opens its own `withOrganizationContext`
 * transaction, so it could not see the withdrawal that has not committed yet:
 * it would find the Stay still in house, or close the Folio in a transaction
 * that survives a withdrawal which then rolls back. A withdrawal and the
 * closing of its Folio share one fate, so they share one transaction.
 *
 * Only an `open` Folio moves, only for a Stay that is `cancelled`, and only
 * while it has no lines. `stays_withdrawal_is_free_of_charges` already refuses
 * to cancel a Stay with anything posted against it, so the last condition
 * should never decide anything — which is exactly why it is there rather than
 * in a comment. It takes no per-Stay lock and reads no balance, so if it ever
 * did meet a Folio with money on it, closing it would be silent and wrong. A
 * database older than that trigger can still hold one.
 *
 * Returns null when there is nothing to close — the Property does no billing,
 * or the Folio is already closed. Both are states, not failures.
 */
export async function closeEmptyFolioWithin(
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
       and not exists (
         select 1 from public.folio_lines as line
          where line.folio_id = folio.id
       )
    returning folio.id
  `;

  return rows[0] ? { folioId: rows[0].id } : null;
}

/** Matches `folio_lines_description_check`. Said here so the caller learns which field. */
export const DESCRIPTION_MAX = 200;

/**
 * Rejects an amount the database would reject anyway.
 *
 * Both places on purpose. The check constraint is the boundary that holds when
 * this code is wrong; this is the one that says which field was wrong before a
 * constraint violation has to be decoded. It also catches the two things the
 * constraint cannot see, because by then they are no longer integers: a
 * fractional amount silently truncated on the way, and one beyond the range a
 * JavaScript number represents exactly.
 */
export function assertPostable(charge: Charge): void {
  if (!Number.isSafeInteger(charge.amountMinor)) {
    throw new FolioAmountError(
      "an amount is a whole number of minor units, within the exact integer range",
    );
  }
  if (charge.amountMinor <= 0) {
    throw new FolioAmountError(
      "a charge is positive; to take money off, reverse a line",
    );
  }
  const description = charge.description.trim();
  if (description.length < 1 || description.length > DESCRIPTION_MAX) {
    throw new FolioAmountError(
      `a description must be between 1 and ${DESCRIPTION_MAX} characters`,
    );
  }
}

/**
 * Posts a charge, and records who posted it, for a caller that owns the
 * transaction.
 *
 * The charge and its audit record share one fate, and a caller that links the
 * line to something of its own — a maintenance request charging a Guest for
 * damage — shares it too: a line posted and never linked, or linked to a line
 * that rolled back, is what a second transaction would eventually produce.
 *
 * Nothing here checks whether the actor is allowed to do this. The insert
 * policy carries all four of blueprint 3.5's gates and `finance.post_charge`,
 * the trigger refuses a closed Folio, and the check constraints refuse an
 * amount that is not one — so a refusal arrives as an exception from the
 * database rather than from a condition this module remembered to write.
 */
export async function postChargeWithin(
  tx: FolioWriteClient,
  userId: string,
  charge: Charge,
): Promise<{ lineId: string; organizationId: string }> {
  assertPostable(charge);

  // organization_id and property_id are read from the Folio rather than
  // taken from the caller, so the composite foreign key has something true
  // to prove rather than something plausible to accept.
  let posted;
  try {
    posted = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
      insert into public.folio_lines
        (organization_id, property_id, folio_id, line_type, description, amount_minor)
      select
        folio.organization_id,
        folio.property_id,
        folio.id,
        'charge',
        ${charge.description.trim()},
        ${charge.amountMinor}::bigint
      from public.folios as folio
      where folio.id = ${charge.folioId}::uuid
      returning id, organization_id as "organizationId"
    `;
  } catch (error: unknown) {
    // Closed, unentitled, out of reach. One message for all of them: telling
    // them apart would confirm that a Folio the caller cannot see is there.
    // The database's own answer travels as the cause, for whoever logs it.
    throw new FolioWriteError("that charge could not be posted", {
      cause: error,
    });
  }

  const [line] = posted;
  if (!line) {
    // The select found no Folio: out of reach, or no such Folio. The insert
    // wrote nothing rather than raising, which is the quiet half of the same
    // refusal.
    throw new FolioWriteError("that charge could not be posted");
  }

  await recordWithin(tx, {
    organizationId: line.organizationId,
    actorId: userId,
    action: "folio.charge_posted",
    subjectType: "folio",
    subjectId: charge.folioId,
    context: {
      lineId: line.id,
      amountMinor: charge.amountMinor,
      description: charge.description.trim(),
    },
  });

  return { lineId: line.id, organizationId: line.organizationId };
}
