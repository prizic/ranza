"use client";

import { useTranslations } from "next-intl";
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
import { Download } from "lucide-react";
import type { PayslipRecord } from "../../../server/viewer";

interface PayslipDrawerProps {
  payslip: PayslipRecord | null;
  period: string;
  locale: string;
  onClose: () => void;
}

export function PayslipDrawer({
  payslip,
  period,
  locale,
  onClose,
}: PayslipDrawerProps) {
  const t = useTranslations("hr.payroll");

  if (!payslip) return null;

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const maskIban = (iban: string | null) => {
    if (!iban) return "—";
    const cleaned = iban.replace(/\s+/g, "");
    if (cleaned.length < 8) return iban;
    const prefix = cleaned.slice(0, 2);
    const suffix = cleaned.slice(-4);
    return `${prefix}•• •••• •••• ${suffix}`;
  };

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
              {t("payslipTitle")}, {period}
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
                  {formatMoney(payslip.grossPay)}
                </dd>
              </div>

              <div className="flex justify-between items-center text-destructive">
                <dt>{t("socialSecurity")}</dt>
                <dd className="font-mono font-medium">
                  −{formatMoney(payslip.socialSecurityDeduction)}
                </dd>
              </div>

              <div className="flex justify-between items-center text-destructive">
                <dt>{t("incomeTax")}</dt>
                <dd className="font-mono font-medium">
                  −{formatMoney(payslip.taxDeduction)}
                </dd>
              </div>

              <div className="flex justify-between items-center text-destructive">
                <dt>{t("stampDuty")}</dt>
                <dd className="font-mono font-medium">
                  −{formatMoney(payslip.stampDuty)}
                </dd>
              </div>

              <Separator className="bg-border" />

              <div className="flex justify-between items-center text-step-0 font-bold">
                <dt className="text-foreground">{t("net")}</dt>
                <dd className="font-mono text-primary text-step-1">
                  {formatMoney(payslip.netPay)}
                </dd>
              </div>

              <Separator className="bg-border" />

              <div className="flex justify-between items-center text-step--1">
                <dt className="text-muted-foreground">{t("paidTo")}</dt>
                <dd className="font-mono font-medium text-foreground">
                  {maskIban(payslip.iban)}
                </dd>
              </div>
            </dl>
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
            <Download className="size-4" />
            <span>{t("downloadPdf")}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
