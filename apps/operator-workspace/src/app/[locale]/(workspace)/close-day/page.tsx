import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CloseDayView } from "../../../../features/front-office/components/close-day-view";
import {
  closeTheDay,
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";
import { gateOf } from "../../../../lib/screens";
import {
  frontDeskProperty,
  frontDeskReach,
} from "../../../../server/front-desk";
import { screenLinks } from "../../../../server/screen-links";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: `${t("navigation.close-day")} · ${t("productName")}` };
}

/**
 * Close the day: the business day waiting to be closed at one Property, what
 * still holds it up, and the recent closes (blueprint 6.4, ADR 0034).
 *
 * Not a live list. Everything that changes it — a close, a no-show, a
 * cancellation, a check-in or check-out on the screens it links to —
 * revalidates it, and a close made elsewhere is caught by the database when
 * this screen tries the same one.
 */
export default async function CloseDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const viewer = await requireViewer(locale);
  const properties = await screenProperties(gateOf("close-day"));
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "close-day"),
  );
  const day = property ? await closeTheDay(property.propertyId) : null;

  if (!property || !day) {
    return (
      <ScreenDenied
        denial={await whyDenied(
          gateOf("close-day"),
          (await searchParams).property,
        )}
        locale={locale}
      />
    );
  }

  const [reach, links] = await Promise.all([
    frontDeskReach(property.propertyId),
    screenLinks(locale, property.propertyId, ["arrivals"]),
  ]);

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("closeDay.at")} {property.propertyName}
      </p>
      <CloseDayView
        arrivalsHref={links.arrivals ?? null}
        day={day}
        locale={locale}
        reach={reach}
        scope={{
          organizationId: property.organizationId,
          propertyId: property.propertyId,
          userId: viewer.userId,
        }}
      />
    </>
  );
}
