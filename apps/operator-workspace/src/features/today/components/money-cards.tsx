"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, cn } from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import type { MoneyCard, Section } from "../../../server/today-derive";
import { unitLabel } from "../../front-office/unit-label";
import { todayHref } from "../links";
import { money, shortDay } from "../format";
import { AllLink } from "./movements-card";
import { SectionUnavailable } from "./section-unavailable";

const CARD = "rounded-[2rem] border border-slate-100 bg-card p-5 md:p-6";
const ROW =
  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Finance's two lists: who leaves with a balance, and the largest open ones.
 * The word is balance throughout, never unpaid: Ranza records charges and
 * reversals, not payments (TD-S1-15).
 */
export function MoneyLists({
  currency,
  locale,
  onRetry,
  propertyId,
  section,
}: {
  currency: string;
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  section: Section<MoneyCard>;
}) {
  const t = useTranslations("dashboard");
  if (section.status === "unavailable") {
    return <SectionUnavailable onRetry={onRetry} />;
  }
  const data = section.data;
  const leaving = data.leaving;
  const card = cn(CARD, section.stale && "opacity-70");
  const folio = (folioId: string) =>
    todayHref(locale, "finance", propertyId, { folio: folioId });

  return (
    <>
      {leaving ? (
        <section aria-labelledby="today-owing" className={card}>
          <h2 className="mb-4 text-base font-semibold" id="today-owing">
            {t("owing")}
          </h2>
          {leaving.rows.length === 0 ? (
            <div className="rounded-2xl bg-success-soft px-5 py-4 text-success">
              <p className="flex items-center gap-2.5 font-medium">
                <CheckCircle2 aria-hidden="true" className="size-4" />
                {t("noOwingTitle")}
              </p>
              <p className="mt-1 text-sm">{t("noOwingDescription")}</p>
            </div>
          ) : (
            <ul className="grid gap-2">
              {leaving.rows.map((row) => (
                <li key={row.stayId}>
                  <Link
                    className={ROW}
                    href={
                      row.folioId
                        ? folio(row.folioId)
                        : todayHref(locale, "departures", propertyId)
                    }
                    prefetch={false}
                  >
                    <span className="min-w-40 flex-1">
                      <span className="block font-semibold">
                        {row.guestName}
                      </span>
                      {row.reference ? (
                        <span className="block font-mono text-xs text-muted-foreground">
                          {row.reference}
                        </span>
                      ) : null}
                    </span>
                    <span className="w-20 tabular-nums">
                      {unitLabel(row.unit.roomName, row.unit.unitName)}
                    </span>
                    <span className="w-32">
                      {row.overdue && row.endsOn ? (
                        <StatusBadge
                          icon={Clock}
                          label={shortDay(row.endsOn, locale)}
                          tone="danger"
                        />
                      ) : (
                        <StatusBadge
                          icon={CalendarDays}
                          label={t("leavesToday")}
                          tone="warning"
                        />
                      )}
                    </span>
                    <span className="w-28 font-semibold tabular-nums">
                      {row.balance
                        ? money([row.balance], currency, locale)
                        : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <section aria-labelledby="today-largest" className={card}>
        <h2 className="mb-4 text-base font-semibold" id="today-largest">
          {t("largestBalances")}
        </h2>
        <ul className="grid gap-1">
          {data.largest.map((row) => (
            <li key={row.folioId}>
              <Link
                className="flex items-center gap-3 rounded-2xl px-2 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                href={folio(row.folioId)}
                prefetch={false}
              >
                <span className="flex-1">
                  <span className="block font-medium">{row.guestName}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {row.unitName}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {money([row.balance], currency, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <AllLink href={todayHref(locale, "finance", propertyId)}>
          {t("allFolios")}
        </AllLink>
      </section>
    </>
  );
}
