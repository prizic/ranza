"use client";

import { useTranslations } from "next-intl";
import type { AuditEntry, AuditNames } from "@ranza/core";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
// The staff feature's, reached across: the log names roles exactly as the
// roster does. By ADR 0013 a second caller moves it to `src/lib/`; that waits
// for the branches editing it in flight to land, rather than conflicting them.
import { asShippedRole } from "../staff/labels";
import { isKnownAction, isKnownSubject, readAs, shortId } from "./actions";

/**
 * An instant, shown as a Property's wall clock.
 *
 * A record is stamped in UTC and read from anywhere; the time that means
 * something is the one on the clock above the front desk where it happened.
 * The machine-readable instant stays on the element for whoever needs the
 * exact moment.
 */
export function whenLabel(
  at: Date,
  locale: SupportedLocale,
  timeZone: string,
): string {
  return formatDate(at, locale, {
    hour: "2-digit",
    // 24-hour in every language, as everywhere else in the product.
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * What the log calls each thing on a record, in the reader's language.
 *
 * The ids are named by the server (`AuditNames`), as far as the viewer may see
 * them; anything it could not name — a Guest the viewer may not read, an id
 * from before a rename — is shown by its first eight characters rather than
 * left blank, so a record never reads as though nobody did it.
 */
export function useAuditWords(names: AuditNames, viewerId: string) {
  const t = useTranslations();

  const name = (id: string): string => names.labels[id] ?? shortId(id);

  const action = (entry: Pick<AuditEntry, "action" | "subjectType">) => {
    const read = readAs(entry.action, entry.subjectType);
    return isKnownAction(read) ? t(`auditAction.${read}`) : read;
  };

  const subjectType = (type: string) =>
    isKnownSubject(type) ? t(`auditSubject.${type}`) : type;

  const actor = (actorId: string) =>
    actorId === viewerId ? t("you") : name(actorId);

  const where = (entry: Pick<AuditEntry, "propertyName" | "locationId">) =>
    entry.propertyName ??
    (entry.locationId ? shortId(entry.locationId) : t("auditOrganizationWide"));

  /**
   * A role, by name. `authored` is what the record says the key was — an
   * Organization's own "Front desk" has the shipped one's key — and records
   * written before it was kept say nothing, so they read shipped first.
   */
  const role = (key: string, authored?: boolean) => {
    if (authored === true) return names.roles[key] ?? key;
    const shipped = asShippedRole(key);
    return shipped ? t(`staff.roles.${shipped}`) : (names.roles[key] ?? key);
  };

  return { action, actor, name, role, subjectType, where };
}

export type AuditWords = ReturnType<typeof useAuditWords>;
