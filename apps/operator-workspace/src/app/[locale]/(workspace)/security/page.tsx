import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
  setRequestLocale(locale);

  const t = await getTranslations();
  const viewer = await requireViewer(locale);

  return (
    <>
      <p className="text-muted-foreground">{t("securitySummary")}</p>

      <TwoFactorPanel enabled={viewer.twoFactorEnabled} />
    </>
  );
}
