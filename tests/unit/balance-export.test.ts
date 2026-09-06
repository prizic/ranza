import { describe, expect, it } from "vitest";

import {
  balanceExportHeaders,
  buildBalanceExportCsv,
} from "../../packages/domain/src/balance-export";

describe("buildBalanceExportCsv", () => {
  it("keeps stable finance-history headers and UTF-8 values", () => {
    expect(balanceExportHeaders).toEqual([
      "account_id",
      "student_id",
      "student_name",
      "currency",
      "remaining_balance",
      "entry_id",
      "entry_type",
      "amount",
      "effective_date",
      "due_date",
      "reversal_of",
      "created_by",
      "created_at",
      "description",
    ]);
    expect(
      buildBalanceExportCsv([
        {
          account_id: "account-1",
          amount: "-100.00",
          created_at: "2026-09-06T09:30:00Z",
          created_by: "user-1",
          currency: "TRY",
          description: "Yanlış ücret, düzeltildi",
          due_date: "",
          effective_date: "2026-09-06",
          entry_id: "entry-2",
          entry_type: "reversal",
          remaining_balance: "0.00",
          reversal_of: "entry-1",
          student_id: "student-1",
          student_name: "Öğrenci شريف",
        },
      ]),
    ).toBe(
      `${balanceExportHeaders.join(",")}\r\naccount-1,student-1,Öğrenci شريف,TRY,0.00,entry-2,reversal,-100.00,2026-09-06,,entry-1,user-1,2026-09-06T09:30:00Z,"Yanlış ücret, düzeltildi"\r\n`,
    );
  });

  it("neutralizes spreadsheet formulas without changing finance values", () => {
    const csv = buildBalanceExportCsv([
      {
        account_id: "account-1",
        amount: "25.50",
        created_at: "2026-09-06T09:30:00Z",
        created_by: "user-1",
        currency: "TRY",
        description: '=HYPERLINK("https://invalid")',
        due_date: "2026-09-10",
        effective_date: "2026-09-06",
        entry_id: "entry-1",
        entry_type: "charge",
        remaining_balance: "25.50",
        reversal_of: "",
        student_id: "student-1",
        student_name: "+formula",
      },
    ]);

    expect(csv).toContain("'+formula");
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid"")"');
    expect(csv).toContain(",25.50,");
  });
});
