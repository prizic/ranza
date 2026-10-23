"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFacts,
  DialogMasthead,
  DialogSection,
  DialogTrigger,
  Field,
  FormError,
  Input,
  dialogFrameClassName,
  fieldClassName,
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
  const all = useTranslations();
  const outcomeText = useOutcomeText();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [wageError, setWageError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"details" | "wage" | null>(null);
  const [view, setView] = useState<"details" | "pay">("details");

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
        if (!next) {
          setSaved(null);
          setView("details");
        }
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
      <DialogContent className={dialogFrameClassName("medium")}>
        <DialogMasthead
          art="/illustrations/dialogs/payslip.svg"
          eyebrow={view === "details" ? t("edit") : t("changePay")}
          facts={`${employee.department} · ${employee.position}`}
          heading={employee.fullName}
        />
        <DialogDescription className="sr-only">
          {t("editDescription")}
        </DialogDescription>
        <div className="px-8 pt-6">
          <ChoiceGroup
            name="employee-view"
            onChange={(next) => {
              setView(next as "details" | "pay");
              setSaved(null);
            }}
            options={[
              { label: t("editTabDetails"), value: "details" },
              { label: t("payHeading"), value: "pay" },
            ]}
            value={view}
          />
        </div>

        {view === "details" ? (
          <form className="grid" onSubmit={saveDetails}>
            <DialogBody>
              <DialogSection
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("registerWhoTitle")}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field htmlFor={id("first")} label={t("firstName")}>
                    <Input
                      className={fieldClassName}
                      id={id("first")}
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </Field>
                  <Field htmlFor={id("last")} label={t("lastName")}>
                    <Input
                      className={fieldClassName}
                      id={id("last")}
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </Field>
                </div>
              </DialogSection>

              <DialogSection
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("registerJobTitle")}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field htmlFor={id("department")} label={t("department")}>
                    <Input
                      className={fieldClassName}
                      id={id("department")}
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </Field>
                  <Field htmlFor={id("position")} label={t("position")}>
                    <Input
                      className={fieldClassName}
                      id={id("position")}
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                    />
                  </Field>
                </div>
                <p className="m-0 text-sm font-medium" id={id("contract")}>
                  {t("contract")}
                </p>
                <ChoiceGroup
                  labelledBy={id("contract")}
                  name="contractType"
                  onChange={(next) => setContractType(next as ContractType)}
                  options={CONTRACT_TYPES.map((type) => ({
                    label: t(`contracts.${type}`),
                    value: type,
                  }))}
                  value={contractType}
                />
              </DialogSection>

              <DialogSection
                labelFor={id("start")}
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("editStartTitle")}
              >
                <Input
                  className={fieldClassName}
                  id={id("start")}
                  max={today}
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </DialogSection>

              <DialogSection
                tag={{ label: all("dialogTagOptional"), required: false }}
                title={t("editContactBankTitle")}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field htmlFor={id("email")} label={t("email")}>
                    <Input
                      className={fieldClassName}
                      id={id("email")}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Field htmlFor={id("phone")} label={t("phone")}>
                    <Input
                      className={fieldClassName}
                      id={id("phone")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </Field>
                </div>
                <Field htmlFor={id("iban")} label={t("iban")}>
                  <Input
                    className={fieldClassName}
                    dir="ltr"
                    id={id("iban")}
                    placeholder={
                      employee.ibanMasked ?? "TR00 0000 0000 0000 0000 0000 00"
                    }
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                  />
                </Field>
                <p className="m-0 text-step--1 text-muted-foreground">
                  {t("ibanKeepHint")}
                </p>
              </DialogSection>

              <div className="grid gap-3 py-5" aria-live="polite">
                {detailsError ? <FormError>{detailsError}</FormError> : null}
                {saved === "details" ? (
                  <p
                    className="m-0 text-sm font-medium text-primary-text"
                    role="status"
                  >
                    {t("detailsSaved")}
                  </p>
                ) : null}
              </div>
            </DialogBody>
            <DialogActions>
              <DialogClose asChild>
                <CancelButton disabled={pending} type="button">
                  {all("staff.confirmRoleClose")}
                </CancelButton>
              </DialogClose>
              <ArrowButton disabled={pending} type="submit">
                {pending ? t("submitting") : t("saveDetails")}
              </ArrowButton>
            </DialogActions>
          </form>
        ) : (
          <form className="grid" onSubmit={saveWage}>
            <DialogBody>
              <DialogSection title={t("editPayNowTitle")}>
                <DialogFacts
                  rows={[
                    ...employee.wageChanges.map(
                      (change) =>
                        [
                          `${t("effectiveFrom")} ${formatDate(
                            new Date(`${change.effectiveFrom}-01T00:00:00Z`),
                            locale,
                            { day: undefined, timeZone: "UTC" },
                          )}`,
                          money(change.grossPayMinor),
                        ] as const,
                    ),
                  ]}
                />
                <p className="m-0 text-step--1 text-muted-foreground">
                  {t("payNow", { amount: money(employee.grossPayMinor) })}
                </p>
              </DialogSection>

              <DialogSection
                labelFor={id("new-pay")}
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("newGrossPay", { currency: employee.currency })}
              >
                <Input
                  className={fieldClassName}
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
              </DialogSection>

              <DialogSection
                hint={t("payHint")}
                labelFor={id("from")}
                tag={{ label: all("dialogTagRequired"), required: true }}
                title={t("editPayFromTitle")}
              >
                <Input
                  aria-describedby={`${id("from")}-hint`}
                  className={fieldClassName}
                  id={id("from")}
                  required
                  type="month"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </DialogSection>

              <div className="grid gap-3 py-5" aria-live="polite">
                {wageError ? <FormError>{wageError}</FormError> : null}
                {saved === "wage" ? (
                  <p
                    className="m-0 text-sm font-medium text-primary-text"
                    role="status"
                  >
                    {t("wageSaved")}
                  </p>
                ) : null}
              </div>
            </DialogBody>
            <DialogActions
              hint={grossPay.trim() === "" ? t("editHintNewPay") : null}
            >
              <DialogClose asChild>
                <CancelButton disabled={pending} type="button">
                  {all("staff.confirmRoleClose")}
                </CancelButton>
              </DialogClose>
              <ArrowButton
                disabled={pending || grossPay.trim() === ""}
                type="submit"
              >
                {pending ? t("submitting") : t("changePay")}
              </ArrowButton>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
