import {
  BEDS_PER_ROOM,
  BUILDING_NAME,
  FLOOR,
  ROOM_NUMBER,
  UNIT_CAPACITY,
  type NewUnits,
} from "@ranza/accommodation";
import type { Gender } from "@ranza/core";
import { normalizeHeading } from "./columns";
import type { ColumnSpec, RowProblem, StagedRow } from "./contracts";

/**
 * A file of rooms (IMP-S1-19 to IMP-S1-22).
 *
 * One row is one room. What it may hold is accommodation's to say, so every
 * bound here is that module's own constant and the command decides again when
 * the row is imported; this only tells a person which cell to fix before they
 * press the button. A room number is digits and the building is its own
 * column, as on the Rooms screen (IMP-DEF-05).
 */
export const ROOM_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "building",
    required: false,
    headers: { tr: "Blok", en: "Building", ar: "المبنى" },
    aliases: ["bina", "block", "blokadi"],
    example: { tr: "A", en: "A", ar: "A" },
  },
  {
    key: "floor",
    required: false,
    headers: { tr: "Kat", en: "Floor", ar: "الطابق" },
    aliases: ["katno", "level"],
    example: { tr: "1", en: "1", ar: "1" },
  },
  {
    key: "room",
    required: true,
    headers: { tr: "Oda No", en: "Room", ar: "رقم الغرفة" },
    aliases: ["oda", "odanumarasi", "roomnumber", "roomno", "number", "no"],
    example: { tr: "101", en: "101", ar: "101" },
  },
  {
    key: "type",
    required: false,
    headers: { tr: "Tür", en: "Type", ar: "النوع" },
    aliases: ["tip", "odatipi", "odaturu", "unittype", "roomtype"],
    example: { tr: "Oda", en: "Room", ar: "غرفة" },
  },
  {
    key: "sleeps",
    required: true,
    headers: { tr: "Kapasite", en: "Sleeps", ar: "السعة" },
    aliases: ["capacity", "kisisayisi", "yataksayisi", "beds", "yatak"],
    example: { tr: "4", en: "4", ar: "4" },
  },
  {
    key: "byBed",
    required: false,
    headers: { tr: "Yatak bazlı", en: "Let by the bed", ar: "تأجير بالسرير" },
    aliases: ["bybed", "perbed", "yatakbazinda"],
    example: { tr: "Evet", en: "Yes", ar: "نعم" },
  },
  {
    key: "admits",
    required: false,
    headers: { tr: "Kimler kalabilir", en: "Admits", ar: "لمن" },
    aliases: ["cinsiyet", "gender", "kimler"],
    example: { tr: "Kadın", en: "Women", ar: "نساء" },
  },
];

const words = (...values: string[]) => new Set(values.map(normalizeHeading));

const YES = words("yes", "y", "true", "1", "evet", "e", "var", "نعم");
const NO = words("no", "n", "false", "0", "hayır", "h", "yok", "لا");

const WOMEN = words(
  "women",
  "woman",
  "female",
  "f",
  "girls",
  "kadın",
  "kız",
  "k",
  "bayan",
  "نساء",
  "إناث",
  "أنثى",
  "بنات",
);
const MEN = words(
  "men",
  "man",
  "male",
  "m",
  "boys",
  "erkek",
  "bay",
  "رجال",
  "ذكور",
  "ذكر",
  "أولاد",
);
const ANYONE = words(
  "anyone",
  "any",
  "all",
  "mixed",
  "herkes",
  "karma",
  "الجميع",
  "مختلط",
);

const TYPES: readonly [NewUnits["unitType"], Set<string>][] = [
  ["room", words("room", "oda", "غرفة")],
  ["apartment", words("apartment", "apart", "daire", "شقة")],
  ["suite", words("suite", "süit", "جناح")],
];

const WHOLE_NUMBER = /^-?\d+$/;

/** A room as accommodation's command takes one. */
export type ImportedRoom = Omit<NewUnits, "propertyId" | "count">;

export interface RoomDefaults {
  /** What an empty "let by the bed" means: yes at a dormitory (ADR 0057). */
  letByTheBed: boolean;
}

/** The room a row describes, or every cell of it that is wrong. */
export function readRoom(
  cells: Readonly<Record<string, string>>,
  defaults: RoomDefaults,
): { room: ImportedRoom | null; problems: RowProblem[] } {
  const problems: RowProblem[] = [];
  const wrong = (column: string, code: string) => {
    problems.push({ column, code });
  };
  const text = (key: string) => (cells[key] ?? "").trim();

  const building = text("building") || null;
  if (building !== null && building.length > BUILDING_NAME.max) {
    wrong("building", "too_long");
  }

  let floor: number | null = null;
  if (text("floor") !== "") {
    if (!WHOLE_NUMBER.test(text("floor"))) wrong("floor", "not_a_whole_number");
    else {
      floor = Number(text("floor"));
      if (floor < FLOOR.min || floor > FLOOR.max)
        wrong("floor", "out_of_range");
    }
  }

  const number = text("room");
  if (number === "") wrong("room", "required");
  else if (
    !new RegExp(`^\\d{${ROOM_NUMBER.min},${ROOM_NUMBER.max}}$`).test(number)
  ) {
    wrong("room", "not_digits");
  }

  const typeWord = normalizeHeading(text("type"));
  const unitType =
    typeWord === ""
      ? "room"
      : (TYPES.find(([, accepted]) => accepted.has(typeWord))?.[0] ?? null);
  if (unitType === null) wrong("type", "unknown_type");

  let capacity = 0;
  if (text("sleeps") === "") wrong("sleeps", "required");
  else if (!WHOLE_NUMBER.test(text("sleeps"))) {
    wrong("sleeps", "not_a_whole_number");
  } else {
    capacity = Number(text("sleeps"));
    if (capacity < UNIT_CAPACITY.min || capacity > UNIT_CAPACITY.max) {
      wrong("sleeps", "out_of_range");
    }
  }

  const byBedWord = normalizeHeading(text("byBed"));
  let letByTheBed = defaults.letByTheBed && unitType === "room";
  if (byBedWord !== "") {
    if (YES.has(byBedWord)) letByTheBed = true;
    else if (NO.has(byBedWord)) letByTheBed = false;
    else wrong("byBed", "unknown_yes_no");
  }
  if (letByTheBed && unitType !== null && unitType !== "room") {
    wrong("byBed", "only_a_room");
  }
  if (letByTheBed && capacity > BEDS_PER_ROOM.max) {
    wrong("sleeps", "too_many_beds");
  }

  const admitsWord = normalizeHeading(text("admits"));
  let admits: Gender | null = null;
  if (WOMEN.has(admitsWord)) admits = "female";
  else if (MEN.has(admitsWord)) admits = "male";
  else if (admitsWord !== "" && !ANYONE.has(admitsWord)) {
    wrong("admits", "unknown_admits");
  }

  if (problems.length > 0 || unitType === null) return { room: null, problems };
  return {
    room: {
      building,
      floor,
      unitType,
      firstNumber: number,
      capacity,
      letByTheBed,
      admits,
    },
    problems,
  };
}

/**
 * Each row as the preview shows it: wrong with its cells named, already at the
 * Property, a second row for a room the file already named, or ready.
 */
export function stageRooms(
  rows: readonly { rowNumber: number; cells: Record<string, string> }[],
  existingRooms: ReadonlySet<string>,
  defaults: RoomDefaults,
): StagedRow[] {
  const seen = new Set<string>();
  return rows.map(({ rowNumber, cells }) => {
    const { room, problems } = readRoom(cells, defaults);
    if (room === null) return { rowNumber, state: "wrong", cells, problems };
    if (seen.has(room.firstNumber)) {
      return {
        rowNumber,
        state: "wrong",
        cells,
        problems: [{ column: "room", code: "duplicate_in_file" }],
      };
    }
    seen.add(room.firstNumber);
    return {
      rowNumber,
      state: existingRooms.has(room.firstNumber) ? "skipped" : "ready",
      cells,
      problems: [],
    };
  });
}
