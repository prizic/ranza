import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { wifiCopy } from "../../../../lib/wifi-copy";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { readProtectedWifi } from "../../../../server/protected-wifi";

import { saveProtectedWifi } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AccessRow {
  branch_id: string;
  branch_name: string;
  capability: string;
  operator_role: "owner" | "manager" | "branch_staff";
}

export default async function StaffWifiPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff/wifi">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const copy = wifiCopy[locale];
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data: access, error } = await client
    .from("staff_branch_access")
    .select("branch_id,branch_name,operator_role,capability")
    .eq("auth_user_id", auth.user.id)
    .returns<AccessRow[]>();
  if (error) throw error;
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
  const details = await readProtectedWifi(client, branchId);

  return (
    <LocalizedShell locale={locale}>
      <section className="branch-context">
        <div>
          <span>{copy.branch}</span>
          <h2>{branch.branch_name}</h2>
          <p>{copy.protectedMode}</p>
        </div>
        <nav aria-label={copy.branch} className="branch-switcher">
          {branches.map((item) => (
            <a
              aria-current={item.branch_id === branchId ? "page" : undefined}
              href={`/${locale}/staff/wifi?branch=${item.branch_id}`}
              key={item.branch_id}
            >
              {item.branch_name}
            </a>
          ))}
        </nav>
      </section>
      {query.result === "saved" ? (
        <StatusMessage tone="success">{copy.saved}</StatusMessage>
      ) : null}
      {query.result === "failed" ? (
        <StatusMessage tone="warning">{copy.unavailable}</StatusMessage>
      ) : null}
      {details ? (
        <section className="wifi-details">
          <h2>{copy.title}</h2>
          <dl>
            <dt>{copy.networkName}</dt>
            <dd>
              <BidiText>{details.networkName}</BidiText>
            </dd>
            <dt>{copy.password}</dt>
            <dd>
              <BidiText>{details.password}</BidiText>
            </dd>
            <dt>{copy.instructions}</dt>
            <dd>{details.instructions || "—"}</dd>
            <dt>{copy.updated}</dt>
            <dd>
              <BidiText>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(details.updatedAt))}
              </BidiText>
            </dd>
          </dl>
        </section>
      ) : (
        <StatusMessage>{copy.noDetails}</StatusMessage>
      )}
      {canManage ? (
        <form action={saveProtectedWifi} className="control-form wifi-form">
          <input name="locale" type="hidden" value={locale} />
          <input name="branchId" type="hidden" value={branchId} />
          <label>
            {copy.mode}
            <input disabled value={copy.protectedMode} />
          </label>
          <label>
            {copy.networkName}
            <input
              autoComplete="off"
              maxLength={128}
              name="networkName"
              required
            />
          </label>
          <label>
            {copy.password}
            <input
              autoComplete="new-password"
              maxLength={256}
              name="password"
              required
              type="password"
            />
          </label>
          <label>
            {copy.instructions}
            <textarea maxLength={1000} name="instructions" rows={4} />
          </label>
          <button className="button" type="submit">
            {copy.save}
          </button>
        </form>
      ) : null}
    </LocalizedShell>
  );
}
