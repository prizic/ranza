import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { ImportDetailView } from "../../../../features/imports/components/import-detail";
import { ImportList } from "../../../../features/imports/components/import-list";
import { ImportUpload } from "../../../../features/imports/components/import-upload";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";
import { roomColumns } from "../../../../server/import-files";
import { importDetail, listImports } from "../../../../server/imports";
import { screenLinks } from "../../../../server/screen-links";
import {
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";

/**
 * Guided import (blueprint 19.1, ADR 0065): upload a file, see every row, then
 * import the ones that are ready. `?record=` names one import, whose way up is
 * this page's own list.
 */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
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
  const property = await frontDeskProperty(
    await screenProperties(gateOf("import")),
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
  const columns = roomColumns(locale);

  if (search.record !== undefined) {
    const [detail, links] = await Promise.all([
      importDetail(property.propertyId, search.record),
      screenLinks(locale, property.propertyId, ["rooms"]),
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
        columns={columns}
        detail={detail}
        locale={locale}
        roomsHref={links.rooms}
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
        columns={columns}
        locale={locale}
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
