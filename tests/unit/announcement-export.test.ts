// @vitest-environment node
import { expect, it } from "vitest";
import { announcementFollowupCsv } from "../../packages/domain/src/announcement-export";
it("exports quoted, formula-safe follow-up rows with explicit acknowledgment times", () => {
  const csv = announcementFollowupCsv([
    {
      student_id: "id",
      display_name: '=HYPERLINK("bad")',
      status: "unacknowledged",
      resolved_at: "2026-09-06T00:00:00Z",
      acknowledged_at: null,
    },
  ]);
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"unacknowledged","2026-09-06T00:00:00Z",""');
});
