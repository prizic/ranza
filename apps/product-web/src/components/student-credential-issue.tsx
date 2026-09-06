"use client";

import { useActionState } from "react";
import { issueStudentCredential } from "../app/[locale]/staff/roster/credential-actions";
import { studentCredentialCopy } from "../lib/student-credential-copy";

export function StudentCredentialIssue({
  studentId,
  locale,
}: {
  studentId: string;
  locale: "tr" | "en" | "ar";
}) {
  const [state, action, pending] = useActionState(issueStudentCredential, {});
  const t = studentCredentialCopy[locale];
  return (
    <form action={action} autoComplete="off">
      <input type="hidden" name="student" value={studentId} />
      {state.error && <p role="alert">{t.issueError}</p>}
      {state.code && (
        <div role="status">
          <p>{t.issued}</p>
          <p>
            {t.accessId}: <bdi dir="ltr">{state.accessId}</bdi>
          </p>
          <p>
            {t.code}: <bdi dir="ltr">{state.code}</bdi>
          </p>
          <button
            type="submit"
            name="operation"
            value="dismiss"
            disabled={pending}
          >
            {t.dismiss}
          </button>
        </div>
      )}
      <button type="submit" name="operation" value="issue" disabled={pending}>
        {t.issue}
      </button>
      <button type="submit" name="operation" value="recover" disabled={pending}>
        {t.recover}
      </button>
    </form>
  );
}
