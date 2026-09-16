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
