import { useTranslations } from "next-intl";
import {
  AlarmClock,
  Ban,
  CalendarClock,
  CircleCheck,
  CircleDashed,
} from "lucide-react";
import { StatusBadge, type StatusTone } from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import type { InstalmentState, PaymentPlan } from "@ranza/payment-plans";

const STATE_TONE: Record<InstalmentState, StatusTone> = {
  waived: "neutral",
  paid: "success",
  overdue: "danger",
  due: "warning",
  upcoming: "info",
};

const STATE_ICON = {
  waived: Ban,
  paid: CircleCheck,
  overdue: AlarmClock,
  due: CalendarClock,
  upcoming: CircleDashed,
} as const;

function formatDay(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A figure that is the point of the section: large, light, and named below. */
function Figure({
  danger = false,
  label,
  value,
}: {
  danger?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <span
        className={`text-3xl leading-none font-light tracking-tight tabular-nums ${danger ? "text-danger" : "text-foreground"}`}
      >
        <bdi>{value}</bdi>
      </span>
      <span className="font-mono text-[0.68rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

/**
 * A booking's instalments and where each stands (PP-S3-01).
 *
 * What is paid and what is still to pay are the large figures, because those
 * are what the desk is asked. Each row is the instalment's number, the day it
 * falls due, its amount and its state, said in words and an icon as well as a
 * colour; whether it has been charged to the Folio is said beneath its date,
 * because a plan that is not yet charged is a promise and one that is, is a
 * bill. Where each stands is the database's one definition of it, never worked
 * out here.
 */
export function PaymentPlanSchedule({
  locale,
  plan,
}: {
  locale: SupportedLocale;
  plan: PaymentPlan;
}) {
  const t = useTranslations("paymentPlan");
  const money = (minor: number) => formatMoney(minor, plan.currency, locale);
  const overdue = plan.instalments.some((i) => i.state === "overdue");

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-6">
        <Figure label={t("paid")} value={money(plan.paidMinor)} />
        <Figure
          danger={overdue}
          label={t("outstanding")}
          value={money(plan.outstandingMinor)}
        />
      </div>
      <ol className="m-0 grid list-none divide-y p-0">
        {plan.instalments.map((instalment) => (
          <li
            className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2.5"
            key={instalment.instalmentId}
          >
            <span className="text-step--1 tabular-nums text-muted-foreground">
              {instalment.number}
            </span>
            <span className="grid min-w-0 text-sm">
              <span className="font-medium">
                {formatDay(instalment.dueOn, locale)}
              </span>
              {instalment.posted ? (
                <span className="text-step--1 text-muted-foreground">
                  {t("onFolio")}
                </span>
              ) : null}
            </span>
            <span className="text-sm font-medium tabular-nums">
              <bdi>{money(instalment.amountMinor)}</bdi>
            </span>
            <StatusBadge
              icon={STATE_ICON[instalment.state]}
              label={t(`state.${instalment.state}`)}
              tone={STATE_TONE[instalment.state]}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
