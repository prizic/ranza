"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
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
] as const;

type ContextKey = (typeof CONTEXT_KEYS)[number];

function isContextKey(key: string): key is ContextKey {
  return (CONTEXT_KEYS as readonly string[]).includes(key);
}

/** Folded into the amount beside it rather than shown on a row of its own. */
const HIDDEN = new Set(["currency"]);
const MONEY = new Set(["amountMinor", "balanceMinor"]);
const ROLES = new Set(["from", "to", "role"]);
const PERMISSIONS = new Set(["added", "removed", "permissions"]);
const DAYS = new Set(["startsOn", "endsOn"]);
const DAY = /^\d{4}-\d{2}-\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ContextFacts({
  context,
  locale,
  subjectType,
  words,
}: {
  context: Record<string, unknown>;
  locale: SupportedLocale;
  subjectType: string;
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
    // A role key is a role only on a role change or an invitation; `key` on a
    // role record is the role's own, and `from`/`to` mean nothing else yet.
    if (
      ROLES.has(key) &&
      typeof value === "string" &&
      (subjectType === "membership" || key === "role")
    ) {
      return words.role(value);
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
        {entries.length === 0 ? (
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
