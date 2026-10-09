/**
 * The parts of exporting that are decided without a database (EXP-S1-*).
 *
 * What a request may say, who may have a file and what the worker reads for
 * whom are the database's answers and are proved against it in
 * `tests/database/data_export.test.sql` and `tests/integration/data-export.test.ts`.
 * What is left is the file itself — a pure function of rows — and the names
 * the module gives things, where a slip is quiet: a cell that runs as a formula,
 * an address printed whole, a reason the worker reads wrong.
 */
import { describe, expect, it } from "vitest";
import {
  csvCell,
  EXPORT_FAILURE_REASONS,
  EXPORT_RESOURCE_TYPES,
  ExportTooLargeError,
  failureReasonOf,
  renderCsv,
  renderJson,
  requesterLabel,
} from "../../packages/ranza/data-export/src";

describe("a CSV cell", () => {
  it("EXP-S1-41: is written as text when it would run as a formula", () => {
    for (const trigger of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(trigger)).toMatch(/^"?'/);
    }
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it("EXP-S1-41: leaves a number alone, a reversal's sign included", () => {
    expect(csvCell(-5000)).toBe("-5000");
    expect(csvCell(12000n)).toBe("12000");
    expect(csvCell(-5000n)).toBe("-5000");
  });

  it("EXP-S1-41: quotes what a CSV needs quoted and nothing else", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("Şule Çelik")).toBe("Şule Çelik");
  });

  it("EXP-S1-41: writes nothing for nothing, and ISO text for an instant", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(new Date("2026-10-09T10:00:00.000Z"))).toBe(
      "2026-10-09T10:00:00.000Z",
    );
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe("a CSV file", () => {
  const guests = {
    key: "residents_guests",
    columns: ["id", "full_name"],
    rows: [{ id: "g1", full_name: "=cmd|' /C calc'!A0" }],
  };
  const rooms = { key: "rooms_beds", columns: ["id", "name"], rows: [] };

  it("EXP-S1-43: one dataset is a plain CSV, behind a byte-order mark", () => {
    expect(renderCsv([guests])).toBe(
      "\uFEFFid,full_name\r\ng1,'=cmd|' /C calc'!A0\r\n",
    );
  });

  it("EXP-S1-43: several are sections under their names, and an empty one keeps its header", () => {
    expect(renderCsv([guests, rooms])).toBe(
      "\uFEFF# dataset: residents_guests\r\nid,full_name\r\ng1,'=cmd|' /C calc'!A0" +
        "\r\n\r\n# dataset: rooms_beds\r\nid,name\r\n",
    );
  });
});

describe("a JSON file", () => {
  it("EXP-S1-42: is an object of arrays, with numbers for amounts and nulls for nothing", () => {
    const json = renderJson([
      {
        key: "folios_payments",
        columns: ["line_id", "amount_minor", "posted_at", "context"],
        rows: [
          {
            line_id: "l1",
            amount_minor: -4000n,
            posted_at: new Date("2026-10-09T10:00:00.000Z"),
            context: { reason: "x" },
          },
          { line_id: null },
        ],
      },
    ]);
    expect(JSON.parse(json)).toEqual({
      folios_payments: [
        {
          line_id: "l1",
          amount_minor: -4000,
          posted_at: "2026-10-09T10:00:00.000Z",
          context: { reason: "x" },
        },
        { line_id: null, amount_minor: null, posted_at: null, context: null },
      ],
    });
  });

  it("EXP-S1-42: keeps an amount too large for a number as its digits", () => {
    const big = 2n ** 60n;
    expect(JSON.parse(renderJson([{ key: "k", columns: ["a"], rows: [{ a: big }] }]))).toEqual({
      k: [{ a: big.toString() }],
    });
  });
});

describe("the name an export records", () => {
  it("EXP-S1-09: is the name they signed up with when there is one", () => {
    expect(requesterLabel("Dilara Yılmaz", "dilara@hotel.example")).toBe(
      "Dilara Yılmaz",
    );
  });

  it("EXP-S1-09: is the address cut to its local part when there is none", () => {
    expect(requesterLabel(null, "dilara@hotel.example")).toBe("dilara@***");
    expect(requesterLabel("   ", "dilara@hotel.example")).toBe("dilara@***");
  });

  it("EXP-S1-09: never prints an address, even as the name", () => {
    expect(requesterLabel("dilara@hotel.example", "other@x.example")).toBe(
      "dilara@***",
    );
    expect(requesterLabel("a name with an @ in it", "x@y.example")).not.toContain(
      "y.example",
    );
  });

  it("EXP-S1-09: strips control characters, as the database does", () => {
    expect(requesterLabel("Dil\tara\n", "x@y.example")).toBe("Dilara");
  });
});

describe("why an export failed", () => {
  it("EXP-S1-30: names a requester who may no longer export as that, from the refusal the database raises", () => {
    expect(
      failureReasonOf(
        new Error("ERROR: export_refused:requester_not_permitted"),
      ),
    ).toBe("requester_not_permitted");
  });

  it("EXP-S1-30: names a dataset or file that is too large as that", () => {
    expect(failureReasonOf(new ExportTooLargeError("audit_log"))).toBe(
      "too_large",
    );
    expect(
      failureReasonOf(
        new Error('violates check constraint "data_exports_file_is_bounded"'),
      ),
    ).toBe("too_large");
  });

  it("EXP-S1-30: records anything else as internal, whatever it said", () => {
    expect(failureReasonOf(new Error("connection terminated: secret"))).toBe(
      "internal_error",
    );
    expect(failureReasonOf("a string")).toBe("internal_error");
  });

  it("EXP-S1-30: only ever answers with a reason the database accepts", () => {
    for (const error of [
      new Error("x"),
      new ExportTooLargeError("x"),
      new Error("export_refused:requester_not_permitted"),
    ]) {
      expect(EXPORT_FAILURE_REASONS).toContain(failureReasonOf(error));
    }
  });
});

describe("the datasets", () => {
  it("EXP-S1-35: are the five the database holds in its check constraint", () => {
    expect([...EXPORT_RESOURCE_TYPES]).toEqual([
      "residents_guests",
      "reservations_stays",
      "rooms_beds",
      "folios_payments",
      "audit_log",
    ]);
  });
});
