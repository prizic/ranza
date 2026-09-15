import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import {
  Badge,
  BidiText,
  Button,
  Card,
  Input,
  StatusMessage,
  Table,
} from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { attendanceCopy } from "../../../../lib/attendance-copy";
import { createProductWebClient } from "../../../../lib/supabase/server";

import {
  configureAttendanceSchedule,
  correctAttendance,
  reopenAttendance,
  retryAttendanceFinalization,
} from "./actions";

interface StaffAccessRow {
  branch_id: string;
  branch_name: string;
  operator_id: string;
  operator_role: "owner" | "manager" | "branch_staff";
  timezone: string;
}

interface BoardRow {
  away_total: number;
  last_updated_at: string | null;
  response_percentage: number;
  status: "staying" | "away" | "unconfirmed";
  staying_total: number;
  student_id: string;
  student_name: string;
  unconfirmed_total: number;
}

interface Snapshot {
  away_count: number;
  eligible_count: number;
  finalized_at: string;
  id: string;
  staying_count: number;
  unconfirmed_count: number;
  version: number;
}

interface SnapshotRow {
  corrected: boolean;
  correction_reason: string | null;
  cutoff_status: "staying" | "away" | "unconfirmed";
  effective_status: "staying" | "away" | "unconfirmed";
  student_name: string;
  student_id: string;
}

export default async function StaffAttendancePage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff/attendance">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const copy = attendanceCopy[locale];
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data, error } = await client
    .from("staff_branch_access")
    .select("operator_id,operator_role,branch_id,branch_name,timezone")
    .eq("auth_user_id", auth.user.id)
    .returns<StaffAccessRow[]>();
  if (error) throw error;
  const branches = Array.from(
    new Map((data ?? []).map((row) => [row.branch_id, row])).values(),
  );
  const requestedBranch =
    typeof query.branch === "string" ? query.branch : null;
  const branchId = selectAuthorizedBranch(
    branches.map((branch) => branch.branch_id),
    requestedBranch,
  );
  if (!branchId) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const branch = branches.find((item) => item.branch_id === branchId);
  if (!branch) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const { data: sessionId, error: sessionError } = await client.rpc(
    "ensure_attendance_session",
    { target_branch_id: branchId },
  );
  if (sessionError || typeof sessionId !== "string") throw sessionError;
  const { data: session, error: sessionStateError } = await client
    .from("attendance_sessions")
    .select("status,cutoff_at")
    .eq("id", sessionId)
    .single<{ cutoff_at: string; status: "open" | "finalized" }>();
  if (sessionStateError) throw sessionStateError;
  const { data: snapshot, error: snapshotError } = await client
    .from("attendance_snapshots")
    .select(
      "id,version,eligible_count,staying_count,away_count,unconfirmed_count,finalized_at",
    )
    .eq("session_id", sessionId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<Snapshot>();
  if (snapshotError) throw snapshotError;
  const { data: latestJob, error: jobError } = await client
    .from("background_job_runs")
    .select("status,correlation_id,started_at")
    .eq("target_session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      correlation_id: string;
      started_at: string;
      status: "running" | "succeeded" | "failed" | "exhausted";
    }>();
  if (jobError) throw jobError;
  const { data: boardData, error: boardError } = await client.rpc(
    "attendance_board",
    { target_session_id: sessionId },
  );
  if (boardError) throw boardError;
  const liveRows = (boardData ?? []) as BoardRow[];
  const { data: snapshotRows, error: snapshotRowsError } = snapshot
    ? await client
        .from("attendance_final_student_status")
        .select(
          "student_id,student_name,cutoff_status,effective_status,corrected,correction_reason",
        )
        .eq("snapshot_id", snapshot.id)
        .order("student_name")
        .returns<SnapshotRow[]>()
    : { data: [], error: null };
  if (snapshotRowsError) throw snapshotRowsError;
  const rows = snapshot ? (snapshotRows ?? []) : liveRows;
  const liveTotals = liveRows[0] ?? {
    away_total: 0,
    response_percentage: 0,
    staying_total: 0,
    unconfirmed_total: 0,
  };
  const totals = snapshot
    ? {
        away_total: (snapshotRows ?? []).filter(
          (row) => row.effective_status === "away",
        ).length,
        response_percentage:
          snapshot.eligible_count === 0
            ? 0
            : Math.round(
                ((snapshotRows ?? []).filter(
                  (row) => row.effective_status !== "unconfirmed",
                ).length /
                  snapshot.eligible_count) *
                  100,
              ),
        staying_total: (snapshotRows ?? []).filter(
          (row) => row.effective_status === "staying",
        ).length,
        unconfirmed_total: (snapshotRows ?? []).filter(
          (row) => row.effective_status === "unconfirmed",
        ).length,
      }
    : liveTotals;
  const canConfigure =
    branch.operator_role === "owner" || branch.operator_role === "manager";
  const result = typeof query.result === "string" ? query.result : null;

  return (
    <LocalizedShell locale={locale}>
      <Card className="branch-context" tone="strong">
        <div>
          <span>{copy.branch}</span>
          <h2>{branch.branch_name}</h2>
          <BidiText>{branch.timezone}</BidiText>
        </div>
        <nav aria-label={copy.branch} className="branch-switcher">
          {branches.map((item) => (
            <a
              aria-current={item.branch_id === branchId ? "page" : undefined}
              href={`/${locale}/staff/attendance?branch=${item.branch_id}`}
              key={item.branch_id}
            >
              {item.branch_name}
            </a>
          ))}
        </nav>
      </Card>
      {result ? (
        <StatusMessage
          tone={
            ["saved", "finalized", "corrected", "reopened"].includes(result)
              ? "success"
              : "warning"
          }
        >
          {result === "saved"
            ? copy.saved
            : result === "finalized"
              ? locale === "tr"
                ? "Yoklama kesinleştirildi."
                : locale === "ar"
                  ? "تم تثبيت سجل الحضور."
                  : "Attendance was finalized."
              : result === "corrected"
                ? locale === "tr"
                  ? "Yoklama düzeltmesi kaydedildi."
                  : locale === "ar"
                    ? "تم حفظ تصحيح الحضور."
                    : "Attendance correction saved."
                : result === "reopened"
                  ? locale === "tr"
                    ? "Yeniden açma kaydı oluşturuldu."
                    : locale === "ar"
                      ? "تم تسجيل إعادة الفتح."
                      : "Reopen event recorded."
                  : locale === "tr"
                    ? "İşlem tamamlanamadı."
                    : locale === "ar"
                      ? "تعذّر إكمال العملية."
                      : "The operation could not be completed."}
        </StatusMessage>
      ) : null}
      {snapshot ? (
        <>
          <StatusMessage tone="success">
            {locale === "tr"
              ? `Kesin kayıt · sürüm ${snapshot.version}`
              : locale === "ar"
                ? `السجل النهائي · الإصدار ${snapshot.version}`
                : `Final Snapshot · version ${snapshot.version}`}{" "}
            <BidiText>{snapshot.finalized_at}</BidiText>
          </StatusMessage>
          <nav aria-label="Attendance exports" className="branch-switcher">
            <a
              href={`/api/attendance-sessions/${sessionId}/export?kind=students`}
            >
              {locale === "tr"
                ? "Öğrenci CSV"
                : locale === "ar"
                  ? "CSV الطلاب"
                  : "Student CSV"}
            </a>
            <a
              href={`/api/attendance-sessions/${sessionId}/export?kind=totals`}
            >
              {locale === "tr"
                ? "Toplamlar CSV"
                : locale === "ar"
                  ? "CSV الإجماليات"
                  : "Totals CSV"}
            </a>
          </nav>
        </>
      ) : session.cutoff_at <= new Date().toISOString() ? (
        <form action={retryAttendanceFinalization}>
          <input name="locale" type="hidden" value={locale} />
          <input name="branch" type="hidden" value={branchId} />
          <input name="session" type="hidden" value={sessionId} />
          <Button type="submit">
            {locale === "tr"
              ? "Güvenli kesinleştirmeyi yeniden dene"
              : locale === "ar"
                ? "إعادة محاولة التثبيت الآمن"
                : "Retry safe finalization"}
          </Button>
        </form>
      ) : null}
      {latestJob?.status === "failed" || latestJob?.status === "exhausted" ? (
        <StatusMessage tone="warning">
          {locale === "tr"
            ? "Kesinleştirme işi başarısız oldu"
            : locale === "ar"
              ? "فشلت مهمة تثبيت السجل"
              : "Finalization job failed"}
          {" · "}
          <BidiText>{latestJob.correlation_id}</BidiText>
        </StatusMessage>
      ) : null}
      <Card
        className="attendance-totals"
        aria-label={copy.title}
        density="compact"
      >
        <article>
          <strong>{totals.staying_total}</strong>
          <span>{copy.staying}</span>
        </article>
        <article>
          <strong>{totals.away_total}</strong>
          <span>{copy.away}</span>
        </article>
        <article>
          <strong>{totals.unconfirmed_total}</strong>
          <span>{copy.unconfirmed}</span>
        </article>
        <article>
          <strong>{totals.response_percentage}%</strong>
          <span>Response</span>
        </article>
      </Card>
      <Table className="attendance-table" label={copy.title}>
        <thead>
          <tr>
            <th>{copy.profile}</th>
            <th>Status</th>
            {snapshot && canConfigure ? <th>Correction</th> : null}
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const lastUpdated = snapshot
              ? null
              : (row as BoardRow).last_updated_at;
            const status = snapshot
              ? (row as SnapshotRow).effective_status
              : (row as BoardRow).status;
            return (
              <tr key={row.student_id}>
                <th scope="row">
                  {snapshot
                    ? (row as SnapshotRow).student_name
                    : (row as BoardRow).student_name}
                </th>
                <td>
                  <Badge
                    tone={
                      status === "staying"
                        ? "success"
                        : status === "away"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {status === "staying"
                      ? copy.staying
                      : status === "away"
                        ? copy.away
                        : copy.unconfirmed}
                  </Badge>
                  {snapshot && (row as SnapshotRow).corrected ? (
                    <span
                      title={
                        (row as SnapshotRow).correction_reason ?? undefined
                      }
                    >
                      {" · ✓"}
                    </span>
                  ) : null}
                </td>
                {snapshot && canConfigure ? (
                  <td>
                    <form action={correctAttendance} className="schedule-form">
                      <input name="locale" type="hidden" value={locale} />
                      <input name="branch" type="hidden" value={branchId} />
                      <input name="session" type="hidden" value={sessionId} />
                      <Input
                        name="student"
                        type="hidden"
                        value={row.student_id}
                      />
                      <select defaultValue={status} name="status" required>
                        <option value="staying">{copy.staying}</option>
                        <option value="away">{copy.away}</option>
                        <option value="unconfirmed">{copy.unconfirmed}</option>
                      </select>
                      <Input
                        aria-label={
                          locale === "tr"
                            ? "Düzeltme nedeni"
                            : locale === "ar"
                              ? "سبب التصحيح"
                              : "Correction reason"
                        }
                        minLength={4}
                        name="reason"
                        placeholder={
                          locale === "tr"
                            ? "Düzeltme nedeni"
                            : locale === "ar"
                              ? "سبب التصحيح"
                              : "Correction reason"
                        }
                        required
                      />
                      <Button type="submit">
                        {locale === "tr"
                          ? "Düzelt"
                          : locale === "ar"
                            ? "تصحيح"
                            : "Correct"}
                      </Button>
                    </form>
                  </td>
                ) : null}
                <td>
                  {lastUpdated ? (
                    <BidiText>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: branch.timezone,
                      }).format(new Date(lastUpdated))}
                    </BidiText>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {snapshot && canConfigure ? (
        <Card>
          <form action={reopenAttendance} className="schedule-form">
            <input name="locale" type="hidden" value={locale} />
            <input name="branch" type="hidden" value={branchId} />
            <input name="session" type="hidden" value={sessionId} />
            <label>
              {locale === "tr"
                ? "Yeniden açma nedeni"
                : locale === "ar"
                  ? "سبب إعادة الفتح"
                  : "Reopen reason"}
              <Input minLength={4} name="reason" required />
            </label>
            <Button type="submit">
              {locale === "tr"
                ? "İnceleme için yeniden aç"
                : locale === "ar"
                  ? "إعادة الفتح للمراجعة"
                  : "Reopen for review"}
            </Button>
          </form>
        </Card>
      ) : null}
      {canConfigure ? (
        <Card>
          <form action={configureAttendanceSchedule} className="schedule-form">
            <input name="locale" type="hidden" value={locale} />
            <input name="branch" type="hidden" value={branchId} />
            <label>
              {copy.branch}
              <Input defaultValue={branch.timezone} name="timezone" required />
            </label>
            <label>
              {copy.cutoff}
              <Input
                defaultValue="1320"
                max="1439"
                min="0"
                name="cutoffMinute"
                required
                type="number"
              />
            </label>
            <Button type="submit">{copy.submit}</Button>
          </form>
        </Card>
      ) : null}
    </LocalizedShell>
  );
}
