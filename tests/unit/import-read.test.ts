import { describe, expect, it } from "vitest";
import {
  IMPORT_LIMITS,
  IMPORT_LOCALES,
  ImportFileError,
  ROOM_COLUMNS,
  cellsByColumn,
  chosenMapping,
  matchColumns,
  readTable,
  stageRooms,
  templateRows,
  workbookOf,
} from "../../packages/ranza/imports/src";

/**
 * A file becomes rows of text whatever it was on disk (IMP-S1-17, IMP-S1-18,
 * IMP-S1-26). The workbooks here are written by the same writer the template
 * uses, so a template that stops reading back fails here first.
 */
const bytes = (text: string) => new TextEncoder().encode(text);

async function refusal(run: Promise<unknown>): Promise<string> {
  const error = await run.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  return error instanceof ImportFileError ? error.reason : "not refused";
}

describe("readTable", () => {
  it("IMP-S1-17: a semicolon-separated file with a byte order mark is read", async () => {
    const table = await readTable(
      bytes(
        '﻿Blok;Kat;Oda No;Kapasite\r\nA;1;101;4\r\n\r\n"B; batı";2;201;2\r\n',
      ),
      "odalar.csv",
    );
    expect(table.headers).toEqual(["Blok", "Kat", "Oda No", "Kapasite"]);
    expect(table.rows).toEqual([
      { number: 2, cells: ["A", "1", "101", "4"] },
      { number: 4, cells: ["B; batı", "2", "201", "2"] },
    ]);
  });

  it("IMP-S1-17: a comma-separated file and a Turkish code page are read too", async () => {
    const comma = await readTable(bytes("Room,Sleeps\n101,4\n"), "rooms.csv");
    expect(comma.rows[0]?.cells).toEqual(["101", "4"]);

    // "Tür;Kapasite" as Excel saves it in windows-1254: ü is 0xFC, not utf-8.
    const legacy = Uint8Array.from([
      0x54, 0xfc, 0x72, 0x3b, 0x4b, 0x61, 0x70, 0x0a, 0x4f, 0x64, 0x61, 0x3b,
      0x34,
    ]);
    expect((await readTable(legacy, "odalar.csv")).headers).toEqual([
      "Tür",
      "Kap",
    ]);
  });

  it("IMP-S1-17: a workbook's first sheet is read, and its numbers as a person typed them", async () => {
    const workbook = await workbookOf([
      ["Room", "Sleeps"],
      ["101", "4"],
    ]);
    const table = await readTable(workbook, "rooms.xlsx");
    expect(table.headers).toEqual(["Room", "Sleeps"]);
    expect(table.rows).toEqual([{ number: 2, cells: ["101", "4"] }]);
    expect(table.sheetsIgnored).toBe(0);
  });

  it("IMP-S1-18: an empty file, a header alone and an unrecognised header are each refused by name", async () => {
    expect(await refusal(readTable(bytes(""), "rooms.csv"))).toBe("empty");
    expect(await refusal(readTable(bytes("\n\n"), "rooms.csv"))).toBe("empty");
    expect(await refusal(readTable(bytes("Room;Sleeps\n"), "rooms.csv"))).toBe(
      "no_rows",
    );
    expect(await refusal(readTable(bytes("a,b\n1,2\n"), "rooms.pdf"))).toBe(
      "unsupported_type",
    );
    expect(
      await refusal(readTable(bytes("not a workbook"), "rooms.xlsx")),
    ).toBe("unreadable");

    const table = await readTable(
      bytes("Colour;Shape\nred;round\n"),
      "rooms.csv",
    );
    const { mapping } = matchColumns(table.headers, ROOM_COLUMNS);
    expect(() => cellsByColumn(table, mapping)).toThrow(ImportFileError);
  });

  it("IMP-S1-18: a file over the row limit is refused", async () => {
    const rows = Array.from(
      { length: IMPORT_LIMITS.rows + 1 },
      (_, index) => `${index + 1};2`,
    ).join("\n");
    expect(
      await refusal(readTable(bytes(`Room;Sleeps\n${rows}\n`), "rooms.csv")),
    ).toBe("too_many_rows");
    expect(
      await refusal(
        readTable(new Uint8Array(IMPORT_LIMITS.bytes + 1), "rooms.csv"),
      ),
    ).toBe("too_large");
  });
});

describe("matchColumns", () => {
  it("IMP-S1-17: headers are matched in Turkish, English and Arabic", () => {
    const headings: Record<string, string[]> = {
      tr: [
        "BLOK",
        "kat",
        "Oda  No.",
        "TÜR",
        "Kapasite",
        "Yatak Bazlı",
        "Kimler Kalabilir",
      ],
      en: [
        "building",
        "FLOOR",
        "Room",
        "type",
        "sleeps",
        "let by the bed",
        "Admits",
      ],
      ar: [
        "المبنى",
        "الطابق",
        "رقم الغرفة",
        "النوع",
        "السعة",
        "تأجير بالسرير",
        "لمن",
      ],
    };
    for (const headers of Object.values(headings)) {
      const { mapping, missing, unknown } = matchColumns(headers, ROOM_COLUMNS);
      expect(Object.values(mapping)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(missing).toEqual([]);
      expect(unknown).toEqual([]);
    }
  });

  it("IMP-S1-17: a column nobody recognises is offered for matching and otherwise ignored", () => {
    const headers = ["Oda", "Kaç kişilik", "Not"];
    const matched = matchColumns(headers, ROOM_COLUMNS);
    expect(matched.missing).toEqual(["sleeps"]);
    expect(matched.unknown).toEqual([
      { index: 1, heading: "Kaç kişilik" },
      { index: 2, heading: "Not" },
    ]);

    const chosen = chosenMapping(
      { ...matched.mapping, sleeps: 1, floor: 1, building: 9 },
      headers,
      ROOM_COLUMNS,
    );
    expect(chosen.missing).toEqual([]);
    // One file column feeds one key, and an index outside the file feeds none.
    expect(chosen.mapping).toMatchObject({
      sleeps: 1,
      floor: null,
      building: null,
    });
  });
});

describe("templateRows", () => {
  it("IMP-S1-26: the template in each language reads back as one ready row", async () => {
    for (const locale of IMPORT_LOCALES) {
      const workbook = await workbookOf(templateRows(ROOM_COLUMNS, locale));
      const table = await readTable(workbook, "template.xlsx");
      const { mapping, missing } = matchColumns(table.headers, ROOM_COLUMNS);
      expect(missing).toEqual([]);
      const staged = stageRooms(cellsByColumn(table, mapping), new Set(), {
        letByTheBed: false,
      });
      expect(staged.map((row) => [row.state, row.problems])).toEqual([
        ["ready", []],
      ]);
    }
  });
});
