import { withOrganizationContext } from "@ranza/db";
import {
  DESCRIPTION_MAX,
  FolioAmountError,
  FolioWriteError,
  postChargeWithin,
} from "@ranza/folios";
import { recordWithin } from "@ranza/platform-audit";
import {
  MaintenanceInputError,
  MaintenanceRefusedError,
  VENDOR,
  type ChargeableStay,
} from "./contracts";
import type { MaintenanceDeps } from "./ports";
import { refusal } from "./refusals";

/**
 * What a repair cost, and charging a Guest for damage (RANZ-33 slice 5).
 *
 * The cost is the request's, worked by whoever works the board. A charge is
 * the Folio's: its line is posted through the Folios module's write contract,
 * under `folio_lines`' own policy, so it takes `finance.post_charge` whatever
 * maintenance permission the actor holds. This module only links the line to
 * the request, in the same transaction, and a mistake is a reversal on the
 * Folio (ADR 0015).
 */

export function createMoneyCommands(deps: MaintenanceDeps) {
  /**
   * Records what a repair cost and who did it, or clears either (MT-S5-01).
   * Whole minor units of the Property's currency; zero is a repair that cost
   * nothing (MT-S5-02).
   */
  async function recordCost(
    userId: string,
    input: {
      requestId: string;
      costMinor: number | null;
      vendor: string | null;
    },
  ): Promise<void> {
    const { costMinor } = input;
    if (
      costMinor !== null &&
      (!Number.isSafeInteger(costMinor) || costMinor < 0)
    ) {
      throw new MaintenanceInputError(
        "a cost is a whole, non-negative number of minor units",
      );
    }
    const vendor = input.vendor?.trim() || null;
    if (vendor !== null && vendor.length > VENDOR.max) {
      throw new MaintenanceInputError("a vendor is at most 120 characters");
    }

    await withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: {
        organizationId: string;
        propertyId: string;
        number: number;
        previousCost: string | null;
        previousVendor: string | null;
      }[];
      try {
        changed = await tx.$queryRaw`
          with previous as (
            select cost_minor::text as cost, vendor
              from public.maintenance_requests
             where id = ${input.requestId}::uuid
          )
          update public.maintenance_requests
             set cost_minor = ${costMinor}::bigint,
                 vendor = ${vendor}
           where id = ${input.requestId}::uuid
          returning organization_id as "organizationId",
                    property_id as "propertyId", number,
                    (select cost from previous) as "previousCost",
                    (select vendor from previous) as "previousVendor"
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }
      const [row] = changed;
      if (!row) throw new MaintenanceRefusedError();

      await recordWithin(tx, {
        organizationId: row.organizationId,
        locationId: row.propertyId,
        actorId: userId,
        action: "maintenance_request.costed",
        subjectType: "maintenance_request",
        subjectId: input.requestId,
        context: {
          number: row.number,
          from: {
            costMinor:
              row.previousCost === null ? null : Number(row.previousCost),
            vendor: row.previousVendor,
          },
          to: { costMinor, vendor },
        },
      });
    });
  }

  /**
   * Who a damage charge may go on (MT-S5-07): each Stay in the request's
   * room, or in a bed under it, that is in house or has left with its Folio
   * still open — most recent first. None for a request about equipment only,
   * and none where the Property does no billing (MT-S5-06).
   */
  async function chargeableStays(
    userId: string,
    requestId: string,
  ): Promise<ChargeableStay[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<ChargeableStay[]>`
        select stay.id                              as "stayId",
               folio.id                             as "folioId",
               guest.full_name                      as "guestName",
               unit.name                            as "unitName",
               stay.status = 'in_house'             as "inHouse",
               to_char(stay.ends_on, 'YYYY-MM-DD')  as "endsOn",
               folio.currency
          from public.maintenance_requests as request
          join public.accommodation_units as unit
            on unit.id = request.accommodation_unit_id
            or unit.parent_id = request.accommodation_unit_id
          join public.stays as stay
            on stay.accommodation_unit_id = unit.id
           and stay.status in ('in_house', 'departed')
          join public.folios as folio
            on folio.stay_id = stay.id
           and folio.status = 'open'
          left join public.reservations as reservation
            on reservation.id = stay.reservation_id
          left join public.guests as guest
            on guest.id = reservation.guest_id
         where request.id = ${requestId}::uuid
           and app.can_use_capability(request.property_id, 'billing_folios', 'finance')
         order by stay.status = 'in_house' desc, stay.starts_on desc
      `,
    );
  }

  /**
   * Charges a Guest for damage (MT-S5-03): a line on the chosen Folio,
   * described with the request's number and title, linked to the request, and
   * audited by both modules — one transaction. A closed Folio, a Folio of a
   * Stay that did not use the room, or a Staff Member without
   * `finance.post_charge` are refused by the database (MT-S5-04, MT-S5-05,
   * MT-S5-07). A request may charge more than once (MT-S5-09).
   */
  async function chargeGuest(
    userId: string,
    input: { requestId: string; folioId: string; amountMinor: number },
  ): Promise<{ lineId: string }> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [request] = await tx.$queryRaw<
        {
          organizationId: string;
          propertyId: string;
          number: number;
          title: string;
        }[]
      >`
        select organization_id as "organizationId",
               property_id     as "propertyId",
               number, title
          from public.maintenance_requests
         where id = ${input.requestId}::uuid
      `;
      if (!request) throw new MaintenanceRefusedError();

      // The request, in no language in particular.
      const description = `MT-${request.number} · ${request.title}`.slice(
        0,
        DESCRIPTION_MAX,
      );
      let line: { lineId: string };
      try {
        line = await postChargeWithin(tx, userId, {
          folioId: input.folioId,
          description,
          amountMinor: input.amountMinor,
        });
      } catch (error: unknown) {
        // The Folio's two answers, told in this module's words. Anything else
        // is a defect and travels on as itself.
        if (error instanceof FolioAmountError) {
          throw new MaintenanceInputError("a charge is a positive amount");
        }
        if (error instanceof FolioWriteError) {
          throw new MaintenanceRefusedError({ cause: error });
        }
        throw error;
      }

      try {
        await tx.$queryRaw`
          insert into public.maintenance_request_charges
            (organization_id, property_id, request_id, folio_id, folio_line_id)
          values (${request.organizationId}::uuid, ${request.propertyId}::uuid,
                  ${input.requestId}::uuid, ${input.folioId}::uuid,
                  ${line.lineId}::uuid)
          returning id
        `;
      } catch (error: unknown) {
        throw refusal(error);
      }

      await recordWithin(tx, {
        organizationId: request.organizationId,
        locationId: request.propertyId,
        actorId: userId,
        action: "maintenance_request.guest_charged",
        subjectType: "maintenance_request",
        subjectId: input.requestId,
        context: {
          number: request.number,
          folioId: input.folioId,
          lineId: line.lineId,
          amountMinor: input.amountMinor,
        },
      });
      return { lineId: line.lineId };
    });
  }

  return { recordCost, chargeableStays, chargeGuest };
}
