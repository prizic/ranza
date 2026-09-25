import { notFound, redirect } from "next/navigation";
import {
  formatDate,
  formatTime,
  formatWeekday,
  isSupportedLocale,
  localizeHref,
} from "@ranza/i18n";
import { EmptyState } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  entitledProperties,
  requireViewer,
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
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const properties = await entitledProperties(TODAY_CAPABILITY);
  const [fallback] = properties;

  if (!fallback) {
    return (
      <EmptyState
        description={t("noPropertyDescription")}
        title={t("noPropertyTitle")}
      />
    );
  }

  // With no ?property= this is the first Property's day, the one the switcher
  // names. One this list does not carry — out of reach, stale, forged — goes
  // back to Today with none, rather than showing the first Property's day
  // under a switcher that names no Property (HK-S1-24). Out of reach and
  // unknown are answered alike, so neither is told apart from the other.
  const { property: requested } = await searchParams;
  const property = requested
    ? properties.find((candidate) => candidate.propertyId === requested)
    : fallback;
  if (!property) redirect(localizeHref(locale, "today"));

  const now = new Date();

  const facts = [
    { label: t("property"), value: property.propertyName },
    { label: t("organization"), value: property.organizationName },
  ];

  // Laid out as the Leaders dashboard opens: a small tracked line over the day
  // set light, the Property's own clock opposite it as a large numeral, and the
  // stored facts under them as cards.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            {formatDate(now, locale, {
              month: "long",
              timeZone: property.timezone,
            })}
          </p>
          <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
            {formatWeekday(now, locale, property.timezone)}
          </h2>
        </div>
        <p className="flex flex-col md:items-end">
          <span className="text-4xl leading-none font-light tracking-tight tabular-nums md:text-5xl">
            <LocalClock
              initial={formatTime(now, locale, property.timezone)}
              locale={locale}
              timeZone={property.timezone}
            />
          </span>
          <span className="mt-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {property.timezone}
          </span>
        </p>
      </div>

      <dl className="m-0 grid gap-4 sm:grid-cols-2">
        {facts.map((fact) => (
          <div
            className="rounded-[2rem] border border-slate-100 bg-card p-5"
            key={fact.label}
          >
            <dt className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {fact.label}
            </dt>
            <dd className="m-0 mt-3 text-xl font-light tracking-tight md:text-2xl">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
