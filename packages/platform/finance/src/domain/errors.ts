/**
 * Domain errors for finance and accounting operations.
 */

export class FinanceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FinanceError";
  }
}

export class UnbalancedEntryError extends FinanceError {
  constructor(message: string) {
    super(message);
    this.name = "UnbalancedEntryError";
  }
}

export class AccountNotFoundError extends FinanceError {
  constructor(message: string) {
    super(message);
    this.name = "AccountNotFoundError";
  }
}

export class DuplicateEntryError extends FinanceError {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateEntryError";
  }
}

export class InvalidEntryError extends FinanceError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEntryError";
  }
}
