"use client";

import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { WindowReport } from "../../../server/analytics";
import { PeriodBody } from "./period-body";
import { WindowHeader } from "./window-header";

/**
 * A trailing window — today, the last 7 days or the last 30 — explained as a
 * month is (ANALYTICS-09). It has no previous or next, and no prior to be set
 * beside it.
 */
export function WindowReportView({
  locale,
  propertyName,
  report,
}: {
  locale: SupportedLocale;
  propertyName: string;
  report: WindowReport;
}) {
  const t = useTranslations("analytics.window");

  return (
    <div className="flex flex-col gap-6">
      <WindowHeader
        locale={locale}
        propertyName={propertyName}
        report={report}
      />
      <PeriodBody
        emptyTitle={t("noActivityTitle", { window: t(report.range) })}
        locale={locale}
        prior={null}
        report={report}
      />
    </div>
  );
}
