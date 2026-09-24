/**
 * The newest audit record of one action about one subject, read as the table
 * owner — so a writer suite can assert what its command recorded, including
 * where, without its own read reach deciding whether the record is visible.
 *
 * Every writer names the Property it acted at, and the read policy narrows to
 * it: a writer that dropped the location would hide its records from every
 * reader assigned to that Property, and one that named the wrong Property
 * would show them to the wrong readers (ADR 0031). Nothing but an assertion in
 * the writer's own suite notices either.
 */
export interface WrittenRecord {
  locationId: string | null;
  subjectId: string;
  reason: string | null;
  context: Record<string, unknown>;
}

interface OwnerClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

export async function latestRecord(
  owner: OwnerClient,
  action: string,
  subjectId: string,
): Promise<WrittenRecord | undefined> {
  const [row] = await owner.$queryRawUnsafe<WrittenRecord[]>(
    `select location_id as "locationId", subject_id as "subjectId",
            reason, context
       from audit.records
      where action = $1 and subject_id = $2::uuid
      order by occurred_at desc, id desc
      limit 1`,
    action,
    subjectId,
  );
  return row;
}
