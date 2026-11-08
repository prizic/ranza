/**
 * Where a record's subject opens (audit 2026-11-07, C-02, C-03): every subject
 * with a screen of its own leads there, only where the viewer may open it, and
 * a stay, which no screen shows alone, leads nowhere from here.
 */
import { describe, expect, it } from "vitest";
import {
  subjectHref,
  type SubjectReach,
} from "../../apps/operator-workspace/src/features/audit-log/links";
import { KNOWN_SUBJECTS } from "../../apps/operator-workspace/src/features/audit-log/actions";

const PROPERTY = "p1";
const ID = "s1";
const ALL: SubjectReach = {
  finance: true,
  rooms: true,
  configuration: true,
  dataExport: true,
  reservations: true,
  closeDay: true,
  maintenance: true,
  hr: true,
  people: true,
  branding: true,
  integrations: true,
};
const NONE = Object.fromEntries(
  Object.keys(ALL).map((key) => [key, false]),
) as unknown as SubjectReach;

const OPENS: Record<string, string> = {
  folio: "/en/finance?property=p1&folio=s1",
  accommodation_unit: "/en/rooms?property=p1&unit=s1",
  property: "/en/configuration?property=p1",
  organization: "/en/configuration?property=p1",
  data_export: "/en/data-export?property=p1&show=s1",
  reservation: "/en/reservations?property=p1&open=s1",
  business_day_close: "/en/close-day?property=p1",
  maintenance_request: "/en/maintenance?property=p1",
  maintenance_equipment: "/en/maintenance?property=p1",
  employee: "/en/hr?property=p1",
  leave_request: "/en/hr?property=p1",
  payroll_run: "/en/hr?property=p1",
  membership: "/en/people?property=p1",
  role: "/en/people?property=p1",
  organization_brand: "/en/branding?property=p1",
  webhook_endpoint: "/en/integrations?property=p1",
  failed_operation: "/en/integrations?property=p1",
};
// Subjects that open nowhere from the log, each for a reason.
const OPENS_NOWHERE = ["stay", "attendance_leave", "payment_plan"];

describe("a record's subject opens where it lives", () => {
  it("C-03: every known subject either opens a screen or is listed as opening none", () => {
    for (const subject of KNOWN_SUBJECTS) {
      expect(
        subject in OPENS || OPENS_NOWHERE.includes(subject),
        `${subject} is neither mapped nor listed as opening nowhere`,
      ).toBe(true);
    }
  });

  it.each(Object.entries(OPENS))("C-03: %s opens %s", (type, href) => {
    expect(subjectHref("en", PROPERTY, type, ID, ALL)).toBe(href);
  });

  it.each(Object.keys(OPENS))(
    "C-03: %s is not a link where the viewer cannot open its screen",
    (type) => {
      expect(subjectHref("en", PROPERTY, type, ID, NONE)).toBeNull();
    },
  );

  it.each(OPENS_NOWHERE)("%s opens nowhere from the log", (type) => {
    expect(subjectHref("en", PROPERTY, type, ID, ALL)).toBeNull();
  });
});
