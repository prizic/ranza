import { withOrganizationContext } from "@ranza/db";
import { recordWithin, type AuditClient } from "@ranza/platform-audit";
import {
  CONFIGURATION_CAPABILITY,
  CONFIGURATION_MANAGE_PERMISSION,
  ConfigurationClosedDayError,
  ConfigurationCurrencyFixedError,
  ConfigurationInputError,
  ConfigurationRefusedError,
  ConfigurationStaleError,
  type BusinessDatePreview,
  type OrganizationNameInput,
  type PropertySettings,
  type PropertySettingsInput,
  type SettingsSaved,
} from "./contracts";
import type { CoreDeps } from "./ports";

/**
 * A Property's settings and its Organization's name (ADR 0036).
 *
 * Nothing here decides who may. The update policies carry all five gates and
 * the column grants bound what may change; a save that matches no row is
 * re-read to tell the three reasons apart — refused, stale, or nothing to
 * change — because the policy refuses quietly (ADR 0012).
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";
const OBJECT_NOT_IN_PREREQUISITE_STATE = "55000";
/** Close the day's own code: a business day is closed (ADR 0034). */
const BUSINESS_DAY_CLOSED = "RZ001";

/** `properties_*_check` and `organizations_name_check` name the column. */
const CONSTRAINT_FIELDS: Record<string, PropertySettingsField> = {
  properties_name_check: "name",
  properties_timezone_check: "timezone",
  properties_currency_check: "currency",
  properties_business_date_cutoff_check: "businessDateCutoff",
};

type PropertySettingsField =
  "name" | "timezone" | "currency" | "businessDateCutoff";

const NAME_MIN = 2;
const NAME_MAX = 120;
const CUTOFF = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CURRENCY = /^[A-Z]{3}$/;
/** The stamp as `to_char` below writes it. */
const VERSION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a failure carries a particular SQLSTATE — read from Prisma's `meta`
 * and from the message, for the reasons `@ranza/accommodation` gives beside
 * its copy.
 */
function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

/** The column a check violation names, when the error says which. */
function violatedField(error: unknown): PropertySettingsField | null {
  const text =
    typeof error === "object" && error !== null
      ? JSON.stringify(error, Object.getOwnPropertyNames(error))
      : "";
  const match = Object.entries(CONSTRAINT_FIELDS).find(([constraint]) =>
    text.includes(constraint),
  );
  return match ? match[1] : null;
}

/**
 * Characters as Postgres's `char_length` counts them, not UTF-16 code units:
 * an Arabic or emoji name would otherwise pass here and fail the constraint.
 */
function isName(value: string): boolean {
  const length = [...value.trim()].length;
  return length >= NAME_MIN && length <= NAME_MAX && value.trim() === value;
}

function isCutoff(value: string): boolean {
  return CUTOFF.test(value) && value >= "03:00" && value < "12:00";
}

/**
 * A zone the runtime can format in. The database refuses a zone Postgres does
 * not know; this refuses one Node does not, because every screen formats dates
 * in the Property's zone and one it cannot read would break all of them.
 */
function isRuntimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function assertPropertyInput(input: PropertySettingsInput): void {
  if (!VERSION.test(input.version)) throw new ConfigurationInputError(null);
  if (!isName(input.name)) throw new ConfigurationInputError("name");
  if (!isRuntimeZone(input.timezone)) {
    throw new ConfigurationInputError("timezone");
  }
  if (!CURRENCY.test(input.currency)) {
    throw new ConfigurationInputError("currency");
  }
  if (!isCutoff(input.businessDateCutoff)) {
    throw new ConfigurationInputError("businessDateCutoff");
  }
}

interface SettingsRow {
  propertyId: string;
  name: string;
  timezone: string;
  currency: string;
  businessDateCutoff: string;
  version: string;
  businessDate: string;
  currencyFixed: boolean;
  mayConfigure: boolean;
  organizationId: string;
  organizationName: string;
  organizationVersion: string;
  mayRename: boolean;
}

/**
 * One Property's settings, read through the same gates the screen is opened
 * by. The permission and reach are asked with the expressions the update
 * policies use, so what the form offers is what a save would be allowed.
 */
async function readSettings(
  tx: AuditClient,
  propertyId: string,
): Promise<PropertySettings | null> {
  const [row] = await tx.$queryRaw<SettingsRow[]>`
    select property.id                                   as "propertyId",
           property.name                                 as "name",
           property.timezone                             as "timezone",
           property.currency::text                       as "currency",
           to_char(property.business_date_cutoff, 'HH24:MI')
                                                         as "businessDateCutoff",
           to_char(property.updated_at at time zone 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')      as "version",
           app.property_today(property.id)::text         as "businessDate",
           app.property_currency_is_fixed(property.id)   as "currencyFixed",
           app.has_organization_permission(
             property.organization_id, ${CONFIGURATION_MANAGE_PERMISSION}
           )                                             as "mayConfigure",
           organization.id                               as "organizationId",
           organization.name                             as "organizationName",
           to_char(organization.updated_at at time zone 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')      as "organizationVersion",
           app.has_organization_permission(
             organization.id, ${CONFIGURATION_MANAGE_PERMISSION}
           )
           and app.has_organization_wide_reach(organization.id)
                                                         as "mayRename"
      from public.properties as property
      join public.organizations as organization
        on organization.id = property.organization_id
     where property.id = ${propertyId}::uuid
       and app.can_use_capability(
             property.id,
             ${CONFIGURATION_CAPABILITY.moduleKey},
             ${CONFIGURATION_CAPABILITY.capabilityKey}
           )
  `;
  if (!row) return null;
  return {
    propertyId: row.propertyId,
    name: row.name,
    timezone: row.timezone,
    currency: row.currency,
    businessDateCutoff: row.businessDateCutoff,
    version: row.version,
    businessDate: row.businessDate,
    currencyFixed: row.currencyFixed,
    mayConfigure: row.mayConfigure,
    organization: {
      organizationId: row.organizationId,
      name: row.organizationName,
      version: row.organizationVersion,
      mayRename: row.mayRename,
    },
  };
}

interface PropertyChange {
  organizationId: string;
  version: string;
  fromName: string;
  fromTimezone: string;
  fromCurrency: string;
  fromCutoff: string;
}

/** Each setting that moved, from and to — what the audit record carries. */
function changesOf(
  before: Record<PropertySettingsField, string>,
  after: Record<PropertySettingsField, string>,
): Partial<Record<PropertySettingsField, { from: string; to: string }>> {
  const fields = Object.keys(after) as PropertySettingsField[];
  return Object.fromEntries(
    fields
      .filter((field) => before[field] !== after[field])
      .map((field) => [field, { from: before[field], to: after[field] }]),
  );
}

export function createConfiguration(deps: CoreDeps) {
  /**
   * What the Configuration screen shows about one Property. Null for one the
   * viewer cannot reach, another Organization's, or one where configuration is
   * not available — the same answer as one that does not exist.
   */
  async function propertySettings(
    userId: string,
    propertyId: string,
  ): Promise<PropertySettings | null> {
    return withOrganizationContext(deps.db, { userId }, (tx) =>
      readSettings(tx, propertyId),
    );
  }

  /**
   * Saves a Property's settings, if they are still what the form was read at.
   *
   * One statement: the version and "something differs" are both in its WHERE,
   * so a stale form and a form that changes nothing each match no row, and a
   * concurrent save waits on the row lock and then re-checks the version
   * against the row it waited for (CF-S1-16).
   */
  async function configureProperty(
    userId: string,
    propertyId: string,
    input: PropertySettingsInput,
  ): Promise<SettingsSaved> {
    assertPropertyInput(input);

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      // The Property's advisory lock first, as a check-in takes it: the stay
      // trigger takes it shared and the Folio guard then the row FOR SHARE,
      // while close the day's trigger on this update takes it exclusive after
      // the row lock. Taken the other way round the two deadlock (ADR 0036).
      // Through the row, as check-in does, so a Property the caller cannot see
      // locks nothing; its canonical id is the text the guard hashes.
      await tx.$queryRaw`
        select pg_advisory_xact_lock(3, hashtext(property.id::text))::text
          from public.properties as property
         where property.id = ${propertyId}::uuid
      `;

      let changed: PropertyChange[];
      try {
        changed = await tx.$queryRaw<PropertyChange[]>`
          with previous as (
            select property.id,
                   property.name,
                   property.timezone,
                   property.currency::text as currency,
                   to_char(property.business_date_cutoff, 'HH24:MI') as cutoff
              from public.properties as property
             where property.id = ${propertyId}::uuid
          )
          update public.properties as property
             set name = ${input.name},
                 timezone = ${input.timezone},
                 currency = ${input.currency},
                 business_date_cutoff = ${input.businessDateCutoff}::time
            from previous
           where property.id = previous.id
             and property.updated_at = ${input.version}::timestamptz
             and (property.name, property.timezone, property.currency::text,
                  property.business_date_cutoff)
                 is distinct from
                 (${input.name}, ${input.timezone}, ${input.currency},
                  ${input.businessDateCutoff}::time)
          returning property.organization_id as "organizationId",
                    to_char(property.updated_at at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "version",
                    previous.name as "fromName",
                    previous.timezone as "fromTimezone",
                    previous.currency as "fromCurrency",
                    previous.cutoff as "fromCutoff"
        `;
      } catch (error: unknown) {
        if (raised(error, BUSINESS_DAY_CLOSED)) {
          throw new ConfigurationClosedDayError();
        }
        if (raised(error, OBJECT_NOT_IN_PREREQUISITE_STATE)) {
          throw new ConfigurationCurrencyFixedError();
        }
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new ConfigurationRefusedError();
        }
        if (raised(error, CHECK_VIOLATION)) {
          throw new ConfigurationInputError(violatedField(error));
        }
        throw error;
      }

      const [saved] = changed;
      if (!saved) return unsaved(tx, propertyId, input);

      const changes = changesOf(
        {
          name: saved.fromName,
          timezone: saved.fromTimezone,
          currency: saved.fromCurrency,
          businessDateCutoff: saved.fromCutoff,
        },
        {
          name: input.name,
          timezone: input.timezone,
          currency: input.currency,
          businessDateCutoff: input.businessDateCutoff,
        },
      );
      await recordWithin(tx, {
        organizationId: saved.organizationId,
        locationId: propertyId,
        actorId: userId,
        action: "property.configured",
        subjectType: "property",
        subjectId: propertyId,
        context: { changed: Object.keys(changes), ...changes },
      });
      return { status: "saved", version: saved.version };
    });
  }

  /**
   * Why a save matched no row. The permission is asked before the values are
   * compared, so somebody without it who resubmits what is saved is refused
   * rather than told "nothing changed".
   */
  async function unsaved(
    tx: AuditClient,
    propertyId: string,
    input: PropertySettingsInput,
  ): Promise<SettingsSaved> {
    const current = await readSettings(tx, propertyId);
    if (!current || !current.mayConfigure) {
      throw new ConfigurationRefusedError();
    }
    if (current.version !== input.version) {
      throw new ConfigurationStaleError(current);
    }
    return { status: "unchanged", version: current.version };
  }

  /**
   * Renames the Organization of the Property the screen is opened from. Needs
   * reach to every Property, because the name governs all of them (CF-S2-02).
   */
  async function renameOrganization(
    userId: string,
    propertyId: string,
    input: OrganizationNameInput,
  ): Promise<SettingsSaved> {
    if (!VERSION.test(input.version)) throw new ConfigurationInputError(null);
    if (!isName(input.name)) {
      throw new ConfigurationInputError("organizationName");
    }

    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      let changed: { organizationId: string; version: string; from: string }[];
      try {
        changed = await tx.$queryRaw`
          with previous as (
            select organization.id, organization.name
              from public.organizations as organization
              join public.properties as property
                on property.organization_id = organization.id
             where property.id = ${propertyId}::uuid
          )
          update public.organizations as organization
             set name = ${input.name}
            from previous
           where organization.id = previous.id
             and organization.updated_at = ${input.version}::timestamptz
             and organization.name is distinct from ${input.name}
          returning organization.id as "organizationId",
                    to_char(organization.updated_at at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "version",
                    previous.name as "from"
        `;
      } catch (error: unknown) {
        if (raised(error, INSUFFICIENT_PRIVILEGE)) {
          throw new ConfigurationRefusedError();
        }
        if (raised(error, CHECK_VIOLATION)) {
          throw new ConfigurationInputError("organizationName");
        }
        throw error;
      }

      const [saved] = changed;
      if (!saved) {
        const current = await readSettings(tx, propertyId);
        if (!current || !current.organization.mayRename) {
          throw new ConfigurationRefusedError();
        }
        if (current.organization.version !== input.version) {
          throw new ConfigurationStaleError(current);
        }
        return { status: "unchanged", version: current.organization.version };
      }

      // No location: the name is the whole Organization's, so the record is
      // read by whoever reaches all of it, as the name is changed by them.
      await recordWithin(tx, {
        organizationId: saved.organizationId,
        actorId: userId,
        action: "organization.configured",
        subjectType: "organization",
        subjectId: saved.organizationId,
        context: {
          changed: ["name"],
          name: { from: saved.from, to: input.name },
        },
      });
      return { status: "saved", version: saved.version };
    });
  }

  /**
   * The business date now, and the one a timezone and cutoff would make —
   * answered by `app.business_date()`, which ADR 0021 makes the only
   * definition, rather than re-derived in the browser against a different
   * copy of the time zone database (CF-S1-10).
   *
   * Null `proposed` for a zone Postgres does not know or a cutoff out of
   * range: a preview says nothing rather than something wrong. Null overall
   * for a Property the viewer cannot configure-read.
   */
  async function businessDatePreview(
    userId: string,
    propertyId: string,
    timezone: string,
    cutoff: string,
  ): Promise<BusinessDatePreview | null> {
    const usable = isCutoff(cutoff) && isRuntimeZone(timezone);
    return withOrganizationContext(deps.db, { userId }, async (tx) => {
      const [row] = await tx.$queryRaw<
        { current: string; proposed: string | null }[]
      >`
        select app.property_today(property.id)::text as "current",
               case when ${usable}::boolean and app.is_valid_timezone(${timezone})
                    then app.business_date(
                           now(), ${timezone}, ${usable ? cutoff : "04:00"}::time
                         )::text
               end as "proposed"
          from public.properties as property
         where property.id = ${propertyId}::uuid
           and app.can_use_capability(
                 property.id,
                 ${CONFIGURATION_CAPABILITY.moduleKey},
                 ${CONFIGURATION_CAPABILITY.capabilityKey}
               )
      `;
      if (!row || !DAY.test(row.current)) return null;
      return { current: row.current, proposed: row.proposed };
    });
  }

  /**
   * The zones a Property may be set to: the ones Postgres knows, in the
   * geographic areas a Property can be in, that the runtime can also format
   * in. The deprecated aliases and `Etc/GMT+3`-style offsets are left out
   * because a person picking where their hotel is does not mean them.
   */
  async function timezoneNames(userId: string): Promise<string[]> {
    const rows = await withOrganizationContext(
      deps.db,
      { userId },
      (tx) =>
        tx.$queryRaw<{ name: string }[]>`
        select name
          from pg_catalog.pg_timezone_names
         where name ~ '^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)/'
            or name = 'UTC'
         order by name
      `,
    );
    return rows.map((row) => row.name).filter(isRuntimeZone);
  }

  return {
    propertySettings,
    configureProperty,
    renameOrganization,
    businessDatePreview,
    timezoneNames,
  };
}
