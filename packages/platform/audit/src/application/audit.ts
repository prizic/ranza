import { withOrganizationContext } from "@ranza/db";
import {
  assertRecordable,
  type AuditEntry,
  type AuditRecord,
} from "../domain/record";
import {
  append,
  findInScope,
  listForScope,
  listForSubject,
  type AuditClient,
  type ScopeHistory,
  type ScopeQuery,
} from "../infrastructure/repository";
import type { AuditDeps } from "../ports";

/**
 * Records that something happened, inside a transaction the caller already owns.
 *
 * `record()` below opens its own, which is right when the entry is the only
 * thing being written. It is wrong when the entry must share the fate of the
 * work it describes: two transactions can half-succeed, leaving either an
 * action nobody recorded or a record of an action that never happened. Both are
 * failures an audit trail exists to prevent, so a caller doing several things at
 * once passes its own transaction here and the whole lot commits or none of it
 * does.
 *
 * The caller is responsible for that transaction having a request context — the
 * policies decide what may be written either way, and without one they deny.
 */
export async function recordWithin(
  tx: AuditClient,
  entry: AuditEntry,
): Promise<AuditRecord> {
  assertRecordable(entry);
  return append(tx, entry);
}

/** Reads are bounded so a caller cannot ask for an unbounded history. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function bounded(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a scope read may narrow by. The page size is bounded here. */
export type ScopeFilter = Omit<ScopeQuery, "limit"> & { limit?: number };

/**
 * One page of one scope's records, newest first, inside a transaction the
 * caller already owns.
 *
 * Only the `Within` form exists for this read, and that is the point. This
 * module knows a scope as an opaque identifier and cannot say what one is
 * entitled to; the host that can is the one that opens the transaction,
 * evaluates its own gate inside it, and hands the transaction here. A module
 * method taking an actor and a scope would be a second path to the same rows
 * with no gate on it at all.
 *
 * Empty when the acting user cannot reach the scope — the same answer as
 * "nothing has happened", and deliberately so. An id that is not a uuid in
 * `locationId`, `actorIds` or `subjectIds` narrows to nothing rather than
 * raising, because those arrive from a URL somebody can edit.
 */
export async function recentWithin(
  tx: AuditClient,
  organizationId: string,
  filter: ScopeFilter = {},
): Promise<ScopeHistory> {
  const uuids = (ids: readonly string[] | undefined) =>
    ids?.filter((id) => UUID.test(id));
  if (filter.locationId !== undefined && !UUID.test(filter.locationId)) {
    return { records: [], total: 0, nextCursor: null };
  }
  return listForScope(tx, organizationId, {
    ...filter,
    actorIds: uuids(filter.actorIds),
    subjectIds: uuids(filter.subjectIds),
    limit: bounded(filter.limit ?? DEFAULT_LIMIT),
  });
}

/**
 * One record of one scope, by id, inside a transaction the caller already
 * owns — the same gate-then-read arrangement as `recentWithin`.
 *
 * Null for a record that does not exist, one in another scope, and one the
 * acting user may not read, alike. An id that is not a uuid is one that does
 * not exist.
 */
export async function getWithin(
  tx: AuditClient,
  organizationId: string,
  recordId: string,
): Promise<AuditRecord | null> {
  if (!UUID.test(recordId)) return null;
  return findInScope(tx, organizationId, recordId);
}

/**
 * The audit module: what was done, by whom, and why.
 *
 * It is reusable because it knows nothing about what it records. Give it an
 * opaque scope, an actor, an action name and an opaque subject, and it keeps
 * them. A host adapter is what turns its own concepts into those identifiers.
 *
 * Every call runs inside a request context, so the row-level policies decide
 * what may be written and read. There is no privileged path through this module.
 */
export function createAuditModule(deps: AuditDeps) {
  /**
   * Records that something happened.
   *
   * Never throws away the caller's failure: if the policies deny the write, this
   * raises rather than returning quietly, because an action that happened
   * without a record is the thing an audit trail exists to prevent.
   */
  async function record(entry: AuditEntry): Promise<AuditRecord> {
    return withOrganizationContext(deps.db, { userId: entry.actorId }, (tx) =>
      recordWithin(tx, entry),
    );
  }

  /**
   * The history of one subject, newest first.
   *
   * Empty when the acting user cannot reach the scope the records belong to.
   * That is the same answer as "nothing has happened", and deliberately so.
   */
  async function historyOf(
    actorId: string,
    subjectType: string,
    subjectId: string,
    limit = DEFAULT_LIMIT,
  ): Promise<AuditRecord[]> {
    return withOrganizationContext(deps.db, { userId: actorId }, (tx) =>
      listForSubject(tx, subjectType, subjectId, bounded(limit)),
    );
  }

  return { record, historyOf };
}

export type AuditModule = ReturnType<typeof createAuditModule>;
