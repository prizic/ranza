import { describe, expect, it } from "vitest";

import {
  buildAttendanceStudentCsv,
  buildAttendanceTotalsCsv,
} from "../../packages/domain/src/attendance-export";

describe("Attendance export CSV", () => {
  it("uses stable UTF-8 columns and escapes names and reasons", () => {
    expect(
      buildAttendanceStudentCsv([
        {
          corrected: true,
          correctionReason: 'Veli, "geç gelecek" dedi',
          cutoffStatus: "unconfirmed",
          effectiveStatus: "staying",
          studentAccessId: "rz-001",
          studentName: "Ayşe العربية",
        },
      ]),
    ).toBe(
      "student_access_id,student_name,cutoff_status,effective_status,corrected,correction_reason\r\n" +
        'rz-001,Ayşe العربية,unconfirmed,staying,true,"Veli, ""geç gelecek"" dedi"\r\n',
    );
  });

  it("emits one stable totals row", () => {
    expect(
      buildAttendanceTotalsCsv({
        correctedStudents: 1,
        cutoffAway: 1,
        cutoffStaying: 2,
        cutoffUnconfirmed: 1,
        effectiveAway: 1,
        effectiveStaying: 3,
        effectiveUnconfirmed: 0,
        eligibleStudents: 4,
      }),
    ).toContain("4,2,1,1,3,1,0,1\r\n");
  });
});
