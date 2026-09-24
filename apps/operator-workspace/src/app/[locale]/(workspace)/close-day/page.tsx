import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { CloseDayView } from "../../../../features/front-office/components/close-day-view";
import {
  closeTheDay,
  entitledProperties,
  FRONT_DESK_CAPABILITY,
} from "../../../../server/viewer";
import { frontDeskProperty } from "../../../../server/front-desk";

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

  const t = await getTranslations();
  const properties = await entitledProperties(FRONT_DESK_CAPABILITY);
  const property = frontDeskProperty(properties, await searchParams);
  const day = property ? await closeTheDay(property.propertyId) : null;

  if (!property || !day) {
    return (
      <EmptyState
        description={t("noFrontDeskDescription")}
        title={t("noFrontDeskTitle")}
      />
    );
  }

  return (
    <>
      <p className="text-muted-foreground">
        {t("closeDay.at")} {property.propertyName}
      </p>
      <CloseDayView day={day} locale={locale} />
    </>
  );
}
