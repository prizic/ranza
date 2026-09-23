"use client";

import { startTransition, useActionState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarCheck } from "lucide-react";
import type { InspectionSettings as Settings } from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import {
  Card,
  FormError,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from "@ranza/ui";
import {
  setInspection,
  type InspectionOutcome,
} from "../../../server/housekeeping";
import { HousekeepingStatusBadge } from "./status";

/**
 * Whether a cleaned room waits to be inspected before it is ready (slice 3).
 *
 * Two answers and one result: the Organization's default, this Property's own
 * answer or "use the Organization's", and the flow that follows, drawn so the
 * choice shows what it does before anybody has to guess (HK-S3-09). Saved on
 * change, because a setting with a separate save button is a setting somebody
 * leaves half-changed.
 *
 * Controls the reader may not use are shown disabled with the reason beside
 * them, rather than hidden: the value still matters to them, it is what their
 * board obeys.
 */
export function InspectionSettings({
  locale,
  propertyId,
  settings,
}: {
  locale: SupportedLocale;
  propertyId: string;
  settings: Settings;
}) {
  const t = useTranslations("housekeeping");
  const [outcome, dispatch, pending] = useActionState<
    InspectionOutcome,
    FormData
  >(setInspection, { status: "idle" });

  function save(scope: "property" | "organization", value: string) {
    const form = new FormData();
    form.set("locale", locale);
    form.set("propertyId", propertyId);
    form.set("scope", scope);
    form.set("value", value);
    startTransition(() => dispatch(form));
  }

  const onOff = (value: boolean) => (value ? t("on") : t("off"));
  const propertyValue =
    settings.propertyOverride === null
      ? "default"
      : settings.propertyOverride
        ? "on"
        : "off";

  return (
    <Card className="grid gap-5 p-5">
      <div className="grid gap-1">
        <h2 className="text-step-0 font-semibold">{t("inspectionTitle")}</h2>
        <p className="max-w-prose text-step--1 text-muted-foreground">
          {t("inspectionHint")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="inspection-organization">
            {t("organizationDefault")}
          </Label>
          <Select
            disabled={!settings.mayConfigureDefault || pending}
            onValueChange={(value) => save("organization", value)}
            value={settings.organizationDefault ? "on" : "off"}
          >
            <SelectTrigger id="inspection-organization">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">{t("on")}</SelectItem>
              <SelectItem value="off">{t("off")}</SelectItem>
            </SelectContent>
          </Select>
          {settings.mayConfigureDefault ? null : (
            <p className="text-step--1 text-muted-foreground">
              {settings.mayConfigure
                ? t("defaultNeedsReach")
                : t("settingReadOnly")}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="inspection-property">{t("thisProperty")}</Label>
          <Select
            disabled={!settings.mayConfigure || pending}
            onValueChange={(value) => save("property", value)}
            value={propertyValue}
          >
            <SelectTrigger id="inspection-property">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                {t("useDefault", {
                  value: onOff(settings.organizationDefault),
                })}
              </SelectItem>
              <SelectItem value="on">{t("on")}</SelectItem>
              <SelectItem value="off">{t("off")}</SelectItem>
            </SelectContent>
          </Select>
          {settings.mayConfigure ? null : (
            <p className="text-step--1 text-muted-foreground">
              {t("settingReadOnly")}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("flow")}
        </span>
        <ol className="flex flex-wrap items-center gap-2" data-testid="flow">
          <li>
            <HousekeepingStatusBadge status="dirty" />
          </li>
          <Step />
          <li>
            <HousekeepingStatusBadge status="clean" />
          </li>
          {settings.effective ? (
            <>
              <Step />
              <li>
                <HousekeepingStatusBadge status="inspected" />
              </li>
            </>
          ) : null}
          <Step />
          <li>
            <StatusBadge
              icon={CalendarCheck}
              label={t("flowReady")}
              tone="success"
            />
          </li>
        </ol>
      </div>

      <div aria-live="polite" className="min-h-5">
        {outcome.status === "done" ? (
          <p className="text-step--1 text-success">{t("saved")}</p>
        ) : outcome.status === "refused" || outcome.status === "invalid" ? (
          <FormError>{t("settingRefused")}</FormError>
        ) : null}
      </div>
    </Card>
  );
}

/** An arrow that points the way the text runs, so Arabic reads right to left. */
function Step() {
  return (
    <li aria-hidden="true" className="text-muted-foreground">
      <ArrowRight className="size-4 rtl:-scale-x-100" />
    </li>
  );
}
