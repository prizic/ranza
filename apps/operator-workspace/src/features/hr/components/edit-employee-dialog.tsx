"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import { toTypedAmount } from "../../../lib/amount";
import type { ContractType, EmployeeRecord } from "../../../server/viewer";
import { changeWageAction, updateEmployeeAction } from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";

const CONTRACT_TYPES: readonly ContractType[] = [
  "full_time",
  "part_time",
  "seasonal",
  "fixed_term",
];

/**
 * Changing an employee: who they are, and — separately — what they are paid.
 *
 * Two sections with a button each, because they are two acts. Details change
 * the record now. Pay changes from a month on and leaves the months before it
 * as they were paid, so it asks for the month and says so; a run already
 * approved is not touched, and a month an approved run covers is refused with
 * the reason (HR-03).
 */
export function EditEmployeeDialog({
  employee,
  locale,
  propertyId,
  today,
}: {
  employee: EmployeeRecord;
  locale: SupportedLocale;
  propertyId: string;
  /** The Property's own calendar date, `YYYY-MM-DD`. */
  today: string;
}) {
  const t = useTranslations("hr.employees");
  const outcomeText = useOutcomeText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [wageError, setWageError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"details" | "wage" | null>(null);

  const hiredOn = new Date(employee.hiredOn).toISOString().slice(0, 10);
  const [firstName, setFirstName] = useState(employee.firstName);
  const [lastName, setLastName] = useState(employee.lastName);
  const [department, setDepartment] = useState(employee.department);
  const [position, setPosition] = useState(employee.position);
  const [contractType, setContractType] = useState<ContractType>(
    employee.contractType,
  );
  const [startDate, setStartDate] = useState(hiredOn);
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [iban, setIban] = useState("");

  const [grossPay, setGrossPay] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today.slice(0, 7));

  const money = (minor: number) =>
    formatMoney(minor, employee.currency, locale);

  function saveDetails(event: React.FormEvent): void {
    event.preventDefault();
    setDetailsError(null);
    setSaved(null);
    startTransition(async () => {
      const outcome = await updateEmployeeAction(
        locale,
        propertyId,
        employee.id,
        {
          firstName,
          lastName,
          department,
          position,
          contractType,
          hiredOn: startDate,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          iban: iban.trim() || undefined,
        },
      );
      if (outcome.status === "done") {
        setIban("");
        setSaved("details");
      } else {
        setDetailsError(outcomeText(outcome));
      }
    });
  }

  function saveWage(event: React.FormEvent): void {
    event.preventDefault();
    setWageError(null);
    setSaved(null);
    startTransition(async () => {
      const outcome = await changeWageAction(locale, propertyId, employee.id, {
        effectiveFrom,
        grossPay,
      });
      if (outcome.status === "done") {
        setGrossPay("");
        setSaved("wage");
      } else {
        setWageError(outcomeText(outcome));
      }
    });
  }

  const id = (name: string) => `${name}-${employee.id}`;

  return (
    <Dialog
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setSaved(null);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button
          aria-label={`${t("edit")}: ${employee.fullName}`}
          className="h-8 px-2 text-step--1"
          size="sm"
          variant="ghost"
        >
          {t("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("editTitle", { name: employee.fullName })}
          </DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={saveDetails}>
          {detailsError ? (
            <div
              className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
              role="alert"
            >
              {detailsError}
            </div>
          ) : null}
          {saved === "details" ? (
            <p className="text-sm font-medium text-success" role="status">
              {t("detailsSaved")}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={id("first")}>{t("firstName")} *</Label>
              <Input
                id={id("first")}
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("last")}>{t("lastName")} *</Label>
              <Input
                id={id("last")}
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("department")}>{t("department")} *</Label>
              <Input
                id={id("department")}
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("position")}>{t("position")} *</Label>
              <Input
                id={id("position")}
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("contract")}>{t("contract")}</Label>
              <Select
                value={contractType}
                onValueChange={(next) => setContractType(next as ContractType)}
              >
                <SelectTrigger id={id("contract")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`contracts.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("start")}>{t("startDate")} *</Label>
              <Input
                id={id("start")}
                max={today}
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("email")}>{t("email")}</Label>
              <Input
                id={id("email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("phone")}>{t("phone")}</Label>
              <Input
                id={id("phone")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={id("iban")}>{t("iban")}</Label>
              <Input
                dir="ltr"
                id={id("iban")}
                placeholder={
                  employee.ibanMasked ?? "TR00 0000 0000 0000 0000 0000 00"
                }
                value={iban}
                onChange={(e) => setIban(e.target.value)}
              />
              <p className="text-step--2 text-muted-foreground">
                {t("ibanKeepHint")}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={pending} type="submit">
              {pending ? t("submitting") : t("saveDetails")}
            </Button>
          </div>
        </form>

        <form
          className="space-y-3 border-t border-border pt-4"
          onSubmit={saveWage}
        >
          <h3 className="text-step-0 font-semibold">{t("payHeading")}</h3>
          <p className="text-step--1 text-muted-foreground">
            {t("payNow", { amount: money(employee.grossPayMinor) })}
          </p>
          {employee.wageChanges.length > 0 ? (
            <ul className="text-step--1 text-muted-foreground">
              {employee.wageChanges.map((change, index) => (
                <li key={`${change.effectiveFrom}-${index}`}>
                  {t("payFrom", {
                    month: formatDate(
                      new Date(`${change.effectiveFrom}-01T00:00:00Z`),
                      locale,
                      { day: undefined, timeZone: "UTC" },
                    ),
                    amount: money(change.grossPayMinor),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {wageError ? (
            <div
              className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
              role="alert"
            >
              {wageError}
            </div>
          ) : null}
          {saved === "wage" ? (
            <p className="text-sm font-medium text-success" role="status">
              {t("wageSaved")}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={id("new-pay")}>
                {t("newGrossPay", { currency: employee.currency })} *
              </Label>
              <Input
                id={id("new-pay")}
                inputMode="decimal"
                placeholder={toTypedAmount(
                  employee.grossPayMinor,
                  employee.currency,
                )}
                required
                value={grossPay}
                onChange={(e) => setGrossPay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("from")}>{t("effectiveFrom")} *</Label>
              <Input
                id={id("from")}
                required
                type="month"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <p className="text-step--2 text-muted-foreground">{t("payHint")}</p>
          <div className="flex justify-end">
            <Button disabled={pending} type="submit" variant="outline">
              {pending ? t("submitting") : t("changePay")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
