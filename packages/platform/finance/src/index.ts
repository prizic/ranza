export {
  createFinanceModule,
  ensureDefaultAccountsWithin,
  getAccountBalancesWithin,
  getJournalEntryBySourceWithin,
  getJournalEntryWithin,
  listAccountsWithin,
  postJournalEntryWithin,
} from "./application/ledger";
export type { FinanceModule } from "./application/ledger";

export { assertPostableEntry } from "./domain/entry";
export type {
  Account,
  AccountBalance,
  AccountType,
  BalanceDirection,
  JournalEntry,
  JournalEntryInput,
  JournalLine,
  JournalLineInput,
} from "./domain/entry";

export {
  AccountNotFoundError,
  DuplicateEntryError,
  FinanceError,
  InvalidEntryError,
  UnbalancedEntryError,
} from "./domain/errors";

export type { FinanceClient, FinanceDeps } from "./ports";
