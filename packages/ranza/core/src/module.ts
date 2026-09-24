import { withOrganizationContext } from "@ranza/db";
import { recentWithin, type ScopeHistory } from "@ranza/platform-audit";
import {
  AUDIT_CAPABILITY,
  type CapabilityProperties,
  type CapabilityRef,
  type EntitledProperty,
} from "./contracts";
import type { CoreDeps } from "./ports";

/**
 * Ranza core: Organization, Property, membership and Entitlement reads.
 *
 * It lives in the Ranza tier rather than the reusable one because Organization
 * and Property are Ranza concepts (ADR 0003). It owns no authorization logic of
 * its own — blueprint 3.5 is decided by `app.can_use_capability()` and
 * row-level security, in the database, where an application defect cannot skip
 * it. This module's job is to ask the question inside a request context.
 */
/**
 * Enough for a working day at a busy Property to be visible at once, and well
 * inside the audit module's own ceiling. The screen says when the log is longer.
 */
const DEFAULT_ACTIVITY_LIMIT = 200;

export function createCoreModule(deps: CoreDeps) {
  /**
   * Every Property the acting Staff Member may use `capability` in.
   *
   * All five blueprint 3.5 gates apply to this one query, and each can deny on
   * its own:
   *
   *   1-3  Subscription, Entitlement and Property capability, via
   *        app.can_use_capability()
   *   4    membership and Property assignment — checked by that same function
   *        and again by the properties policy
   *   5    row-level security on properties and organizations, which filters
   *        the rows before the function is ever called
   *
   * An empty result is the correct answer to "this viewer may use nothing",
   * never an error. A missing request context produces the same empty result,
   * which is why callers must not reach this without one — see viewer.ts in the
   * host, and ADR 0007.
   */
  async function listEntitledProperties(
    userId: string,
    capability: CapabilityRef,
  ): Promise<EntitledProperty[]> {
    return withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<EntitledProperty[]>`
        select
          property.id              as "propertyId",
          property.name            as "propertyName",
          property.timezone        as "timezone",
          organization.id          as "organizationId",
          organization.name        as "organizationName"
        from public.properties as property
        join public.organizations as organization
          on organization.id = property.organization_id
        where app.can_use_capability(
          property.id,
          ${capability.moduleKey},
          ${capability.capabilityKey}
        )
        order by organization.name, property.name
      `,
    );
  }

  /**
   * `listEntitledProperties` for several capabilities at once, in one
   * transaction — one entry per requested capability, in the order asked.
   *
   * The shell asks about every destination to build its navigation, and one
   * transaction per destination is a connection each: a dozen at once on every
   * full page load, more than the pool holds. The question is unchanged — the
   * same `app.can_use_capability()` per Property, behind the same row-level
   * security — so each entry is exactly what `listEntitledProperties` would
   * answer for that capability alone.
   *
   * Keyed on the position asked rather than the capability key, because two
   * modules may name a capability alike and are still different gates.
   */
  async function listEntitledPropertiesByCapability(
    userId: string,
    capabilities: readonly CapabilityRef[],
  ): Promise<CapabilityProperties[]> {
    if (capabilities.length === 0) return [];

    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<(EntitledProperty & { position: number })[]>`
        select
          requested.position::int  as "position",
          property.id              as "propertyId",
          property.name            as "propertyName",
          property.timezone        as "timezone",
          organization.id          as "organizationId",
          organization.name        as "organizationName"
        from unnest(
          ${capabilities.map((capability) => capability.moduleKey)}::text[],
          ${capabilities.map((capability) => capability.capabilityKey)}::text[]
        ) with ordinality as requested(module_key, capability_key, position)
        cross join public.properties as property
        join public.organizations as organization
          on organization.id = property.organization_id
        where app.can_use_capability(
          property.id,
          requested.module_key,
          requested.capability_key
        )
        order by requested.position, organization.name, property.name
      `,
    );

    return capabilities.map((capability, index) => ({
      capability,
      properties: rows
        .filter((row) => row.position === index + 1)
        .map((row) => ({
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          timezone: row.timezone,
          organizationId: row.organizationId,
          organizationName: row.organizationName,
        })),
    }));
  }

  /**
   * The Organization's newest audit records, read through one of its
   * Properties.
   *
   * The log is Organization-wide because that is the scope a record carries,
   * but the gate is a Property's: blueprint 3.5's commercial gates are
   * evaluated by `app.can_use_capability()`, which takes a Property, and the
   * audit module may not name one (blueprint 9.8). So the Property the viewer
   * opened the screen from is what the gate is asked about, in this
   * transaction, and the Organization it resolves to is what the audit module
   * is then handed — the same arrangement as every module that writes a record
   * inside its own transaction (ADR 0028).
   *
   * An empty history is the answer to a Property the viewer cannot reach, one
   * whose Organization is not entitled, and one that does not exist — all
   * deliberately the same answer as "nothing has happened".
   */
  async function recentActivity(
    userId: string,
    propertyId: string,
    limit = DEFAULT_ACTIVITY_LIMIT,
  ): Promise<ScopeHistory> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const scope = await tx.$queryRaw<{ organizationId: string }[]>`
        select property.organization_id as "organizationId"
        from public.properties as property
        where property.id = ${propertyId}::uuid
          and app.can_use_capability(
            property.id,
            ${AUDIT_CAPABILITY.moduleKey},
            ${AUDIT_CAPABILITY.capabilityKey}
          )
      `;
      const [entitled] = scope;
      if (!entitled) return { records: [], total: 0 };
      return recentWithin(tx, entitled.organizationId, limit);
    });
  }

  return {
    listEntitledProperties,
    listEntitledPropertiesByCapability,
    recentActivity,
  };
}

export type CoreModule = ReturnType<typeof createCoreModule>;
