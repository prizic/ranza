import { isSupportedLocale } from "@ranza/i18n";
import { leadMessagesFor } from "@ranza/i18n/leads";
import { BidiText } from "@ranza/ui";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { leadReviewClient } from "../../../server/lead-client";
import { LocalizedShell } from "../../../components/localized-shell";

export const metadata = { robots: { index: false, follow: false } };
interface LeadRow {
  id: string;
  name: string;
  contact: string;
  operator_name: string;
  approximate_beds: number;
  city: string;
  preferred_language: string;
  message: string;
  status: string;
  created_at: string;
  consent_version: string;
  consent_at: string;
  correlation_id: string;
}
export default async function LeadsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/leads">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const m = leadMessagesFor(locale);
  const client = await leadReviewClient();
  const requested = (await searchParams).status;
  const status =
    typeof requested === "string" && Object.hasOwn(m.statuses, requested)
      ? requested
      : "new";
  const result = client
    ? await client
        .from("leads")
        .select(
          "id,name,contact,operator_name,approximate_beds,city,preferred_language,message,status,created_at,consent_version,consent_at,correlation_id",
        )
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(100)
    : null;
  async function updateStatus(form: FormData) {
    "use server";
    const client = await leadReviewClient();
    const id = form.get("id"),
      next = form.get("status");
    if (
      !client ||
      typeof id !== "string" ||
      !/^[\da-f-]{36}$/i.test(id) ||
      typeof next !== "string" ||
      !["new", "contacted", "qualified", "closed"].includes(next)
    )
      throw new Error("Lead update denied");
    const { data, error } = await client
      .from("leads")
      .update({ status: next })
      .eq("id", id)
      .select("id");
    if (error || data?.length !== 1) throw new Error("Lead update denied");
    revalidatePath(`/${locale}/leads`);
  }
  return (
    <LocalizedShell locale={locale}>
      <h2>{m.leads}</h2>
      {!client || result?.error ? (
        <p role="status">{m.restricted}</p>
      ) : (
        <>
          <form>
            <label htmlFor="lead-filter">{m.status}</label>{" "}
            <select id="lead-filter" name="status" defaultValue={status}>
              {Object.entries(m.statuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>{" "}
            <button className="button">{m.leads}</button>
          </form>
          {!result?.data?.length && <p>{m.empty}</p>}
          {(result?.data as LeadRow[] | undefined)?.map((lead) => (
            <article className="status-message" key={lead.id}>
              <h3>{lead.operator_name}</h3>
              <p>
                {lead.name} · <BidiText>{lead.contact}</BidiText>
              </p>
              <p>
                {m.city}: {lead.city} · {m.beds}:{" "}
                <BidiText>{lead.approximate_beds}</BidiText> · {m.language}:{" "}
                {lead.preferred_language}
              </p>
              <p dir="auto">{lead.message}</p>
              <p>
                {m.privacy}:{" "}
                <BidiText>
                  {lead.consent_version} · {lead.consent_at}
                </BidiText>
              </p>
              <p>
                {m.reference}: <BidiText>{lead.correlation_id}</BidiText>
              </p>
              <form action={updateStatus}>
                <input type="hidden" name="id" value={lead.id} />
                <label htmlFor={`status-${lead.id}`}>{m.status}</label>{" "}
                <select
                  id={`status-${lead.id}`}
                  name="status"
                  defaultValue={lead.status}
                >
                  {Object.entries(m.statuses).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>{" "}
                <button className="button">{m.save}</button>
              </form>
            </article>
          ))}
        </>
      )}
    </LocalizedShell>
  );
}
