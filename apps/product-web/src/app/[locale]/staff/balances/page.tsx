import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { createProductWebClient } from "../../../../lib/supabase/server";
import { postBalanceEntryAction, reverseBalanceEntryAction } from "./actions";

interface AccessRow {
  branch_id: string;
  branch_name: string;
  capability: string;
  operator_id: string;
}

export default async function StaffBalancesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff/balances">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);
  const { data: access, error: accessError } = await client
    .from("staff_branch_access")
    .select("operator_id,branch_id,branch_name,capability")
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
    (row) => row.branch_id === branchId && row.capability === "finance.manage",
  );
  const { data: summaries, error: summaryError } = await client
    .from("branch_student_balance_summary")
    .select(
      "student_id,display_name,currency,remaining_balance,overdue_balance",
    )
    .eq("branch_id", branchId)
    .order("display_name");
  if (summaryError) throw summaryError;
  const selectedId = typeof query.student === "string" ? query.student : null;
  const selected = (summaries ?? []).find(
    (student) => student.student_id === selectedId,
  );
  const { data: entries, error: entryError } = selected
    ? await client
        .from("student_balance_entries")
        .select(
          "id,entry_type,amount,currency,effective_date,due_date,description,reversal_of",
        )
        .eq("student_id", selected.student_id)
        .order("effective_date", { ascending: false })
    : { data: [], error: null };
  if (entryError) throw entryError;
  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>Student Balances · {branch.branch_name}</h2>
        <StatusMessage tone="warning">
          Ranza records money activity reported by the dormitory. It never
          collects, transfers, settles, or receipts money.
        </StatusMessage>
        {query.result ? (
          <StatusMessage
            tone={
              query.result === "posted" || query.result === "reversed"
                ? "success"
                : "warning"
            }
          >
            {query.result}
          </StatusMessage>
        ) : null}
        <ul>
          {(summaries ?? []).map((student) => (
            <li key={student.student_id}>
              <a
                href={`/${locale}/staff/balances?branch=${branchId}&student=${student.student_id}`}
              >
                {student.display_name}
              </a>{" "}
              ·{" "}
              <BidiText>
                {student.remaining_balance} {student.currency}
              </BidiText>{" "}
              · overdue {student.overdue_balance}
            </li>
          ))}
        </ul>
      </section>
      {selected && canManage ? (
        <section className="control-card">
          <h2>{selected.display_name}</h2>
          <form action={postBalanceEntryAction} className="control-form">
            <input name="locale" type="hidden" value={locale} />
            <input name="operatorId" type="hidden" value={branch.operator_id} />
            <input name="branchId" type="hidden" value={branchId} />
            <input name="studentId" type="hidden" value={selected.student_id} />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <label>
              Entry type
              <select name="entryType">
                <option value="charge">Charge</option>
                <option value="external_payment">
                  External Payment Record
                </option>
                <option value="credit">Credit</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                name="amount"
                pattern="[+-]?[0-9]+([.][0-9]{1,2})?"
                required
              />
            </label>
            <label>
              Currency
              <input
                defaultValue="TRY"
                maxLength={3}
                minLength={3}
                name="currency"
                required
              />
            </label>
            <label>
              Effective date
              <input
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="effectiveDate"
                required
                type="date"
              />
            </label>
            <label>
              Due date (charges only)
              <input name="dueDate" type="date" />
            </label>
            <label>
              Description
              <input
                maxLength={500}
                minLength={2}
                name="description"
                required
              />
            </label>
            <button className="button" type="submit">
              Record entry
            </button>
          </form>
          <ul>
            {(entries ?? []).map((entry) => (
              <li key={entry.id}>
                <strong>
                  {entry.entry_type} · {entry.amount} {entry.currency}
                </strong>
                <p>{entry.description}</p>
                {entry.entry_type !== "reversal" ? (
                  <form action={reverseBalanceEntryAction}>
                    <input name="locale" type="hidden" value={locale} />
                    <input name="branchId" type="hidden" value={branchId} />
                    <input
                      name="studentId"
                      type="hidden"
                      value={selected.student_id}
                    />
                    <input name="entryId" type="hidden" value={entry.id} />
                    <input
                      name="idempotencyKey"
                      type="hidden"
                      value={randomUUID()}
                    />
                    <label>
                      Reversal reason
                      <input minLength={2} name="description" required />
                    </label>
                    <button className="button button-secondary" type="submit">
                      Reverse
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </LocalizedShell>
  );
}
