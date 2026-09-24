import type { TenantClient } from "@ranza/db";
import type { AuditEntry, AuditRecord } from "../domain/record";

/**
 * The only place this module speaks SQL.
 *
 * The table is owned by this module and lives in its own schema (ADR 0008), so
 * nothing else is granted anything on it. There is no update and no delete here,
 * and there is no policy that would allow one: a record is written once.
 */

/** The transaction surface these statements need. */
export interface AuditClient extends TenantClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

interface Row {
  id: string;
  organizationId: string;
  locationId: string | null;
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  reason: string | null;
  context: Record<string, unknown>;
  occurredAt: Date;
}

const COLUMNS = `
  id,
  organization_id as "organizationId",
  location_id     as "locationId",
  actor_id        as "actorId",
  action,
  subject_type    as "subjectType",
  subject_id      as "subjectId",
  reason,
  context,
  occurred_at     as "occurredAt"`;

function toRecord(row: Row): AuditRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    actorId: row.actorId,
    action: row.action,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    occurredAt: row.occurredAt,
    context: row.context,
    ...(row.reason === null ? {} : { reason: row.reason }),
  };
}

export async function append(
  tx: AuditClient,
  entry: AuditEntry,
): Promise<AuditRecord> {
  const rows = await tx.$queryRaw<Row[]>`
    insert into audit.records
      (organization_id, location_id, actor_id, action, subject_type, subject_id,
       reason, context)
    values (
      ${entry.organizationId}::uuid,
      ${entry.locationId ?? null}::uuid,
      ${entry.actorId}::uuid,
      ${entry.action},
      ${entry.subjectType},
      ${entry.subjectId}::uuid,
      ${entry.reason ?? null},
      ${JSON.stringify(entry.context ?? {})}::jsonb
    )
    returning
      id,
      organization_id as "organizationId",
      location_id     as "locationId",
      actor_id        as "actorId",
      action,
      subject_type    as "subjectType",
      subject_id      as "subjectId",
      reason,
      context,
      occurred_at     as "occurredAt"
  `;

  const [row] = rows;
  if (!row) {
    // Reachable only if the insert policy denied: the acting user cannot reach
    // that scope, or tried to write in somebody else's name.
    throw new Error("the audit record was not written");
  }
  return toRecord(row);
}

export async function listForSubject(
  tx: AuditClient,
  subjectType: string,
  subjectId: string,
  limit: number,
): Promise<AuditRecord[]> {
  const rows = await tx.$queryRaw<Row[]>`
    select
      id,
      organization_id as "organizationId",
      location_id     as "locationId",
      actor_id        as "actorId",
      action,
      subject_type    as "subjectType",
      subject_id      as "subjectId",
      reason,
      context,
      occurred_at     as "occurredAt"
    from audit.records
    where subject_type = ${subjectType}
      and subject_id = ${subjectId}::uuid
    order by occurred_at desc, id desc
    limit ${limit}
  `;
  return rows.map(toRecord);
}

/**
 * Which records of one scope a read wants. Every field narrows; an absent one
 * does not.
 *
 * `text` matches the reason and the values of the context (a charge's
 * description, a room's name as it was), and any actor or subject the caller
 * has already translated it into. This module cannot know that "204" is a
 * room or that an address belongs to a person, so the host resolves those to
 * ids and hands them over.
 */
export interface ScopeQuery {
  limit: number;
  actions?: readonly string[] | undefined;
  locationId?: string | undefined;
  /** Inclusive lower bound on when it happened. */
  from?: Date | undefined;
  /** Exclusive upper bound. */
  to?: Date | undefined;
  text?: string | undefined;
  actorIds?: readonly string[] | undefined;
  subjectIds?: readonly string[] | undefined;
  /** Continue after this record, from a previous page's `nextCursor`. */
  cursor?: string | undefined;
}

/** One page of a scope's records, newest first. */
export interface ScopeHistory {
  records: AuditRecord[];
  /** How many records match, across every page — not how many are left. */
  total: number;
  /** Where the next page starts, or null when this one is the last. */
  nextCursor: string | null;
}

/**
 * A position in the newest-first order: the instant in whole microseconds
 * since the epoch, and the id that breaks ties on it.
 *
 * Microseconds rather than a `Date`, because `occurred_at` keeps them and a
 * `Date` does not: a cursor rounded to the millisecond would step past every
 * record written in the rest of that millisecond, and a page boundary would
 * quietly lose them.
 */
const CURSOR =
  /^(\d{1,16})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseCursor(
  cursor: string | undefined,
): { micros: string; id: string } | null {
  if (cursor === undefined) return null;
  const [, micros, id] = CURSOR.exec(cursor) ?? [];
  // Sixteen digits is past the year 2250 in microseconds and well inside what
  // the interval arithmetic below accepts; a longer number is a URL somebody
  // edited, and is no cursor rather than an out-of-range error.
  return micros && id && Number(micros) <= Number.MAX_SAFE_INTEGER
    ? { micros, id }
    : null;
}

/**
 * The predicate every scope read shares, as one fixed statement with every
 * narrowing guarded by its own null. Nothing is concatenated from input, so
 * there is no filter a caller can supply that changes the shape of the query.
 *
 * `position(…)` rather than `ilike`, so a `%` or `_` somebody typed is a
 * character they are looking for and not a pattern. Both sides are folded the
 * same way, in the database: lower case, and without the combining dot some
 * collations leave behind when they lower "İ" — so "istanbul" finds "İstanbul"
 * whichever collation the database was created with. Under libc's en_US,
 * which the local and hosted databases use, `lower('İ')` is a plain "i" and
 * the dot-stripping never binds; it is there for an ICU collation, which emits
 * the dot.
 *
 * A context that is not an object is skipped rather than searched:
 * `jsonb_each_text` raises on anything else, and one such record would
 * otherwise break every search in its scope.
 */
const SCOPE_PREDICATE = `
  organization_id = $1::uuid
  and ($2::text[]      is null or action = any ($2::text[]))
  and ($3::uuid        is null or location_id = $3::uuid)
  and ($4::timestamptz is null or occurred_at >= $4::timestamptz)
  and ($5::timestamptz is null or occurred_at <  $5::timestamptz)
  and (
    $6::text is null
    or position(replace(lower($6::text), chr(775), '') in replace(lower(coalesce(reason, '')), chr(775), '')) > 0
    or (
      jsonb_typeof(context) = 'object'
      and exists (
        select 1 from jsonb_each_text(context) as fact
         where position(replace(lower($6::text), chr(775), '') in replace(lower(fact.value), chr(775), '')) > 0
      )
    )
    or actor_id   = any (coalesce($7::uuid[], '{}'))
    or subject_id = any (coalesce($8::uuid[], '{}'))
  )`;

/**
 * Search text as it may be sent: trimmed, and without NUL, which Postgres
 * refuses in any text value — a `%00` in a URL would otherwise be a server
 * error rather than no match. Case is folded by the database on both sides,
 * never here: JavaScript lowers "İ" differently from Postgres, and folding one
 * side in each would make them disagree.
 */
export function cleanSearch(text: string | undefined): string | undefined {
  const cleaned = text?.replaceAll("\0", "").trim();
  return cleaned ? cleaned : undefined;
}

function scopeValues(organizationId: string, query: ScopeQuery): unknown[] {
  const text = cleanSearch(query.text);
  return [
    organizationId,
    query.actions && query.actions.length > 0 ? [...query.actions] : null,
    query.locationId ?? null,
    query.from?.toISOString() ?? null,
    query.to?.toISOString() ?? null,
    text ?? null,
    query.actorIds ? [...query.actorIds] : null,
    query.subjectIds ? [...query.subjectIds] : null,
  ];
}

/**
 * One page of one scope's records, newest first, and how many match in all.
 *
 * The scope is named in the predicate even though the read policy already
 * bounds rows to what the acting user reaches: that policy spans every scope
 * they belong to, so a user in two would otherwise see both interleaved. The
 * policy is the boundary; the predicate is what makes this one scope's history.
 *
 * `total` is its own count, without the cursor. A window count over the page
 * would say how many records are left after the cursor, and the screen shows
 * this number as how many there are.
 */
export async function listForScope(
  tx: AuditClient,
  organizationId: string,
  query: ScopeQuery,
): Promise<ScopeHistory> {
  const values = scopeValues(organizationId, query);
  const cursor = parseCursor(query.cursor);

  const [counted] = await tx.$queryRawUnsafe<{ total: number }[]>(
    `select count(*)::int as total from audit.records where ${SCOPE_PREDICATE}`,
    ...values,
  );

  // One more than the page, to learn whether there is a next one without a
  // second count.
  const rows = await tx.$queryRawUnsafe<(Row & { position: string })[]>(
    `select ${COLUMNS},
            (extract(epoch from occurred_at) * 1000000)::bigint::text as "position"
       from audit.records
      where ${SCOPE_PREDICATE}
        and (
          $9::bigint is null
          or (occurred_at, id) <
             ('epoch'::timestamptz + $9::bigint * interval '1 microsecond', $10::uuid)
        )
      order by occurred_at desc, id desc
      limit $11`,
    ...values,
    cursor?.micros ?? null,
    cursor?.id ?? null,
    query.limit + 1,
  );

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    records: page.map(toRecord),
    total: counted?.total ?? 0,
    nextCursor:
      rows.length > query.limit && last ? `${last.position}.${last.id}` : null,
  };
}

/** One record of one scope, or null — absent and unreachable alike. */
export async function findInScope(
  tx: AuditClient,
  organizationId: string,
  recordId: string,
): Promise<AuditRecord | null> {
  const rows = await tx.$queryRawUnsafe<Row[]>(
    `select ${COLUMNS} from audit.records
      where organization_id = $1::uuid and id = $2::uuid`,
    organizationId,
    recordId,
  );
  const [row] = rows;
  return row ? toRecord(row) : null;
}
