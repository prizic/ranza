"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Plus } from "lucide-react";
import type { ContractType } from "../../../server/viewer";
import { registerEmployeeAction } from "../../../server/hr";
import { useOutcomeText } from "./outcome-text";

interface RegisterEmployeeDialogProps {
  /** The Property's currency: what a new employee is paid in. */
  currency: string;
  locale: SupportedLocale;
  propertyId: string;
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
  prefill,
}: RegisterEmployeeDialogProps) {
  const t = useTranslations("hr.employees");
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
    setErrorMessage(null);
  };

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
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("registerTitle")}</DialogTitle>
            <DialogDescription>
              {prefill
                ? `${t("registerForLogin", { email: prefill.email })} ${t("registerDescription")}`
                : t("registerDescription")}
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div
              role="alert"
              className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{t("firstName")} *</Label>
              <Input
                id="firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("lastName")} *</Label>
              <Input
                id="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department">{t("department")} *</Label>
              <Input
                id="department"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">{t("position")} *</Label>
              <Input
                id="position"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contractType">{t("contract")}</Label>
              <Select
                value={contractType}
                onValueChange={(val) => setContractType(val as ContractType)}
              >
                <SelectTrigger id="contractType">
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
              <Label htmlFor="grossPay">
                {t("grossPayIn", { currency })} *
              </Label>
              <Input
                id="grossPay"
                inputMode="decimal"
                required
                value={grossPay}
                onChange={(e) => setGrossPay(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="iban">{t("iban")}</Label>
              <Input
                id="iban"
                dir="ltr"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
              <p className="text-step--2 text-muted-foreground">
                {t("ibanHint")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
