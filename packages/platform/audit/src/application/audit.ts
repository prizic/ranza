import { withOrganizationContext } from "@ranza/db";
import {
  assertRecordable,
  type AuditEntry,
  type AuditRecord,
} from "../domain/record";
import { append, listForSubject } from "../infrastructure/repository";
import type { AuditDeps } from "../ports";

/** Reads are bounded so a caller cannot ask for an unbounded history. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

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
    assertRecordable(entry);
    return withOrganizationContext(deps.db, { userId: entry.actorId }, (tx) =>
      append(tx, entry),
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
      listForSubject(
        tx,
        subjectType,
        subjectId,
        Math.min(Math.max(limit, 1), MAX_LIMIT),
      ),
    );
  }

  return { record, historyOf };
}

export type AuditModule = ReturnType<typeof createAuditModule>;
