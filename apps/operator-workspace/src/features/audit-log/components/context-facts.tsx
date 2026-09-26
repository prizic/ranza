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

const CONTEXT_KEYS = [
  "amountMinor",
  "balanceMinor",
  "description",
  "lineId",
  "reversedLineId",
  "reversalLineId",
  "stayId",
  "folioId",
  "accommodationUnitId",
  "guestId",
  "guestCreated",
  "startsOn",
  "endsOn",
  "from",
  "to",
  "role",
  "added",
  "removed",
  "permissions",
  "propertyIds",
  "properties",
  "propertyId",
  "userId",
  "name",
  "names",
  "key",
  "holders",
  "unitIds",
  "unitType",
  "capacity",
  "building",
  "floor",
  "letByTheBed",
  "hadBeenBlockedFor",
  "status",
  "previousStatus",
] as const;

type ContextKey = (typeof CONTEXT_KEYS)[number];

function isContextKey(key: string): key is ContextKey {
  return (CONTEXT_KEYS as readonly string[]).includes(key);
}

/** Folded into the fact beside it rather than shown on a row of its own. */
const HIDDEN = new Set([
  "currency",
  "roleAuthored",
  "fromAuthored",
  "toAuthored",
]);
const MONEY = new Set(["amountMinor", "balanceMinor"]);
const CHANGE = new Set(["from", "to"]);
const HOUSEKEEPING_STATUS = new Set(["status", "previousStatus"]);
const PERMISSIONS = new Set(["added", "removed", "permissions"]);
const DAYS = new Set(["startsOn", "endsOn"]);
const DAY = /^\d{4}-\d{2}-\d{2}/;
/** What the housekeeping module writes, as the Housekeeping screen says it. */
const ROOM_STATUSES = ["dirty", "clean", "inspected"] as const;
type RoomStatus = (typeof ROOM_STATUSES)[number];
const isRoomStatus = (value: unknown): value is RoomStatus =>
  (ROOM_STATUSES as readonly unknown[]).includes(value);

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
  const entries = Object.entries(context).filter(([key]) => !HIDDEN.has(key));

  const permission = (key: string) => {
    const known = asPermission(key);
    return known ? t(`staff.permissions.${known}`) : key;
  };

  function list(values: readonly unknown[], one: (value: unknown) => string) {
    return values.length === 0 ? t("auditNone") : values.map(one).join(", ");
  }

  function scalar(value: unknown): string {
    if (value === null || value === undefined) return t("auditNone");
    if (typeof value === "boolean") return value ? t("auditYes") : t("auditNo");
    // An id is named; any other text is the text somebody wrote.
    if (typeof value === "string") {
      return UUID.test(value) ? words.name(value) : value;
    }
    if (typeof value === "number") return String(value);
    return JSON.stringify(value);
  }

  function render(key: string, value: unknown): ReactNode {
    if (MONEY.has(key) && typeof value === "number" && currency) {
      return formatMoney(value, currency, locale);
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

  return (
    <Table>
      <TableCaption>{t("context")}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("contextKey")}</TableHead>
          <TableHead>{t("contextValue")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changed ? (
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
