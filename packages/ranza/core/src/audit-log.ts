import type { AuditClient, AuditRecord } from "@ranza/platform-audit";
import { AUDIT_READ_PERMISSION } from "./contracts";

/**
 * The Ranza half of the audit log: the gate, the translation of what somebody
 * typed into ids, and the names a reader needs instead of those ids.
 *
 * The audit module keeps opaque identifiers and cannot say what any of them
 * is — that is what keeps it reusable (blueprint 9.8). Naming them is this
 * tier's job, and it happens at read time rather than being copied into the
 * record when it is written, for two reasons. A Guest's name in an append-only
 * table is personal data nothing could ever erase. And a name read now obeys
 * the policies now: a Guest this viewer may not see comes back as no name, the
 * record still stands, and the screen falls back to the id (ADR 0031).
 *
 * Every function here runs inside the caller's request-context transaction, so
 * row-level security bounds each statement.
 */

/** The Organization a log is read in, and the clock its dates mean. */
export interface AuditScope {
  organizationId: string;
  timezone: string;
}

/**
 * The Property the log is opened from, if the viewer may read the log there:
 * they reach it, and hold `audit.read` in its Organization.
 *
 * No commercial gate. Audit is a baseline right no package selection removes
 * (blueprint 3.6), and an Organization whose invoice is late still has to be
 * able to find out who reversed a charge (ADR 0026, ADR 0031).
 */
export async function auditScope(
  tx: AuditClient,
  propertyId: string,
): Promise<AuditScope | null> {
  const rows = await tx.$queryRawUnsafe<AuditScope[]>(
    `select property.organization_id as "organizationId",
            property.timezone        as "timezone"
       from public.properties as property
      where property.id = $1::uuid
        and property.id in (select app.accessible_property_ids())
        and app.has_organization_permission(property.organization_id, $2)`,
    propertyId,
    AUDIT_READ_PERMISSION,
  );
  return rows[0] ?? null;
}

/**
 * A calendar day range in a Property's wall clock, as the instants that bound
 * it: from the start of `from` to the end of `to`, both inclusive as a reader
 * means them. Postgres does the conversion so a day that crosses a daylight
 * saving change is still that day.
 */
export async function dayRange(
  tx: AuditClient,
  timezone: string,
  from: string | undefined,
  to: string | undefined,
): Promise<{ from?: Date; to?: Date }> {
  if (from === undefined && to === undefined) return {};
  const [row] = await tx.$queryRawUnsafe<
    { from: Date | null; to: Date | null }[]
  >(
    `select ($1::date::timestamp at time zone $3)         as "from",
            (($2::date + 1)::timestamp at time zone $3)   as "to"`,
    from ?? null,
    to ?? null,
    timezone,
  );
  return {
    ...(row?.from ? { from: row.from } : {}),
    ...(row?.to ? { to: row.to } : {}),
  };
}

/**
 * Enough ids that a real search finds what it is looking for, and few enough
 * that one letter cannot build an array the size of the Guest list.
 */
const MATCH_LIMIT = 200;

/**
 * Shorter than this and a search matches everything, which is no search.
 * Measured on the folded text the database compares.
 */
export const MIN_SEARCH_LENGTH = 2;

/**
 * What a reader typed, as the actors and subjects it could mean.
 *
 * "Ayşe" is a Guest, so every Reservation, Stay and Folio of hers is a subject
 * worth finding. "204" is a room, so is everything that happened in it. An
 * address is a colleague, as the one who acted or the membership acted on.
 * The audit module matches the reason text itself; this supplies the rest.
 */
export async function searchIds(
  tx: AuditClient,
  organizationId: string,
  text: string,
): Promise<{ actorIds: string[]; subjectIds: string[] }> {
  const rows = await tx.$queryRawUnsafe<{ kind: string; id: string }[]>(
    `with
       guest as (
         select id from public.guests
          where organization_id = $1::uuid
            and position(replace(lower($2), chr(775), '') in replace(lower(full_name), chr(775), '')) > 0
          limit $3),
       unit as (
         select id from public.accommodation_units
          where organization_id = $1::uuid
            and position(replace(lower($2), chr(775), '') in replace(lower(name), chr(775), '')) > 0
          limit $3),
       person as (
         select users.id from public.users as users
           join public.organization_memberships as membership
             on membership.user_id = users.id
            and membership.organization_id = $1::uuid
          where position(replace(lower($2), chr(775), '') in replace(lower(users.email), chr(775), '')) > 0
          limit $3),
       reservation as (
         select id from public.reservations
          where organization_id = $1::uuid
            and (guest_id in (select id from guest)
                 or accommodation_unit_id in (select id from unit))
          limit $3),
       stay as (
         select id from public.stays
          where organization_id = $1::uuid
            and (reservation_id in (select id from reservation)
                 or accommodation_unit_id in (select id from unit))
          limit $3)
     select 'actor' as kind, id from person
     union all select 'subject', id from person
     union all select 'subject', membership.id
       from public.organization_memberships as membership
      where membership.organization_id = $1::uuid
        and membership.user_id in (select id from person)
     union all select 'subject', id from guest
     union all select 'subject', id from unit
     union all select 'subject', id from reservation
     union all select 'subject', id from stay
     union all select 'subject', folio.id from public.folios as folio
      where folio.stay_id in (select id from stay)
     union all select 'subject', property.id from public.properties as property
      where property.organization_id = $1::uuid
        and position(replace(lower($2), chr(775), '') in replace(lower(property.name), chr(775), '')) > 0
     union all select 'subject', role.id from public.staff_roles as role
      where role.scope_id in ($1::uuid, '00000000-0000-0000-0000-000000000000')
        and position(replace(lower($2), chr(775), '') in replace(lower(role.name), chr(775), '')) > 0`,
    organizationId,
    text,
    MATCH_LIMIT,
  );
  return {
    actorIds: rows.filter((row) => row.kind === "actor").map((row) => row.id),
    subjectIds: rows
      .filter((row) => row.kind === "subject")
      .map((row) => row.id),
  };
}

/** Where a record happened, named, and whose clock its time is read on. */
export interface AuditLocation {
  name: string;
  timezone: string;
}

/** What the ids on a page of records are called, as far as the viewer may see. */
export interface AuditNames {
  /** id → a readable name: a person's address, a Guest, a room, a role. */
  labels: Record<string, string>;
  /** location id → the Property's name and timezone. */
  locations: Record<string, AuditLocation>;
  /** role key → an authored role's name. Shipped roles are named by the screen. */
  roles: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Context keys whose value is a role key rather than an id. */
const ROLE_KEYS = new Set(["role", "from", "to", "key"]);

function collect(records: readonly AuditRecord[]) {
  const ids = new Set<string>();
  const locations = new Set<string>();
  const roles = new Set<string>();
  const visit = (key: string, value: unknown) => {
    if (typeof value === "string") {
      if (UUID.test(value)) ids.add(value);
      else if (ROLE_KEYS.has(key)) roles.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(key, item);
    }
  };
  for (const record of records) {
    ids.add(record.actorId);
    ids.add(record.subjectId);
    if (record.locationId) locations.add(record.locationId);
    for (const [key, value] of Object.entries(record.context ?? {})) {
      visit(key, value);
    }
  }
  return { ids: [...ids], locations: [...locations], roles: [...roles] };
}

/**
 * Every name a page of records needs, in two statements.
 *
 * A Reservation, Stay or Folio is named by who stayed and where — "Ayşe
 * Yılmaz · 204" — because that is how the front desk refers to one. A Stay
 * with no Reservation behind it is named by its room alone. An id the viewer
 * may not see simply has no entry, and the screen shows it short.
 */
export async function namesFor(
  tx: AuditClient,
  organizationId: string,
  records: readonly AuditRecord[],
): Promise<AuditNames> {
  if (records.length === 0) return { labels: {}, locations: {}, roles: {} };
  const wanted = collect(records);

  const labelled = await tx.$queryRawUnsafe<{ id: string; label: string }[]>(
    `with wanted as (select unnest($1::uuid[]) as id),
       stay_label as (
         select stay.id,
                concat_ws(' · ', guest.full_name, unit.name) as label
           from public.stays as stay
           join public.accommodation_units as unit
             on unit.id = stay.accommodation_unit_id
           left join public.reservations as reservation
             on reservation.id = stay.reservation_id
           left join public.guests as guest on guest.id = reservation.guest_id
          where stay.id in (select id from wanted)
             or stay.id in (select folio.stay_id from public.folios as folio
                             where folio.id in (select id from wanted)))
     select users.id, users.email as label
       from public.users as users where users.id in (select id from wanted)
     union all
     select membership.id, users.email
       from public.organization_memberships as membership
       join public.users as users on users.id = membership.user_id
      where membership.id in (select id from wanted)
        and membership.organization_id = $2::uuid
     union all
     select guest.id, guest.full_name
       from public.guests as guest where guest.id in (select id from wanted)
     union all
     select unit.id, unit.name
       from public.accommodation_units as unit
      where unit.id in (select id from wanted)
     union all
     select role.id, role.name
       from public.staff_roles as role where role.id in (select id from wanted)
     union all
     select reservation.id, concat_ws(' · ', guest.full_name, unit.name)
       from public.reservations as reservation
       join public.guests as guest on guest.id = reservation.guest_id
       join public.accommodation_units as unit
         on unit.id = reservation.accommodation_unit_id
      where reservation.id in (select id from wanted)
     union all
     select id, label from stay_label where id in (select id from wanted)
     union all
     select folio.id, stay_label.label
       from public.folios as folio
       join stay_label on stay_label.id = folio.stay_id
      where folio.id in (select id from wanted)
     union all
     select location.location_id, location.name
       from app.audit_location_names($1::uuid[]) as location`,
    wanted.ids,
    organizationId,
  );

  const located = await tx.$queryRawUnsafe<
    { id: string; name: string; timezone: string }[]
  >(
    `select location_id as id, name, timezone
       from app.audit_location_names($1::uuid[])`,
    wanted.locations,
  );

  const authored =
    wanted.roles.length === 0
      ? []
      : await tx.$queryRawUnsafe<{ key: string; name: string }[]>(
          `select key, name from public.staff_roles
            where scope_id = $1::uuid and key = any ($2::text[])`,
          organizationId,
          wanted.roles,
        );

  return {
    labels: Object.fromEntries(
      labelled
        .filter((row) => row.label.trim() !== "")
        .map((row) => [row.id, row.label]),
    ),
    locations: Object.fromEntries(
      located.map((row) => [
        row.id,
        { name: row.name, timezone: row.timezone },
      ]),
    ),
    roles: Object.fromEntries(authored.map((row) => [row.key, row.name])),
  };
}
