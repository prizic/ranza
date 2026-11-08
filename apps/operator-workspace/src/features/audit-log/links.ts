import { localizeHref, type SupportedLocale } from "@ranza/i18n";

/**
 * Where a record's subject can be opened, when there is somewhere to open it.
 *
 * A booking opens on Reservations by its id, and a folio, a room or bed, a
 * Property, an Organization and a data export each have a screen that shows one
 * by id. The rest of the subjects have a screen of their own but none that
 * shows one alone, so they open the screen (audit 2026-11-07, C-02, C-03). A
 * stay is shown alone nowhere, so for it the log itself is the destination:
 * every record about it, and about the folios that belong with it (AUDIT-02).
 */
export interface SubjectReach {
  /** Which of the screens a subject can open the viewer may open at all. */
  finance: boolean;
  rooms: boolean;
  configuration: boolean;
  dataExport: boolean;
  reservations: boolean;
  closeDay: boolean;
  maintenance: boolean;
  hr: boolean;
  people: boolean;
  branding: boolean;
  integrations: boolean;
}

export function subjectHref(
  locale: SupportedLocale,
  propertyId: string,
  subjectType: string,
  subjectId: string,
  reach: SubjectReach,
): string | null {
  const here = (segment: string, query = "") =>
    `${localizeHref(locale, segment)}?property=${propertyId}${query}`;
  switch (subjectType) {
    case "folio":
      return reach.finance ? here("finance", `&folio=${subjectId}`) : null;
    case "accommodation_unit":
      return reach.rooms ? here("rooms", `&unit=${subjectId}`) : null;
    case "property":
    case "organization":
      return reach.configuration ? here("configuration") : null;
    case "data_export":
      return reach.dataExport
        ? here("data-export", `&show=${subjectId}`)
        : null;
    case "reservation":
      return reach.reservations
        ? here("reservations", `&open=${subjectId}`)
        : null;
    case "business_day_close":
      return reach.closeDay ? here("close-day") : null;
    case "maintenance_request":
    case "maintenance_equipment":
      return reach.maintenance ? here("maintenance") : null;
    case "employee":
    case "leave_request":
    case "payroll_run":
      return reach.hr ? here("hr") : null;
    case "membership":
    case "role":
      return reach.people ? here("people") : null;
    case "organization_brand":
      return reach.branding ? here("branding") : null;
    case "webhook_endpoint":
    case "failed_operation":
      return reach.integrations ? here("integrations") : null;
    default:
      return null;
  }
}

/** The log narrowed to everything about one subject. */
export function historyHref(
  locale: SupportedLocale,
  propertyId: string,
  subjectId: string,
): string {
  return `${localizeHref(locale, "audit-log")}?property=${propertyId}&subject=${subjectId}`;
}
