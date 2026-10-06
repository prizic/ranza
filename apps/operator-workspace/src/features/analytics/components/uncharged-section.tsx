"use client";

import { useTranslations } from "next-intl";
import type { UnchargedNights } from "../../../server/analytics";
import { MonthSection } from "./month-section";

export const REASON = {
  resident: { labelKey: "unchargedReason.resident" },
  unpriced: { labelKey: "unchargedReason.unpriced" },
  billing_unavailable: { labelKey: "unchargedReason.billing_unavailable" },
  no_folio: { labelKey: "unchargedReason.no_folio" },
  folio_closed: { labelKey: "unchargedReason.folio_closed" },
  currency: { labelKey: "unchargedReason.currency" },
  not_yet_charged: { labelKey: "unchargedReason.not_yet_charged" },
} as const satisfies Record<UnchargedNights["reason"], { labelKey: string }>;

/**
 * The occupied nights that earned no room night charge, and why — the close's
 * own reasons, in the close's own words. Operational: every reader sees it, and
 * it is counts and never amounts (AN-S3-01).
 */
export function UnchargedSection({
  rows,
}: {
  rows: readonly UnchargedNights[];
}) {
  const t = useTranslations("analytics.month");

  return (
    <MonthSection title={t("uncharged")}>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        {rows.length === 0 ? t("unchargedNone") : t("unchargedNote")}
      </p>
      {rows.length === 0 ? null : (
        <dl>
          {rows.map(({ nights, reason }) => (
            <div
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-border py-3 last:border-b-0"
              data-reason={reason}
              data-row
              key={reason}
            >
              <dt className="text-sm">{t(REASON[reason].labelKey)}</dt>
              <dd className="text-end tabular-nums">
                {t("unchargedNights", { n: nights })}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </MonthSection>
  );
}
