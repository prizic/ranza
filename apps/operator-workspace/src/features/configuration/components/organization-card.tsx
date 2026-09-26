"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Landmark } from "lucide-react";
import type { SupportedLocale } from "@ranza/i18n";
import { Field, Input } from "@ranza/ui";
import {
  renameOrganization,
  type SettingsOutcome,
} from "../../../server/configuration";
import type { PropertySettings } from "../../../server/viewer";
import { SaveBar } from "./save-bar";
import { SettingsCard } from "./settings-card";

const IDLE: SettingsOutcome = { status: "idle" };

/**
 * The Organization's name (slice 2). It governs every Property, so changing it
 * takes reach to all of them as well as the permission; somebody with only the
 * permission reads why they cannot (CF-S3-02).
 */
export function OrganizationCard({
  locale,
  settings,
}: {
  locale: SupportedLocale;
  settings: PropertySettings;
}) {
  const t = useTranslations("configuration");
  const organization = settings.organization;
  const [draft, setDraft] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SettingsOutcome>(IDLE);
  const [pending, startSaving] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  // What this card last saved, until the page's refresh catches up with it:
  // the next rename then names the version that exists now (see `newest` in
  // property-settings-form.tsx for the same reasoning).
  const [lastSaved, setLastSaved] = useState<{
    name: string;
    version: string;
  } | null>(null);
  const saved =
    lastSaved && lastSaved.version > organization.version
      ? lastSaved
      : { name: organization.name, version: organization.version };

  const name = draft ?? saved.name;
  const dirty = draft !== null && draft !== saved.name;
  const invalid = outcome.status === "invalid";

  function save() {
    const form = new FormData();
    form.set("locale", locale);
    form.set("propertyId", settings.propertyId);
    form.set("version", saved.version);
    form.set("name", name);
    startSaving(async () => {
      const answer = await renameOrganization(IDLE, form);
      startSaving(() => {
        setOutcome(answer);
        if (answer.status === "saved" && answer.version) {
          setLastSaved({ name, version: answer.version });
        }
        if (answer.status !== "invalid" && answer.status !== "refused") {
          setDraft(null);
        }
      });
      if (answer.status === "invalid") nameRef.current?.focus();
    });
  }

  return (
    <SettingsCard
      footer={
        <SaveBar
          dirty={dirty}
          mayChange={organization.mayRename}
          onDiscard={() => setDraft(null)}
          onSave={save}
          outcome={outcome}
          pending={pending}
          readOnly={
            settings.mayConfigure ? t("organizationNeedsReach") : t("readOnly")
          }
        />
      }
      hint={t("organizationHint")}
      icon={Landmark}
      id="organization"
      title={t("organizationTitle")}
    >
      {/* The Property card's grid, so the name field lines up with its own. */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Field htmlFor="organization-name" label={t("organizationName")}>
            <Input
              aria-describedby={invalid ? "organization-name-error" : undefined}
              aria-invalid={invalid || undefined}
              autoComplete="organization"
              disabled={!organization.mayRename}
              id="organization-name"
              maxLength={120}
              onChange={(event) => setDraft(event.target.value)}
              ref={nameRef}
              value={name}
            />
          </Field>
          {invalid ? (
            <p
              className="text-step--1 text-destructive"
              id="organization-name-error"
            >
              {t("invalidName")}
            </p>
          ) : null}
        </div>
      </div>
    </SettingsCard>
  );
}
