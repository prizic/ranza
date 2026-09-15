import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { Badge, BidiText, Card, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { createProductWebClient } from "../../../lib/supabase/server";
import { announcementCopy } from "../../../lib/announcement-copy";

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
      <Card
        className="branch-context"
        tone="strong"
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
      </Card>
      {requestedBranch && requestedBranch !== selectedBranchId ? (
        <StatusMessage tone="warning">
          The requested Branch is unavailable. Your authorized Branch is shown
          instead.
        </StatusMessage>
      ) : null}
      <Card className="staff-module-grid" aria-label="Staff tools">
        {selected.operator_role === "owner" ? (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/exports?operator=${selected.operator_id}`}
          >
            {locale === "tr"
              ? "Verileri dışa aktar"
              : locale === "ar"
                ? "تصدير البيانات"
                : "Export Operator data"}
          </a>
        ) : null}
        {capabilities.includes("workflow.read") ||
        capabilities.includes("workflow.manage") ? (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/attendance?branch=${selectedBranchId}`}
          >
            {locale === "tr"
              ? "Gece yoklaması"
              : locale === "ar"
                ? "الحضور الليلي"
                : "Nightly attendance"}
          </a>
        ) : null}
        {capabilities.includes("workflow.manage") && (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/announcements?operator=${selected.operator_id}`}
          >
            {announcementCopy[locale].manage}
          </a>
        )}
        {capabilities.includes("roster.manage") ? (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/roster?branch=${selectedBranchId}`}
          >
            {locale === "tr"
              ? "Öğrenci listesi"
              : locale === "ar"
                ? "قائمة الطلاب"
                : "Student roster"}
          </a>
        ) : null}
        {capabilities.includes("workflow.manage") ||
        capabilities.includes("workflow.read") ? (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/meals?branch=${selectedBranchId}`}
          >
            {locale === "tr"
              ? "Yemek yanıtları"
              : locale === "ar"
                ? "ردود الوجبات"
                : "Meal responses"}
          </a>
        ) : null}
        {capabilities.includes("finance.manage") ? (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/balances?branch=${selectedBranchId}`}
          >
            {locale === "tr"
              ? "Öğrenci bakiyeleri"
              : locale === "ar"
                ? "أرصدة الطلاب"
                : "Student Balances"}
          </a>
        ) : null}
        {capabilities.includes("workflow.manage") ||
        capabilities.includes("workflow.read") ? (
          <a
            className="staff-module-link"
            href={`/${locale}/staff/wifi?branch=${selectedBranchId}`}
          >
            {locale === "tr"
              ? "Şube Wi-Fi"
              : locale === "ar"
                ? "شبكة Wi-Fi للفرع"
                : "Branch Wi-Fi"}
          </a>
        ) : null}
        <h2>Staff access</h2>
        <Badge tone="info">{selected.operator_role.replace("_", " ")}</Badge>
        <ul className="badge-list">
          {capabilities.map((capability) => (
            <li key={capability}>
              <Badge>{capability}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </LocalizedShell>
  );
}
