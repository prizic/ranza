"use client";

import { useTranslations } from "next-intl";
import { Checkbox, cn } from "@ranza/ui";
import {
  EXPORT_RESOURCE_TYPES,
  type ExportAbilities,
  type ExportResourceType,
} from "../types";

/**
 * Which datasets an export holds, as a list of choices a role can be refused
 * and says so beside (DX-02): the datasets its role will not cover are shown
 * disabled with the permission they need, rather than ticked and refused on
 * submit. The database still decides every request; this asks it early.
 *
 * Nothing is ticked to begin with. A form that opens with the guest list and
 * the bookings ticked asks a person to notice what they did not choose, and a
 * file of personal data is the wrong thing to hand over by default.
 */
export function DatasetPicker({
  abilities,
  idPrefix,
  onChange,
  value,
}: {
  abilities: ExportAbilities;
  idPrefix: string;
  onChange: (next: ExportResourceType[]) => void;
  value: readonly ExportResourceType[];
}) {
  const t = useTranslations("dataExport");
  const permissions = useTranslations("staff.permissions");

  function reasonFor(dataset: ExportResourceType): string | null {
    if (abilities.datasets[dataset]) return null;
    if (!abilities.mayCreate) return null;
    switch (dataset) {
      case "residents_guests":
      case "reservations_stays":
        return t("datasetNeedsFrontDesk", { permission: permissions("book") });
      case "folios_payments":
        return t("datasetNeeds", { permission: permissions("manageFolio") });
      case "audit_log":
        return t("datasetNeeds", { permission: permissions("readAudit") });
      case "rooms_beds":
        return null;
    }
  }

  function toggle(dataset: ExportResourceType) {
    onChange(
      value.includes(dataset)
        ? value.filter((chosen) => chosen !== dataset)
        : [...value, dataset],
    );
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="grid gap-0.5">
        <span className="text-sm font-medium">{t("datasetsTitle")}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {t("datasetsDescription")}
        </span>
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {EXPORT_RESOURCE_TYPES.map((dataset) => {
          const allowed = abilities.datasets[dataset];
          const checked = value.includes(dataset);
          const reason = reasonFor(dataset);
          const id = `${idPrefix}-${dataset}`;
          return (
            <label
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                allowed
                  ? "cursor-pointer hover:bg-muted/50"
                  : "cursor-not-allowed bg-muted/30 text-muted-foreground",
                checked && "border-primary bg-primary/5",
              )}
              htmlFor={id}
              key={dataset}
            >
              <Checkbox
                checked={checked}
                className="mt-0.5"
                disabled={!allowed}
                id={id}
                onCheckedChange={() => toggle(dataset)}
              />
              <span className="grid gap-1">
                <span className="text-sm leading-none font-medium">
                  {t(`datasets.${dataset}`)}
                </span>
                <span className="text-xs leading-normal text-muted-foreground">
                  {t(`datasetDescriptions.${dataset}`)}
                </span>
                {reason ? (
                  <span className="text-xs leading-normal text-foreground">
                    {reason}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
