import type { Gender } from "@ranza/core";
import {
  GUEST_DETAILS,
  GUEST_PARTICULARS,
  isTcKimlik,
  normalizeDocumentNumber,
  type GuestDocumentType,
  type GuestParticulars,
} from "@ranza/guests";
import { normalizeHeading } from "./columns";
import type { ColumnSpec, RowProblem, StagedRow } from "./contracts";
import { MEN, WOMEN, words } from "./words";

/**
 * A file of people: who they are, the bed they sleep in and from when
 * (IMP-S2-*). One row is one person and one booking. What a Guest, a booking
 * and a Guest's particulars may hold is the guests and reservations modules'
 * to say, so every bound here is theirs and the commands decide again when
 * the row is imported; this only names the cell to fix first.
 */
export const PEOPLE_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "fullName",
    required: true,
    headers: { tr: "Ad Soyad", en: "Full name", ar: "الاسم الكامل" },
    aliases: ["adsoyad", "adisoyadi", "isim", "name", "fullname", "ogrenci"],
    example: { tr: "Elif Yılmaz", en: "Elif Yılmaz", ar: "Elif Yılmaz" },
  },
  {
    key: "email",
    required: false,
    headers: { tr: "E-posta", en: "Email", ar: "البريد الإلكتروني" },
    aliases: ["eposta", "mail", "emailaddress"],
    example: {
      tr: "elif@example.com",
      en: "elif@example.com",
      ar: "elif@example.com",
    },
  },
  {
    key: "phone",
    required: false,
    headers: { tr: "Telefon", en: "Phone", ar: "الهاتف" },
    aliases: ["tel", "cep", "ceptelefonu", "gsm", "mobile", "telephone"],
    example: {
      tr: "0532 000 00 00",
      en: "0532 000 00 00",
      ar: "0532 000 00 00",
    },
  },
  {
    key: "gender",
    required: false,
    headers: { tr: "Cinsiyet", en: "Gender", ar: "الجنس" },
    aliases: ["sex"],
    example: { tr: "Kadın", en: "Woman", ar: "أنثى" },
  },
  {
    key: "documentType",
    required: false,
    headers: { tr: "Belge türü", en: "Document type", ar: "نوع الوثيقة" },
    aliases: ["kimlikturu", "belgetipi", "idtype"],
    example: { tr: "TC Kimlik", en: "TC Kimlik", ar: "TC Kimlik" },
  },
  {
    key: "documentNumber",
    required: false,
    headers: { tr: "Kimlik No", en: "Identity number", ar: "رقم الهوية" },
    aliases: [
      "tckimlik",
      "tckimlikno",
      "tcno",
      "kimliknumarasi",
      "pasaportno",
      "idnumber",
      "passportnumber",
    ],
    example: { tr: "10000000146", en: "10000000146", ar: "10000000146" },
  },
  {
    key: "dateOfBirth",
    required: false,
    headers: { tr: "Doğum tarihi", en: "Date of birth", ar: "تاريخ الميلاد" },
    aliases: ["dob", "birthdate"],
    example: { tr: "14.05.2007", en: "14.05.2007", ar: "14.05.2007" },
  },
  {
    key: "institution",
    required: false,
    headers: { tr: "Okul", en: "School", ar: "المدرسة" },
    aliases: ["universite", "university", "institution"],
    example: {
      tr: "İstanbul Üniversitesi",
      en: "İstanbul Üniversitesi",
      ar: "İstanbul Üniversitesi",
    },
  },
  {
    key: "guardianName",
    required: false,
    headers: { tr: "Veli adı", en: "Guardian", ar: "ولي الأمر" },
    aliases: ["veli", "veliadisoyadi", "guardianname", "parent"],
    example: { tr: "Ayşe Yılmaz", en: "Ayşe Yılmaz", ar: "Ayşe Yılmaz" },
  },
  {
    key: "guardianPhone",
    required: false,
    headers: {
      tr: "Veli telefonu",
      en: "Guardian's phone",
      ar: "هاتف ولي الأمر",
    },
    aliases: ["velitel", "velitelefon", "guardianphone", "parentphone"],
    example: {
      tr: "0532 000 00 01",
      en: "0532 000 00 01",
      ar: "0532 000 00 01",
    },
  },
  {
    key: "building",
    required: false,
    headers: { tr: "Blok", en: "Building", ar: "المبنى" },
    aliases: ["bina", "block"],
    example: { tr: "A", en: "A", ar: "A" },
  },
  {
    key: "room",
    required: true,
    headers: { tr: "Oda No", en: "Room", ar: "رقم الغرفة" },
    aliases: ["oda", "odanumarasi", "roomnumber", "roomno"],
    example: { tr: "101", en: "101", ar: "101" },
  },
  {
    key: "bed",
    required: false,
    headers: { tr: "Yatak", en: "Bed", ar: "السرير" },
    aliases: ["yatakno", "bedno"],
    example: { tr: "A", en: "A", ar: "A" },
  },
  {
    key: "firstNight",
    required: true,
    headers: { tr: "Giriş tarihi", en: "First night", ar: "الليلة الأولى" },
    aliases: ["giris", "movein", "moveindate", "arrival", "startdate"],
    example: { tr: "01.09.2026", en: "01.09.2026", ar: "01.09.2026" },
  },
  {
    key: "leaving",
    required: false,
    headers: { tr: "Çıkış tarihi", en: "Leaving", ar: "تاريخ المغادرة" },
    aliases: ["cikis", "moveout", "departure", "enddate"],
    example: { tr: "30.06.2027", en: "30.06.2027", ar: "30.06.2027" },
  },
  {
    key: "stayType",
    required: false,
    headers: { tr: "Konaklama türü", en: "Stay type", ar: "نوع الإقامة" },
    aliases: ["staytype", "kalisturu"],
    example: { tr: "Öğrenci", en: "Resident", ar: "مقيم" },
  },
];

const RESIDENT = words(
  "resident",
  "student",
  "longstay",
  "öğrenci",
  "sakin",
  "yurtsakini",
  "مقيم",
  "طالب",
);
const GUEST = words("guest", "misafir", "konuk", "ضيف", "زائر");

const DOCUMENT_TYPES: readonly [GuestDocumentType, Set<string>][] = [
  ["tc_kimlik", words("tckimlik", "tc", "kimlik", "turkishid", "هوية تركية")],
  ["passport", words("passport", "pasaport", "جواز سفر", "جواز")],
  [
    "residence_permit",
    words("residencepermit", "ikamet", "ikametizni", "إقامة", "تصريح إقامة"),
  ],
  ["other", words("other", "diğer", "أخرى")],
];

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const ISO_DAY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DOTTED_DAY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const SLASHED_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A day as a person typed it (IMP-S2-06). Dotted is day first, as Turkey
 * writes it; a spreadsheet's own date cell reaches here as ISO. Slashed is day
 * first in Turkey and month first elsewhere, so it is read only when one part
 * is past twelve or both are the same: `03/04/2026` is never guessed.
 */
export function readDay(
  typed: string,
): { day: string } | { problem: "not_a_date" | "ambiguous_date" } {
  const text = typed.trim();
  let parts: [number, number, number] | null = null;
  const iso = ISO_DAY.exec(text);
  const dotted = DOTTED_DAY.exec(text);
  const slashed = SLASHED_DAY.exec(text);
  if (iso) parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dotted) {
    parts = [Number(dotted[3]), Number(dotted[2]), Number(dotted[1])];
  } else if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    const year = Number(slashed[3]);
    if (first > 12 && second <= 12) parts = [year, second, first];
    else if (second > 12 && first <= 12) parts = [year, first, second];
    else if (first === second) parts = [year, first, first];
    else return { problem: "ambiguous_date" };
  }
  const day = parts ? isoDay(...parts) : null;
  return day ? { day } : { problem: "not_a_date" };
}

export type ImportedStayType = "resident" | "guest";

/** A person and the bed they are booked into, as the commands take them. */
export interface ImportedPerson {
  fullName: string;
  email: string | null;
  phone: string | null;
  gender: Gender | null;
  /** Null when the row gives none of them. */
  particulars: GuestParticulars | null;
  building: string | null;
  room: string;
  /** Null for a room let whole. */
  bed: string | null;
  /** `YYYY-MM-DD`, as the file gave it. */
  firstNight: string;
  /** The day they leave, `YYYY-MM-DD`; null for a Resident with no end. */
  leaving: string | null;
  stayType: ImportedStayType;
}

export interface PeopleDefaults {
  /** What an empty stay type means: a Resident at a dormitory (ADR 0057). */
  residentByDefault: boolean;
}

/** The person a row describes, or every cell of it that is wrong. */
export function readPerson(
  cells: Readonly<Record<string, string>>,
  defaults: PeopleDefaults,
): { person: ImportedPerson | null; problems: RowProblem[] } {
  const problems: RowProblem[] = [];
  const wrong = (column: string, code: string) => {
    problems.push({ column, code });
  };
  const text = (key: string) => (cells[key] ?? "").trim();
  const optional = (key: string) => text(key) || null;

  const fullName = text("fullName");
  if (fullName === "") wrong("fullName", "required");
  else if (fullName.length > GUEST_DETAILS.name.max) {
    wrong("fullName", "too_long");
  }

  const email = optional("email");
  if (email !== null) {
    if (!EMAIL.test(email)) wrong("email", "not_an_email");
    else if (email.length > GUEST_DETAILS.email.max) wrong("email", "too_long");
  }

  const phone = optional("phone");
  if (phone !== null && phone.length > GUEST_DETAILS.phone.max) {
    wrong("phone", "too_long");
  }

  const genderWord = normalizeHeading(text("gender"));
  let gender: Gender | null = null;
  if (WOMEN.has(genderWord)) gender = "female";
  else if (MEN.has(genderWord)) gender = "male";
  else if (genderWord !== "") wrong("gender", "unknown_gender");

  const documentNumber = text("documentNumber")
    ? normalizeDocumentNumber(text("documentNumber"))
    : null;
  const typeWord = normalizeHeading(text("documentType"));
  let documentType: GuestDocumentType | null =
    typeWord === ""
      ? null
      : (DOCUMENT_TYPES.find(([, accepted]) => accepted.has(typeWord))?.[0] ??
        null);
  if (typeWord !== "" && documentType === null) {
    wrong("documentType", "unknown_document_type");
  }
  if (documentNumber !== null && typeWord === "") {
    // Eleven digits is what a kimlik number is, and nothing else is.
    if (/^\d{11}$/.test(documentNumber)) documentType = "tc_kimlik";
    else wrong("documentType", "document_type_required");
  }
  if (documentNumber === null && documentType !== null) {
    wrong("documentNumber", "required");
  }
  if (documentNumber !== null) {
    if (documentType === "tc_kimlik" && !isTcKimlik(documentNumber)) {
      wrong("documentNumber", "invalid_tc_kimlik");
    } else if (
      documentNumber.length < GUEST_PARTICULARS.documentNumber.min ||
      documentNumber.length > GUEST_PARTICULARS.documentNumber.max
    ) {
      wrong("documentNumber", "document_number_length");
    }
  }

  let dateOfBirth: string | null = null;
  if (text("dateOfBirth") !== "") {
    const read = readDay(text("dateOfBirth"));
    if ("problem" in read) wrong("dateOfBirth", read.problem);
    else if (read.day < GUEST_PARTICULARS.earliestDateOfBirth) {
      wrong("dateOfBirth", "too_early");
    } else dateOfBirth = read.day;
  }

  for (const key of ["institution", "guardianName"] as const) {
    const value = text(key);
    if (value === "") continue;
    if (value.length < GUEST_PARTICULARS.text.min) wrong(key, "too_short");
    else if (value.length > GUEST_PARTICULARS.text.max) wrong(key, "too_long");
  }
  if (text("guardianPhone").length > GUEST_PARTICULARS.phone.max) {
    wrong("guardianPhone", "too_long");
  }

  const room = text("room");
  if (room === "") wrong("room", "required");

  let firstNight = "";
  if (text("firstNight") === "") wrong("firstNight", "required");
  else {
    const read = readDay(text("firstNight"));
    if ("problem" in read) wrong("firstNight", read.problem);
    else firstNight = read.day;
  }

  let leaving: string | null = null;
  if (text("leaving") !== "") {
    const read = readDay(text("leaving"));
    if ("problem" in read) wrong("leaving", read.problem);
    else if (firstNight !== "" && read.day <= firstNight) {
      wrong("leaving", "leaving_before_first_night");
    } else leaving = read.day;
  }

  const stayWord = normalizeHeading(text("stayType"));
  let stayType: ImportedStayType | null = defaults.residentByDefault
    ? "resident"
    : "guest";
  if (RESIDENT.has(stayWord)) stayType = "resident";
  else if (GUEST.has(stayWord)) stayType = "guest";
  else if (stayWord !== "") {
    stayType = null;
    wrong("stayType", "unknown_stay_type");
  }
  // An open-ended booking is a Resident's case only (RG-S1-11).
  if (stayType === "guest" && text("leaving") === "") {
    wrong("leaving", "leaving_required");
  }

  if (problems.length > 0 || stayType === null) {
    return { person: null, problems };
  }

  const particulars: GuestParticulars = {
    dateOfBirth,
    institution: optional("institution"),
    studyYear: null,
    guardianName: optional("guardianName"),
    guardianPhone: optional("guardianPhone"),
    emergencyName: null,
    emergencyPhone: null,
    nationality: null,
    documentType,
    documentNumber,
  };
  return {
    person: {
      fullName,
      email,
      phone,
      gender,
      particulars: Object.values(particulars).some((value) => value !== null)
        ? particulars
        : null,
      building: optional("building"),
      room,
      bed: optional("bed"),
      firstNight,
      leaving,
      stayType,
    },
    problems,
  };
}

/**
 * The nights a person is booked for, and whether they are checked in at once
 * (IMP-S2-05). A booking cannot start before the Property's today, so somebody
 * who already lives there is booked from today and checked in; the first night
 * the file gave stays in the row (IMP-DEF-07).
 */
export function bookingOf(
  person: ImportedPerson,
  today: string,
): { startsOn: string; endsOn: string | null; checkInNow: boolean } {
  return {
    startsOn: person.firstNight > today ? person.firstNight : today,
    endsOn: person.leaving,
    checkInNow: person.firstNight < today,
  };
}

/** A room let whole or a bed, as a row names it. */
export interface PlaceOnFile {
  unitId: string;
  room: string;
  /** Null for a room let whole. */
  bed: string | null;
  admits: Gender | null;
}

export interface PeopleContext extends PeopleDefaults {
  /** The Property's business date (ADR 0021), not the uploader's clock. */
  today: string;
  places: readonly PlaceOnFile[];
  /** The places already promised over those nights, as the dialog marks them. */
  taken(startsOn: string, endsOn: string | null): ReadonlySet<string>;
}

/** The place a person is booked into, or the cell that says why there is none. */
export function placeOf(
  person: ImportedPerson,
  places: readonly PlaceOnFile[],
): { place: PlaceOnFile } | { problem: RowProblem } {
  const inRoom = places.filter((place) => place.room === person.room);
  if (inRoom.length === 0) {
    return { problem: { column: "room", code: "no_such_room" } };
  }
  if (person.bed === null) {
    const whole = inRoom.find((place) => place.bed === null);
    return whole
      ? { place: whole }
      : { problem: { column: "bed", code: "bed_required" } };
  }
  const bed = person.bed.toUpperCase();
  const named = inRoom.find((place) => place.bed?.toUpperCase() === bed);
  return named
    ? { place: named }
    : { problem: { column: "bed", code: "no_such_bed" } };
}

/** The gender a place asks of the person in it, if it asks one. */
export function admissionOf(
  person: ImportedPerson,
  place: PlaceOnFile,
): RowProblem | null {
  if (place.admits === null) return null;
  if (person.gender === null)
    return { column: "gender", code: "gender_required" };
  return person.gender === place.admits
    ? null
    : { column: "gender", code: "not_admitted" };
}

const overlaps = (
  a: { startsOn: string; endsOn: string | null },
  b: { startsOn: string; endsOn: string | null },
) =>
  (a.endsOn === null || b.startsOn < a.endsOn) &&
  (b.endsOn === null || a.startsOn < b.endsOn);

/**
 * Each row as the preview shows it: wrong with its cells named, or ready. A
 * bed promised since the preview is the database's to refuse (IMP-S2-03).
 */
export function stagePeople(
  rows: readonly { rowNumber: number; cells: Record<string, string> }[],
  context: PeopleContext,
): StagedRow[] {
  const documents = new Set<string>();
  const booked: { unitId: string; startsOn: string; endsOn: string | null }[] =
    [];
  return rows.map(({ rowNumber, cells }) => {
    const wrongRow = (...problems: RowProblem[]): StagedRow => ({
      rowNumber,
      state: "wrong",
      cells,
      problems,
    });
    const { person, problems } = readPerson(cells, context);
    if (person === null) return wrongRow(...problems);
    if (person.leaving !== null && person.leaving <= context.today) {
      return wrongRow({ column: "leaving", code: "already_left" });
    }
    const found = placeOf(person, context.places);
    if ("problem" in found) return wrongRow(found.problem);
    const refusal = admissionOf(person, found.place);
    if (refusal) return wrongRow(refusal);

    const document = person.particulars?.documentNumber ?? null;
    if (document !== null && documents.has(document)) {
      return wrongRow({ column: "documentNumber", code: "duplicate_in_file" });
    }
    const nights = bookingOf(person, context.today);
    if (
      booked.some(
        (other) =>
          other.unitId === found.place.unitId && overlaps(other, nights),
      )
    ) {
      return wrongRow({ column: "bed", code: "bed_twice_in_file" });
    }
    if (context.taken(nights.startsOn, nights.endsOn).has(found.place.unitId)) {
      return wrongRow({ column: "bed", code: "bed_taken" });
    }
    if (document !== null) documents.add(document);
    booked.push({ unitId: found.place.unitId, ...nights });
    return { rowNumber, state: "ready", cells, problems: [] };
  });
}
