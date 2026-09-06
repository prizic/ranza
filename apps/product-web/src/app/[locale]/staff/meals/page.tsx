import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { publishMealDayAction } from "./actions";

interface AccessRow {
  branch_id: string;
  branch_name: string;
  capability: string;
  operator_id: string;
}

export default async function StaffMealsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff/meals">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data: access, error: accessError } = await client
    .from("staff_branch_access")
    .select("operator_id, branch_id, branch_name, capability")
    .eq("auth_user_id", auth.user.id)
    .returns<AccessRow[]>();
  if (accessError) throw accessError;
  const branches = Array.from(
    new Map((access ?? []).map((row) => [row.branch_id, row])).values(),
  );
  const branchId = selectAuthorizedBranch(
    branches.map((branch) => branch.branch_id),
    typeof query.branch === "string" ? query.branch : null,
  );
  if (!branchId) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const branch = branches.find((item) => item.branch_id === branchId);
  if (!branch) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const canManage = (access ?? []).some(
    (row) => row.branch_id === branchId && row.capability === "workflow.manage",
  );
  const { data: totals, error: totalError } = await client
    .from("meal_day_live_totals")
    .select(
      "meal_day_id, service_date, deadline_at, responded, zero_meal, unconfirmed, breakfast, lunch, dinner",
    )
    .eq("branch_id", branchId)
    .order("service_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (totalError) throw totalError;
  const { data: statuses, error: statusError } = totals
    ? await client
        .from("meal_response_status")
        .select(
          "student_id, display_name, response_status, selected_meals, submitted_at",
        )
        .eq("meal_day_id", totals.meal_day_id)
        .order("display_name")
    : { data: [], error: null };
  if (statusError) throw statusError;
  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>Meal Day · {branch.branch_name}</h2>
        {query.result === "published" ? (
          <StatusMessage tone="success">Meal Day published.</StatusMessage>
        ) : null}
        {query.result === "failed" ? (
          <StatusMessage tone="warning">
            Meal Day could not be published.
          </StatusMessage>
        ) : null}
        {canManage ? (
          <form action={publishMealDayAction} className="control-form">
            <input name="locale" type="hidden" value={locale} />
            <input name="operatorId" type="hidden" value={branch.operator_id} />
            <input name="branchId" type="hidden" value={branchId} />
            <label>
              Service date
              <input name="serviceDate" required type="date" />
            </label>
            <label>
              Immutable UTC deadline
              <input name="deadlineAt" required type="datetime-local" />
            </label>
            {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
              <label key={meal}>
                <input name="meal" type="checkbox" value={meal} />
                {meal}
              </label>
            ))}
            <button className="button" type="submit">
              Publish
            </button>
          </form>
        ) : null}
      </section>
      {totals ? (
        <section className="control-card">
          <h2>{totals.service_date}</h2>
          <p>
            Breakfast {totals.breakfast} · Lunch {totals.lunch} · Dinner{" "}
            {totals.dinner}
          </p>
          <p>
            Responded {totals.responded} · Explicit zero {totals.zero_meal} ·
            Unconfirmed {totals.unconfirmed}
          </p>
          <ul>
            {(statuses ?? []).map((status) => (
              <li key={status.student_id}>
                {status.display_name} · {status.response_status} ·{" "}
                {(status.selected_meals as string[]).join(", ") || "no meals"}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <StatusMessage>
          No Meal Day has been published for this Branch.
        </StatusMessage>
      )}
    </LocalizedShell>
  );
}
