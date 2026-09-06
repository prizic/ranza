import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { createProductWebClient } from "../../../lib/supabase/server";

interface StaffAccessRow {
  branch_id: string;
  branch_name: string;
  capability: string;
  default_locale: "tr" | "en" | "ar";
  operator_id: string;
  operator_role: "owner" | "manager" | "branch_staff";
  timezone: string;
}

export default async function StaffPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);

  const { data, error } = await client
    .from("staff_branch_access")
    .select(
      "operator_id, operator_role, branch_id, branch_name, timezone, default_locale, capability",
    )
    .eq("auth_user_id", auth.user.id)
    .returns<StaffAccessRow[]>();
  if (error) throw error;

  const branches = Array.from(
    new Map((data ?? []).map((row) => [row.branch_id, row])).values(),
  );
  const requestedBranch =
    typeof query.branch === "string" ? query.branch : null;
  const selectedBranchId = selectAuthorizedBranch(
    branches.map((branch) => branch.branch_id),
    requestedBranch,
  );
  if (!selectedBranchId)
    redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const selected = branches.find(
    (branch) => branch.branch_id === selectedBranchId,
  );
  if (!selected) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const capabilities = (data ?? [])
    .filter((row) => row.branch_id === selectedBranchId)
    .map((row) => row.capability);

  return (
    <LocalizedShell locale={locale}>
      <section
        className="branch-context"
        aria-labelledby="branch-context-title"
      >
        <div>
          <span id="branch-context-title">Active Branch</span>
          <h2>{selected.branch_name}</h2>
          <BidiText>{selected.timezone}</BidiText>
        </div>
        <nav aria-label="Switch Branch" className="branch-switcher">
          {branches.map((branch) => (
            <a
              aria-current={
                branch.branch_id === selectedBranchId ? "page" : undefined
              }
              href={`/${locale}/staff?branch=${encodeURIComponent(branch.branch_id)}`}
              key={branch.branch_id}
            >
              {branch.branch_name}
            </a>
          ))}
        </nav>
      </section>
      {requestedBranch && requestedBranch !== selectedBranchId ? (
        <StatusMessage tone="warning">
          The requested Branch is unavailable. Your authorized Branch is shown
          instead.
        </StatusMessage>
      ) : null}
      <section className="control-card">
        {capabilities.includes("workflow.read") ||
        capabilities.includes("workflow.manage") ? (
          <a href={`/${locale}/staff/attendance?branch=${selectedBranchId}`}>
            {locale === "tr"
              ? "Gece yoklaması"
              : locale === "ar"
                ? "الحضور الليلي"
                : "Nightly attendance"}
          </a>
        ) : null}
        {capabilities.includes("roster.manage") ? (
          <a href={`/${locale}/staff/roster?branch=${selectedBranchId}`}>
            {locale === "tr"
              ? "Öğrenci listesi"
              : locale === "ar"
                ? "قائمة الطلاب"
                : "Student roster"}
          </a>
        ) : null}
        {capabilities.includes("workflow.manage") ||
        capabilities.includes("workflow.read") ? (
          <a href={`/${locale}/staff/meals?branch=${selectedBranchId}`}>
            {locale === "tr"
              ? "Yemek yanıtları"
              : locale === "ar"
                ? "ردود الوجبات"
                : "Meal responses"}
          </a>
        ) : null}
        <h2>Staff access</h2>
        <p>{selected.operator_role.replace("_", " ")}</p>
        <ul>
          {capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
    </LocalizedShell>
  );
}
