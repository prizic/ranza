import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { ImportDetailView } from "../../../../features/imports/components/import-detail";
import { ImportList } from "../../../../features/imports/components/import-list";
import { ImportUpload } from "../../../../features/imports/components/import-upload";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";
import { importColumns, isImportKind } from "../../../../server/import-files";
import { importDetail, listImports } from "../../../../server/imports";
import { screenLinks } from "../../../../server/screen-links";
import {
  requireViewer,
  screenPropertiesByGate,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";

/**
 * Who may import people. Each row is booked by the booking command, so it is
 * the reservations screen's gate narrowed to booking (IMP-S2-07); the database
 * refuses anybody else's rows whatever this says.
 */
const BOOKING_GATE = {
  ...gateOf("reservations"),
  permission: "front_desk.book",
};

/**
 * Guided import (blueprint 19.1, ADR 0065): upload a file, see every row, then
 * import the ones that are ready. `?kind=` picks rooms or people; `?record=`
 * names one import, whose way up is this page's own list.
 */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    kind?: string;
    property?: string;
    record?: string;
    sheets?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const search = await searchParams;
  const [importable, bookable] = await screenPropertiesByGate([
    gateOf("import"),
    BOOKING_GATE,
  ]);
  const property = await frontDeskProperty(
    importable ?? [],
    search,
    localizeHref(locale, "import"),
  );
  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("import"), search.property)}
        locale={locale}
      />
    );
  }

  const t = await getTranslations({ locale, namespace: "imports" });

  if (search.record !== undefined) {
    const [detail, links] = await Promise.all([
      importDetail(property.propertyId, search.record),
      screenLinks(locale, property.propertyId, ["rooms", "reservations"]),
    ]);
    // A link that names no import of this Property says so, and the page bar's
    // back button leads to the list (audit 2026-11-07, DEEPLINK).
    if (!detail) {
      return (
        <EmptyState
          description={t("notFound.description")}
          title={t("notFound.title")}
        />
      );
    }
    return (
      <ImportDetailView
        columns={importColumns(detail.kind, locale)}
        detail={detail}
        locale={locale}
        madeHref={detail.kind === "people" ? links.reservations : links.rooms}
        sheetsIgnored={
          /^\d{1,3}$/.test(search.sheets ?? "") ? Number(search.sheets) : 0
        }
      />
    );
  }

  const imports = await listImports(property.propertyId);
  return (
    <div className="grid gap-4">
      <p className="max-w-prose text-muted-foreground">{t("intro")}</p>
      <ImportUpload
        columns={{
          rooms: importColumns("rooms", locale),
          people: importColumns("people", locale),
        }}
        initialKind={isImportKind(search.kind) ? search.kind : "rooms"}
        locale={locale}
        mayImportPeople={(bookable ?? []).some(
          (one) => one.propertyId === property.propertyId,
        )}
        propertyId={property.propertyId}
      />
      <ImportList
        hrefBase={`${localizeHref(locale, "import")}?property=${property.propertyId}`}
        imports={imports}
        locale={locale}
        timezone={property.timezone}
      />
    </div>
  );
}
