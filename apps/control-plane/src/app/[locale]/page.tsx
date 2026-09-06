import { formatNumber, isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";

import { LocalizedShell } from "../../components/localized-shell";
import { readOperators } from "../../lib/operator-control";
import { hasControlPlaneDatabase } from "../../lib/supabase/server";
import {
  archiveBranchAction,
  approveLifecyclePolicyAction,
  createBranchAction,
  createOperatorAction,
  executeLifecycleAction,
  planLifecycleAction,
  requestOperatorExportAction,
  setOperatorStatusAction,
  signOutAction,
} from "./actions";

const labels = {
  ar: {
    activate: "تفعيل",
    archive: "أرشفة",
    branch: "إضافة فرع",
    create: "إنشاء",
    female: "سكن طالبات",
    locale: "اللغة الافتراضية",
    male: "سكن طلاب",
    mixed: "مختلط",
    name: "الاسم",
    operator: "إضافة مشغّل",
    other: "آخر",
    signOut: "تسجيل الخروج",
    suspend: "تعليق",
    timezone: "المنطقة الزمنية",
  },
  en: {
    activate: "Activate",
    archive: "Archive",
    branch: "Add Branch",
    create: "Create",
    female: "Female residence",
    locale: "Default locale",
    male: "Male residence",
    mixed: "Mixed residence",
    name: "Name",
    operator: "Add Operator",
    other: "Other",
    signOut: "Sign out",
    suspend: "Suspend",
    timezone: "Timezone",
  },
  tr: {
    activate: "Etkinleştir",
    archive: "Arşivle",
    branch: "Şube ekle",
    create: "Oluştur",
    female: "Kadın öğrenci yurdu",
    locale: "Varsayılan dil",
    male: "Erkek öğrenci yurdu",
    mixed: "Karma yurt",
    name: "Ad",
    operator: "Operatör ekle",
    other: "Diğer",
    signOut: "Çıkış yap",
    suspend: "Askıya al",
    timezone: "Saat dilimi",
  },
} as const;

export default async function ControlPlanePage({
  params,
  searchParams,
}: PageProps<"/[locale]">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const copy = labels[locale];

  if (!hasControlPlaneDatabase()) {
    return (
      <LocalizedShell locale={locale}>
        <StatusMessage tone="warning">
          Configure the server-side Supabase environment to enable secured
          Operator administration. <BidiText>RANZA-CP-SETUP</BidiText>
        </StatusMessage>
      </LocalizedShell>
    );
  }

  const operators = await readOperators(locale);
  const branchCount = operators.reduce(
    (total, operator) => total + operator.branches.length,
    0,
  );

  return (
    <LocalizedShell locale={locale}>
      <div className="control-toolbar">
        <StatusMessage tone={query.result ? "success" : "info"}>
          {query.result
            ? "The audited lifecycle change was saved."
            : "Authenticated Platform Admin session"}
        </StatusMessage>
        <form action={signOutAction}>
          <input name="locale" type="hidden" value={locale} />
          <button className="button button-secondary" type="submit">
            {copy.signOut}
          </button>
        </form>
      </div>

      <section className="ops-list">
        <article id="operators">
          <h2>{copy.operator}</h2>
          <strong>{formatNumber(operators.length, locale)}</strong>
        </article>
        <article id="branches">
          <h2>{copy.branch}</h2>
          <strong>{formatNumber(branchCount, locale)}</strong>
        </article>
        <article id="health">
          <h2>Audit</h2>
          <BidiText>RLS · MFA</BidiText>
        </article>
      </section>

      <section className="control-grid">
        <form
          action={createOperatorAction}
          className="control-card control-form"
        >
          <h2>{copy.operator}</h2>
          <input name="locale" type="hidden" value={locale} />
          <label>
            <span>{copy.name}</span>
            <input maxLength={120} minLength={2} name="name" required />
          </label>
          <label>
            <span>{copy.locale}</span>
            <select defaultValue="tr" name="defaultLocale">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <button className="button" type="submit">
            {copy.create}
          </button>
        </form>
      </section>

      <section aria-label="Operators" className="operator-directory">
        {operators.map((operator) => (
          <article className="operator-card" key={operator.id}>
            <header>
              <div>
                <h2>{operator.name}</h2>
                <BidiText>{operator.id}</BidiText>
                <p>
                  <strong>{operator.billableBeds}</strong> Billable Beds ·{" "}
                  {operator.currentSubscription
                    ? `${operator.currentSubscription.status} · ${operator.currentSubscription.pricingReference}`
                    : "Subscription not configured"}
                </p>
              </div>
              <strong className={`lifecycle-status status-${operator.status}`}>
                {operator.status}
              </strong>
            </header>
            <div className="lifecycle-actions">
              <form action={requestOperatorExportAction}>
                <input name="locale" type="hidden" value={locale} />
                <input name="operatorId" type="hidden" value={operator.id} />
                <button className="button button-secondary" type="submit">
                  Request full export
                </button>
              </form>
              {operator.latestExport ? (
                operator.latestExport.status === "ready" ? (
                  <a
                    className="button button-secondary"
                    href={`/api/operator-exports/${operator.latestExport.id}/download?operator=${operator.id}`}
                  >
                    Download export
                  </a>
                ) : (
                  <span>Export: {operator.latestExport.status}</span>
                )
              ) : null}
              <span>
                Data lifecycle: {operator.lifecycle?.state ?? operator.status}
              </span>
            </div>
            <form
              action={approveLifecyclePolicyAction}
              className="control-form compact-form"
            >
              <h3>Approved retention policy</h3>
              <input name="locale" type="hidden" value={locale} />
              <input name="operatorId" type="hidden" value={operator.id} />
              <label>
                Archive retention days
                <input
                  defaultValue="30"
                  min="1"
                  name="archiveDays"
                  type="number"
                />
              </label>
              <label>
                Anonymize after days
                <input
                  defaultValue="365"
                  min="1"
                  name="anonymizeDays"
                  type="number"
                />
              </label>
              <label>
                Delete after days
                <input
                  defaultValue="2555"
                  min="1"
                  name="deleteDays"
                  type="number"
                />
              </label>
              <label>
                Export retention hours
                <input
                  defaultValue="24"
                  max="168"
                  min="1"
                  name="exportHours"
                  type="number"
                />
              </label>
              <button className="button button-secondary" type="submit">
                Approve policy
              </button>
            </form>
            {operator.status === "archived" &&
            operator.lifecycle?.policyVersion ? (
              <div className="lifecycle-actions">
                {(["anonymize", "delete"] as const).map((action) => (
                  <form action={planLifecycleAction} key={action}>
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="operatorId"
                      type="hidden"
                      value={operator.id}
                    />
                    <input
                      name="lifecycleAction"
                      type="hidden"
                      value={action}
                    />
                    <button className="button button-secondary" type="submit">
                      Dry run {action}
                    </button>
                  </form>
                ))}
              </div>
            ) : null}
            {operator.lifecycleRuns
              .filter((run) => run.isDryRun && run.status === "planned")
              .map((run) => (
                <form
                  action={executeLifecycleAction}
                  className="control-form compact-form"
                  key={run.id}
                >
                  <input name="locale" type="hidden" value={locale} />
                  <input name="operatorId" type="hidden" value={operator.id} />
                  <input name="runId" type="hidden" value={run.id} />
                  <input
                    name="idempotencyKey"
                    type="hidden"
                    value={randomUUID()}
                  />
                  <span>Dry-run manifest ready: {run.action}</span>
                  <button className="button" type="submit">
                    Queue approved execution
                  </button>
                </form>
              ))}
            {operator.status !== "archived" ? (
              <div className="lifecycle-actions">
                {operator.status !== "active" ? (
                  <StatusForm
                    action="active"
                    current={operator.status}
                    label={copy.activate}
                    locale={locale}
                    operatorId={operator.id}
                  />
                ) : null}
                {operator.status !== "suspended" ? (
                  <StatusForm
                    action="suspended"
                    current={operator.status}
                    label={copy.suspend}
                    locale={locale}
                    operatorId={operator.id}
                  />
                ) : null}
                <StatusForm
                  action="archived"
                  current={operator.status}
                  label={copy.archive}
                  locale={locale}
                  operatorId={operator.id}
                />
              </div>
            ) : null}

            <div className="branch-directory">
              {operator.branches.map((branch) => (
                <div className="branch-row" key={branch.id}>
                  <div>
                    <strong>{branch.name}</strong>
                    <small>
                      {branch.residenceClassification} · {branch.timezone} ·{" "}
                      {branch.defaultLocale} · {branch.billableBeds} Billable
                      Beds
                    </small>
                  </div>
                  {branch.status === "active" ? (
                    <form action={archiveBranchAction}>
                      <input name="locale" type="hidden" value={locale} />
                      <input
                        name="operatorId"
                        type="hidden"
                        value={operator.id}
                      />
                      <input name="branchId" type="hidden" value={branch.id} />
                      <button className="button button-secondary" type="submit">
                        {copy.archive}
                      </button>
                    </form>
                  ) : (
                    <span className="lifecycle-status status-archived">
                      archived
                    </span>
                  )}
                </div>
              ))}
            </div>

            {operator.status !== "archived" ? (
              <form
                action={createBranchAction}
                className="control-form compact-form"
              >
                <h3>{copy.branch}</h3>
                <input name="locale" type="hidden" value={locale} />
                <input name="operatorId" type="hidden" value={operator.id} />
                <label>
                  <span>{copy.name}</span>
                  <input maxLength={120} minLength={2} name="name" required />
                </label>
                <label>
                  <span>{copy.timezone}</span>
                  <input
                    defaultValue="Europe/Istanbul"
                    name="timezone"
                    required
                  />
                </label>
                <label>
                  <span>{copy.locale}</span>
                  <select
                    defaultValue={operator.defaultLocale}
                    name="defaultLocale"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </label>
                <label>
                  <span>Residence</span>
                  <select defaultValue="other" name="residenceClassification">
                    <option value="male">{copy.male}</option>
                    <option value="female">{copy.female}</option>
                    <option value="mixed">{copy.mixed}</option>
                    <option value="other">{copy.other}</option>
                  </select>
                </label>
                <button className="button" type="submit">
                  {copy.create}
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </LocalizedShell>
  );
}

function StatusForm({
  action,
  current,
  label,
  locale,
  operatorId,
}: {
  action: "active" | "suspended" | "archived";
  current: "pending" | "active" | "suspended";
  label: string;
  locale: "tr" | "en" | "ar";
  operatorId: string;
}) {
  return (
    <form action={setOperatorStatusAction}>
      <input name="locale" type="hidden" value={locale} />
      <input name="operatorId" type="hidden" value={operatorId} />
      <input name="currentStatus" type="hidden" value={current} />
      <input name="status" type="hidden" value={action} />
      <button className="button button-secondary" type="submit">
        {label}
      </button>
    </form>
  );
}
