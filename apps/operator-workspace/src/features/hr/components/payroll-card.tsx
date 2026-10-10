"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  TriangleAlert,
} from "lucide-react";
import type {
  PayrollPeriodSummary,
  PayslipRecord,
} from "../../../server/viewer";
import { approvePayrollAction } from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";
import { PayslipDrawer } from "./payslip-drawer";

interface PayrollCardProps {
  /**
   * Null for somebody who does not reach every Property: a payroll run has no
   * Property to narrow to, so there is nothing of it to show them.
   */
  payroll: PayrollPeriodSummary | null;
  canManage: boolean;
  locale: SupportedLocale;
  propertyId: string;
}

/** The period `delta` months from `period` (`YYYY-MM`). */
function shiftPeriod(period: string, delta: number): string {
  const [year = 0, month = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

export function PayrollCard({
  payroll,
  canManage,
  locale,
  propertyId,
}: PayrollCardProps) {
  const t = useTranslations("hr.payroll");
  const outcomeText = useOutcomeText();
  const [isPending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(
    null,
  );

  if (!payroll) {
    return (
      <EmptyState
        title={t("needsReach.title")}
        description={t("needsReach.description")}
      />
    );
  }

  const { currency } = payroll;
  const money = (amountMinor: number) =>
    currency ? formatMoney(amountMinor, currency, locale) : "";

  const handleApprovePayroll = () => {
    setFailure(null);
    startTransition(async () => {
      const outcome = await approvePayrollAction(
        locale,
        propertyId,
        payroll.period,
      );
      setFailure(outcomeText(outcome));
      setConfirming(false);
    });
  };

  const periodHref = (period: string) =>
    `/${locale}/hr?property=${propertyId}&period=${period}`;

  const canApprove =
    payroll.status === "draft" && canManage && payroll.blocker === null;

  return (
    <>
      <Card className="border-border">
        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <div className="flex items-center gap-1">
              <Button asChild size="icon" variant="ghost" className="size-7">
                <Link
                  aria-label={t("previousPeriod")}
                  href={periodHref(shiftPeriod(payroll.period, -1))}
                  prefetch={false}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </Link>
              </Button>
              <CardTitle className="text-step-1 font-semibold text-foreground">
                {payroll.period}
              </CardTitle>
              <Button asChild size="icon" variant="ghost" className="size-7">
                <Link
                  aria-label={t("nextPeriod")}
                  href={periodHref(shiftPeriod(payroll.period, 1))}
                  prefetch={false}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>
            {currency && (
              <p className="text-step--1 text-muted-foreground mt-0.5">
                {t("summaryGrossNet", {
                  amount: money(payroll.totalGrossMinor),
                  total: money(payroll.totalNetMinor),
                })}
              </p>
            )}
            {payroll.status === "approved" && payroll.approvedAt && (
              <p className="text-step--2 text-muted-foreground mt-0.5">
                {t("approvedOn", {
                  date: formatDate(new Date(payroll.approvedAt), locale, {}),
                })}
              </p>
            )}
          </div>

          <div>
            {payroll.status === "approved" ? (
              <Badge variant="default" className="gap-1.5 py-1 px-3">
                <CheckCircle2 className="size-3.5" />
                <span>{t("approved")}</span>
              </Badge>
            ) : canApprove ? (
              <Button
                onClick={() => setConfirming(true)}
                disabled={isPending}
                className="gap-2"
              >
                <Check className="size-4" />
                <span>{isPending ? t("approving") : t("approve")}</span>
              </Button>
            ) : (
              <Badge variant="secondary">{t("draft")}</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div
            role="note"
            className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-step--1"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">
                {t("placeholderTitle")}
              </p>
              <p className="text-muted-foreground">{t("placeholderBody")}</p>
            </div>
          </div>

          {failure && (
            <div
              role="alert"
              className="mx-4 mb-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium"
            >
              {failure}
            </div>
          )}

          {payroll.blocker ? (
            <div className="p-4">
              <EmptyState
                title={payroll.period}
                description={t(`blocked.${payroll.blocker}`)}
              />
            </div>
          ) : (
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
                      <span className="sr-only">{t("actions")}</span>
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
                          {money(p.grossPayMinor)}
                        </TableCell>

                        <TableCell className="text-end font-mono text-step--1 text-muted-foreground">
                          {money(p.socialSecurityDeductionMinor)}
                        </TableCell>

                        <TableCell className="text-end font-mono text-step--1 text-muted-foreground">
                          {money(p.taxDeductionMinor)}
                        </TableCell>

                        <TableCell className="text-end font-mono text-step--1 font-bold text-foreground">
                          {money(p.netPayMinor)}
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
          )}

          {canApprove && (
            <p className="border-t border-border p-4 text-step--1 text-muted-foreground">
              {t("organizationWide")}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirming}
        onOpenChange={(isOpen) => {
          if (!isPending) setConfirming(isOpen);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("confirmTitle", { period: payroll.period })}
            </DialogTitle>
            <DialogDescription>
              {t("confirmBody", {
                count: payroll.payslips.length,
                currency: currency ?? "",
                amount: money(payroll.totalGrossMinor),
                total: money(payroll.totalNetMinor),
              })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-step--1 text-muted-foreground">
            {t("confirmLocked")}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirming(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleApprovePayroll}
            >
              {isPending ? t("approving") : t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayslipDrawer
        payslip={selectedPayslip}
        period={payroll.period}
        currency={currency}
        locale={locale}
        onClose={() => setSelectedPayslip(null)}
      />
    </>
  );
}
