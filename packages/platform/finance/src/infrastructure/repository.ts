import {
  Account,
  AccountBalance,
  AccountType,
  BalanceDirection,
  JournalEntry,
  JournalEntryInput,
  JournalLine,
} from "../domain/entry";
import {
  AccountNotFoundError,
  DuplicateEntryError,
  FinanceError,
  InvalidEntryError,
} from "../domain/errors";
import type { FinanceClient } from "../ports";

interface EntryRow {
  id: string;
  organizationId: string;
  entryNumber: string | number;
  entryDate: Date;
  postedAt: Date;
  currency: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdBy: string | null;
}

interface LineRow {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  direction: BalanceDirection;
  amountMinor: string | number;
  description: string | null;
  lineNumber: number;
}

interface AccountRow {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: BalanceDirection;
  isActive: boolean;
  createdAt: Date;
}

interface BalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: BalanceDirection;
  debitMinor: string | number;
  creditMinor: string | number;
}

export async function insertJournalEntry(
  tx: FinanceClient,
  entry: JournalEntryInput,
): Promise<JournalEntry> {
  // Validate that all referenced accounts exist, belong to this organization, and are active
  const uniqueAccountIds = Array.from(
    new Set(entry.lines.map((l) => l.accountId)),
  );
  for (const accountId of uniqueAccountIds) {
    const accRows = await tx.$queryRaw<
      Array<{
        id: string;
        isActive: boolean;
        code: string;
        organizationId: string;
      }>
    >`
      select
        id,
        is_active as "isActive",
        code,
        organization_id as "organizationId"
      from finance.accounts
      where id = ${accountId}::uuid
    `;
    const acc = accRows[0];
    if (!acc || acc.organizationId !== entry.organizationId) {
      throw new AccountNotFoundError(
        `account ${accountId} does not exist for organization ${entry.organizationId}`,
      );
    }
    if (!acc.isActive) {
      throw new InvalidEntryError(
        `account ${acc.code} is inactive and cannot accept postings`,
      );
    }
  }

  const formattedDate = entry.entryDate
    ? new Date(entry.entryDate).toISOString().slice(0, 10)
    : null;

  let headerRows: EntryRow[];
  try {
    headerRows = await tx.$queryRaw<EntryRow[]>`
      insert into finance.journal_entries
        (organization_id, currency, description, source_type, source_id, created_by, entry_date)
      values (
        ${entry.organizationId}::uuid,
        ${entry.currency},
        ${entry.description.trim()},
        ${entry.sourceType},
        ${entry.sourceId}::uuid,
        ${entry.createdBy ?? null}::uuid,
        coalesce(${formattedDate}::date, current_date)
      )
      returning
        id,
        organization_id as "organizationId",
        entry_number    as "entryNumber",
        entry_date      as "entryDate",
        posted_at       as "postedAt",
        currency,
        description,
        source_type     as "sourceType",
        source_id       as "sourceId",
        created_by      as "createdBy"
    `;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err.code === "23505" ||
      err.message?.includes("journal_entries_source")
    ) {
      throw new DuplicateEntryError(
        `a journal entry already exists for source ${entry.sourceType}:${entry.sourceId}`,
      );
    }
    throw new FinanceError("could not insert journal entry header", {
      cause: error,
    });
  }

  const header = headerRows[0];
  if (!header) {
    throw new FinanceError("the journal entry header was not returned");
  }

  const createdLines: JournalLine[] = [];

  for (const [idx, line] of entry.lines.entries()) {
    const lineNumber = idx + 1;
    const lineRows = await tx.$queryRaw<LineRow[]>`
      with inserted as (
        insert into finance.journal_lines
          (organization_id, journal_entry_id, account_id, direction, amount_minor, description, line_number)
        values (
          ${entry.organizationId}::uuid,
          ${header.id}::uuid,
          ${line.accountId}::uuid,
          ${line.direction},
          ${line.amountMinor}::bigint,
          ${line.description ?? null},
          ${lineNumber}
        )
        returning id, journal_entry_id, account_id, direction, amount_minor, description, line_number
      )
      select
        inserted.id,
        inserted.journal_entry_id as "journalEntryId",
        inserted.account_id       as "accountId",
        acc.code                  as "accountCode",
        acc.name                  as "accountName",
        inserted.direction,
        inserted.amount_minor     as "amountMinor",
        inserted.description,
        inserted.line_number      as "lineNumber"
      from inserted
      join finance.accounts as acc on acc.id = inserted.account_id
    `;

    const row = lineRows[0];
    if (!row) {
      throw new FinanceError(`could not insert journal line ${lineNumber}`);
    }

    createdLines.push({
      id: row.id,
      journalEntryId: row.journalEntryId,
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      direction: row.direction,
      amountMinor: Number(row.amountMinor),
      description: row.description,
      lineNumber: row.lineNumber,
    });
  }

  return {
    id: header.id,
    organizationId: header.organizationId,
    entryNumber: Number(header.entryNumber),
    entryDate: new Date(header.entryDate),
    postedAt: new Date(header.postedAt),
    currency: header.currency.trim(),
    description: header.description,
    sourceType: header.sourceType,
    sourceId: header.sourceId,
    createdBy: header.createdBy,
    lines: createdLines,
  };
}

export async function findJournalEntryBySource(
  tx: FinanceClient,
  organizationId: string,
  sourceType: string,
  sourceId: string,
): Promise<JournalEntry | null> {
  const headerRows = await tx.$queryRaw<EntryRow[]>`
    select
      id,
      organization_id as "organizationId",
      entry_number    as "entryNumber",
      entry_date      as "entryDate",
      posted_at       as "postedAt",
      currency,
      description,
      source_type     as "sourceType",
      source_id       as "sourceId",
      created_by      as "createdBy"
    from finance.journal_entries
    where organization_id = ${organizationId}::uuid
      and source_type = ${sourceType}
      and source_id = ${sourceId}::uuid
  `;

  const header = headerRows[0];
  if (!header) return null;

  const lineRows = await tx.$queryRaw<LineRow[]>`
    select
      jl.id,
      jl.journal_entry_id as "journalEntryId",
      jl.account_id       as "accountId",
      acc.code            as "accountCode",
      acc.name            as "accountName",
      jl.direction,
      jl.amount_minor     as "amountMinor",
      jl.description,
      jl.line_number      as "lineNumber"
    from finance.journal_lines as jl
    join finance.accounts as acc on acc.id = jl.account_id
    where jl.journal_entry_id = ${header.id}::uuid
    order by jl.line_number asc
  `;

  return {
    id: header.id,
    organizationId: header.organizationId,
    entryNumber: Number(header.entryNumber),
    entryDate: new Date(header.entryDate),
    postedAt: new Date(header.postedAt),
    currency: header.currency.trim(),
    description: header.description,
    sourceType: header.sourceType,
    sourceId: header.sourceId,
    createdBy: header.createdBy,
    lines: lineRows.map((r) => ({
      id: r.id,
      journalEntryId: r.journalEntryId,
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      direction: r.direction,
      amountMinor: Number(r.amountMinor),
      description: r.description,
      lineNumber: r.lineNumber,
    })),
  };
}

export async function findJournalEntryById(
  tx: FinanceClient,
  organizationId: string,
  entryId: string,
): Promise<JournalEntry | null> {
  const headerRows = await tx.$queryRaw<EntryRow[]>`
    select
      id,
      organization_id as "organizationId",
      entry_number    as "entryNumber",
      entry_date      as "entryDate",
      posted_at       as "postedAt",
      currency,
      description,
      source_type     as "sourceType",
      source_id       as "sourceId",
      created_by      as "createdBy"
    from finance.journal_entries
    where organization_id = ${organizationId}::uuid
      and id = ${entryId}::uuid
  `;

  const header = headerRows[0];
  if (!header) return null;

  const lineRows = await tx.$queryRaw<LineRow[]>`
    select
      jl.id,
      jl.journal_entry_id as "journalEntryId",
      jl.account_id       as "accountId",
      acc.code            as "accountCode",
      acc.name            as "accountName",
      jl.direction,
      jl.amount_minor     as "amountMinor",
      jl.description,
      jl.line_number      as "lineNumber"
    from finance.journal_lines as jl
    join finance.accounts as acc on acc.id = jl.account_id
    where jl.journal_entry_id = ${header.id}::uuid
    order by jl.line_number asc
  `;

  return {
    id: header.id,
    organizationId: header.organizationId,
    entryNumber: Number(header.entryNumber),
    entryDate: new Date(header.entryDate),
    postedAt: new Date(header.postedAt),
    currency: header.currency.trim(),
    description: header.description,
    sourceType: header.sourceType,
    sourceId: header.sourceId,
    createdBy: header.createdBy,
    lines: lineRows.map((r) => ({
      id: r.id,
      journalEntryId: r.journalEntryId,
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      direction: r.direction,
      amountMinor: Number(r.amountMinor),
      description: r.description,
      lineNumber: r.lineNumber,
    })),
  };
}

export async function listAccounts(
  tx: FinanceClient,
  organizationId: string,
): Promise<Account[]> {
  const rows = await tx.$queryRaw<AccountRow[]>`
    select
      id,
      organization_id as "organizationId",
      code,
      name,
      type,
      normal_balance as "normalBalance",
      is_active as "isActive",
      created_at as "createdAt"
    from finance.accounts
    where organization_id = ${organizationId}::uuid
    order by code asc
  `;

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    code: r.code,
    name: r.name,
    type: r.type,
    normalBalance: r.normalBalance,
    isActive: r.isActive,
    createdAt: new Date(r.createdAt),
  }));
}

export async function ensureDefaultAccounts(
  tx: FinanceClient,
  organizationId: string,
): Promise<Account[]> {
  await tx.$executeRawUnsafe(
    `select finance.ensure_default_accounts($1::uuid)`,
    organizationId,
  );
  return listAccounts(tx, organizationId);
}

export async function getAccountBalances(
  tx: FinanceClient,
  organizationId: string,
  currency?: string,
): Promise<AccountBalance[]> {
  const rows = currency
    ? await tx.$queryRaw<BalanceRow[]>`
        select
          acc.id as "accountId",
          acc.code as "accountCode",
          acc.name as "accountName",
          acc.type as "accountType",
          acc.normal_balance as "normalBalance",
          coalesce(sum(case when jl.direction = 'debit' then jl.amount_minor else 0 end), 0) as "debitMinor",
          coalesce(sum(case when jl.direction = 'credit' then jl.amount_minor else 0 end), 0) as "creditMinor"
        from finance.accounts as acc
        left join finance.journal_lines as jl
          on jl.account_id = acc.id
          and jl.organization_id = acc.organization_id
        left join finance.journal_entries as je
          on je.id = jl.journal_entry_id
          and je.organization_id = acc.organization_id
        where acc.organization_id = ${organizationId}::uuid
          and (je.currency is null or je.currency = ${currency})
        group by acc.id, acc.code, acc.name, acc.type, acc.normal_balance
        order by acc.code asc
      `
    : await tx.$queryRaw<BalanceRow[]>`
        select
          acc.id as "accountId",
          acc.code as "accountCode",
          acc.name as "accountName",
          acc.type as "accountType",
          acc.normal_balance as "normalBalance",
          coalesce(sum(case when jl.direction = 'debit' then jl.amount_minor else 0 end), 0) as "debitMinor",
          coalesce(sum(case when jl.direction = 'credit' then jl.amount_minor else 0 end), 0) as "creditMinor"
        from finance.accounts as acc
        left join finance.journal_lines as jl
          on jl.account_id = acc.id
          and jl.organization_id = acc.organization_id
        where acc.organization_id = ${organizationId}::uuid
        group by acc.id, acc.code, acc.name, acc.type, acc.normal_balance
        order by acc.code asc
      `;

  return rows.map((r) => {
    const debit = Number(r.debitMinor);
    const credit = Number(r.creditMinor);
    const net = r.normalBalance === "debit" ? debit - credit : credit - debit;
    return {
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      normalBalance: r.normalBalance,
      debitMinor: debit,
      creditMinor: credit,
      netBalanceMinor: net,
      ...(currency !== undefined ? { currency } : {}),
    };
  });
}
