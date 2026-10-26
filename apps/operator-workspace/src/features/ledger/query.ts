/**
 * What the ledger's URL says, read once and made safe.
 *
 * Every filter is a URL parameter the server answers (as the audit log's are),
 * so a view can be sent to a colleague. A value that is not what its parameter
 * should hold is a URL somebody edited: it is no filter, never an error.
 */

export const LEDGER_TABS = ["journal", "accounts"] as const;
export type LedgerTab = (typeof LEDGER_TABS)[number];

/** The value of a filter that is not narrowing. */
export const ANY = "any";

export interface LedgerSearch {
  tab: LedgerTab;
  from?: string | undefined;
  to?: string | undefined;
  account?: string | undefined;
  source?: string | undefined;
  currency?: string | undefined;
  cursor?: string | undefined;
  entry?: string | undefined;
}

type Raw = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const CURRENCY = /^[A-Z]{3}$/;
const POSITION = /^\d{1,18}$/;

/** A real calendar day, `YYYY-MM-DD`: 2026-02-30 is not one. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

/** One value per parameter; a repeated one is a URL somebody edited. */
function one(raw: Raw, key: string): string | undefined {
  const value = raw[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" || first === ANY
    ? undefined
    : first;
}

function matching(
  value: string | undefined,
  accepts: (value: string) => boolean,
): string | undefined {
  return value !== undefined && accepts(value) ? value : undefined;
}

export function readLedgerSearch(raw: Raw): LedgerSearch {
  const tab = one(raw, "tab");
  return {
    tab: tab === "accounts" ? "accounts" : "journal",
    from: matching(one(raw, "from"), isDay),
    to: matching(one(raw, "to"), isDay),
    account: matching(one(raw, "account"), (v) => UUID.test(v)),
    source: matching(
      one(raw, "source"),
      (v) => v.length <= 64 && SOURCE.test(v),
    ),
    currency: matching(one(raw, "currency"), (v) => CURRENCY.test(v)),
    cursor: matching(one(raw, "cursor"), (v) => POSITION.test(v)),
    entry: matching(one(raw, "entry"), (v) => UUID.test(v)),
  };
}

/** The route with the Property and whichever of these filters are set. */
export function ledgerHref(
  route: string,
  propertyId: string,
  search: Partial<LedgerSearch>,
): string {
  const params = new URLSearchParams({ property: propertyId });
  for (const [key, value] of Object.entries(search)) {
    if (value && !(key === "tab" && value === "journal"))
      params.set(key, value);
  }
  return `${route}?${params.toString()}`;
}

/** Whether any filter narrows the view (the tab and a cursor do not). */
export function isFiltered(search: LedgerSearch): boolean {
  return Boolean(
    search.from ||
    search.to ||
    search.account ||
    search.source ||
    search.currency,
  );
}
