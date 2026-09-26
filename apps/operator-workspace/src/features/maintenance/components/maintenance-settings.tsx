"use client";

import { useOptimistic } from "react";
import { useTranslations } from "next-intl";
import type {
  MaintenanceSettings as Settings,
  ReturnAs,
  SettingOverrides,
  SettingValues,
} from "@ranza/maintenance";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Card,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import { saveMaintenanceSettings } from "../../../server/maintenance";
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
 * "use the Organization's". Saved on change, as the housekeeping setting is,
 * and shown the moment it is chosen. Controls the reader may not use are
 * disabled with the reason beside them, never hidden: the answer is what their
 * board obeys.
 */
export function MaintenanceSettingsCard({
  locale,
  propertyId,
  settings,
}: {
  locale: SupportedLocale;
  propertyId: string;
  settings: Settings;
}) {
  const t = useTranslations("maintenance");
  const returnAs = useTranslations("maintenance.returnAs");
  const save = useCommand(saveMaintenanceSettings, locale);

  const [shown, show] = useOptimistic(
    settings,
    (
      current: Settings,
      change: { organization?: SettingValues; property?: SettingOverrides },
    ): Settings => {
      const organizationDefault =
        change.organization ?? current.organizationDefault;
      const propertyOverride = change.property ?? current.propertyOverride;
      return {
        ...current,
        organizationDefault,
        propertyOverride,
        effective: {
          assigneeRequired:
            propertyOverride.assigneeRequired ??
            organizationDefault.assigneeRequired,
          returnOnDone:
            propertyOverride.returnOnDone ?? organizationDefault.returnOnDone,
          returnAs: propertyOverride.returnAs ?? organizationDefault.returnAs,
        },
      };
    },
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

  function saveOrganization(question: Question, value: string) {
    const next = {
      ...shown.organizationDefault,
      [question]: parse(question, value),
    };
    save.run(
      {
        propertyId,
        scope: "organization",
        assigneeRequired: encode(next.assigneeRequired),
        returnOnDone: encode(next.returnOnDone),
        returnAs: encode(next.returnAs),
      },
      () => show({ organization: next }),
    );
  }

  function saveProperty(question: Question, value: string) {
    const next = {
      ...shown.propertyOverride,
      [question]: value === "default" ? null : parse(question, value),
    };
    save.run(
      {
        propertyId,
        scope: "property",
        assigneeRequired: encode(next.assigneeRequired),
        returnOnDone: encode(next.returnOnDone),
        returnAs: encode(next.returnAs),
      },
      () => show({ property: next }),
    );
  }

  const labels: Record<Question, string> = {
    assigneeRequired: t("assigneeRequired"),
    returnOnDone: t("whenReturns"),
    returnAs: t("returnsAs"),
  };

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

      {QUESTIONS.map((question) => {
        const own = shown.propertyOverride[question];
        const inherited = shown.organizationDefault[question];
        const inheritLabel = t("useDefault", {
          value: word(question, inherited),
        });
        return (
          <fieldset className="grid gap-3 border-t pt-4" key={question}>
            <legend className="text-step--1 font-medium">
              {labels[question]}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${question}-organization`}>
                  {t("organizationDefault")}
                </Label>
                <Select
                  disabled={!settings.mayConfigureDefault || save.pending}
                  onValueChange={(value) => saveOrganization(question, value)}
                  value={encode(inherited)}
                >
                  <SelectTrigger id={`${question}-organization`}>
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
              <div className="grid gap-1.5">
                <Label htmlFor={`${question}-property`}>
                  {t("thisProperty")}
                </Label>
                <Select
                  disabled={!settings.mayConfigure || save.pending}
                  onValueChange={(value) => saveProperty(question, value)}
                  value={encode(own)}
                >
                  <SelectTrigger id={`${question}-property`}>
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

      <OutcomeMessage
        outcome={
          save.outcome.status === "refused" || save.outcome.status === "invalid"
            ? { status: "refused" }
            : save.outcome
        }
      />
    </Card>
  );
}
