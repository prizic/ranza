"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  OpenWorkCard as OpenWork,
  Section,
} from "../../../server/today-derive";
import { Panel } from "../layouts/parts";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * What a dormitory still has open: requests students and guests have made, and
 * maintenance somebody reported or scheduled (RANZ-108). A figure is absent for a viewer who may
 * not see that list, and each present one opens its own, at the Property. The
 * rooms out of order open the maintenance board narrowed to the requests that
 * hold them, as the hotel's maintenance card does (TD-S4-07).
 */
export function OpenWorkCard({
  locale,
  onRetry,
  propertyId,
  work,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  work: Section<OpenWork>;
}) {
  const t = useTranslations("dashboard");
  if (work.status === "unavailable") {
    return <SectionUnavailable onRetry={onRetry} />;
  }
  const { requests, maintenance } = work.data;
  const figures = [
    requests
      ? {
          key: "requests",
          count: requests.open,
          urgent: requests.urgent,
          label: t("openWorkRequests"),
          aria: t("openWorkRequestsLink", { count: requests.open }),
          href: todayHref(locale, "guest-experience", propertyId),
        }
      : null,
    maintenance
      ? {
          key: "maintenance",
          count: maintenance.open,
          urgent: maintenance.urgent,
          label: t("openWorkMaintenance"),
          aria: t("openWorkMaintenanceLink", { count: maintenance.open }),
          href: todayHref(locale, "maintenance", propertyId),
        }
      : null,
    maintenance
      ? {
          key: "outOfOrder",
          count: maintenance.outOfOrder,
          urgent: 0,
          label: t("roomsOutOfOrder"),
          aria: t("openWorkOutOfOrderLink", { count: maintenance.outOfOrder }),
          href: todayHref(locale, "maintenance", propertyId, {
            outOfOrder: "1",
          }),
        }
      : null,
  ].filter((figure) => figure !== null);

  return (
    <Panel
      className={cn(work.stale && "opacity-70")}
      labelledBy="open-work-title"
    >
      <h2 className="text-xl font-semibold tracking-tight" id="open-work-title">
        {t("openWorkTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("openWorkHint")}</p>
      <ul className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
        {figures.map((figure) => (
          <li key={figure.key}>
            <Link
              aria-label={figure.aria}
              className="flex h-full flex-col gap-1 rounded-2xl border border-border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={figure.href}
              prefetch={false}
            >
              <span
                className={cn(
                  "text-3xl font-light tracking-tight tabular-nums",
                  figure.count === 0 && "text-muted-foreground/60",
                )}
              >
                {formatNumber(figure.count, locale)}
              </span>
              <span className="text-xs text-muted-foreground">
                {figure.label}
              </span>
              {figure.urgent > 0 ? (
                <span className="text-xs font-semibold text-danger">
                  {t("openWorkUrgent", { count: figure.urgent })}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
