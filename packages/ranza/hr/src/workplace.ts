import { withOrganizationContext } from "@ranza/db";
import { HR_CAPABILITY } from "./contracts";
import type { HrDeps } from "./ports";

/** What a Property says that HR needs to be told, and nothing else of it. */
export interface Workplace {
  /** ISO 4217. A new employee is paid in the currency of the Property they work at (ADR 0015). */
  readonly currency: string;
  /** The Property's own calendar date, `YYYY-MM-DD`: when "today" is for the people who work there. */
  readonly today: string;
}

export function createWorkplace(deps: HrDeps) {
  /**
   * The Property's currency and today, or null when the acting Staff Member may
   * not use HR there, which is also the answer for a Property that does not
   * exist.
   */
  async function workplace(
    userId: string,
    propertyId: string,
  ): Promise<Workplace | null> {
    const [row] = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<Workplace[]>`
          select trim(property.currency) as currency,
                 to_char((now() at time zone property.timezone)::date,
                         'YYYY-MM-DD') as today
            from public.properties as property
           where property.id = ${propertyId}::uuid
             and app.can_use_capability(
                   property.id, ${HR_CAPABILITY.moduleKey},
                   ${HR_CAPABILITY.capabilityKey})
        `,
    );
    return row ?? null;
  }

  return { workplace };
}
