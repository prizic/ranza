import {
  GUEST_DOCUMENT_TYPES,
  GUEST_PARTICULARS,
  GuestParticularsError,
  type GuestDocumentType,
  type GuestParticulars,
  type GuestParticularsField,
  type StoredGuestParticulars,
} from "./contracts";
import { isTcKimlik, normalizeDocumentNumber } from "./identity-document";
import { GuestWriteError, type GuestWriteClient } from "./write";

/**
 * A Guest's particulars, recorded and read for a caller that owns the
 * transaction and the request context (GP-S1-*).
 *
 * Recorded through `app.record_guest_particulars`, never a write of the table:
 * the function asks `front_desk.book`, and a role may book without being
 * allowed to read what it recorded. Read through the table's policy, which
 * asks `guests.read_particulars`.
 */

const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";

/** As every module's: the code in Prisma's `meta`, or failing that the message. */
function raised(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { meta, message } = error as {
    meta?: { driverAdapterError?: { cause?: { code?: unknown } } };
    message?: unknown;
  };
  return (
    meta?.driverAdapterError?.cause?.code === code ||
    (typeof message === "string" && message.includes(code))
  );
}

function trimmed(value: string | null): string | null {
  const text = (value ?? "").trim();
  return text.length === 0 ? null : text;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const OTHER_DOCUMENT_NUMBER = /^[A-Z0-9]+$/;

/**
 * The document, normalized and measured, or nothing. A kind with no number is
 * nothing typed — a form's kind selector is not a decision to record a
 * document — and a number with no kind cannot be checked, so it is refused.
 */
function documentOf(input: GuestParticulars): {
  documentType: GuestDocumentType | null;
  documentNumber: string | null;
} {
  const number = trimmed(input.documentNumber);
  if (number === null) return { documentType: null, documentNumber: null };

  const type = input.documentType;
  if (type === null || !GUEST_DOCUMENT_TYPES.includes(type)) {
    throw new GuestParticularsError(
      "choose which kind of document the number is",
      "documentType",
    );
  }
  const normalized = normalizeDocumentNumber(number);
  const { min, max } = GUEST_PARTICULARS.documentNumber;
  const valid =
    type === "tc_kimlik"
      ? isTcKimlik(normalized)
      : OTHER_DOCUMENT_NUMBER.test(normalized) &&
        normalized.length >= min &&
        normalized.length <= max;
  if (!valid) {
    throw new GuestParticularsError(
      type === "tc_kimlik"
        ? "a T.C. kimlik number is eleven digits with its two check digits"
        : `a document number is ${min} to ${max} letters and digits`,
      "documentNumber",
    );
  }
  return { documentType: type, documentNumber: normalized };
}

/** Trimmed and measured against the check constraints, empty as absent. */
function normalize(input: GuestParticulars): GuestParticulars {
  const particulars: GuestParticulars = {
    dateOfBirth: trimmed(input.dateOfBirth),
    institution: trimmed(input.institution),
    studyYear: input.studyYear,
    guardianName: trimmed(input.guardianName),
    guardianPhone: trimmed(input.guardianPhone),
    emergencyName: trimmed(input.emergencyName),
    emergencyPhone: trimmed(input.emergencyPhone),
    nationality: trimmed(input.nationality)?.toUpperCase() ?? null,
    ...documentOf(input),
  };
  const { text, phone, studyYear, earliestDateOfBirth } = GUEST_PARTICULARS;

  const born = particulars.dateOfBirth;
  if (
    born !== null &&
    (!DAY.test(born) ||
      Number.isNaN(Date.parse(`${born}T00:00:00Z`)) ||
      born < earliestDateOfBirth)
  ) {
    throw new GuestParticularsError(
      `a date of birth is a day from ${earliestDateOfBirth}`,
      "dateOfBirth",
    );
  }
  if (
    particulars.nationality !== null &&
    !COUNTRY_CODE.test(particulars.nationality)
  ) {
    throw new GuestParticularsError(
      "a nationality is a two-letter country code",
      "nationality",
    );
  }
  const year = particulars.studyYear;
  if (
    year !== null &&
    (!Number.isInteger(year) || year < studyYear.min || year > studyYear.max)
  ) {
    throw new GuestParticularsError(
      `a year of study is ${studyYear.min} to ${studyYear.max}`,
      "studyYear",
    );
  }
  for (const field of [
    "institution",
    "guardianName",
    "emergencyName",
  ] as const) {
    const value = particulars[field];
    if (
      value !== null &&
      (value.length < text.min || value.length > text.max)
    ) {
      throw new GuestParticularsError(
        `between ${text.min} and ${text.max} characters`,
        field,
      );
    }
  }
  for (const field of ["guardianPhone", "emergencyPhone"] as const) {
    const value = particulars[field];
    if (value !== null && value.length > phone.max) {
      throw new GuestParticularsError(
        `a telephone number is at most ${phone.max} characters`,
        field,
      );
    }
  }
  return particulars;
}

/** Whether nothing was typed, so there is nothing to record. */
function isBlank(particulars: GuestParticulars): boolean {
  return Object.values(particulars).every((value) => value === null);
}

/**
 * Records what was typed for a Guest. A blank keeps what is on file and all
 * blanks record nothing, so a hotel booking that asked for none costs no
 * statement. A date in the future is refused by the function, which knows
 * what day it is.
 */
export async function recordParticularsWithin(
  tx: GuestWriteClient,
  guestId: string,
  input: GuestParticulars,
): Promise<void> {
  const particulars = normalize(input);
  if (isBlank(particulars)) return;

  try {
    // From the call rather than of it: the function returns void, which the
    // driver cannot hand back as a column.
    await tx.$queryRaw`
      select 1 as "recorded" from app.record_guest_particulars(
        ${guestId}::uuid,
        ${particulars.dateOfBirth}::date,
        ${particulars.institution},
        ${particulars.studyYear}::smallint,
        ${particulars.guardianName},
        ${particulars.guardianPhone},
        ${particulars.emergencyName},
        ${particulars.emergencyPhone},
        ${particulars.nationality},
        ${particulars.documentType},
        ${particulars.documentNumber}
      )
    `;
  } catch (error: unknown) {
    if (raised(error, INSUFFICIENT_PRIVILEGE)) {
      throw new GuestWriteError("the particulars were not recorded");
    }
    if (raised(error, CHECK_VIOLATION)) {
      throw new GuestParticularsError(
        "that particular is not one the database accepts",
        violatedField(error),
      );
    }
    throw error;
  }
}

/**
 * Which field a check the checks above did not foresee refused. The one the
 * function raises itself is a date of birth in the future, and it is the
 * default: every other bound is measured before the statement is sent.
 */
function violatedField(error: unknown): GuestParticularsField {
  const text = String((error as { message?: unknown }).message ?? "");
  if (text.includes("guest_particulars_nationality_check"))
    return "nationality";
  if (text.includes("guest_particulars_document_number_check")) {
    return "documentNumber";
  }
  if (text.includes("guest_particulars_document_")) return "documentType";
  return "dateOfBirth";
}

/**
 * A Guest's particulars, or null when none are recorded or the caller may not
 * read them — the policy hides the row, and the two are not told apart.
 */
export async function readParticularsWithin(
  tx: GuestWriteClient,
  guestId: string,
): Promise<StoredGuestParticulars | null> {
  const rows = await tx.$queryRaw<StoredGuestParticulars[]>`
    select to_char(date_of_birth, 'YYYY-MM-DD') as "dateOfBirth",
           institution                          as "institution",
           study_year::int                      as "studyYear",
           guardian_name                        as "guardianName",
           guardian_phone                       as "guardianPhone",
           emergency_name                       as "emergencyName",
           emergency_phone                      as "emergencyPhone",
           nationality                          as "nationality",
           document_type                        as "documentType",
           document_last_four                   as "documentLastFour"
      from public.guest_particulars
     where guest_id = ${guestId}::uuid
  `;
  return rows[0] ?? null;
}

/** A document number in full, with whose it is and which kind. */
export interface RevealedIdentityDocument {
  organizationId: string;
  documentType: GuestDocumentType;
  documentNumber: string;
}

/**
 * A Guest's document number in full, or null when there is none to show, the
 * Guest is out of reach, or the caller may not read particulars — one answer,
 * as for the particulars themselves.
 *
 * The only way the number leaves the database. The caller owns the
 * transaction and records, in it, that somebody looked: a number that could
 * not be recorded as seen is not shown.
 */
export async function revealIdentityDocumentWithin(
  tx: GuestWriteClient,
  guestId: string,
): Promise<RevealedIdentityDocument | null> {
  const rows = await tx.$queryRaw<RevealedIdentityDocument[]>`
    select holder_organization_id as "organizationId",
           held_document_type     as "documentType",
           held_document_number   as "documentNumber"
      from app.reveal_guest_identity_document(${guestId}::uuid)
  `;
  return rows[0] ?? null;
}
