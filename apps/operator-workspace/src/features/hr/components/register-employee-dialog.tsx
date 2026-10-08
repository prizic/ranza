"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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

interface RegisterEmployeeDialogProps {
  locale: string;
  propertyId: string;
}

export function RegisterEmployeeDialog({
  locale,
  propertyId,
}: RegisterEmployeeDialogProps) {
  const t = useTranslations("hr.employees");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [contractType, setContractType] = useState<ContractType>("full_time");
  const [grossPay, setGrossPay] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setDepartment("");
    setPosition("");
    setContractType("full_time");
    setGrossPay("");
    setEmail("");
    setPhone("");
    setIban("");
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !department.trim() ||
      !position.trim()
    ) {
      return;
    }
    const parsedPay = parseFloat(grossPay);
    if (isNaN(parsedPay) || parsedPay <= 0) {
      setErrorMessage("Invalid gross pay amount");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const res = await registerEmployeeAction(locale, propertyId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        department: department.trim(),
        position: position.trim(),
        contractType,
        grossPay: parsedPay,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        iban: iban.trim() || undefined,
      });

      if (res.status === "done") {
        resetForm();
        setOpen(false);
      } else {
        setErrorMessage(res.message || "Failed to register employee");
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
        <Button size="sm" className="gap-2">
          <Plus className="size-4" />
          <span>{t("register")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("registerTitle")}</DialogTitle>
            <DialogDescription>{t("registerDescription")}</DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium">
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
                placeholder="Ahmet"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("lastName")} *</Label>
              <Input
                id="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Yılmaz"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department">{t("department")} *</Label>
              <Input
                id="department"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Front Desk"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">{t("position")} *</Label>
              <Input
                id="position"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Front Desk Agent"
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
                  <SelectItem value="full_time">
                    {t("contracts.full_time")}
                  </SelectItem>
                  <SelectItem value="part_time">
                    {t("contracts.part_time")}
                  </SelectItem>
                  <SelectItem value="seasonal">
                    {t("contracts.seasonal")}
                  </SelectItem>
                  <SelectItem value="fixed_term">
                    {t("contracts.fixed_term")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="grossPay">{t("grossPay")} (TRY) *</Label>
              <Input
                id="grossPay"
                type="number"
                min="0"
                step="0.01"
                required
                value={grossPay}
                onChange={(e) => setGrossPay(e.target.value)}
                placeholder="35000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@hospitality.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+90 532 000 0000"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="iban">{t("iban")}</Label>
              <Input
                id="iban"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
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
