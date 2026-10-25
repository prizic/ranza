"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  MaintenanceSettings as Settings,
  ReturnAs,
  SettingOverrides,
  SettingValues,
} from "@ranza/maintenance";
import type { SupportedLocale } from "@ranza/i18n";
import {
  ArrowButton,
  Button,
  CancelButton,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogMasthead,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  dialogFrameClassName,
} from "@ranza/ui";
import { saveMaintenanceSettings } from "../../../server/maintenance";
import { WRAPPING_TRIGGER } from "../../configuration/options";
import { DefaultReachLines } from "../../configuration/components/default-reach-lines";
import { OutcomeMessage } from "./outcome-message";
import { useCommand } from "./use-command";

type Question = keyof SettingValues;
const QUESTIONS: readonly Question[] = [
  "assigneeRequired",
  "returnOnDone",
  "returnAs",
];
const RETURN_AS: readonly ReturnAs[] = ["dirty", "clean", "inspected"];

/**
 * How maintenance works at this Property (MT-S2-22 .. MT-S2-27): three
 * questions, each with the Organization's answer and this Property's own or
 * "use the Organization's".
 *
 * Nothing is written until a Save is pressed (MAINT-13). The Organization's
 * answer governs every Property, so saving it first names what it changes for
 * all of them; saving this Property's own answers changes this Property only,
 * and the button says so. Controls the reader may not use are disabled with
 * the reason beside them, never hidden: the answer is what their board obeys.
 *
 * `embedded` is for a screen that draws its own card around it (Configuration):
 * the title and hint are then that card's.
 */
export function MaintenanceSettingsCard({
  embedded = false,
  locale,
  propertyId,
  settings,
}: {
  embedded?: boolean;
  locale: SupportedLocale;
  propertyId: string;
  settings: Settings;
}) {
  const t = useTranslations("maintenance");
  const returnAs = useTranslations("maintenance.returnAs");
  const save = useCommand(saveMaintenanceSettings, locale);

  const [organizationDraft, setOrganizationDraft] = useState<SettingValues>(
    settings.organizationDefault,
  );
  const [propertyDraft, setPropertyDraft] = useState<SettingOverrides>(
    settings.propertyOverride,
  );
  const [confirming, setConfirming] = useState(false);

  const changedForOrganization = QUESTIONS.filter(
    (question) =>
      organizationDraft[question] !== settings.organizationDefault[question],
  );
  const propertyChanged = QUESTIONS.some(
    (question) =>
      propertyDraft[question] !== settings.propertyOverride[question],
  );

  function word(question: Question, value: boolean | ReturnAs): string {
    if (question === "returnAs") return returnAs(value as ReturnAs);
    if (question === "returnOnDone") {
      return value ? t("onDone") : t("onConfirmation");
    }
    return value ? t("yes") : t("no");
  }

  function choices(question: Question): string[] {
    return question === "returnAs" ? [...RETURN_AS] : ["on", "off"];
  }

  function parse(question: Question, value: string): boolean | ReturnAs {
    return question === "returnAs" ? (value as ReturnAs) : value === "on";
  }

  function encode(value: boolean | ReturnAs | null): string {
    if (value === null) return "default";
    if (typeof value === "boolean") return value ? "on" : "off";
    return value;
  }

  function saveOrganization() {
    setConfirming(false);
    save.run({
      propertyId,
      scope: "organization",
      assigneeRequired: encode(organizationDraft.assigneeRequired),
      returnOnDone: encode(organizationDraft.returnOnDone),
      returnAs: encode(organizationDraft.returnAs),
    });
  }

  function saveProperty() {
    save.run({
      propertyId,
      scope: "property",
      assigneeRequired: encode(propertyDraft.assigneeRequired),
      returnOnDone: encode(propertyDraft.returnOnDone),
      returnAs: encode(propertyDraft.returnAs),
    });
  }

  function discard() {
    setOrganizationDraft(settings.organizationDefault);
    setPropertyDraft(settings.propertyOverride);
  }

  const labels: Record<Question, string> = {
    assigneeRequired: t("assigneeRequired"),
    returnOnDone: t("whenReturns"),
    returnAs: t("returnsAs"),
  };

  const body = (
    <>
      {QUESTIONS.map((question) => {
        const own = propertyDraft[question];
        const inherited = organizationDraft[question];
        const inheritLabel = t("useDefault", {
          value: word(question, inherited),
        });
        return (
          // min-w-0: a fieldset is as wide as its content by default, and a
          // chosen value such as "Use the Organization's (When its request is
          // done)" then pushes the whole page sideways on a phone.
          <fieldset className="grid min-w-0 gap-3 border-t pt-4" key={question}>
            <legend className="text-step--1 font-medium">
              {labels[question]}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`${question}-organization`}>
                  {t("organizationDefault")}
                </Label>
                <Select
                  disabled={!settings.mayConfigureDefault || save.pending}
                  onValueChange={(value) =>
                    setOrganizationDraft({
                      ...organizationDraft,
                      [question]: parse(question, value),
                    })
                  }
                  value={encode(inherited)}
                >
                  <SelectTrigger
                    className={cn("w-full min-w-0", WRAPPING_TRIGGER)}
                    id={`${question}-organization`}
                  >
                    <SelectValue>{word(question, inherited)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {choices(question).map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        {word(question, parse(question, choice))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`${question}-property`}>
                  {t("thisProperty")}
                </Label>
                <Select
                  disabled={!settings.mayConfigure || save.pending}
                  onValueChange={(value) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      [question]:
                        value === "default" ? null : parse(question, value),
                    })
                  }
                  value={encode(own)}
                >
                  <SelectTrigger
                    className={cn("w-full min-w-0", WRAPPING_TRIGGER)}
                    id={`${question}-property`}
                  >
                    <SelectValue>
                      {own === null ? inheritLabel : word(question, own)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{inheritLabel}</SelectItem>
                    {choices(question).map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        {word(question, parse(question, choice))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>
        );
      })}

      {settings.mayConfigureDefault ? null : (
        <p className="text-step--1 text-muted-foreground">
          {settings.mayConfigure
            ? t("defaultNeedsReach")
            : t("settingReadOnly")}
        </p>
      )}

      {settings.mayConfigure || settings.mayConfigureDefault ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {settings.mayConfigure ? (
            <Button
              disabled={!propertyChanged || save.pending}
              onClick={saveProperty}
              type="button"
            >
              {t("saveForProperty")}
            </Button>
          ) : null}
          {settings.mayConfigureDefault ? (
            <Button
              disabled={changedForOrganization.length === 0 || save.pending}
              onClick={() => setConfirming(true)}
              type="button"
              variant="outline"
            >
              {t("saveForOrganization")}
            </Button>
          ) : null}
          {propertyChanged || changedForOrganization.length > 0 ? (
            <>
              <Button
                disabled={save.pending}
                onClick={discard}
                type="button"
                variant="ghost"
              >
                {t("discardChanges")}
              </Button>
              <p className="text-step--1 text-muted-foreground">
                {t("unsavedChanges")}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog onOpenChange={setConfirming} open={confirming}>
        <DialogContent className={dialogFrameClassName("small")}>
          <DialogMasthead
            art="/illustrations/dialogs/wrench.svg"
            eyebrow={t("confirmOrgTitle")}
            heading={t("settingsTitle")}
          />
          <DialogBody simple>
            <DialogDescription className="m-0 text-sm">
              {t("orgChangeNote")}
            </DialogDescription>
            <ul className="m-0 grid list-none gap-2 p-0 text-sm">
              {changedForOrganization.map((question) => (
                <li className="grid gap-1" key={question}>
                  <p className="m-0">
                    {t("orgChangeLine", {
                      setting: labels[question],
                      from: word(
                        question,
                        settings.organizationDefault[question],
                      ),
                      to: word(question, organizationDraft[question]),
                    })}
                  </p>
                  <DefaultReachLines
                    reach={settings.defaultReach?.[question] ?? null}
                  />
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogActions>
            <CancelButton onClick={() => setConfirming(false)} type="button">
              {t("keepEditing")}
            </CancelButton>
            <ArrowButton onClick={saveOrganization} type="button">
              {t("confirmOrgChange")}
            </ArrowButton>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <OutcomeMessage
        outcome={
          save.outcome.status === "refused" || save.outcome.status === "invalid"
            ? { status: "refused" }
            : save.outcome
        }
      />
    </>
  );

  if (embedded) return <div className="grid gap-5">{body}</div>;

  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-1">
        {/* h3: this card is one of the Maintenance board's own tabs, under
            the board's h2 (one-h1-per-page: patterns.tsx). */}
        <h3 className="text-step-0 font-semibold">{t("settingsTitle")}</h3>
        <p className="max-w-prose text-step--1 text-muted-foreground">
          {t("settingsHint")}
        </p>
      </div>
      {body}
    </Card>
  );
}
