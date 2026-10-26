import { notFound } from "next/navigation";
import { calendarDay, isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountsTable } from "../../../../features/ledger/components/accounts-table";
import { EntryPanel } from "../../../../features/ledger/components/entry-panel";
import { JournalTable } from "../../../../features/ledger/components/journal-table";
import { LedgerFilters } from "../../../../features/ledger/components/ledger-filters";
import { LedgerTabs } from "../../../../features/ledger/components/ledger-tabs";
import {
  isFiltered,
  ledgerHref,
  readLedgerSearch,
} from "../../../../features/ledger/query";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";
import {
  accountsView,
  entryView,
  journalView,
} from "../../../../server/ledger";
import {
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";

const SEGMENT = "ledger";

/**
 * The ledger: the books the Organization's Folios post to, read.
 *
 * Read only, and the Organization's: an entry carries no Property, so the
 * `?property=` in the address says which Organization's books these are and
 * that the viewer may read them there (ACC-S2-05), and nothing narrows by it.
 * The journal and the chart are tabs of one route. `?entry=` opens one entry
 * by id, so a link to it keeps working however many are posted after it.
 *
 * Nothing is filtered again here. The permission, the Organization's whole
 * reach and the Folio finance capability are asked by the read policies inside
 * each read's own transaction; a second application-side check would be the
 * weaker of the two while inviting somebody to trust it instead.
 */
export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const raw = await searchParams;
  const gate = gateOf(SEGMENT);
  const route = localizeHref(locale, SEGMENT);
  const properties = await screenProperties(gate);
  const property = await frontDeskProperty(properties, raw, route);

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gate,
          typeof raw.property === "string" ? raw.property : undefined,
        )}
        locale={locale}
      />
    );
  }

  const search = readLedgerSearch(raw);
  const organizationId = property.organizationId;
  const foliosOpenAt = new Set(
    (await screenProperties(gateOf("finance"))).map(
      (opened) => opened.propertyId,
    ),
  );
  const heading = (
    <p className="text-sm text-muted-foreground">
      {t("ledger.for", { organization: property.organizationName })}
    </p>
  );

  if (search.entry) {
    const view = await entryView(organizationId, search.entry, foliosOpenAt);
    return (
      <>
        {heading}
        {view ? (
          <EntryPanel timeZone={property.timezone} view={view} />
        ) : (
          // Absent, in another Organization, or not one this viewer may read:
          // one answer for all three.
          <div className="mt-6">
            <EmptyState
              description={t("ledger.entryMissingDescription")}
              title={t("ledger.entryMissingTitle")}
            />
          </div>
        )}
      </>
    );
  }

  const today = calendarDay(property.timezone);
  const tabHrefs = {
    journal: ledgerHref(route, property.propertyId, {}),
    accounts: ledgerHref(route, property.propertyId, { tab: "accounts" }),
  };
  const tabs = (
    <div className="mt-4">
      <LedgerTabs current={search.tab} hrefs={tabHrefs} />
    </div>
  );
  const lag = (
    <p className="mt-3 text-step--1 text-muted-foreground">{t("ledger.lag")}</p>
  );

  if (search.tab === "accounts") {
    const view = await accountsView(organizationId, search);
    const shown = view.balances[0]?.currency;
    return (
      <>
        {heading}
        {tabs}
        <LedgerFilters
          accounts={null}
          actionHref={route}
          currencies={view.currencies}
          propertyId={property.propertyId}
          sourceTypes={[]}
          today={today}
          values={{ ...search, shownCurrency: shown }}
        />
        {lag}
        <AccountsTable currency={shown} view={view} />
      </>
    );
  }

  const view = await journalView(
    organizationId,
    {
      from: search.from,
      to: search.to,
      accountId: search.account,
      sourceType: search.source,
      currency: search.currency,
      cursor: search.cursor,
    },
    foliosOpenAt,
  );
  const withoutCursor = { ...search, cursor: undefined };
  const olderHref = view.nextCursor
    ? ledgerHref(route, property.propertyId, {
        ...withoutCursor,
        cursor: view.nextCursor,
      })
    : null;
  const newestHref = search.cursor
    ? ledgerHref(route, property.propertyId, withoutCursor)
    : null;

  return (
    <>
      {heading}
      {tabs}
      <LedgerFilters
        accounts={view.accounts}
        actionHref={route}
        currencies={view.currencies}
        propertyId={property.propertyId}
        sourceTypes={view.sourceTypes}
        today={today}
        values={search}
      />
      {lag}
      <JournalTable
        entries={view.entries}
        filtered={isFiltered(search)}
        newestHref={newestHref}
        olderHref={olderHref}
        propertyId={property.propertyId}
        route={route}
        search={withoutCursor}
      />
    </>
  );
}
