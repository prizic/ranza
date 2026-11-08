"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type SupportedLocale } from "@ranza/i18n";
import { cn } from "@ranza/ui";
import type {
  RollCallCard as RollCall,
  Section,
} from "../../../server/today-derive";
import { Panel } from "../layouts/parts";
import { todayHref } from "../links";
import { SectionUnavailable } from "./section-unavailable";

/**
 * Tonight's roll call at a Property that keeps one: who is on leave, who was
 * marked missing, who nobody has called yet. Each figure opens the roll call
 * narrowed to the people it counts (`?show=`); the same figures head that list
 * and widen it again. The words are the roll call's own (`attendance`).
 */
export function RollCallCard({
  locale,
  onRetry,
  propertyId,
  rollCall,
}: {
  locale: SupportedLocale;
  onRetry: () => void;
  propertyId: string;
  rollCall: Section<RollCall>;
}) {
  const t = useTranslations("dashboard");
  const a = useTranslations("attendance");
  if (rollCall.status === "unavailable") {
    return <SectionUnavailable onRetry={onRetry} />;
  }
  const { inHouse, onLeave, missing, notCalled, curfewPassed } = rollCall.data;
  const figures = [
    {
      key: "onLeave",
      show: "on_leave",
      count: onLeave,
      label: a("figures.onLeave"),
      alert: false,
    },
    {
      key: "missing",
      show: "absent",
      count: missing,
      label: a("figures.missing"),
      alert: true,
    },
    {
      key: "notCalled",
      show: "not_called",
      count: notCalled,
      label: a("figures.notCalled"),
      alert: curfewPassed,
    },
  ];

  return (
    <Panel
      className={cn(rollCall.stale && "opacity-70")}
      labelledBy="roll-call-title"
    >
      <h2 className="text-xl font-semibold tracking-tight" id="roll-call-title">
        {t("rollCallTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("rollCallHint", { count: inHouse })}
      </p>
      {curfewPassed ? (
        <p className="mt-1 text-sm font-medium text-danger">
          {a("curfewPassed")}
        </p>
      ) : null}
      <ul className="mt-5 grid grid-cols-3 gap-2">
        {figures.map((figure) => (
          <li key={figure.key}>
            <Link
              aria-label={t("rollCallLink", {
                label: figure.label,
                count: figure.count,
              })}
              className="flex h-full flex-col gap-1 rounded-2xl border border-border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={todayHref(locale, "roll-call", propertyId, {
                show: figure.show,
              })}
              prefetch={false}
            >
              <span
                className={cn(
                  "text-3xl font-light tracking-tight tabular-nums",
                  figure.count === 0 && "text-muted-foreground/60",
                  figure.count > 0 && figure.alert && "text-danger",
                )}
              >
                {formatNumber(figure.count, locale)}
              </span>
              <span className="text-xs text-muted-foreground">
                {figure.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
