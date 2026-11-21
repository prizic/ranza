import { describe, expect, it } from "vitest";
import {
  PEOPLE_COLUMNS,
  bookingOf,
  cellsByColumn,
  matchColumns,
  readDay,
  readPerson,
  stagePeople,
  templateRows,
  type PlaceOnFile,
} from "../../packages/ranza/imports/src";

/**
 * A row of people is checked before anybody is booked (IMP-S2-*). The booking
 * command decides again when the row is imported; this names the cell to fix.
 */
const TODAY = "2026-11-21";

const row = (cells: Record<string, string>) => ({
  fullName: "Elif Yılmaz",
  email: "",
  phone: "",
  gender: "",
  documentType: "",
  documentNumber: "",
  dateOfBirth: "",
  institution: "",
  guardianName: "",
  guardianPhone: "",
  building: "",
  room: "101",
  bed: "A",
  firstNight: "01.09.2026",
  leaving: "",
  stayType: "",
  ...cells,
});

const problemsOf = (cells: Record<string, string>) =>
  readPerson(row(cells), { residentByDefault: true }).problems;

/** A women's room 101 with beds A and B, a room 102 let whole, and bed 101/B taken. */
const PLACES: PlaceOnFile[] = [
  { unitId: "u-101a", room: "101", bed: "A", admits: "female" },
  { unitId: "u-101b", room: "101", bed: "B", admits: "female" },
  { unitId: "u-102", room: "102", bed: null, admits: null },
];
const taken = (startsOn: string) =>
  new Set(startsOn <= "2026-12-31" ? ["u-101b"] : []);

const stage = (...rows: Record<string, string>[]) =>
  stagePeople(
    rows.map((cells, index) => ({ rowNumber: index + 2, cells: row(cells) })),
    { today: TODAY, places: PLACES, taken, residentByDefault: true },
  );

describe("readDay", () => {
  it("IMP-S2-06: a day-first and an ISO date are read", () => {
    expect(readDay("31.12.2026")).toEqual({ day: "2026-12-31" });
    expect(readDay("1.4.2026")).toEqual({ day: "2026-04-01" });
    expect(readDay("2026-12-31")).toEqual({ day: "2026-12-31" });
    // A spreadsheet's own date cell arrives as ISO from the reader.
    expect(readDay("2026-09-01")).toEqual({ day: "2026-09-01" });
    // A day past twelve says which part is the day.
    expect(readDay("31/12/2026")).toEqual({ day: "2026-12-31" });
  });

  it("IMP-S2-06: an ambiguous date is wrong", () => {
    expect(readDay("03/04/2026")).toEqual({ problem: "ambiguous_date" });
    expect(readDay("31.02.2026")).toEqual({ problem: "not_a_date" });
    expect(readDay("next week")).toEqual({ problem: "not_a_date" });
    expect(problemsOf({ firstNight: "03/04/2026" })).toEqual([
      { column: "firstNight", code: "ambiguous_date" },
    ]);
  });
});

describe("readPerson", () => {
  it("IMP-S2-06: each wrong cell of a person row is named with its column", () => {
    expect(problemsOf({ fullName: "" })).toEqual([
      { column: "fullName", code: "required" },
    ]);
    expect(problemsOf({ room: "" })).toEqual([
      { column: "room", code: "required" },
    ]);
    expect(problemsOf({ firstNight: "" })).toEqual([
      { column: "firstNight", code: "required" },
    ]);
    expect(problemsOf({ gender: "sometimes" })).toEqual([
      { column: "gender", code: "unknown_gender" },
    ]);
    expect(problemsOf({ email: "elif at example" })).toEqual([
      { column: "email", code: "not_an_email" },
    ]);
    expect(
      problemsOf({ firstNight: "01.09.2026", leaving: "01.08.2026" }),
    ).toEqual([{ column: "leaving", code: "leaving_before_first_night" }]);
    expect(problemsOf({ stayType: "tourist" })).toEqual([
      { column: "stayType", code: "unknown_stay_type" },
    ]);
    expect(problemsOf({ stayType: "Guest" })).toEqual([
      { column: "leaving", code: "leaving_required" },
    ]);
  });

  it("IMP-S2-06: an identity number is read with its kind, and a kimlik number is checked", () => {
    const valid = "10000000146";
    expect(
      readPerson(row({ documentNumber: valid }), { residentByDefault: true })
        .person?.particulars,
    ).toMatchObject({ documentType: "tc_kimlik", documentNumber: valid });
    expect(problemsOf({ documentNumber: "12345678901" })).toEqual([
      { column: "documentNumber", code: "invalid_tc_kimlik" },
    ]);
    expect(problemsOf({ documentNumber: "U1234567" })).toEqual([
      { column: "documentType", code: "document_type_required" },
    ]);
    expect(
      problemsOf({ documentType: "Pasaport", documentNumber: "U1234567" }),
    ).toEqual([]);
  });

  it("IMP-S2-01: an empty stay type is a Resident where the Property is a dormitory, and a Guest elsewhere", () => {
    const at = (residentByDefault: boolean, cells: Record<string, string>) =>
      readPerson(row(cells), { residentByDefault }).person?.stayType;
    expect(at(true, {})).toBe("resident");
    expect(at(false, { leaving: "05.09.2026" })).toBe("guest");
    expect(at(false, { stayType: "Öğrenci" })).toBe("resident");
  });
});

describe("stagePeople", () => {
  it("IMP-S2-01: a row naming a bed that is free and admits the person is ready", () => {
    expect(stage({ gender: "Kadın" })).toEqual([
      expect.objectContaining({ rowNumber: 2, state: "ready", problems: [] }),
    ]);
    expect(stage({ room: "102", bed: "" })[0]?.state).toBe("ready");
  });

  it("IMP-S2-04: a person the room does not admit is a wrong row", () => {
    expect(stage({ gender: "Erkek" })[0]?.problems).toEqual([
      { column: "gender", code: "not_admitted" },
    ]);
    expect(stage({ gender: "" })[0]?.problems).toEqual([
      { column: "gender", code: "gender_required" },
    ]);
  });

  it("IMP-S2-03: a bed already promised over those nights is wrong at the preview", () => {
    expect(stage({ gender: "Kadın", bed: "B" })[0]?.problems).toEqual([
      { column: "bed", code: "bed_taken" },
    ]);
  });

  it("IMP-S2-01: a room or bed the Property does not have is named", () => {
    expect(stage({ room: "999" })[0]?.problems).toEqual([
      { column: "room", code: "no_such_room" },
    ]);
    expect(stage({ gender: "Kadın", bed: "" })[0]?.problems).toEqual([
      { column: "bed", code: "bed_required" },
    ]);
    expect(stage({ gender: "Kadın", bed: "Z" })[0]?.problems).toEqual([
      { column: "bed", code: "no_such_bed" },
    ]);
    expect(stage({ room: "102", bed: "A" })[0]?.problems).toEqual([
      { column: "bed", code: "no_such_bed" },
    ]);
  });

  it("IMP-S2-02: one identity number twice in a file is a duplicate", () => {
    const valid = "10000000146";
    const [first, second] = stage(
      { gender: "Kadın", documentNumber: valid },
      { room: "102", bed: "", documentNumber: valid },
    );
    expect(first?.state).toBe("ready");
    expect(second?.problems).toEqual([
      { column: "documentNumber", code: "duplicate_in_file" },
    ]);
  });

  it("IMP-S2-03: one bed twice in a file is a duplicate", () => {
    const [, second] = stage(
      { gender: "Kadın" },
      { fullName: "Ayşe Kaya", gender: "Kadın" },
    );
    expect(second?.problems).toEqual([
      { column: "bed", code: "bed_twice_in_file" },
    ]);
  });

  it("IMP-S2-05: somebody who has already left is not booked", () => {
    expect(
      stage({
        gender: "Kadın",
        firstNight: "01.09.2026",
        leaving: "21.11.2026",
      })[0]?.problems,
    ).toEqual([{ column: "leaving", code: "already_left" }]);
  });
});

describe("bookingOf", () => {
  const person = (firstNight: string, leaving = "") =>
    readPerson(row({ firstNight, leaving }), { residentByDefault: true })
      .person!;

  it("IMP-S2-05: a row begun before the Property's today is booked from today and checked in", () => {
    expect(bookingOf(person("01.09.2026", "30.06.2027"), TODAY)).toEqual({
      startsOn: TODAY,
      endsOn: "2027-06-30",
      checkInNow: true,
    });
  });

  it("IMP-S2-05: a row begun today or later is a booking only", () => {
    expect(bookingOf(person("21.11.2026"), TODAY)).toEqual({
      startsOn: TODAY,
      endsOn: null,
      checkInNow: false,
    });
    expect(bookingOf(person("01.02.2027"), TODAY)).toEqual({
      startsOn: "2027-02-01",
      endsOn: null,
      checkInNow: false,
    });
  });
});

describe("the people template", () => {
  it("IMP-S2-06: the template in each language reads back as one ready person", () => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const [headers, example] = templateRows(PEOPLE_COLUMNS, locale);
      const table = {
        headers: headers!,
        rows: [{ number: 2, cells: example! }],
        sheetsIgnored: 0,
      };
      const match = matchColumns(table.headers, PEOPLE_COLUMNS);
      expect(match.missing).toEqual([]);
      const [cells] = cellsByColumn(table, match.mapping);
      expect(
        readPerson(cells!.cells, { residentByDefault: true }).problems,
      ).toEqual([]);
    }
  });
});
