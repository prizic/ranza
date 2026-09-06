import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";

export default async function ForbiddenPage({
  params,
}: PageProps<"/[locale]/forbidden">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return (
    <LocalizedShell locale={locale}>
      <StatusMessage tone="warning">
        This identity does not have active Platform Admin access. Reference{" "}
        <BidiText>RANZA-CP-AUTH</BidiText>
      </StatusMessage>
    </LocalizedShell>
  );
}
