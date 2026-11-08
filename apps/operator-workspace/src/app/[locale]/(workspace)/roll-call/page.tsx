import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RollCallView } from "../../../../features/attendance/components/roll-call-view";
import { rollFilterFrom } from "../../../../features/attendance/grouping";
import {
  requireViewer,
  rollCall,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: `${t("navigation.roll-call")} · ${t("productName")}` };
}

/**
 * The nightly roll call at one Property (RANZ-101, docs/features/
 * leave-and-attendance).
 *
 * Not a live list. A mark, a leave or a curfew change revalidates it, and what
 * another desk did meanwhile is caught by the database when this one tries the
 * same Resident. A Property that keeps no roll call, or a viewer who may
 * neither call it nor give leave, reads as no destination at all.
 */
export default async function RollCallPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string; show?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  await requireViewer(locale);
  const search = await searchParams;
  const properties = await screenProperties(gateOf("roll-call"));
  const property = await frontDeskProperty(
    properties,
    search,
    localizeHref(locale, "roll-call"),
  );
  const night = property ? await rollCall(property.propertyId) : null;

  if (!property || !night) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("roll-call"), search.property)}
        locale={locale}
      />
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">{property.propertyName}</p>
      <RollCallView
        initialFilter={rollFilterFrom(search.show)}
        locale={locale}
        rollCall={night}
      />
    </>
  );
}
