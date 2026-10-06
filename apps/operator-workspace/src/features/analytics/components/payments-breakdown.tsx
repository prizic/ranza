"use client";

import { Banknote, Building2, CreditCard, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { PaymentMethodBreakdown } from "../../../server/analytics";
import { formatMinorMoney, formatPercentValue } from "../format";

interface PaymentsBreakdownProps {
  breakdown: PaymentMethodBreakdown;
  currency: string;
  locale: SupportedLocale;
}

export function PaymentsBreakdown({
  breakdown,
  currency,
  locale,
}: PaymentsBreakdownProps) {
  const t = useTranslations("analytics");
  const total = breakdown.totalMinor;

  const methods = [
    {
      key: "card",
      label: t("card"),
      amount: breakdown.cardMinor,
      icon: CreditCard,
      color: "bg-blue-500",
    },
    {
      key: "cash",
      label: t("cash"),
      amount: breakdown.cashMinor,
      icon: Banknote,
      color: "bg-emerald-500",
    },
    {
      key: "bankTransfer",
      label: t("bankTransfer"),
      amount: breakdown.bankTransferMinor,
      icon: Building2,
      color: "bg-purple-500",
    },
    {
      key: "other",
      label: t("other"),
      amount: breakdown.otherMinor,
      icon: HelpCircle,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("paymentsBreakdownTitle")}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatMinorMoney(total, currency, locale)} {t("netPayments")}
        </p>
      </div>

      <div className="mt-5 space-y-3.5">
        {methods.map(({ key, label, amount, icon: Icon, color }) => {
          const share = total > 0 ? (amount / total) * 100 : 0;
          return (
            <div key={key} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs sm:text-sm">
                <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                  <Icon aria-hidden="true" className="size-4 text-slate-400" />
                  {label}
                </span>
                <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {formatMinorMoney(amount, currency, locale)}
                  <span className="ms-2 font-sans text-xs text-slate-400">
                    ({formatPercentValue(share, locale)})
                  </span>
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <div
                  className={`h-full rounded-full ${color} transition-all duration-300`}
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
