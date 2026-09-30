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
  type Payment,
  type PaymentMethod,
} from "./contracts";
import type { FoliosDeps } from "./ports";
import { CLOSURE_REFUSED, raisedOneOf, REVERSAL_REFUSED } from "./refusals";
import {
  assertPaymentPostable,
  assertPostable,
  DESCRIPTION_MAX,
  postChargeWithin,
  postPaymentWithin,
} from "./write";

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
  propertyId: string;
  stayId: string;
  status: "open" | "closed";
  currency: string;
  guestName: string;
  unitName: string;
  balanceMinor: string;
  lineCount: number;
  stayInHouse: boolean;
}

interface LineRow {
  lineId: string;
  lineType: "charge" | "payment" | "reversal";
  description: string;
  amountMinor: string;
  paymentMethod: PaymentMethod | null;
  reversesLineId: string | null;
  reversed: boolean;
  postedAt: Date;
  roomNightOf: string | null;
}

type Nullable<T> = { [K in keyof T]: T[K] | null };

function toSummary(row: SummaryRow): FolioSummary {
  // char(3) is blank-padded, and the amounts arrive as text so a bigint never
  // becomes a float on the way. Named rather than spread, because a detail row
  // carries a line's columns beside these.
  return {
    folioId: row.folioId,
    propertyId: row.propertyId,
    stayId: row.stayId,
    status: row.status,
    currency: row.currency.trim(),
    guestName: row.guestName,
    unitName: row.unitName,
    balanceMinor: Number(row.balanceMinor),
    lineCount: row.lineCount,
    stayInHouse: row.stayInHouse,
  };
}

function toLine(row: LineRow): FolioLine {
  return {
    lineId: row.lineId,
    lineType: row.lineType,
    description: row.description,
    amountMinor: Number(row.amountMinor),
    paymentMethod: row.paymentMethod,
    reversesLineId: row.reversesLineId,
    reversed: row.reversed,
    postedAt: row.postedAt,
    roomNightOf: row.roomNightOf,
  };
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
      folio.property_id                     as "propertyId",
      stay.id                               as "stayId",
      folio.status                          as "status",
      folio.currency                        as "currency",
      coalesce(guest.full_name, '')         as "guestName",
      unit.name                             as "unitName",
      coalesce(sum(line.amount_minor), 0)::text as "balanceMinor",
      count(line.id)::int                   as "lineCount",
      stay.status = 'in_house'              as "stayInHouse"
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
          // Not `order by folio.status`: status is text, and 'closed' sorts
          // before 'open', which listed the finished Folios first (FO-S9-02).
          `order by folio.status = 'open' desc, unit.name, folio.id`,
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
   * One statement, so the balance and the lines it is the sum of come from one
   * snapshot. Two statements — even in one transaction, at READ COMMITTED —
   * each take their own, so a charge committing between them printed a total
   * that did not match its own rows (FO-S3-02): the drift a stored total was
   * avoided to prevent, arriving by a different route. The summary is the same
   * `folioQuery` the list uses; each line is left-joined to it, and a Folio with
   * no lines comes back as one row whose line columns are null.
   *
   * Null for a Folio the viewer cannot reach and for one that does not exist,
   * which are the same answer on purpose.
   */
  async function folioDetail(
    userId: string,
    folioId: string,
  ): Promise<FolioDetail | null> {
    const rows = await withOrganizationContext(deps.db, { userId }, (tx) =>
      tx.$queryRawUnsafe<(SummaryRow & Nullable<LineRow>)[]>(
        `select summary.*,
                line.id                 as "lineId",
                line.line_type          as "lineType",
                line.description        as "description",
                line.amount_minor::text as "amountMinor",
                line.payment_method     as "paymentMethod",
                line.reverses_line_id   as "reversesLineId",
                exists (
                  select 1 from public.folio_lines as cancelling
                  where cancelling.reverses_line_id = line.id
                )                       as "reversed",
                line.posted_at          as "postedAt",
                case when line.source = 'room_night'
                     then to_char(line.business_date, 'YYYY-MM-DD')
                end                     as "roomNightOf"
           from (${folioQuery("folio.id = $1::uuid")}) as summary
           left join public.folio_lines as line
             on line.folio_id = summary."folioId"
          order by line.posted_at desc nulls last, line.id`,
        folioId,
        FOLIO_CAPABILITY.moduleKey,
        FOLIO_CAPABILITY.capabilityKey,
      ),
    );

    const [first] = rows;
    if (!first) return null;

    const lines = rows.flatMap((row) =>
      row.lineId === null ? [] : [toLine(row as LineRow)],
    );
    return { ...toSummary(first), lines };
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
      const { lineId } = await postChargeWithin(tx, userId, charge);
      return { lineId };
    });
  }

  /**
   * Posts a payment, and records who posted it.
   */
  async function postPayment(
    userId: string,
    payment: Payment,
  ): Promise<{ lineId: string }> {
    assertPaymentPostable(payment);
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const { lineId } = await postPaymentWithin(tx, userId, payment);
      return { lineId };
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
        // What was taken off comes back with the reversal — the original
        // line's amount and description and the Folio's currency — because a
        // reversal is the record a reader of the audit log is most often
        // looking for, and "which charge, for how much" is its first question.
        reversed = await tx.$queryRaw<
          {
            id: string;
            folioId: string;
            organizationId: string;
            propertyId: string;
            amountMinor: string;
            description: string;
            currency: string;
          }[]
        >`
          with reversed as (
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
              and original.line_type in ('charge', 'payment')
            returning id, folio_id, organization_id, property_id, amount_minor,
                      reverses_line_id
          )
          select reversed.id,
                 reversed.folio_id        as "folioId",
                 reversed.organization_id as "organizationId",
                 reversed.property_id     as "propertyId",
                 (-reversed.amount_minor)::text as "amountMinor",
                 original.description,
                 folio.currency::text     as "currency"
            from reversed
            join public.folio_lines as original
              on original.id = reversed.reverses_line_id
            join public.folios as folio on folio.id = reversed.folio_id
        `;
      } catch (error: unknown) {
        // Already reversed, the Folio is closed, or no permission to reverse.
        // Anything else is a defect and travels on as itself (FO-S9-04).
        if (!raisedOneOf(error, REVERSAL_REFUSED)) throw error;
        throw new FolioWriteError("that line could not be reversed", {
          cause: error,
        });
      }

      const [line] = reversed;
      if (!line) {
        throw new FolioWriteError("that line could not be reversed");
      }

      await recordWithin(tx, {
        organizationId: line.organizationId,
        locationId: line.propertyId,
        actorId: userId,
        action: "folio.line_reversed",
        subjectType: "folio",
        subjectId: line.folioId,
        reason: explanation,
        context: {
          reversedLineId: lineId,
          reversalLineId: line.id,
          // The amount taken off or restored, positive.
          amountMinor: Math.abs(Number(line.amountMinor)),
          currency: line.currency,
          description: line.description,
        },
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
      let closed;
      try {
        closed = await tx.$queryRaw<
          { organizationId: string; propertyId: string; currency: string }[]
        >`
          update public.folios
             set status = 'closed',
                 closed_at = now(),
                 updated_at = now()
           where id = ${folioId}::uuid
             and status = 'open'
          returning organization_id as "organizationId",
                    property_id     as "propertyId",
                    currency::text  as "currency"
        `;
      } catch (error: unknown) {
        // The Guest is still in house, or the front desk's settled-only rule.
        // Anything else is a defect and travels on as itself (FO-S9-04).
        if (!raisedOneOf(error, CLOSURE_REFUSED)) throw error;
        throw new FolioWriteError("that Folio could not be closed", {
          cause: error,
        });
      }

      const [folio] = closed;
      if (!folio) {
        // Out of reach, already closed, or never existed. The UPDATE policy's
        // USING refuses quietly by matching no rows, so "no row returned" is a
        // refusal and must be read as one.
        throw new FolioWriteError("that Folio could not be closed");
      }

      // The balance it was closed on is the fact a closure is later
      // questioned about. Read in the same transaction, so it is the balance
      // the closure saw.
      const [balance] = await tx.$queryRaw<{ balanceMinor: string }[]>`
        select coalesce(sum(amount_minor), 0)::text as "balanceMinor"
        from public.folio_lines
        where folio_id = ${folioId}::uuid
      `;

      await recordWithin(tx, {
        organizationId: folio.organizationId,
        locationId: folio.propertyId,
        actorId: userId,
        action: "folio.closed",
        subjectType: "folio",
        subjectId: folioId,
        context: {
          balanceMinor: Number(balance?.balanceMinor ?? 0),
          currency: folio.currency,
        },
      });

      return { folioId };
    });
  }

  return {
    listFolios,
    folioDetail,
    postCharge,
    postPayment,
    reverseLine,
    closeFolio,
  };
}

export type FoliosModule = ReturnType<typeof createFoliosModule>;
