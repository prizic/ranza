import { withOrganizationContext } from "@ranza/db";
import { recordWithin } from "@ranza/platform-audit";
import {
  FOLIO_CAPABILITY,
  FolioAmountError,
  FolioWriteError,
  type Charge,
  type FolioDetail,
  type FolioLine,
  type FolioSummary,
} from "./contracts";
import type { FoliosDeps } from "./ports";

/**
 * Billing and Folios: the first time the product holds money.
 *
 * Like every Ranza module this one owns no authorization logic. Blueprint 3.5
 * is decided by `app.can_use_capability()` and row-level security, in the
 * database, for writing as well as reading (ADR 0012). Nothing below asks
 * whether the actor may do this; the statements run inside a request context
 * and the policies answer.
 *
 * What it does own is arithmetic, and there is deliberately almost none: a
 * balance is `sum(amount_minor)` in the query that read the lines, and a
 * reversal is `-original.amount_minor` computed by the database from the row
 * it is cancelling. Neither number is ever carried through this process, which
 * is what makes "the balance is the sum of the lines" a fact rather than a
 * convention (ADR 0015).
 */

/** Matches `folio_lines_description_check`. Said here so the caller learns which field. */
const DESCRIPTION_MAX = 200;

/**
 * A reversal's reason has to satisfy two things at once, so it is checked
 * against both here rather than against whichever it happens to reach first.
 *
 * It becomes the reversal line's `description`, which the database limits to
 * DESCRIPTION_MAX, and the audit record's `reason`, which the audit module
 * requires to be at least three characters. A two-character reason therefore
 * used to pass the insert and fail the record — after the line had been
 * written — producing a rollback and an error naming a field the caller never
 * mentioned. Found by breaking the atomicity test and discovering it had been
 * passing for this reason rather than the one it claimed.
 */
const REASON_MIN = 3;

/** Rows come back as text so a bigint never becomes a float on the way. */
interface SummaryRow {
  folioId: string;
  stayId: string;
  status: "open" | "closed";
  currency: string;
  guestName: string;
  unitName: string;
  balanceMinor: string;
  lineCount: number;
}

interface LineRow {
  lineId: string;
  lineType: "charge" | "reversal";
  description: string;
  amountMinor: string;
  reversesLineId: string | null;
  reversed: boolean;
  postedAt: Date;
}

function toSummary(row: SummaryRow): FolioSummary {
  // char(3) is blank-padded, and the amounts arrive as text so a bigint never
  // becomes a float on the way. Everything else is already the contract.
  return {
    ...row,
    currency: row.currency.trim(),
    balanceMinor: Number(row.balanceMinor),
  };
}

function toLine(row: LineRow): FolioLine {
  return { ...row, amountMinor: Number(row.amountMinor) };
}

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
function assertPostable(charge: Charge): void {
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
 * Every Folio read, with the balance among its columns.
 *
 * One function rather than two queries sharing a select list, because the
 * halves that were left duplicated are the ones that decide the balance: add
 * a join to the list and forget the detail, and the same Folio shows two
 * different totals. `predicate` is the only thing the two callers disagree
 * about, so it is the only thing they pass.
 *
 * The sum is here rather than in a view or a function, and that is the
 * decision ADR 0015 records. A view would need its own grant and its own
 * reasoning about whose policies apply to it; a `security definer` function
 * would be worse, because it could return a balance over lines the reader
 * cannot see — a total that disagrees with the lines printed underneath it.
 * Aggregating in the same statement that selects the lines makes that
 * impossible by construction: the sum is over exactly the rows the policy let
 * through, so the screen and the number cannot tell different stories.
 */
function folioQuery(predicate: string, order = ""): string {
  return `
    select
      folio.id                              as "folioId",
      stay.id                               as "stayId",
      folio.status                          as "status",
      folio.currency                        as "currency",
      coalesce(guest.full_name, '')         as "guestName",
      unit.name                             as "unitName",
      coalesce(sum(line.amount_minor), 0)::text as "balanceMinor",
      count(line.id)::int                   as "lineCount"
    from public.folios as folio
    join public.stays as stay
      on stay.id = folio.stay_id
    join public.accommodation_units as unit
      on unit.id = stay.accommodation_unit_id
    left join public.reservations as reservation
      on reservation.id = stay.reservation_id
    -- Left, because the Reservation is: a Stay that began without one has no
    -- Guest recorded anywhere, and the Unit names them instead.
    left join public.guests as guest
      on guest.id = reservation.guest_id
    left join public.folio_lines as line
      on line.folio_id = folio.id
    where ${predicate}
      and app.can_use_capability(folio.property_id, $2, $3)
    group by folio.id, stay.id, unit.name, guest.full_name
    ${order}`;
}

export function createFoliosModule(deps: FoliosDeps) {
  /**
   * The Folios at one Property, open ones first.
   *
   * Empty is the correct answer for a Property the viewer cannot reach, for
   * one whose Organization lost the Entitlement, and for a Property where
   * nobody has checked in yet. Those are different situations with
   * deliberately identical answers.
   */
  async function listFolios(
    userId: string,
    propertyId: string,
  ): Promise<FolioSummary[]> {
    const rows = await withOrganizationContext(deps.db, { userId }, (tx) =>
      tx.$queryRawUnsafe<SummaryRow[]>(
        folioQuery(
          "folio.property_id = $1::uuid",
          "order by folio.status, unit.name",
        ),
        propertyId,
        FOLIO_CAPABILITY.moduleKey,
        FOLIO_CAPABILITY.capabilityKey,
      ),
    );
    return rows.map(toSummary);
  }

  /**
   * One Folio and everything posted to it.
   *
   * Two statements in one transaction, so the balance and the lines it is the
   * sum of are read at the same instant. Separately, a charge posted between
   * them would produce a screen whose total does not match its own rows —
   * which is exactly the drift a stored total was avoided to prevent, arriving
   * by a different route.
   *
   * Null for a Folio the viewer cannot reach and for one that does not exist,
   * which are the same answer on purpose.
   */
  async function folioDetail(
    userId: string,
    folioId: string,
  ): Promise<FolioDetail | null> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const rows = await tx.$queryRawUnsafe<SummaryRow[]>(
        folioQuery("folio.id = $1::uuid"),
        folioId,
        FOLIO_CAPABILITY.moduleKey,
        FOLIO_CAPABILITY.capabilityKey,
      );

      const [summary] = rows;
      if (!summary) return null;

      const lines = await tx.$queryRaw<LineRow[]>`
        select
          line.id               as "lineId",
          line.line_type        as "lineType",
          line.description      as "description",
          line.amount_minor::text as "amountMinor",
          line.reverses_line_id as "reversesLineId",
          exists (
            select 1 from public.folio_lines as cancelling
            where cancelling.reverses_line_id = line.id
          )                     as "reversed",
          line.posted_at        as "postedAt"
        from public.folio_lines as line
        where line.folio_id = ${folioId}::uuid
        order by line.posted_at desc, line.id
      `;

      return { ...toSummary(summary), lines: lines.map(toLine) };
    });
  }

  /**
   * Posts a charge, and records who posted it.
   *
   * Two writes in one transaction, so they share one fate. A charge nobody
   * recorded and a record of a charge that was never posted are each worse
   * than the posting not happening, and each is what a second transaction here
   * would eventually produce.
   *
   * Nothing here checks whether the actor is allowed to do this. The insert
   * policy carries all four of blueprint 3.5's gates, the trigger refuses a
   * closed Folio, and the check constraints refuse an amount that is not one —
   * so a refusal arrives as an exception from the database rather than from a
   * condition this module remembered to write.
   */
  async function postCharge(
    userId: string,
    charge: Charge,
  ): Promise<{ lineId: string }> {
    assertPostable(charge);

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
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
      } catch {
        // Closed, unentitled, out of reach. One message for all of them:
        // telling them apart would confirm that a Folio the caller cannot see
        // is there.
        throw new FolioWriteError("that charge could not be posted");
      }

      const [line] = posted;
      if (!line) {
        // The select found no Folio: out of reach, or no such Folio. The
        // insert wrote nothing rather than raising, which is the quiet half of
        // the same refusal.
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

      return { lineId: line.id };
    });
  }

  /**
   * Corrects a line by posting the one that cancels it.
   *
   * Never an edit and never a removal: blueprint 7.4 requires that financial
   * history is corrected by adding a record, and the grants, the missing
   * policies and the append-only trigger each refuse the alternative
   * independently.
   *
   * The amount is `-original.amount_minor`, computed by the database from the
   * row being cancelled. It is not passed in and never travels through this
   * process, so a reversal that does not exactly cancel its line is not a
   * thing a caller can ask for — and the trigger refuses one anyway.
   *
   * `reason` is required here although the column is nullable, because
   * blueprint 4.4 makes it the caller that decides which actions need one, and
   * taking money off a Guest's account is such an action.
   */
  async function reverseLine(
    userId: string,
    lineId: string,
    reason: string,
  ): Promise<{ lineId: string }> {
    const explanation = reason.trim();
    if (
      explanation.length < REASON_MIN ||
      explanation.length > DESCRIPTION_MAX
    ) {
      throw new FolioAmountError(
        `a reason must be between ${REASON_MIN} and ${DESCRIPTION_MAX} characters`,
      );
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let reversed;
      try {
        reversed = await tx.$queryRaw<
          { id: string; folioId: string; organizationId: string }[]
        >`
          insert into public.folio_lines
            (organization_id, property_id, folio_id, line_type, description,
             amount_minor, reverses_line_id)
          select
            original.organization_id,
            original.property_id,
            original.folio_id,
            'reversal',
            ${explanation},
            -original.amount_minor,
            original.id
          from public.folio_lines as original
          where original.id = ${lineId}::uuid
            and original.line_type = 'charge'
          returning
            id,
            folio_id        as "folioId",
            organization_id as "organizationId"
        `;
      } catch {
        // Already reversed, the Folio is closed, or out of reach.
        throw new FolioWriteError("that line could not be reversed");
      }

      const [line] = reversed;
      if (!line) {
        throw new FolioWriteError("that line could not be reversed");
      }

      await recordWithin(tx, {
        organizationId: line.organizationId,
        actorId: userId,
        action: "folio.line_reversed",
        subjectType: "folio",
        subjectId: line.folioId,
        reason: explanation,
        context: { reversedLineId: lineId, reversalLineId: line.id },
      });

      return { lineId: line.id };
    });
  }

  /**
   * Closes a Folio, so nothing more can be posted to it.
   *
   * Only an open Folio moves, and the caller learns that a second attempt did
   * nothing from the absent row rather than from a second read — the predicate
   * is re-evaluated after any concurrent transaction holding the row lock
   * commits, so two people pressing the button produce one closure.
   *
   * There is no rule here about the balance. Blueprint 5.9 lists folio closure
   * rules as its own concern, and a "must be settled first" invented at this
   * point would be inventing that workflow.
   */
  async function closeFolio(
    userId: string,
    folioId: string,
  ): Promise<{ folioId: string }> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const closed = await tx.$queryRaw<{ organizationId: string }[]>`
        update public.folios
           set status = 'closed',
               closed_at = now(),
               updated_at = now()
         where id = ${folioId}::uuid
           and status = 'open'
        returning organization_id as "organizationId"
      `;

      const [folio] = closed;
      if (!folio) {
        // Out of reach, already closed, or never existed. The UPDATE policy's
        // USING refuses quietly by matching no rows, so "no row returned" is a
        // refusal and must be read as one.
        throw new FolioWriteError("that Folio could not be closed");
      }

      await recordWithin(tx, {
        organizationId: folio.organizationId,
        actorId: userId,
        action: "folio.closed",
        subjectType: "folio",
        subjectId: folioId,
      });

      return { folioId };
    });
  }

  return { listFolios, folioDetail, postCharge, reverseLine, closeFolio };
}

export type FoliosModule = ReturnType<typeof createFoliosModule>;
