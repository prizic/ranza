"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button, DialogSection, Input, fieldClassName } from "@ranza/ui";

/**
 * `GUEST_PARTICULARS` in `@ranza/guests`, restated for the reason the booking
 * dialog restates `GUEST_DETAILS` (ADR 0007); `tests/unit/new-reservation.test.tsx`
 * fails if they disagree.
 */
const PARTICULARS = {
  textMin: 2,
  textMax: 120,
  phone: 40,
  yearMin: 1,
  yearMax: 8,
  earliestDateOfBirth: "1900-01-01",
};

const NAMES = [
  ["guardianName", "guardianPhone"],
  ["emergencyName", "emergencyPhone"],
] as const;

/**
 * A student's date of birth, studies, guardian and emergency contact, in the
 * booking dialog (PA-S1-09).
 *
 * Open for a Resident's stay, which is a dormitory's default (ADR 0057: the
 * model sets what is shown first, never the rule), and one press away for a
 * Guest's. Every field is optional: the database requires none, and a desk that
 * has only a name still takes the booking. Once anything is typed the fields
 * stay, so switching the stay type afterwards never drops it.
 */
export function GuestParticularsFields({
  onShow,
  shown,
  tagOptional,
  today,
}: {
  onShow: () => void;
  shown: boolean;
  /** The dialog's own "Optional" tag, so every optional section reads alike. */
  tagOptional: string;
  /** The Property's own today: a date of birth is not after it. */
  today: string;
}) {
  const t = useTranslations("particulars");

  if (!shown) {
    return (
      <div className="py-5">
        <Button onClick={onShow} size="sm" type="button" variant="outline">
          <Plus aria-hidden="true" className="size-4" />
          {t("show")}
        </Button>
      </div>
    );
  }

  return (
    <DialogSection
      hint={t("hint")}
      tag={{ label: tagOptional }}
      title={t("title")}
      titleId="booking-particulars"
    >
      {/* A typed field keeps the section open whatever the stay type becomes. */}
      <div className="grid gap-4 sm:grid-cols-2" onChange={onShow}>
        <label className="grid gap-1.5 text-sm font-medium">
          {t("dateOfBirth")}
          <Input
            className={fieldClassName}
            max={today}
            min={PARTICULARS.earliestDateOfBirth}
            name="dateOfBirth"
            type="date"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          {t("studyYear")}
          <Input
            className={fieldClassName}
            inputMode="numeric"
            max={PARTICULARS.yearMax}
            min={PARTICULARS.yearMin}
            name="studyYear"
            type="number"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
          {t("institution")}
          <Input
            autoComplete="off"
            className={fieldClassName}
            maxLength={PARTICULARS.textMax}
            minLength={PARTICULARS.textMin}
            name="institution"
          />
        </label>
        {NAMES.map(([name, phone]) => (
          <div className="contents" key={name}>
            <label className="grid gap-1.5 text-sm font-medium">
              {t(name)}
              <Input
                autoComplete="off"
                className={fieldClassName}
                maxLength={PARTICULARS.textMax}
                minLength={PARTICULARS.textMin}
                name={name}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t(phone)}
              <Input
                autoComplete="off"
                className={fieldClassName}
                maxLength={PARTICULARS.phone}
                name={phone}
                type="tel"
              />
            </label>
          </div>
        ))}
      </div>
    </DialogSection>
  );
}
