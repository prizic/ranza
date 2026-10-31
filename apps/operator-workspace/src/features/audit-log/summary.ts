import { useTranslations } from "next-intl";
import type { AuditEntry } from "@ranza/core";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import { readAs } from "./actions";
import { minorUnitsOf, shownAmount } from "./amounts";
import type { AuditWords } from "./words";

/**
 * The one line the list shows under what happened, for the records that are
 * one setting or one price changing (AUDIT-09).
 *
 * Seven rows reading "Room check after cleaning changed · Property · Demo
 * Hotel" at the same minute say that something was switched seven times and
 * not what to or from; the record screen has it, one click each. This is the
 * fact that decides whether to click: "Off → On". A record whose context is
 * not one of these, or is not shaped as expected, has no summary and the row
 * is as it was.
 */

/** The three questions Maintenance asks per Property or Organization. */
export const MAINTENANCE_SETTINGS = [
  "assigneeRequired",
  "returnOnDone",
  "returnAs",
] as const;
export type MaintenanceSetting = (typeof MAINTENANCE_SETTINGS)[number];

export interface SettingChange {
  setting: MaintenanceSetting;
  from: unknown;
  to: unknown;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Which of the Maintenance settings a record changed. `from` is null for an
 * Organization's default that was never set, which every Property then read as
 * the product's; there is nothing to compare, so each setting it now holds is
 * a change.
 */
export function maintenanceSettingChanges(
  from: unknown,
  to: unknown,
): SettingChange[] {
  const before = asObject(from);
  const after = asObject(to);
  return MAINTENANCE_SETTINGS.filter(
    (setting) => before[setting] !== after[setting],
  ).map((setting) => ({
    setting,
    from: before[setting],
    to: after[setting],
  }));
}

const CONFIGURATION_FIELDS = [
  "name",
  "timezone",
  "currency",
  "businessDateCutoff",
  "operatingModel",
] as const;

const PRICED_KINDS = ["room", "bed", "apartment", "suite"] as const;

function pair(value: unknown): { from: unknown; to: unknown } | null {
  const object = asObject(value);
  return "from" in object && "to" in object
    ? { from: object.from, to: object.to }
    : null;
}

/** What each Maintenance setting and its answers are called, as Maintenance says them. */
export function useMaintenanceSettingWords() {
  const t = useTranslations();

  const settingWord = (setting: MaintenanceSetting, value: unknown): string => {
    if (value === undefined || value === null) return t("auditNotSet");
    if (setting === "returnAs") {
      return value === "dirty" || value === "clean" || value === "inspected"
        ? t(`maintenance.returnAs.${value}`)
        : String(value);
    }
    if (setting === "returnOnDone") {
      return value === true
        ? t("maintenance.onDone")
        : t("maintenance.onConfirmation");
    }
    return value === true ? t("maintenance.yes") : t("maintenance.no");
  };

  const settingName = (setting: MaintenanceSetting): string =>
    t(
      setting === "assigneeRequired"
        ? "maintenance.assigneeRequired"
        : setting === "returnOnDone"
          ? "maintenance.whenReturns"
          : "maintenance.returnsAs",
    );

  return { settingName, settingWord };
}

/**
 * A configured setting's value as a reader says it. Most are recorded as they
 * read (a name, a zone, `04:00`); the operating model is recorded as its code
 * and named in the reader's language (ADR 0057).
 */
export function useConfiguredValue() {
  const t = useTranslations();
  return (setting: string, value: unknown): string =>
    setting === "operatingModel" && (value === "hotel" || value === "dormitory")
      ? t(`configuration.operatingModels.${value}`)
      : String(value);
}

/** Whom a room admits, as the rooms screen says it; null is anyone (RB-S5-13). */
export function useRoomAdmitsWord() {
  const t = useTranslations();
  return (value: unknown): string =>
    t(
      `roomAdmits.${value === "female" || value === "male" ? value : "anyone"}`,
    );
}

export function useAuditSummary(words: AuditWords, locale: SupportedLocale) {
  const t = useTranslations();
  const configuredValue = useConfiguredValue();
  const admitsWord = useRoomAdmitsWord();

  const fromTo = (from: string, to: string) => t("auditFromTo", { from, to });

  const day = (value: unknown): string =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? formatDate(new Date(value.slice(0, 10)), locale, { timeZone: "UTC" })
      : t("auditNotSet");

  const inspection = (value: unknown): string =>
    value === "on"
      ? t("housekeeping.on")
      : value === "off"
        ? t("housekeeping.off")
        : value === "default"
          ? t("auditInspectionFollowsOrganization")
          : t("auditNotSet");

  const roomStatus = (value: unknown): string =>
    value === "dirty" || value === "clean" || value === "inspected"
      ? t(`housekeeping.${value}`)
      : t("auditNotSet");

  const { settingName, settingWord } = useMaintenanceSettingWords();

  const money = (amount: unknown, currency: unknown): string | null =>
    typeof amount === "number" && typeof currency === "string"
      ? formatMoney(amount, currency, locale)
      : null;

  return function summaryOf(
    entry: Pick<AuditEntry, "action" | "subjectType" | "context">,
  ): string | null {
    const action = readAs(entry.action, entry.subjectType);
    const context = asObject(entry.context);

    switch (action) {
      case "housekeeping.inspection_set":
        return fromTo(inspection(context.from), inspection(context.to));

      case "unit.admits_changed":
        return fromTo(admitsWord(context.from), admitsWord(context.to));

      case "housekeeping.status_changed":
        return fromTo(
          roomStatus(context.previousStatus),
          roomStatus(context.status),
        );

      case "maintenance_setting.changed": {
        const changes = maintenanceSettingChanges(context.from, context.to);
        if (changes.length === 0) return null;
        return changes
          .map(
            (change) =>
              `${settingName(change.setting)}: ${fromTo(
                settingWord(change.setting, change.from),
                settingWord(change.setting, change.to),
              )}`,
          )
          .join("; ");
      }

      case "property.configured":
      case "organization.configured": {
        const changed = Array.isArray(context.changed)
          ? context.changed.filter(
              (field): field is (typeof CONFIGURATION_FIELDS)[number] =>
                (CONFIGURATION_FIELDS as readonly unknown[]).includes(field),
            )
          : [];
        const parts = changed.flatMap((field) => {
          const change = pair(context[field]);
          return change
            ? [
                `${t(`configuration.fields.${field}`)}: ${fromTo(
                  configuredValue(field, change.from),
                  configuredValue(field, change.to),
                )}`,
              ]
            : [];
        });
        return parts.length === 0 ? null : parts.join("; ");
      }

      case "price_list.changed": {
        if (!Array.isArray(context.changes)) return null;
        const parts = (context.changes as unknown[]).flatMap((item) => {
          const change = asObject(item);
          const kind = change.unitType;
          if (!(PRICED_KINDS as readonly unknown[]).includes(kind)) return [];
          const side = (value: unknown) => {
            const price = asObject(value);
            return (
              money(price.amountMinor, price.currency) ?? t("rates.noPrice")
            );
          };
          return [
            `${t(`unitType.${kind as (typeof PRICED_KINDS)[number]}`)}: ${fromTo(
              side(change.from),
              side(change.to),
            )}`,
          ];
        });
        return parts.length === 0 ? null : parts.join("; ");
      }

      case "staff.role_changed": {
        const { from, to } = context;
        if (typeof from !== "string" || typeof to !== "string") return null;
        return fromTo(
          words.role(
            from,
            typeof context.fromAuthored === "boolean"
              ? context.fromAuthored
              : undefined,
          ),
          words.role(
            to,
            typeof context.toAuthored === "boolean"
              ? context.toAuthored
              : undefined,
          ),
        );
      }

      case "stay.departure_changed":
        return fromTo(day(context.fromEndsOn), day(context.toEndsOn));

      case "reservation.arrival_time_changed": {
        const time = (value: unknown) =>
          typeof value === "string" ? value.slice(0, 5) : t("auditNotSet");
        return fromTo(time(context.fromTime), time(context.toTime));
      }

      case "folio.charge_posted":
      case "folio.payment_posted":
      case "folio.line_reversed": {
        const minor = minorUnitsOf(context.amountMinor);
        const amount = money(
          minor === null ? undefined : shownAmount(action, minor),
          context.currency,
        );
        const description =
          typeof context.description === "string" ? context.description : null;
        const parts = [description, amount].filter(
          (part): part is string => part !== null,
        );
        return parts.length === 0 ? null : parts.join(" · ");
      }

      default:
        return null;
    }
  };
}
