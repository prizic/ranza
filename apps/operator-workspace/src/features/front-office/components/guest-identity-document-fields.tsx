"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChoiceGroup, Combobox, Input, fieldClassName } from "@ranza/ui";
import { countryOptions } from "../../../lib/countries";
import {
  DOCUMENT_NUMBER,
  DOCUMENT_TYPES,
  documentNumberProblem,
  isDocumentType,
  type DocumentType,
} from "../../../lib/identity-document";
import { usePickerLabels } from "../../../lib/picker-labels";

/** A Turkish national is asked for a T.C. kimlik; anybody else for a passport. */
function suggestedType(nationality: string): DocumentType {
  return nationality === "TR" ? "tc_kimlik" : "passport";
}

/**
 * The nationality and the identity document a Guest registers with, inside the
 * particulars section of the booking dialog (PA-S2-*).
 *
 * Choosing a nationality suggests the kind of document until the desk has
 * chosen one by hand: a Turkish national is asked for a T.C. kimlik, anybody
 * else for a passport, which is one press fewer for the common case and never
 * overrides a choice made. The number is checked as it is typed, with the
 * checksum, and said under the field once it has been left; the browser also
 * refuses the form with the same words, because the database would.
 */
export function GuestIdentityDocumentFields({
  onShow,
}: {
  /** The picker submits through a hidden input, which the section's own change listener never hears. */
  onShow: () => void;
}) {
  const t = useTranslations("particulars");
  const locale = useLocale();
  const pickerLabels = usePickerLabels(t("nationalityPlaceholder"));
  const options = useMemo(() => countryOptions(locale), [locale]);
  const ids = useId();
  const typeLabelId = `${ids}-type`;
  const numberId = `${ids}-number`;
  const nationalityId = `${ids}-nationality`;
  const problemId = `${ids}-problem`;

  const [nationality, setNationality] = useState("");
  const [type, setType] = useState<DocumentType | "">("");
  const [typeChosenByHand, setTypeChosenByHand] = useState(false);
  const [number, setNumber] = useState("");
  const [left, setLeft] = useState(false);
  const numberInput = useRef<HTMLInputElement>(null);

  const problem = documentNumberProblem(type, number);
  const problemText =
    problem === null
      ? ""
      : t(`documentProblems.${problem}`, {
          min: DOCUMENT_NUMBER.min,
          max: DOCUMENT_NUMBER.max,
        });

  useEffect(() => {
    numberInput.current?.setCustomValidity(problemText);
  }, [problemText]);

  return (
    <>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor={nationalityId}>
          {t("nationality")}
        </label>
        <Combobox
          id={nationalityId}
          labels={pickerLabels}
          name="nationality"
          onValueChange={(code) => {
            setNationality(code);
            onShow();
            if (!typeChosenByHand) setType(suggestedType(code));
          }}
          options={options}
          value={nationality}
        />
      </div>

      <div className="grid gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium" id={typeLabelId}>
          {t("documentType")}
        </span>
        <ChoiceGroup
          labelledBy={typeLabelId}
          name="documentType"
          onChange={(value) => {
            if (!isDocumentType(value)) return;
            setType(value);
            setTypeChosenByHand(true);
          }}
          options={DOCUMENT_TYPES.map((kind) => ({
            label: t(`documentTypes.${kind}`),
            value: kind,
          }))}
          value={type}
        />
      </div>

      <div className="grid gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium" htmlFor={numberId}>
          {t("documentNumber")}
        </label>
        <Input
          aria-describedby={left && problem ? problemId : undefined}
          aria-invalid={left && problem ? true : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          className={fieldClassName}
          dir="ltr"
          id={numberId}
          inputMode={type === "tc_kimlik" ? "numeric" : "text"}
          maxLength={DOCUMENT_NUMBER.max + 6}
          name="documentNumber"
          onBlur={() => setLeft(true)}
          onChange={(event) => setNumber(event.target.value)}
          ref={numberInput}
          value={number}
        />
        {left && problem ? (
          <p className="m-0 text-step--1 text-destructive" id={problemId}>
            {problemText}
          </p>
        ) : null}
      </div>
    </>
  );
}
