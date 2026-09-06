"use client";

import type { AttendanceDeclaration } from "@ranza/domain";
import { useFormStatus } from "react-dom";

import type { attendanceCopy } from "../../../../lib/attendance-copy";

import { submitAttendance } from "./actions";

type Copy = (typeof attendanceCopy)[keyof typeof attendanceCopy];

function SubmitButton({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" disabled={pending} type="submit">
      {pending ? copy.pending : copy.submit}
    </button>
  );
}

export function AttendanceForm({
  copy,
  current,
  locale,
  session,
}: {
  copy: Copy;
  current: AttendanceDeclaration | null;
  locale: string;
  session: string;
}) {
  return (
    <form action={submitAttendance} className="attendance-form">
      <input name="locale" type="hidden" value={locale} />
      <input name="session" type="hidden" value={session} />
      <fieldset>
        <legend>{copy.title}</legend>
        <label>
          <input
            defaultChecked={current === "staying"}
            name="declaration"
            required
            type="radio"
            value="staying"
          />
          {copy.staying}
        </label>
        <label>
          <input
            defaultChecked={current === "away"}
            name="declaration"
            required
            type="radio"
            value="away"
          />
          {copy.away}
        </label>
      </fieldset>
      <SubmitButton copy={copy} />
    </form>
  );
}
