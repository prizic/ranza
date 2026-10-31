import {
  GUEST_PARTICULARS,
  GuestParticularsError,
  type GuestParticulars,
} from "./contracts";
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
        ${particulars.emergencyPhone}
      )
    `;
  } catch (error: unknown) {
    if (raised(error, INSUFFICIENT_PRIVILEGE)) {
      throw new GuestWriteError("the particulars were not recorded");
    }
    if (raised(error, CHECK_VIOLATION)) {
      throw new GuestParticularsError(
        "a date of birth is not in the future",
        "dateOfBirth",
      );
    }
    throw error;
  }
}

/**
 * A Guest's particulars, or null when none are recorded or the caller may not
 * read them — the policy hides the row, and the two are not told apart.
 */
export async function readParticularsWithin(
  tx: GuestWriteClient,
  guestId: string,
): Promise<GuestParticulars | null> {
  const rows = await tx.$queryRaw<GuestParticulars[]>`
    select to_char(date_of_birth, 'YYYY-MM-DD') as "dateOfBirth",
           institution                          as "institution",
           study_year::int                      as "studyYear",
           guardian_name                        as "guardianName",
           guardian_phone                       as "guardianPhone",
           emergency_name                       as "emergencyName",
           emergency_phone                      as "emergencyPhone"
      from public.guest_particulars
     where guest_id = ${guestId}::uuid
  `;
  return rows[0] ?? null;
}
