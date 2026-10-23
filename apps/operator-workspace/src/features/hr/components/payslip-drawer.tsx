"use client";

import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  DialogActions,
  DialogBody,
  DialogFacts,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  Sheet,
  SheetContent,
  sheetFrameClassName,
} from "@ranza/ui";
import { TriangleAlert } from "lucide-react";
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

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent
        aria-describedby={undefined}
        className={sheetFrameClassName}
        side="end"
      >
        <DialogMasthead
          art="/illustrations/dialogs/payslip.svg"
          eyebrow={`${t("payslipTitle")}, ${monthName}`}
          facts={`${payslip.position}, ${payslip.department}`}
          heading={payslip.employeeName}
        />
        <DialogBody>
          <DialogSection title={t("payslipDeductionsTitle")}>
            <DialogFacts
              rows={[
                [t("gross"), money(payslip.grossPayMinor)],
                [
                  t("socialSecurity"),
                  `−${money(payslip.socialSecurityDeductionMinor)}`,
                ],
                [t("incomeTax"), `−${money(payslip.taxDeductionMinor)}`],
                [t("stampDuty"), `−${money(payslip.stampDutyMinor)}`],
              ]}
              total={[t("net"), money(payslip.netPayMinor)]}
            />
          </DialogSection>
          <DialogSection title={t("paidTo")}>
            <p className="m-0 font-mono text-sm font-medium" dir="ltr">
              {payslip.ibanMasked ?? t("noBankAccount")}
            </p>
          </DialogSection>
          <DialogSection>
            <DialogNotice icon={TriangleAlert}>
              {t("placeholderBody")}
            </DialogNotice>
          </DialogSection>
        </DialogBody>
        <DialogActions>
          <ArrowButton onClick={() => window.print()} type="button">
            {t("print")}
          </ArrowButton>
        </DialogActions>
      </SheetContent>
    </Sheet>
  );
}
