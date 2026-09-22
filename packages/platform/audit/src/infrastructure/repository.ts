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
}

interface Row {
  id: string;
  organizationId: string;
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  reason: string | null;
  context: Record<string, unknown>;
  occurredAt: Date;
}

function toRecord(row: Row): AuditRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
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
      (organization_id, actor_id, action, subject_type, subject_id, reason, context)
    values (
      ${entry.organizationId}::uuid,
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
    order by occurred_at desc
    limit ${limit}
  `;
  return rows.map(toRecord);
}

/** The newest records in one scope, and how many there are in all. */
export interface ScopeHistory {
  records: AuditRecord[];
  total: number;
}

/**
 * The newest records in one scope.
 *
 * The scope is named in the predicate even though the read policy already
 * bounds rows to scopes the acting user reaches: that policy is membership-wide,
 * so a user in two scopes would otherwise see both interleaved. The policy is
 * the boundary; the predicate is what makes this one scope's history.
 *
 * `total` is the count before the limit, from the same statement, so a capped
 * list can say so — a silently truncated history looks exactly like a complete
 * one. `id` breaks ties on `occurred_at` so the order is stable across reads.
 */
export async function listForScope(
  tx: AuditClient,
  organizationId: string,
  limit: number,
): Promise<ScopeHistory> {
  const rows = await tx.$queryRaw<(Row & { total: number })[]>`
    select
      id,
      organization_id as "organizationId",
      actor_id        as "actorId",
      action,
      subject_type    as "subjectType",
      subject_id      as "subjectId",
      reason,
      context,
      occurred_at     as "occurredAt",
      count(*) over()::int as "total"
    from audit.records
    where organization_id = ${organizationId}::uuid
    order by occurred_at desc, id desc
    limit ${limit}
  `;
  return { records: rows.map(toRecord), total: rows[0]?.total ?? 0 };
}
