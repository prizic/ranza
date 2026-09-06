import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { attendanceCopy } from "../../../../lib/attendance-copy";
import { createProductWebClient } from "../../../../lib/supabase/server";

import {
  configureAttendanceSchedule,
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
  display_name: string;
  response_updated_at: string | null;
  status: "staying" | "away" | "unconfirmed";
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
        .from("attendance_snapshot_students")
        .select("student_id,display_name,status,response_updated_at")
        .eq("snapshot_id", snapshot.id)
        .order("display_name")
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
        away_total: snapshot.away_count,
        response_percentage:
          snapshot.eligible_count === 0
            ? 0
            : Math.round(
                ((snapshot.staying_count + snapshot.away_count) /
                  snapshot.eligible_count) *
                  100,
              ),
        staying_total: snapshot.staying_count,
        unconfirmed_total: snapshot.unconfirmed_count,
      }
    : liveTotals;
  const canConfigure =
    branch.operator_role === "owner" || branch.operator_role === "manager";
  const result = typeof query.result === "string" ? query.result : null;

  return (
    <LocalizedShell locale={locale}>
      <section className="branch-context">
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
      </section>
      {result ? (
        <StatusMessage
          tone={
            result === "saved" || result === "finalized" ? "success" : "warning"
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
              : locale === "tr"
                ? "İşlem tamamlanamadı."
                : locale === "ar"
                  ? "تعذّر إكمال العملية."
                  : "The operation could not be completed."}
        </StatusMessage>
      ) : null}
      {snapshot ? (
        <StatusMessage tone="success">
          {locale === "tr"
            ? `Kesin kayıt · sürüm ${snapshot.version}`
            : locale === "ar"
              ? `السجل النهائي · الإصدار ${snapshot.version}`
              : `Final Snapshot · version ${snapshot.version}`}{" "}
          <BidiText>{snapshot.finalized_at}</BidiText>
        </StatusMessage>
      ) : session.cutoff_at <= new Date().toISOString() ? (
        <form action={retryAttendanceFinalization}>
          <input name="locale" type="hidden" value={locale} />
          <input name="branch" type="hidden" value={branchId} />
          <input name="session" type="hidden" value={sessionId} />
          <button className="button" type="submit">
            {locale === "tr"
              ? "Güvenli kesinleştirmeyi yeniden dene"
              : locale === "ar"
                ? "إعادة محاولة التثبيت الآمن"
                : "Retry safe finalization"}
          </button>
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
      <section className="attendance-totals" aria-label={copy.title}>
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
      </section>
      <div className="table-scroll">
        <table className="attendance-table">
          <thead>
            <tr>
              <th>{copy.profile}</th>
              <th>Status</th>
              <th>Last update</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const lastUpdated = snapshot
                ? (row as SnapshotRow).response_updated_at
                : (row as BoardRow).last_updated_at;
              return (
                <tr key={row.student_id}>
                  <th scope="row">
                    {snapshot
                      ? (row as SnapshotRow).display_name
                      : (row as BoardRow).student_name}
                  </th>
                  <td>
                    {row.status === "staying"
                      ? copy.staying
                      : row.status === "away"
                        ? copy.away
                        : copy.unconfirmed}
                  </td>
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
        </table>
      </div>
      {canConfigure ? (
        <form action={configureAttendanceSchedule} className="schedule-form">
          <input name="locale" type="hidden" value={locale} />
          <input name="branch" type="hidden" value={branchId} />
          <label>
            {copy.branch}
            <input defaultValue={branch.timezone} name="timezone" required />
          </label>
          <label>
            {copy.cutoff}
            <input
              defaultValue="1320"
              max="1439"
              min="0"
              name="cutoffMinute"
              required
              type="number"
            />
          </label>
          <button className="button" type="submit">
            {copy.submit}
          </button>
        </form>
      ) : null}
    </LocalizedShell>
  );
}
