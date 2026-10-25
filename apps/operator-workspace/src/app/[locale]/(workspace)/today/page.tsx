import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { formatTime, isSupportedLocale, localizeHref } from "@ranza/i18n";
import type { Departure } from "@ranza/reservations";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  entitledProperties,
  requireViewer,
  TODAY_CAPABILITY,
  todaySummary,
} from "../../../../server/viewer";
import { TodayDashboard } from "../../../../features/today/components/today-dashboard";
import type { Greeting } from "../../../../features/today/components/today-header";
import {
  layoutCookieName,
  parseLayout,
} from "../../../../features/today/layouts/model";
import { todayKeys } from "../../../../features/today/query-keys";
import { frontOfficeKeys } from "../../../../features/front-office/query-keys";
import { frontDeskProperty } from "../../../../server/front-desk";
import { Hydrated, requestQueryClient } from "../../../providers/hydrate";

/** The greeting for an hour of the Property's own day. */
function greetingAt(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  // Evening runs through the night shift: "good night" is a farewell, and
  // this is said to somebody arriving.
  return "evening";
}

/**
 * Today: the Operator Workspace's home, and the day at the Property you are
 * working in (blueprint 18.4; docs/features/today-dashboard).
 *
 * Every figure is a way into the records that explain it. What the page
 * leads with follows the permissions the viewer holds, never the name of
 * their role, and what they may not see is not in the answer at all — the
 * summary is derived on the server (`src/server/today-derive.ts`).
 *
 * The first answer is read here and handed to the live dashboard, which then
 * refreshes it itself (ADR 0019).
 */
export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const viewer = await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(TODAY_CAPABILITY);

  const noProperty = (
    <EmptyState
      description={t("noPropertyDescription")}
      title={t("noPropertyTitle")}
    />
  );
  if (properties.length === 0) return noProperty;

  // With no ?property= this is the day of the Property remembered on this
  // device, or the first, written into the URL so the switcher and the rail
  // name it too (OA-S3-02). One this list does not carry — out of reach,
  // stale, forged — goes back to Today with none, rather than showing another
  // Property's day under a switcher that names no Property (HK-S1-24,
  // TD-S1-08). The same resolver as every other page (OA-S3-05).
  const property = await frontDeskProperty(
    properties,
    await searchParams,
    localizeHref(locale, "today"),
  );
  if (!property) redirect(localizeHref(locale, "today"));

  let dueDepartures: readonly Departure[] | undefined;
  const summary = await todaySummary(property.propertyId, (rows) => {
    dueDepartures = rows;
  });
  // Today withdrawn between the list above and this read: the same answer as
  // having no Property with it.
  if (!summary) return noProperty;

  const scope = {
    organizationId: property.organizationId,
    propertyId: property.propertyId,
    userId: viewer.userId,
  };
  const client = requestQueryClient();
  client.setQueryData(todayKeys.summary(scope), summary);
  // The bills a Check out button reviews are the departures just read, so the
  // buttons are in the first HTML rather than arriving after a second read.
  if (dueDepartures) {
    client.setQueryData(
      frontOfficeKeys.departures(scope, "due"),
      dueDepartures,
    );
  }

  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: property.timezone,
    }).format(now),
  );

  return (
    <Hydrated client={client}>
      <TodayDashboard
        clock={formatTime(now, locale, property.timezone)}
        greeting={greetingAt(hour)}
        initialLayout={parseLayout(
          (await cookies()).get(layoutCookieName(viewer.userId))?.value,
        )}
        locale={locale}
        name={viewer.name}
        nowMs={now.getTime()}
        properties={properties
          .filter((other) => other.organizationId === property.organizationId)
          .map((other) => ({
            propertyId: other.propertyId,
            propertyName: other.propertyName,
          }))}
        scope={scope}
      />
    </Hydrated>
  );
}
