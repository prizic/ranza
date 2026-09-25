import { withOrganizationContext } from "@ranza/db";
import {
  cleanSearch,
  getWithin,
  recentWithin,
  type AuditRecord,
} from "@ranza/platform-audit";
import {
  auditScope,
  dayRange,
  MIN_SEARCH_LENGTH,
  namesFor,
  searchIds,
  type AuditNames,
  type AuditScope,
} from "./audit-log";
import {
  TODAY_CAPABILITY,
  type AuditEntry,
  type AuditFilters,
  type AuditPage,
  type CapabilityProperties,
  type CapabilityRef,
  type EntitledProperty,
  type WorkingDay,
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
/** One screen of the log. The rest is a page away, never out of reach. */
const AUDIT_PAGE_SIZE = 50;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` that names a real day Postgres accepts, or undefined — never
 * a cast error. JavaScript takes year 0 and Postgres does not, so the year is
 * bounded before the date is.
 */
function calendarDay(value: string | undefined): string | undefined {
  if (value === undefined || !DAY.test(value)) return undefined;
  if (Number(value.slice(0, 4)) < 1) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function located(
  record: AuditRecord,
  names: AuditNames,
  scope: AuditScope,
): AuditEntry {
  const location = record.locationId
    ? names.locations[record.locationId]
    : undefined;
  return {
    ...record,
    propertyName: location?.name ?? null,
    timeZone: location?.timezone ?? scope.timezone,
  };
}

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
   * Every Property the viewer reaches, in an Organization where they hold
   * `permission`.
   *
   * Reach and permission, in the statement, and no commercial gate: this is
   * for a destination no package selection may remove — the audit log, which
   * is a baseline right (blueprint 3.6, ADR 0031). It is what puts that
   * destination in the rail and what its Property switcher offers.
   */
  async function listPermittedProperties(
    userId: string,
    permission: string,
  ): Promise<EntitledProperty[]> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      tx.$queryRawUnsafe<EntitledProperty[]>(
        `select property.id              as "propertyId",
                property.name            as "propertyName",
                property.timezone        as "timezone",
                organization.id          as "organizationId",
                organization.name        as "organizationName"
           from public.properties as property
           join public.organizations as organization
             on organization.id = property.organization_id
          where property.id in (select app.accessible_property_ids())
            and app.has_organization_permission(property.organization_id, $1)
          order by organization.name, property.name`,
        permission,
      ),
    );
  }

  /**
   * One Property's working day, with the viewer's permissions and the
   * capabilities asked about — or null when the viewer does not have Today
   * there, which is also the answer for a Property that does not exist.
   *
   * One transaction for all of it, so the dashboard's first question costs one
   * connection however many capabilities it asks about.
   */
  async function workingDay(
    userId: string,
    propertyId: string,
    capabilities: readonly CapabilityRef[],
  ): Promise<WorkingDay | null> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<WorkingDay[]>`
        select
          property.id                                     as "propertyId",
          property.name                                   as "propertyName",
          property.organization_id                        as "organizationId",
          property.timezone                               as "timezone",
          trim(property.currency)                         as "currency",
          to_char(app.property_today(property.id), 'YYYY-MM-DD')
                                                          as "businessDate",
          to_char((now() at time zone property.timezone)::date, 'YYYY-MM-DD')
                                                          as "calendarDate",
          to_char(property.business_date_cutoff, 'HH24:MI') as "cutoff",
          app.organization_permissions(property.organization_id)
                                                          as "permissions",
          array(
            select app.can_use_capability(
                     property.id, requested.module_key, requested.capability_key)
              from unnest(
                ${capabilities.map((capability) => capability.moduleKey)}::text[],
                ${capabilities.map((capability) => capability.capabilityKey)}::text[]
              ) with ordinality as requested(module_key, capability_key, position)
             order by requested.position
          )                                               as "capabilities"
        from public.properties as property
        where property.id = ${propertyId}::uuid
          and app.can_use_capability(
            property.id,
            ${TODAY_CAPABILITY.moduleKey},
            ${TODAY_CAPABILITY.capabilityKey}
          )
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * One page of the audit log, opened from a Property.
   *
   * The log is the Organization's, narrowed to what the viewer reaches: the
   * records of every Property they reach, and — when their reach is the whole
   * Organization — the records about the Organization itself. Which rows those
   * are is the read policy's decision; the Property opened from decides only
   * which Organization, whose clock the date filter means, and that the viewer
   * holds `audit.read` there.
   *
   * Empty for a Property the viewer cannot reach, one where they may not read
   * the log, and one that does not exist — deliberately the same answer as
   * "nothing has happened".
   */
  async function auditLog(
    userId: string,
    propertyId: string,
    filters: AuditFilters = {},
  ): Promise<AuditPage> {
    const empty: AuditPage = {
      entries: [],
      total: 0,
      nextCursor: null,
      labels: {},
      locations: {},
      roles: {},
    };
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const scope = await auditScope(tx, propertyId);
      if (!scope) return empty;

      const range = await dayRange(
        tx,
        scope.timezone,
        calendarDay(filters.from),
        calendarDay(filters.to),
      );
      const text = cleanSearch(filters.q);
      const searching = text !== undefined && text.length >= MIN_SEARCH_LENGTH;
      const found = searching
        ? await searchIds(tx, scope.organizationId, text)
        : undefined;

      const page = await recentWithin(tx, scope.organizationId, {
        limit: AUDIT_PAGE_SIZE,
        actions: filters.actions,
        locationId: filters.propertyId,
        from: range.from,
        to: range.to,
        cursor: filters.cursor,
        ...(searching && found
          ? { text, actorIds: found.actorIds, subjectIds: found.subjectIds }
          : {}),
      });
      const names = await namesFor(tx, scope.organizationId, page.records);
      return {
        ...names,
        entries: page.records.map((record) => located(record, names, scope)),
        total: page.total,
        nextCursor: page.nextCursor,
      };
    });
  }

  /**
   * One record, by id, opened from a Property — so a link to it keeps working
   * however many records are written after it.
   *
   * Null for a record that does not exist, one in another Organization, and
   * one the viewer may not read, alike.
   */
  async function auditRecord(
    userId: string,
    propertyId: string,
    recordId: string,
  ): Promise<(AuditNames & { entry: AuditEntry }) | null> {
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const scope = await auditScope(tx, propertyId);
      if (!scope) return null;
      const record = await getWithin(tx, scope.organizationId, recordId);
      if (!record) return null;
      const names = await namesFor(tx, scope.organizationId, [record]);
      return { ...names, entry: located(record, names, scope) };
    });
  }

  return {
    listEntitledProperties,
    listEntitledPropertiesByCapability,
    listPermittedProperties,
    workingDay,
    auditLog,
    auditRecord,
  };
}

export type CoreModule = ReturnType<typeof createCoreModule>;
