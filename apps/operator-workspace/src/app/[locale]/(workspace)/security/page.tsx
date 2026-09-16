import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { PageHeader } from "@ranza/ui";
import { messages } from "../../../../messages";
import { requireViewer } from "../../../../server/viewer";
import { TwoFactorPanel } from "./two-factor-panel";

/**
 * Security: how this account is signed in to.
 *
 * Account-level rather than Organization-level. A second factor belongs to a
 * person, not to a Property or an Entitlement, so nothing here is gated by
 * blueprint 3.5 — it is reachable by anyone who can reach the shell at all,
 * including a Staff Member who belongs to no Organization yet.
 */
export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy = messages[locale];
  const viewer = await requireViewer(locale);

  return (
    <>
      <PageHeader>
        <h1 className="text-step-2 font-normal">{copy.security}</h1>
        <p className="mt-1.5 text-ink-soft">{copy.securitySummary}</p>
      </PageHeader>

      <TwoFactorPanel copy={copy} enabled={viewer.twoFactorEnabled} />
    </>
  );
}
