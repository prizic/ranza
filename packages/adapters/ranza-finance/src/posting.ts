import {
  DuplicateEntryError,
  ensureDefaultAccountsWithin,
  getJournalEntryBySourceWithin,
  postJournalEntryWithin,
  type FinanceClient,
  type JournalEntry,
} from "@ranza/platform-finance";
import { mapFolioLineToJournalEntry, type FolioLineRecord } from "./mapper";

interface LineRow {
  id: string;
  organizationId: string;
  propertyId: string;
  folioId: string;
  lineType: string;
  description: string;
  amountMinor: string | number;
  paymentMethod: string | null;
  reversesLineId: string | null;
  source: string | null;
  currency: string;
}

export interface FolioLineSnapshot {
  lineId?: string;
  organizationId?: string;
  propertyId?: string;
  folioId?: string;
  lineType?: string;
  description?: string;
  amountMinor?: number | bigint;
  paymentMethod?: string | null;
  reversesLineId?: string | null;
  source?: string | null;
  currency?: string;
  reversedOriginalType?: string | null;
  reversedOriginalMethod?: string | null;
  reversedOriginalSource?: string | null;
}

/**
 * Posts a single Folio line into the generic accounting general ledger (blueprint 5.10).
 *
 * Idempotent: if a journal entry already exists for this Folio line, returns the existing entry.
 * Concurrency-safe: handles concurrent race conditions by recovering on duplicate key conflict.
 */
export async function postFolioLineToLedgerWithin(
  tx: FinanceClient,
  folioLineId: string,
  snapshot?: FolioLineSnapshot,
): Promise<JournalEntry | null> {
  let lineRecord: FolioLineRecord | null = null;
  let originalLine: FolioLineRecord | null = null;

  if (
    snapshot &&
    snapshot.lineId === folioLineId &&
    snapshot.organizationId &&
    snapshot.propertyId &&
    snapshot.folioId &&
    snapshot.lineType &&
    snapshot.amountMinor !== undefined &&
    snapshot.currency
  ) {
    lineRecord = {
      id: snapshot.lineId,
      organizationId: snapshot.organizationId,
      propertyId: snapshot.propertyId,
      folioId: snapshot.folioId,
      lineType: snapshot.lineType,
      description: snapshot.description ?? "",
      amountMinor: Number(snapshot.amountMinor),
      paymentMethod: snapshot.paymentMethod ?? null,
      reversesLineId: snapshot.reversesLineId ?? null,
      source: snapshot.source ?? null,
      currency: snapshot.currency,
    };

    if (snapshot.reversesLineId && snapshot.reversedOriginalType) {
      originalLine = {
        id: snapshot.reversesLineId,
        organizationId: snapshot.organizationId,
        propertyId: snapshot.propertyId,
        folioId: snapshot.folioId,
        lineType: snapshot.reversedOriginalType,
        description: "Reversed original line",
        amountMinor: Number(snapshot.amountMinor),
        paymentMethod: snapshot.reversedOriginalMethod ?? null,
        reversesLineId: null,
        source: snapshot.reversedOriginalSource ?? null,
        currency: snapshot.currency,
      };
    }
  }

  if (!lineRecord) {
    const lineRows = await tx.$queryRaw<LineRow[]>`
      select
        line.id,
        line.organization_id  as "organizationId",
        line.property_id      as "propertyId",
        line.folio_id         as "folioId",
        line.line_type        as "lineType",
        line.description,
        line.amount_minor     as "amountMinor",
        line.payment_method   as "paymentMethod",
        line.reverses_line_id as "reversesLineId",
        line.source,
        folio.currency::text  as "currency"
      from public.folio_lines as line
      join public.folios as folio on folio.id = line.folio_id
      where line.id = ${folioLineId}::uuid
    `;

    const line = lineRows[0];
    if (!line) {
      return null;
    }

    lineRecord = {
      ...line,
      amountMinor: Number(line.amountMinor),
    };

    if (line.reversesLineId) {
      const origRows = await tx.$queryRaw<LineRow[]>`
        select
          orig.id,
          orig.organization_id  as "organizationId",
          orig.property_id      as "propertyId",
          orig.folio_id         as "folioId",
          orig.line_type        as "lineType",
          orig.description,
          orig.amount_minor     as "amountMinor",
          orig.payment_method   as "paymentMethod",
          orig.reverses_line_id as "reversesLineId",
          orig.source,
          folio.currency::text  as "currency"
        from public.folio_lines as orig
        join public.folios as folio on folio.id = orig.folio_id
        where orig.id = ${line.reversesLineId}::uuid
      `;
      if (origRows[0]) {
        originalLine = {
          ...origRows[0],
          amountMinor: Number(origRows[0].amountMinor),
        };
      }
    }
  }

  // Idempotency check: if this line has already posted, do not double post
  const existing = await getJournalEntryBySourceWithin(
    tx,
    lineRecord.organizationId,
    "folio_line",
    lineRecord.id,
  );
  if (existing) {
    return existing;
  }

  // Ensure default accounts exist for this organization
  const accountList = await ensureDefaultAccountsWithin(
    tx,
    lineRecord.organizationId,
  );
  const accountMap: Record<string, string> = {};
  for (const acc of accountList) {
    accountMap[acc.code] = acc.id;
  }

  const entryInput = mapFolioLineToJournalEntry(
    lineRecord,
    accountMap,
    originalLine,
  );

  try {
    return await postJournalEntryWithin(tx, entryInput);
  } catch (error: unknown) {
    if (error instanceof DuplicateEntryError) {
      const recovered = await getJournalEntryBySourceWithin(
        tx,
        lineRecord.organizationId,
        "folio_line",
        lineRecord.id,
      );
      if (recovered) {
        return recovered;
      }
    }
    throw error;
  }
}
