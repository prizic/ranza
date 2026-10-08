"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { Check, CheckCircle2, FileText, Info } from "lucide-react";
import type {
  PayrollPeriodSummary,
  PayslipRecord,
} from "../../../server/viewer";
import { approvePayrollAction } from "../../../server/hr";
import { PayslipDrawer } from "./payslip-drawer";

interface PayrollCardProps {
  payroll: PayrollPeriodSummary;
  canManage: boolean;
  locale: string;
  propertyId: string;
}

export function PayrollCard({
  payroll,
  canManage,
  locale,
  propertyId,
}: PayrollCardProps) {
  const t = useTranslations("hr.payroll");
  const [isPending, startTransition] = useTransition();
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(
    null,
  );

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleApprovePayroll = () => {
    startTransition(async () => {
      await approvePayrollAction(locale, propertyId, payroll.period);
    });
  };

  return (
    <>
      <Card className="border-border">
        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-step-1 font-semibold text-foreground">
              {payroll.period}
            </CardTitle>
            <p className="text-step--1 text-muted-foreground mt-0.5">
              {t("summaryGrossNet", {
                amount: formatMoney(payroll.totalGross),
                total: formatMoney(payroll.totalNet),
              })}
            </p>
          </div>

          <div>
            {payroll.status === "approved" ? (
              <Badge variant="default" className="gap-1.5 py-1 px-3">
                <CheckCircle2 className="size-3.5" />
                <span>{t("approved")}</span>
              </Badge>
            ) : canManage ? (
              <Button
                onClick={handleApprovePayroll}
                disabled={isPending}
                className="gap-2"
              >
                <Check className="size-4" />
                <span>{isPending ? t("approving") : t("approve")}</span>
              </Button>
            ) : (
              <Badge variant="secondary">{payroll.status}</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-56">{t("payslip")}</TableHead>
                  <TableHead className="text-end">{t("gross")}</TableHead>
                  <TableHead className="text-end">
                    {t("socialSecurity")}
                  </TableHead>
                  <TableHead className="text-end">{t("incomeTax")}</TableHead>
                  <TableHead className="text-end font-semibold">
                    {t("net")}
                  </TableHead>
                  <TableHead className="text-end w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll.payslips.map((p) => {
                  const initials = p.employeeName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <TableRow
                      key={p.id}
                      className="border-border hover:bg-muted/30"
                    >
                      <TableCell className="p-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8 border border-border">
                            <AvatarFallback className="bg-primary/10 text-primary text-step--2 font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-step--1 text-foreground">
                              {p.employeeName}
                            </div>
                            <div className="text-step--2 text-muted-foreground">
                              {p.position}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-end font-mono text-step--1">
                        {formatMoney(p.grossPay)}
                      </TableCell>

                      <TableCell className="text-end font-mono text-step--1 text-muted-foreground">
                        {formatMoney(p.socialSecurityDeduction)}
                      </TableCell>

                      <TableCell className="text-end font-mono text-step--1 text-muted-foreground">
                        {formatMoney(p.taxDeduction)}
                      </TableCell>

                      <TableCell className="text-end font-mono text-step--1 font-bold text-foreground">
                        {formatMoney(p.netPay)}
                      </TableCell>

                      <TableCell className="text-end p-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedPayslip(p)}
                          className="h-8 gap-1.5 px-2 text-step--1 text-muted-foreground hover:text-foreground"
                        >
                          <FileText className="size-3.5" />
                          <span>{t("payslip")}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t border-border flex items-center gap-2 text-step--1 text-muted-foreground bg-muted/20">
            <Info className="size-4 shrink-0 text-muted-foreground" />
            <span>{t("disclaimer")}</span>
          </div>
        </CardContent>
      </Card>

      <PayslipDrawer
        payslip={selectedPayslip}
        period={payroll.period}
        locale={locale}
        onClose={() => setSelectedPayslip(null)}
      />
    </>
  );
}
