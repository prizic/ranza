"use client";

import { useTranslations } from "next-intl";
import type { AuditEntry, AuditNames } from "@ranza/core";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
// The staff feature's, reached across: the log names roles exactly as the
// roster does. By ADR 0013 a second caller moves it to `src/lib/`; that waits
// for the branches editing it in flight to land, rather than conflicting them.
import { asShippedRole } from "../staff/labels";
import {
  isKnownAction,
  isKnownSubject,
  isMoveReasonKind,
  readAs,
  shortId,
} from "./actions";

/** The year an instant falls in on a clock, as `YYYY`. */
function yearOf(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(
    at,
  );
}

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
  /** The year the reader is in: a time in it needs no year (DATA-06). */
  currentYear?: string,
): string {
  return formatDate(at, locale, {
    ...(currentYear !== undefined && yearOf(at, timeZone) === currentYear
      ? { year: undefined }
      : {}),
    hour: "2-digit",
    // 24-hour in every language, as everywhere else in the product.
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * What a zone is called when no Property is a good name for its clock: "Turkey
 * Time", in the reader's language and script, where the zone's id would put
 * "Europe/Istanbul" inside an Arabic header (DATA-08).
 */
export function zoneName(locale: SupportedLocale, timeZone: string): string {
  const named = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "longGeneric",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName");
  return named?.value ?? timeZone;
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

  /** "Demo Hotel time": whose clock a time is on, in words (DATA-08). */
  const clockOf = (place: string) => t("auditClockOf", { place });

  const where = (entry: Pick<AuditEntry, "propertyName" | "locationId">) =>
    entry.propertyName ??
    (entry.locationId ? shortId(entry.locationId) : t("auditOrganizationWide"));

  /**
   * The reason a record carries, in words. A Guest's move is recorded as
   * `guest_request: <note>`, the kind in front of the note, and records are
   * never rewritten, so the kind is turned into the words the move dialog gave
   * it here (DATA-05). The kind is also a fact of the record (`reasonKind`),
   * and only a prefix that is that fact is read as one: a note that happens to
   * begin with a word is the note.
   */
  const reason = (
    entry: Pick<AuditEntry, "action" | "subjectType" | "reason" | "context">,
  ): string | null => {
    const text = entry.reason;
    if (!text) return null;
    const kind = entry.context?.reasonKind;
    if (readAs(entry.action, entry.subjectType) !== "stay.moved") return text;
    if (!isMoveReasonKind(kind)) return text;
    if (text === kind) return t(`moveReason.${kind}`);
    if (!text.startsWith(`${kind}: `)) return text;
    const note = text.slice(kind.length + 2);
    return kind === "other" ? note : `${t(`moveReason.${kind}`)}: ${note}`;
  };

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

  return { action, actor, clockOf, name, reason, role, subjectType, where };
}

export type AuditWords = ReturnType<typeof useAuditWords>;
