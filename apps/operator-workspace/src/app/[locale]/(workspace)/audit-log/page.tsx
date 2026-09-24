import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { Button, EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ANY } from "../../../../features/audit-log/actions";
import {
  AuditFilters,
  type AuditFilterValues,
} from "../../../../features/audit-log/components/audit-filters";
import { AuditTable } from "../../../../features/audit-log/components/audit-table";
import { RecordPanel } from "../../../../features/audit-log/components/record-panel";
import {
  AUDIT_READ_PERMISSION,
  auditLog,
  auditRecord,
  MIN_SEARCH_LENGTH,
  permittedProperties,
  requireViewer,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

type Search = Record<string, string | string[] | undefined>;

/** One value per parameter; a repeated one is a URL somebody edited. */
function one(search: Search, key: string): string | undefined {
  const value = search[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" || first === ANY
    ? undefined
    : first;
}

/**
 * The audit log: what was done, by whom, where, and why.
 *
 * One route with two states. `?record=` opens one record by id, so a link to
 * it keeps working however many records are written after it; everything
 * else is the list, narrowed by filters that are URL parameters and answered
 * by the server over every record the viewer may read (ADR 0031).
 *
 * `?property=` is the Property the log is opened from — the page bar's
 * switcher, as on every screen. It decides which Organization's log this is
 * and that the viewer may read it there. `?at=` is the separate narrowing to
 * one Property's records.
 *
 * Nothing is filtered again here. The permission is asked and the rows are
 * chosen by the read policy inside the read's own transaction, and a second
 * application-side check would be the weaker of the two while inviting
 * somebody to trust it instead.
 */
export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const search = await searchParams;
  const viewer = await requireViewer(locale);
  const properties = await permittedProperties(AUDIT_READ_PERMISSION);
  const opened = one(search, "property");
  const property = frontDeskProperty(
    properties,
    opened === undefined ? {} : { property: opened },
  );

  if (!property) {
    // The switcher names a Property the log cannot be opened from, and there
    // is one it can: a named Property no longer falls back to another, so say
    // where it opens rather than a refusal that is untrue for this viewer.
    // Linked here rather than left to the switcher, which lists the Properties
    // Today is open at and leads back to Today — neither is this question.
    // One link per Organization: the log is the Organization's, and which of
    // its Properties it is opened from changes nothing in it (ADR 0031).
    if (properties.length > 0) {
      const entrances = new Map<string, (typeof properties)[number]>();
      for (const candidate of properties) {
        if (!entrances.has(candidate.organizationId)) {
          entrances.set(candidate.organizationId, candidate);
        }
      }
      return (
        <EmptyState
          action={
            <ul className="flex flex-wrap gap-2">
              {[...entrances.values()].map((entrance) => (
                <li key={entrance.organizationId}>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`${localizeHref(locale, "audit-log")}?property=${entrance.propertyId}`}
                    >
                      {entrance.organizationName}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          }
          description={t("auditNotHereDescription")}
          title={t("auditNotHereTitle")}
        />
      );
    }
    // No Property to open the log from means no `audit.read` wherever the
    // viewer reaches — a permission, not the Subscription the other screens'
    // refusal speaks of: audit is not something an Organization buys. A role
    // that holds it with no Property assigned lands here too, and telling the
    // two apart would take a read of its own, so the copy names both remedies.
    return (
      <EmptyState
        description={t("auditNotPermittedDescription")}
        title={t("auditNotPermittedTitle")}
      />
    );
  }

  const route = localizeHref(locale, "audit-log");
  const listHref = `${route}?property=${property.propertyId}`;
  const folioHref = `${localizeHref(locale, "finance")}?property=${property.propertyId}`;

  const recordId = one(search, "record");
  if (recordId) {
    const found = await auditRecord(property.propertyId, recordId);
    return (
      <>
        <p className="text-muted-foreground">
          <Link className="hover:underline" href={listHref}>
            {t("allRecords")}
          </Link>
          {" · "}
          {property.organizationName}
        </p>
        {found ? (
          <RecordPanel
            entry={found.entry}
            folioHref={folioHref}
            locale={locale}
            names={found}
            viewerId={viewer.userId}
          />
        ) : (
          // Absent, in another Organization, or not one this viewer may
          // read — one answer for all three.
          <div className="mt-6">
            <EmptyState
              description={t("auditRecordMissingDescription")}
              title={t("auditRecordMissingTitle")}
            />
          </div>
        )}
      </>
    );
  }

  const values: AuditFilterValues = {
    action: one(search, "action"),
    at: one(search, "at"),
    from: one(search, "from"),
    to: one(search, "to"),
    q: one(search, "q"),
  };
  const cursor = one(search, "cursor");
  // Shorter than this the server does not search; say so rather than
  // silently show every record as though it matched.
  const searchTooShort =
    values.q !== undefined && values.q.trim().length < MIN_SEARCH_LENGTH;

  const page = await auditLog(property.propertyId, {
    actions: values.action ? [values.action] : undefined,
    propertyId: values.at,
    from: values.from,
    to: values.to,
    q: values.q,
    cursor,
  });

  // Every link on the page carries the filters, so paging and opening a
  // record never silently drop what the reader narrowed to.
  const filtersQuery = new URLSearchParams({ property: property.propertyId });
  for (const [key, value] of Object.entries(values)) {
    if (value) filtersQuery.set(key, value);
  }
  const filteredHref = `${route}?${filtersQuery.toString()}`;
  const olderHref = page.nextCursor
    ? `${filteredHref}&cursor=${encodeURIComponent(page.nextCursor)}`
    : null;

  const organizationProperties = properties
    .filter((candidate) => candidate.organizationId === property.organizationId)
    .map((candidate) => ({
      id: candidate.propertyId,
      name: candidate.propertyName,
    }));

  return (
    <>
      <p className="text-muted-foreground">
        {t("auditLogFor")} {property.organizationName}
      </p>
      <AuditFilters
        actionHref={route}
        properties={organizationProperties}
        propertyId={property.propertyId}
        values={values}
      />
      {searchTooShort ? (
        <p className="mt-2 text-step--1 text-muted-foreground" role="status">
          {t("auditSearchTooShort")}
        </p>
      ) : null}
      <AuditTable
        filtered={Object.values(values).some(Boolean)}
        locale={locale}
        newestHref={cursor ? filteredHref : null}
        olderHref={olderHref}
        page={page}
        recordHref={filteredHref}
        viewerId={viewer.userId}
      />
    </>
  );
}
