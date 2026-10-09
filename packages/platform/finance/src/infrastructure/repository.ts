import {
  Account,
  AccountBalance,
  AccountType,
  BalanceDirection,
  JournalEntry,
} from "../domain/entry";
import type { FinanceClient } from "../ports";

/**
 * Reads of the ledger, under the caller's own policies.
 *
 * There is no write here. The ledger is written by one database function that
 * only the worker may execute (ADR 0042, ADR 0027), so a runtime role that
 * called an `insert` from this package would be refused by the grant it lacks.
 */

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

async function loadEntry(
  tx: FinanceClient,
  header: EntryRow,
): Promise<JournalEntry> {
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
  return header ? loadEntry(tx, header) : null;
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
  return header ? loadEntry(tx, header) : null;
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
