"use client";

import type { SupportedLocale } from "@ranza/i18n";
import type { TodaySummary } from "../../../server/today-derive";
import { OverdueCard } from "./overdue-card";
import { RollCallCard } from "./roll-call-card";

/**
 * The two cards about the Residents themselves, wherever their data exists:
 * who is behind on an instalment, and who is out or unaccounted for tonight.
 * A Property with neither a plan nor a roll call has neither card, and no
 * layout asks which kind of Property it is.
 */
export function StandingCards({
  locale,
  onRetry,
  propertyId,
  summary,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  summary: Pick<TodaySummary, "overdue" | "rollCall">;
}) {
  return (
    <>
      {summary.rollCall ? (
        <RollCallCard
          locale={locale}
          onRetry={onRetry}
          propertyId={propertyId}
          rollCall={summary.rollCall}
        />
      ) : null}
      {summary.overdue ? (
        <OverdueCard
          locale={locale}
          onRetry={onRetry}
          overdue={summary.overdue}
          propertyId={propertyId}
        />
      ) : null}
    </>
  );
}
