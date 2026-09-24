import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { AuditTable } from "../../../../features/audit-log/components/audit-table";
import { RecordPanel } from "../../../../features/audit-log/components/record-panel";
import {
  auditLog,
  AUDIT_CAPABILITY,
  entitledProperties,
  requireViewer,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

/**
 * The audit log: what was done, by whom, and why.
 *
 * One route with two states, as Finance is — `?record=` opens one row of the
 * list the page already holds, so the second state costs no second read and a
 * record can be bookmarked or sent to a colleague. A record older than the cap
 * is therefore not openable from here; reading past the cap is AL-DEF-03.
 *
 * The list is the Organization's, not the Property's: a record carries the
 * scope it was written in, and that scope is an Organization. The Property is
 * still what the screen is opened from, because that is what the gate is asked
 * about (ADR 0028) and whose wall clock the times are shown in — so the
 * sub-heading names the Organization, and the switcher still chooses the
 * Property.
 *
 * Nothing is filtered again here. The gate and the policies decided the list
 * inside the read's own transaction, and a second application-side check would
 * be the weaker of the two while inviting somebody to trust it instead.
 */
export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; record?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations();
  const search = await searchParams;
  const viewer = await requireViewer(locale);
  const properties = await entitledProperties(AUDIT_CAPABILITY);
  const property = frontDeskProperty(properties, search);

  if (!property) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  const { records, total } = await auditLog(property.propertyId);
  const listHref = `${localizeHref(locale, "audit-log")}?property=${property.propertyId}`;
  const folioHref = `${localizeHref(locale, "finance")}?property=${property.propertyId}`;

  // A `?record=` that is not in the list — older than the cap, or guessed —
  // falls through to the list, exactly as a record that never existed would.
  const selected = search.record
    ? (records.find((record) => record.id === search.record) ?? null)
    : null;

  if (selected) {
    return (
      <>
        <p className="text-muted-foreground">
          <Link className="hover:underline" href={listHref}>
            {t("allRecords")}
          </Link>
          {" · "}
          {property.organizationName}
        </p>
        <RecordPanel
          folioHref={folioHref}
          locale={locale}
          record={selected}
          timeZone={property.timezone}
          viewerId={viewer.userId}
        />
      </>
    );
  }

  return (
    <>
      <p className="text-muted-foreground">
        {t("auditLogFor")} {property.organizationName}
      </p>
      <AuditTable
        locale={locale}
        recordHref={listHref}
        records={records}
        timeZone={property.timezone}
        total={total}
        viewerId={viewer.userId}
      />
    </>
  );
}
