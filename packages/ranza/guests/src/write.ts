import type { TenantClient } from "@ranza/db";
import {
  GUEST_DETAILS,
  GuestDetailsError,
  type GuestDetails,
} from "./contracts";

/**
 * Recording who a booking is for, for a caller that owns the transaction.
 *
 * This module owns the `guests` table, and the tier rule is that no other
 * module writes to it. Front Office needs to — taking a booking is the only
 * thing that creates a Guest today — so it goes through this rather than
 * issuing its own SQL, which is what keeps the rule true rather than merely
 * stated, exactly as `openStayWithin` and `openFolioWithin` do.
 *
 * It takes the transaction instead of opening one for the same reason those
 * two do: a Guest recorded without the Reservation that named them is a
 * profile nobody asked for, and a Reservation with no Guest is unrepresentable.
 * They share one fate.
 *
 * The caller is responsible for the request context. Without one the policies
 * see a null acting user and deny, which is the safe direction.
 */

/** The transaction surface this statement needs. */
export interface GuestWriteClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** The write was refused: out of reach, unentitled, or no front desk. */
export class GuestWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuestWriteError";
  }
}

export interface IdentifiedGuest {
  guestId: string;
  /** False when these details named somebody the Organization already had. */
  created: boolean;
}

/**
 * Trimmed, and empty becomes absent.
 *
 * An email of spaces is not an email, and storing it as one would make it a
 * key that matches the next person who also typed nothing. The address is
 * lowercased because `guests_email_is_normalized` requires it and the unique
 * index is over the stored value — an address is not case-sensitive in the way
 * that matters here, and two spellings of one person is the failure this table
 * exists to avoid.
 */
function normalize(value: string | null, lower = false): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return null;
  return lower ? trimmed.toLowerCase() : trimmed;
}

/**
 * The Guest these details name, creating one when the Organization has nobody
 * matching.
 *
 * Matching is an exact email within the Organization and nothing else. That is
 * deliberately the narrowest possible rule: blueprint 18.7 forbids merging
 * ambiguous people automatically and asks for staff review with the evidence in
 * front of them, so anything fuzzier — a similar name, a shared phone — belongs
 * to that workflow and not to a booking form. An exact address is not an
 * ambiguous match; two bookings under one is the same person, and treating them
 * as two is the duplicate that review would later have to undo.
 *
 * Two people booked with no email are therefore two Guests, which is correct:
 * nothing distinguishes them, and guessing would be the merge 18.7 forbids.
 *
 * `on conflict` rather than a select and then an insert. The second is a race
 * with a window — two clerks booking the same returning Guest at once both read
 * "nobody", and one of them hits the unique index — and this has none.
 * The existing row's own details are kept: somebody booking as "A. Lovelace"
 * must not silently rewrite the profile, which is an edit and belongs to a
 * screen that says so.
 */
export async function identifyGuestWithin(
  tx: GuestWriteClient,
  details: GuestDetails,
): Promise<IdentifiedGuest> {
  const fullName = normalize(details.fullName) ?? "";
  const email = normalize(details.email, true);
  const phone = normalize(details.phone);

  // Measured here as well as by the check constraints, so a form can be told
  // which field and which way. The constraint is still the boundary: these
  // bounds are its own, published for exactly this.
  if (
    fullName.length < GUEST_DETAILS.name.min ||
    fullName.length > GUEST_DETAILS.name.max
  ) {
    throw new GuestDetailsError(
      `a Guest's name must be between ${GUEST_DETAILS.name.min} and ${GUEST_DETAILS.name.max} characters`,
      "fullName",
    );
  }
  if (email && email.length > GUEST_DETAILS.email.max) {
    throw new GuestDetailsError(
      `an email address must be at most ${GUEST_DETAILS.email.max} characters`,
      "email",
    );
  }
  if (phone && phone.length > GUEST_DETAILS.phone.max) {
    throw new GuestDetailsError(
      `a telephone number must be at most ${GUEST_DETAILS.phone.max} characters`,
      "phone",
    );
  }

  const rows = await tx.$queryRaw<{ id: string; created: boolean }[]>`
    insert into public.guests (organization_id, full_name, email, phone)
    values (
      ${details.organizationId}::uuid,
      ${fullName},
      ${email},
      ${phone}
    )
    on conflict (organization_id, email) where email is not null
      -- A no-op that is still an UPDATE, which is what makes RETURNING give
      -- back the existing row. Assigning anything else would edit a profile
      -- because somebody booked a second time.
      do update set updated_at = public.guests.updated_at
    returning id, (xmax = 0) as created
  `;

  const [row] = rows;
  if (!row) {
    // Reachable when a policy denied: either the insert, or — on a returning
    // Guest — the update whose USING clause carries gates 1-4 against the
    // Organization. Both are "you cannot record a Guest here".
    throw new GuestWriteError("the Guest was not recorded");
  }
  return { guestId: row.id, created: row.created };
}
