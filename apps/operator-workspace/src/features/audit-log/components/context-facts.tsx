"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ranza/ui";
import { formatDate, formatMoney, type SupportedLocale } from "@ranza/i18n";
import { asPermission } from "../../staff/labels";
import { formatSize } from "../../data-export/helpers";
import { minorUnitsOf, shownAmount } from "../amounts";
import { HIDDEN_CONTEXT_KEYS, isContextKey } from "../context-keys";
import {
  maintenanceSettingChanges,
  useMaintenanceSettingWords,
} from "../summary";
import type { AuditWords } from "../words";

/**
 * The facts a module thought worth explaining later, as a reader would say
 * them rather than as the module wrote them.
 *
 * A module writes `amountMinor: 15000, currency: "TRY"`, an id, a role key, a
 * list of permission names. A manager reading the log needs "₺150,00", a room,
 * "Front desk", "Post charges". Each known key is rendered for what it is; a
 * key this does not know is shown as itself, so a fact added by a writer later
 * is visible on the day rather than hidden.
 */

const MONEY = new Set([
  "amountMinor",
  "balanceMinor",
  "totalGrossMinor",
  "totalNetMinor",
  "grossPayMinor",
  "fromAmountMinor",
]);
const CHANGE = new Set(["from", "to"]);
const HOUSEKEEPING_STATUS = new Set(["status", "previousStatus"]);
const PERMISSIONS = new Set(["added", "removed", "permissions"]);
const DAYS = new Set([
  "startsOn",
  "endsOn",
  "plannedEndsOn",
  "fromStartsOn",
  "toStartsOn",
  "fromEndsOn",
  "toEndsOn",
  "leaveFrom",
  "leaveTo",
  "terminatedOn",
  "effectiveFrom",
  "businessDate",
  "servicedOn",
  "expectedBackOn",
  "rangeFrom",
  "rangeTo",
]);
const TIMES = new Set(["fromTime", "toTime"]);
const DAY = /^\d{4}-\d{2}-\d{2}/;
/** What the housekeeping module writes, as the Housekeeping screen says it. */
const ROOM_STATUSES = ["dirty", "clean", "inspected"] as const;
type RoomStatus = (typeof ROOM_STATUSES)[number];
const isRoomStatus = (value: unknown): value is RoomStatus =>
  (ROOM_STATUSES as readonly unknown[]).includes(value);

const DATASETS = [
  "residents_guests",
  "reservations_stays",
  "rooms_beds",
  "folios_payments",
  "audit_log",
] as const;
const isDataset = (value: unknown): value is (typeof DATASETS)[number] =>
  (DATASETS as readonly unknown[]).includes(value);
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "other"] as const;
const isPaymentMethod = (
  value: unknown,
): value is (typeof PAYMENT_METHODS)[number] =>
  (PAYMENT_METHODS as readonly unknown[]).includes(value);
const PRIORITIES = ["urgent", "this_week", "can_wait"] as const;
const isPriority = (value: unknown): value is (typeof PRIORITIES)[number] =>
  (PRIORITIES as readonly unknown[]).includes(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A configuration record names what changed and carries each setting as
 * `{ from, to }` (ADR 0036), so it reads as one row per setting rather than
 * as the raw objects — and its `currency` is a setting, not the unit of an
 * amount, which the generic path would hide.
 */
const CONFIGURED = new Set(["property.configured", "organization.configured"]);
const SETTINGS = [
  "name",
  "timezone",
  "currency",
  "businessDateCutoff",
] as const;
type Setting = (typeof SETTINGS)[number];
const isSetting = (value: unknown): value is Setting =>
  (SETTINGS as readonly unknown[]).includes(value);

/**
 * A brand change or reset names what changed and carries each as `{ from, to }`
 * (ADR 0046): a colour as `#rrggbb` or null, a logo as its hash and size or
 * null — never the bytes. It reads as one row per part.
 */
const BRANDED = new Set(["branding.changed", "branding.reset"]);
const BRAND_PARTS = ["color", "logo"] as const;
type BrandPart = (typeof BRAND_PARTS)[number];
const isBrandPart = (value: unknown): value is BrandPart =>
  (BRAND_PARTS as readonly unknown[]).includes(value);

interface LogoFact {
  hash: string;
  sizeBytes: number;
}

function logoFactOf(value: unknown): LogoFact | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const { hash, sizeBytes } = value as Partial<LogoFact>;
  return typeof hash === "string" && typeof sizeBytes === "number"
    ? { hash, sizeBytes }
    : undefined;
}

/**
 * A price list save carries `changes`: each kind of Unit with its price before
 * and after, either side null when there was none (ADR 0038). It reads as one
 * row per kind, "₺1.500,00 → ₺1.750,00", rather than as the objects.
 */
const PRICED_KINDS = ["room", "bed", "apartment", "suite"] as const;
type PricedKind = (typeof PRICED_KINDS)[number];
interface Price {
  amountMinor: number;
  currency: string;
}
interface PriceChange {
  unitType: PricedKind;
  from: Price | null;
  to: Price | null;
}

function priceOf(value: unknown): Price | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const { amountMinor, currency } = value as Partial<Price>;
  return typeof amountMinor === "number" && typeof currency === "string"
    ? { amountMinor, currency }
    : undefined;
}

function priceChangesOf(value: unknown): PriceChange[] | null {
  if (!Array.isArray(value)) return null;
  const changes: PriceChange[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const { unitType, from, to } = item as Record<string, unknown>;
    const before = priceOf(from);
    const after = priceOf(to);
    if (
      !(PRICED_KINDS as readonly unknown[]).includes(unitType) ||
      before === undefined ||
      after === undefined
    ) {
      return null;
    }
    changes.push({ unitType: unitType as PricedKind, from: before, to: after });
  }
  return changes;
}

function changeOf(value: unknown): { from: string; to: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const { from, to } = value as { from?: unknown; to?: unknown };
  return typeof from === "string" && typeof to === "string"
    ? { from, to }
    : null;
}

export function ContextFacts({
  action,
  context,
  locale,
  words,
}: {
  /** The action as the log reads it (`readAs`): what `from` and `to` mean depends on it. */
  action: string;
  context: Record<string, unknown>;
  locale: SupportedLocale;
  words: AuditWords;
}) {
  const t = useTranslations();
  const currency =
    typeof context.currency === "string" ? context.currency : undefined;
  const entries = Object.entries(context).filter(
    ([key]) => !HIDDEN_CONTEXT_KEYS.has(key),
  );

  const permission = (key: string) => {
    const known = asPermission(key);
    return known ? t(`staff.permissions.${known}`) : key;
  };

  function list(values: readonly unknown[], one: (value: unknown) => string) {
    return values.length === 0 ? t("auditNone") : values.map(one).join(", ");
  }

  function scalar(value: unknown): string {
    // A fact the record carries as nothing is "not set", which is what "no
    // departure before" means; "None" is for a list with nothing in it.
    if (value === null || value === undefined) return t("auditNotSet");
    if (typeof value === "boolean") return value ? t("auditYes") : t("auditNo");
    // An id is named; any other text is the text somebody wrote.
    if (typeof value === "string") {
      return UUID.test(value) ? words.name(value) : value;
    }
    if (typeof value === "number") return String(value);
    return JSON.stringify(value);
  }

  function render(key: string, value: unknown): ReactNode {
    const minor = MONEY.has(key) ? minorUnitsOf(value) : null;
    if (minor !== null && currency) {
      return formatMoney(shownAmount(action, minor), currency, locale);
    }
    if (TIMES.has(key) && typeof value === "string") return value.slice(0, 5);
    if (key === "format" && typeof value === "string") {
      return value.toUpperCase();
    }
    if (key === "bytes" && typeof value === "number") {
      return formatSize(value, locale);
    }
    if (key === "resourceTypes" && Array.isArray(value)) {
      return list(value, (item) =>
        isDataset(item) ? t(`dataExport.datasets.${item}`) : String(item),
      );
    }
    if (key === "paymentMethod" && isPaymentMethod(value)) {
      return t(`paymentMethods.${value}`);
    }
    if (key === "returnAs" && isRoomStatus(value)) {
      return t(`maintenance.returnAs.${value}`);
    }
    if (key === "priority" && isPriority(value)) {
      return t(`maintenance.priorities.${value}`);
    }
    // `from` and `to` are whatever the action changed: a role on a role
    // change, an inspection setting on that setting. `key` on a role record is
    // the role's own key, not a role to name.
    if (
      typeof value === "string" &&
      (key === "role" || (CHANGE.has(key) && action === "staff.role_changed"))
    ) {
      const authored = context[`${key}Authored`];
      return words.role(
        value,
        typeof authored === "boolean" ? authored : undefined,
      );
    }
    if (CHANGE.has(key) && action === "housekeeping.inspection_set") {
      if (value === "on") return t("housekeeping.on");
      if (value === "off") return t("housekeeping.off");
      if (value === "default") return t("auditInspectionFollowsOrganization");
    }
    // A room's status before and after it was marked. The writer records a
    // never-marked room's previous status as clean (app.unit_housekeeping_state,
    // 20260916003960); null is still named rather than shown as "None", for any
    // record that lacks it.
    if (
      HOUSEKEEPING_STATUS.has(key) &&
      action === "housekeeping.status_changed"
    ) {
      if (isRoomStatus(value)) return t(`housekeeping.${value}`);
      if (value === null) return t("housekeeping.notRecorded");
    }
    if (PERMISSIONS.has(key) && Array.isArray(value)) {
      return list(value, (item) => permission(String(item)));
    }
    // The words the HR screen already uses for a kind of contract.
    if (key === "contractType" && typeof value === "string") {
      return t(`hr.employees.contracts.${value as "full_time"}`);
    }
    if (DAYS.has(key) && typeof value === "string" && DAY.test(value)) {
      return formatDate(new Date(value.slice(0, 10)), locale, {
        timeZone: "UTC",
      });
    }
    if (Array.isArray(value)) return list(value, scalar);
    return scalar(value);
  }

  const changed =
    CONFIGURED.has(action) && Array.isArray(context.changed)
      ? context.changed.filter(isSetting)
      : null;
  const branded =
    BRANDED.has(action) && Array.isArray(context.changed)
      ? context.changed.filter(isBrandPart)
      : null;
  const brandValue = (part: BrandPart, value: unknown): string => {
    if (value === null) return t("branding.defaultTheme");
    if (part === "color") return scalar(value);
    const logo = logoFactOf(value);
    if (!logo) return scalar(value);
    const size = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      style: "unit",
      unit: "kilobyte",
    }).format(logo.sizeBytes / 1024);
    return `${logo.hash.slice(0, 12)} · ${size}`;
  };
  const maintenanceChanges =
    action === "maintenance_setting.changed"
      ? maintenanceSettingChanges(context.from, context.to)
      : null;
  const { settingName, settingWord } = useMaintenanceSettingWords();
  const priced =
    action === "price_list.changed" ? priceChangesOf(context.changes) : null;
  const price = (value: Price | null) =>
    value === null
      ? t("rates.noPrice")
      : formatMoney(value.amountMinor, value.currency, locale);

  return (
    <Table>
      <TableCaption className="sr-only">{t("context")}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("contextKey")}</TableHead>
          <TableHead>{t("contextValue")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {priced ? (
          priced.map((change) => (
            <TableRow key={change.unitType}>
              <TableCell className="text-muted-foreground">
                {t(`unitType.${change.unitType}`)}
              </TableCell>
              <TableCell className="break-words">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <bdi>{price(change.from)}</bdi>
                  <ArrowRight
                    aria-label={t("auditChangedTo")}
                    className="size-3.5 text-muted-foreground rtl:-scale-x-100"
                  />
                  <bdi>{price(change.to)}</bdi>
                </span>
              </TableCell>
            </TableRow>
          ))
        ) : maintenanceChanges ? (
          maintenanceChanges.map((change) => (
            <TableRow key={change.setting}>
              <TableCell className="text-muted-foreground">
                {settingName(change.setting)}
              </TableCell>
              <TableCell className="break-words">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <bdi>{settingWord(change.setting, change.from)}</bdi>
                  <ArrowRight
                    aria-label={t("auditChangedTo")}
                    className="size-3.5 text-muted-foreground rtl:-scale-x-100"
                  />
                  <bdi>{settingWord(change.setting, change.to)}</bdi>
                </span>
              </TableCell>
            </TableRow>
          ))
        ) : branded ? (
          branded.map((part) => {
            const change = context[part];
            const { from, to } =
              typeof change === "object" && change !== null
                ? (change as { from?: unknown; to?: unknown })
                : { from: undefined, to: undefined };
            return (
              <TableRow key={part}>
                <TableCell className="text-muted-foreground">
                  {t(`branding.${part}Title`)}
                </TableCell>
                <TableCell className="break-words">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <bdi>{brandValue(part, from ?? null)}</bdi>
                    <ArrowRight
                      aria-label={t("auditChangedTo")}
                      className="size-3.5 text-muted-foreground rtl:-scale-x-100"
                    />
                    <bdi>{brandValue(part, to ?? null)}</bdi>
                  </span>
                </TableCell>
              </TableRow>
            );
          })
        ) : changed ? (
          changed.map((setting) => {
            const change = changeOf(context[setting]);
            return (
              <TableRow key={setting}>
                <TableCell className="text-muted-foreground">
                  {t(`configuration.fields.${setting}`)}
                </TableCell>
                <TableCell className="break-words">
                  {change ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <bdi>{change.from}</bdi>
                      <ArrowRight
                        aria-label={t("auditChangedTo")}
                        className="size-3.5 text-muted-foreground rtl:-scale-x-100"
                      />
                      <bdi>{change.to}</bdi>
                    </span>
                  ) : (
                    scalar(context[setting])
                  )}
                </TableCell>
              </TableRow>
            );
          })
        ) : entries.length === 0 ? (
          <TableRow>
            <TableCell className="text-muted-foreground" colSpan={2}>
              {t("noContext")}
            </TableCell>
          </TableRow>
        ) : (
          entries.map(([key, value]) => (
            <TableRow key={key}>
              <TableCell className="text-muted-foreground">
                {isContextKey(key) ? (
                  t(`auditContext.${key}`)
                ) : (
                  <span className="font-mono text-step--1">{key}</span>
                )}
              </TableCell>
              <TableCell className="break-words">
                {render(key, value)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
