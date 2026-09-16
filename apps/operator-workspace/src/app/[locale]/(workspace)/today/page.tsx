import { notFound } from "next/navigation";
import {
  formatDate,
  formatTime,
  formatWeekday,
  isSupportedLocale,
} from "@ranza/i18n";
import { EmptyState, Fact, FactList, PageHeader } from "@ranza/ui";
import { messages } from "../../../../messages";
import {
  entitledProperties,
  TODAY_CAPABILITY,
} from "../../../../server/viewer";
import { LocalClock } from "./local-clock";

/**
 * Today: the day at the Property you are working in.
 *
 * The list of Properties is the rack in the shell above, so this page shows one
 * Property rather than printing the same rows again. Everything here is either
 * stored (name, Organization, timezone) or derived from the timezone (the day
 * and the clock). Nothing is invented — a Property in İzmir and one in Dubai
 * are genuinely on different days, and that is what the heading answers.
 *
 * The list is not filtered again here. A second application-side check would be
 * the weaker of the two and would invite trusting it instead of the database.
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

  const copy = messages[locale];
  const properties = await entitledProperties(TODAY_CAPABILITY);
  const [fallback] = properties;

  if (!fallback) {
    return (
      <EmptyState
        description={copy.noPropertyDescription}
        title={copy.noPropertyTitle}
      />
    );
  }

  // A Property the viewer may not reach is simply absent from this list, so an
  // unknown or forged ?property= falls back to the first one they can reach.
  const { property: requested } = await searchParams;
  const property =
    properties.find((candidate) => candidate.propertyId === requested) ??
    fallback;

  const now = new Date();

  return (
    <>
      <PageHeader
        aside={
          <p className="flex flex-col items-end text-end">
            <span className="text-step-2 leading-none tabular-nums">
              <LocalClock
                initial={formatTime(now, locale, property.timezone)}
                locale={locale}
                timeZone={property.timezone}
              />
            </span>
            <span className="text-step--1 text-muted-foreground">
              {property.timezone}
            </span>
          </p>
        }
      >
        <h2 className="text-[clamp(2.75rem,9vw,5.5rem)] leading-[0.95] font-light tracking-[-0.03em] rtl:leading-[1.15] rtl:tracking-normal">
          {formatWeekday(now, locale, property.timezone)}
        </h2>
        <p className="mt-3 text-step-1 text-muted-foreground">
          {formatDate(now, locale, {
            month: "long",
            timeZone: property.timezone,
          })}
        </p>
      </PageHeader>

      <FactList>
        <Fact label={copy.property}>{property.propertyName}</Fact>
        <Fact label={copy.organization}>{property.organizationName}</Fact>
      </FactList>
    </>
  );
}
