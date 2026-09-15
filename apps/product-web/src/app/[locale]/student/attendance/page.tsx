import type { AttendanceDeclaration } from "@ranza/domain";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, Card, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { attendanceCopy } from "../../../../lib/attendance-copy";
import { createProductWebClient } from "../../../../lib/supabase/server";

import { AttendanceForm } from "./attendance-form";

interface StudentContext {
  access_id: string;
  display_name: string;
  id: string;
}

interface AttendanceContext {
  branch_name: string;
  branch_timezone: string;
  cutoff_at: string;
  declaration: AttendanceDeclaration | null;
  last_updated_at: string | null;
  student_access_id: string;
  student_name: string;
}

export default async function StudentAttendancePage({
  params,
  searchParams,
}: PageProps<"/[locale]/student/attendance">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const copy = attendanceCopy[locale];
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/student/sign-in`);

  const { data: student } = await client
    .from("students")
    .select("id,display_name,access_id")
    .eq("auth_user_id", auth.user.id)
    .eq("status", "active")
    .single<StudentContext>();
  if (!student) redirect(`/${locale}/student/sign-in?error=not-authorized`);
  const { data: assignment } = await client
    .from("student_branch_history")
    .select("branch_id")
    .eq("student_id", student.id)
    .is("ended_at", null)
    .single<{ branch_id: string }>();
  if (!assignment) redirect(`/${locale}/student/sign-in?error=not-authorized`);
  const { data: sessionId, error: sessionError } = await client.rpc(
    "ensure_attendance_session",
    { target_branch_id: assignment.branch_id },
  );
  if (sessionError || typeof sessionId !== "string") throw sessionError;
  const { data, error } = await client.rpc("student_attendance_context", {
    target_session_id: sessionId,
  });
  if (error) throw error;
  const context = (data as AttendanceContext[] | null)?.[0];
  if (!context) redirect(`/${locale}/student/sign-in?error=not-authorized`);
  const cutoff = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.branch_timezone,
  }).format(new Date(context.cutoff_at));
  const result = typeof query.result === "string" ? query.result : null;

  return (
    <LocalizedShell locale={locale}>
      <Card className="attendance-context" tone="strong">
        <div>
          <span>{copy.profile}</span>
          <h2>{context.student_name}</h2>
          <BidiText>{context.student_access_id}</BidiText>
        </div>
        <div>
          <span>{copy.branch}</span>
          <h2>{context.branch_name}</h2>
          <p>
            {copy.cutoff}: <BidiText>{cutoff}</BidiText>
          </p>
        </div>
      </Card>
      {result ? (
        <StatusMessage tone={result === "saved" ? "success" : "warning"}>
          {result === "saved"
            ? copy.saved
            : result === "late"
              ? copy.late
              : copy.failed}
        </StatusMessage>
      ) : null}
      <AttendanceForm
        copy={copy}
        current={context.declaration}
        locale={locale}
        session={sessionId}
      />
      <StatusMessage>
        {context.declaration === "staying"
          ? copy.staying
          : context.declaration === "away"
            ? copy.away
            : copy.unconfirmed}
        {context.last_updated_at ? (
          <>
            {" · "}
            <BidiText>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: context.branch_timezone,
              }).format(new Date(context.last_updated_at))}
            </BidiText>
          </>
        ) : null}
      </StatusMessage>
    </LocalizedShell>
  );
}
