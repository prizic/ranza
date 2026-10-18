"use client";

import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ranza/ui";
import { Printer, TriangleAlert } from "lucide-react";
import type { PayslipRecord } from "../../../server/viewer";

interface PayslipDrawerProps {
  payslip: PayslipRecord | null;
  period: string;
  /** The run's currency; a payslip carries none of its own. */
  currency: string | null;
  locale: SupportedLocale;
  onClose: () => void;
}

export function PayslipDrawer({
  payslip,
  period,
  currency,
  locale,
  onClose,
}: PayslipDrawerProps) {
  const t = useTranslations("hr.payroll");

  if (!payslip || !currency) return null;

  const money = (amountMinor: number) =>
    formatMoney(amountMinor, currency, locale);

  const monthName = formatDate(new Date(`${period}-01T00:00:00Z`), locale, {
    day: undefined,
    month: "long",
    timeZone: "UTC",
  });

  const initials = payslip.employeeName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sheet open={!!payslip} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md flex flex-col justify-between">
        <div>
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-step-1">
              {t("payslipTitle")}, {monthName}
            </SheetTitle>
            <SheetDescription>{payslip.employeeName}</SheetDescription>
          </SheetHeader>

          <div className="py-5 space-y-6">
            <div className="flex items-center gap-3">
              <Avatar className="size-12 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-step-0">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold text-step-0 text-foreground">
                  {payslip.employeeName}
                </div>
                <div className="text-step--1 text-muted-foreground">
                  {payslip.position}, {payslip.department}
                </div>
              </div>
            </div>

            <Separator className="bg-border" />

            <dl className="space-y-3 text-step--1">
              <div className="flex justify-between items-center">
                <dt className="text-muted-foreground">{t("gross")}</dt>
                <dd className="font-mono font-medium text-foreground">
                  {money(payslip.grossPayMinor)}
                </dd>
              </div>

              <div className="flex justify-between items-center text-destructive">
                <dt>{t("socialSecurity")}</dt>
                <dd className="font-mono font-medium">
                  −{money(payslip.socialSecurityDeductionMinor)}
                </dd>
              </div>

              <div className="flex justify-between items-center text-destructive">
                <dt>{t("incomeTax")}</dt>
                <dd className="font-mono font-medium">
                  −{money(payslip.taxDeductionMinor)}
                </dd>
              </div>

              <div className="flex justify-between items-center text-destructive">
                <dt>{t("stampDuty")}</dt>
                <dd className="font-mono font-medium">
                  −{money(payslip.stampDutyMinor)}
                </dd>
              </div>

              <Separator className="bg-border" />

              <div className="flex justify-between items-center text-step-0 font-bold">
                <dt className="text-foreground">{t("net")}</dt>
                <dd className="font-mono text-primary text-step-1">
                  {money(payslip.netPayMinor)}
                </dd>
              </div>

              <Separator className="bg-border" />

              <div className="flex justify-between items-center text-step--1">
                <dt className="text-muted-foreground">{t("paidTo")}</dt>
                <dd className="font-mono font-medium text-foreground" dir="ltr">
                  {payslip.ibanMasked ?? t("noBankAccount")}
                </dd>
              </div>
            </dl>

            <div
              role="note"
              className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-step--1"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">{t("placeholderBody")}</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              window.print();
            }}
          >
            <Printer className="size-4" />
            <span>{t("print")}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
