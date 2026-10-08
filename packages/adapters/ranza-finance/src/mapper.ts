import {
  InvalidEntryError,
  type JournalEntryInput,
  type JournalLineInput,
} from "@ranza/platform-finance";

export interface FolioLineRecord {
  id: string;
  organizationId: string;
  propertyId: string;
  folioId: string;
  lineType: string;
  description: string;
  amountMinor: number | bigint;
  paymentMethod: string | null;
  reversesLineId: string | null;
  source: string | null;
  currency: string;
}

export interface AccountMap {
  readonly [code: string]: string; // code -> accountId
}

export const STANDARD_ACCOUNT_CODES = {
  CASH: "1000",
  BANK: "1010",
  CARD: "1020",
  RECEIVABLES: "1200",
  ROOM_REVENUE: "4000",
  OTHER_REVENUE: "4100",
} as const;

export function resolvePaymentAccount(paymentMethod: string | null): string {
  switch (paymentMethod) {
    case "bank_transfer":
      return STANDARD_ACCOUNT_CODES.BANK;
    case "card":
      return STANDARD_ACCOUNT_CODES.CARD;
    case "cash":
    case "other":
    case null:
    case undefined:
      return STANDARD_ACCOUNT_CODES.CASH;
    default:
      throw new InvalidEntryError(
        `Unsupported payment method "${paymentMethod}" for ledger classification`,
      );
  }
}

/**
 * Translates a Folio line into a balanced generic JournalEntryInput.
 */
export function mapFolioLineToJournalEntry(
  line: FolioLineRecord,
  accounts: AccountMap,
  reversedOriginalLine?: FolioLineRecord | null,
): JournalEntryInput {
  const amount = Math.abs(Number(line.amountMinor));
  const description = line.description?.trim() || `${line.lineType} posting`;
  const receivablesId = accounts[STANDARD_ACCOUNT_CODES.RECEIVABLES];
  const roomRevenueId = accounts[STANDARD_ACCOUNT_CODES.ROOM_REVENUE];
  const otherRevenueId =
    accounts[STANDARD_ACCOUNT_CODES.OTHER_REVENUE] ?? roomRevenueId;

  if (!receivablesId) {
    throw new InvalidEntryError(
      `Missing required account mapping for ${STANDARD_ACCOUNT_CODES.RECEIVABLES}`,
    );
  }

  const lines: JournalLineInput[] = [];

  if (line.lineType === "charge") {
    const revenueAccountId =
      line.source === "room_night" ? roomRevenueId : otherRevenueId;
    if (!revenueAccountId) {
      throw new InvalidEntryError("Missing required revenue account mapping");
    }

    // Debit Accounts Receivable, Credit Revenue
    lines.push(
      {
        accountId: receivablesId,
        direction: "debit",
        amountMinor: amount,
        description,
      },
      {
        accountId: revenueAccountId,
        direction: "credit",
        amountMinor: amount,
        description,
      },
    );
  } else if (line.lineType === "payment") {
    const paymentAccountCode = resolvePaymentAccount(line.paymentMethod);
    const paymentAccountId = accounts[paymentAccountCode];
    if (!paymentAccountId) {
      throw new InvalidEntryError(
        `Missing required payment account mapping for code ${paymentAccountCode}`,
      );
    }

    // Debit Cash/Bank/Card, Credit Accounts Receivable
    lines.push(
      {
        accountId: paymentAccountId,
        direction: "debit",
        amountMinor: amount,
        description,
      },
      {
        accountId: receivablesId,
        direction: "credit",
        amountMinor: amount,
        description,
      },
    );
  } else if (line.lineType === "reversal") {
    // Reversal cancels the original line
    if (!reversedOriginalLine) {
      throw new InvalidEntryError(
        `Reversal line ${line.id} missing referenced original line for proper accounting classification`,
      );
    }

    if (reversedOriginalLine.lineType === "payment") {
      const paymentAccountCode = resolvePaymentAccount(
        reversedOriginalLine.paymentMethod,
      );
      const paymentAccountId = accounts[paymentAccountCode];
      if (!paymentAccountId) {
        throw new InvalidEntryError(
          `Missing required payment account mapping for code ${paymentAccountCode}`,
        );
      }

      // Reversing a payment: Debit Accounts Receivable, Credit Cash/Bank/Card
      lines.push(
        {
          accountId: receivablesId,
          direction: "debit",
          amountMinor: amount,
          description,
        },
        {
          accountId: paymentAccountId,
          direction: "credit",
          amountMinor: amount,
          description,
        },
      );
    } else if (reversedOriginalLine.lineType === "charge") {
      // Reversing a charge: Debit Revenue, Credit Accounts Receivable
      const revSource = reversedOriginalLine.source ?? line.source;
      const revenueAccountId =
        revSource === "room_night" ? roomRevenueId : otherRevenueId;
      if (!revenueAccountId) {
        throw new InvalidEntryError("Missing required revenue account mapping");
      }

      lines.push(
        {
          accountId: revenueAccountId,
          direction: "debit",
          amountMinor: amount,
          description,
        },
        {
          accountId: receivablesId,
          direction: "credit",
          amountMinor: amount,
          description,
        },
      );
    } else {
      throw new InvalidEntryError(
        `Cannot reverse line ${line.id}: unrecognized original line type ${reversedOriginalLine.lineType}`,
      );
    }
  } else {
    throw new InvalidEntryError(
      `Unsupported folio line type: ${line.lineType}`,
    );
  }

  return {
    organizationId: line.organizationId,
    currency: line.currency,
    description,
    sourceType: "folio_line",
    sourceId: line.id,
    lines,
  };
}
