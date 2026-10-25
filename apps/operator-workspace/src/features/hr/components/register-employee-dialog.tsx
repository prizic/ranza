"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  ChoiceGroup,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  DialogNotice,
  DialogSection,
  DialogTrigger,
  Field,
  FormError,
  Input,
  dialogFrameClassName,
  fieldClassName,
} from "@ranza/ui";
import { Plus } from "lucide-react";
import type { ContractType } from "../../../server/viewer";
import { registerEmployeeAction } from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";

interface RegisterEmployeeDialogProps {
  /** The Property's currency: what a new employee is paid in. */
  currency: string;
  locale: SupportedLocale;
  propertyId: string;
  /** Where the new record will work, said in the dialog (HR-02). */
  propertyName: string;
  /** The Property's own calendar date, `YYYY-MM-DD`: the default and last start date. */
  today: string;
  /**
   * The sign-in the record is for, when it is registered from one: the new
   * record is linked to it and its email is where the form starts. The name is
   * not known, because a Staff Member has only an email.
   */
  prefill?: { userId: string; email: string } | undefined;
}

const CONTRACT_TYPES: readonly ContractType[] = [
  "full_time",
  "part_time",
  "seasonal",
  "fixed_term",
];

export function RegisterEmployeeDialog({
  currency,
  locale,
  propertyId,
  propertyName,
  today,
  prefill,
}: RegisterEmployeeDialogProps) {
  const t = useTranslations("hr.employees");
  const all = useTranslations();
  const outcomeText = useOutcomeText();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [contractType, setContractType] = useState<ContractType>("full_time");
  const [grossPay, setGrossPay] = useState("");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");
  const [hiredOn, setHiredOn] = useState(today);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setDepartment("");
    setPosition("");
    setContractType("full_time");
    setGrossPay("");
    setEmail(prefill?.email ?? "");
    setPhone("");
    setIban("");
    setHiredOn(today);
    setErrorMessage(null);
  };

  const ready = [
    firstName,
    lastName,
    department,
    position,
    grossPay,
    hiredOn,
  ].every((value) => value.trim() !== "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const outcome = await registerEmployeeAction(locale, propertyId, {
        userId: prefill?.userId,
        firstName,
        lastName,
        department,
        position,
        contractType,
        grossPay,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        iban: iban.trim() || undefined,
        hiredOn,
      });

      if (outcome.status === "done") {
        resetForm();
        setOpen(false);
      } else {
        setErrorMessage(outcomeText(outcome));
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isPending) return;
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {prefill ? (
          <Button
            size="sm"
            variant="outline"
            aria-label={`${t("registerAsEmployee")}: ${prefill.email}`}
          >
            {t("registerAsEmployee")}
          </Button>
        ) : (
          <Button size="sm" className="gap-2">
            <Plus className="size-4" />
            <span>{t("register")}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={dialogFrameClassName("medium")}>
        <form className="grid" onSubmit={handleSubmit}>
          <DialogMasthead
            art="/illustrations/dialogs/invite.svg"
            eyebrow={t("registerTitle")}
            facts={
              propertyName
                ? t("registersAt", { property: propertyName })
                : undefined
            }
            heading={t("registerHeading")}
            large
          />
          <DialogBody>
            <DialogDescription className="sr-only">
              {t("registerDescription")}
            </DialogDescription>

            {prefill ? (
              <div className="py-5">
                <DialogNotice>
                  {t("registerForLogin", { email: prefill.email })}
                </DialogNotice>
              </div>
            ) : null}

            <DialogSection
              tag={{ label: all("dialogTagRequired"), required: true }}
              title={t("registerWhoTitle")}
            >
              <div className="grid grid-cols-2 gap-4">
                <Field htmlFor="firstName" label={t("firstName")}>
                  <Input
                    className={fieldClassName}
                    id="firstName"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </Field>
                <Field htmlFor="lastName" label={t("lastName")}>
                  <Input
                    className={fieldClassName}
                    id="lastName"
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
                <Field htmlFor="department" label={t("department")}>
                  <Input
                    className={fieldClassName}
                    id="department"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </Field>
                <Field htmlFor="position" label={t("position")}>
                  <Input
                    className={fieldClassName}
                    id="position"
                    required
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                  />
                </Field>
              </div>
              <p className="m-0 text-sm font-medium" id="contract-label">
                {t("contract")}
              </p>
              <ChoiceGroup
                labelledBy="contract-label"
                name="contractType"
                onChange={(type) => setContractType(type as ContractType)}
                options={CONTRACT_TYPES.map((type) => ({
                  label: t(`contracts.${type}`),
                  value: type,
                }))}
                value={contractType}
              />
            </DialogSection>

            <DialogSection
              tag={{ label: all("dialogTagRequired"), required: true }}
              title={t("registerPayTitle")}
            >
              <div className="grid grid-cols-2 gap-4">
                <Field htmlFor="grossPay" label={t("grossPayIn", { currency })}>
                  <Input
                    className={fieldClassName}
                    id="grossPay"
                    inputMode="decimal"
                    required
                    value={grossPay}
                    onChange={(e) => setGrossPay(e.target.value)}
                  />
                </Field>
                <Field
                  hint={t("startDateHint")}
                  htmlFor="hiredOn"
                  label={t("startDate")}
                >
                  <Input
                    aria-describedby="hiredOn-hint"
                    className={fieldClassName}
                    id="hiredOn"
                    max={today}
                    required
                    type="date"
                    value={hiredOn}
                    onChange={(e) => setHiredOn(e.target.value)}
                  />
                </Field>
              </div>
            </DialogSection>

            <DialogSection
              tag={{ label: all("dialogTagOptional"), required: false }}
              title={t("registerContactTitle")}
            >
              <div className="grid grid-cols-2 gap-4">
                <Field htmlFor="email" label={t("email")}>
                  <Input
                    className={fieldClassName}
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field htmlFor="phone" label={t("phone")}>
                  <Input
                    className={fieldClassName}
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
              </div>
              <Field htmlFor="iban" label={t("iban")}>
                <Input
                  className={fieldClassName}
                  dir="ltr"
                  id="iban"
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  value={iban}
                />
              </Field>
              <p className="m-0 text-step--1 text-muted-foreground">
                {t("ibanHint")}
              </p>
            </DialogSection>

            {errorMessage ? (
              <div aria-live="polite" className="py-5">
                <FormError>{errorMessage}</FormError>
              </div>
            ) : null}
          </DialogBody>

          <DialogActions hint={ready ? null : t("registerHintMissing")}>
            <CancelButton
              disabled={isPending}
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              type="button"
            >
              {t("cancel")}
            </CancelButton>
            <ArrowButton disabled={isPending || !ready} type="submit">
              {isPending ? t("submitting") : t("submit")}
            </ArrowButton>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
