import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { attendanceCopy } from "../../../../lib/attendance-copy";
import { createProductWebClient } from "../../../../lib/supabase/server";

import { configureAttendanceSchedule } from "./actions";

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
  const { data: boardData, error: boardError } = await client.rpc(
    "attendance_board",
    { target_session_id: sessionId },
  );
  if (boardError) throw boardError;
  const rows = (boardData ?? []) as BoardRow[];
  const totals = rows[0] ?? {
    away_total: 0,
    response_percentage: 0,
    staying_total: 0,
    unconfirmed_total: 0,
  };
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
        <StatusMessage tone={result === "saved" ? "success" : "warning"}>
          {result === "saved"
            ? copy.saved
            : locale === "tr"
              ? "Ayar kaydedilemedi."
              : locale === "ar"
                ? "تعذّر حفظ الإعداد."
                : "The schedule was not saved."}
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
            {rows.map((row) => (
              <tr key={row.student_id}>
                <th scope="row">{row.student_name}</th>
                <td>
                  {row.status === "staying"
                    ? copy.staying
                    : row.status === "away"
                      ? copy.away
                      : copy.unconfirmed}
                </td>
                <td>
                  {row.last_updated_at ? (
                    <BidiText>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: branch.timezone,
                      }).format(new Date(row.last_updated_at))}
                    </BidiText>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
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
