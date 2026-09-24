import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { EmptyState, PlannedScreen } from "@ranza/ui";
import { getTranslations } from "next-intl/server";
import { screenFor } from "../../../../lib/screens";
import { entitledProperties, requireViewer } from "../../../../server/viewer";

const SEGMENT = "guest-experience";

/**
 * Guest Experience — a destination with nothing behind it yet.
 *
 * The route is real and the gate is real: a viewer whose Organization is not
 * entitled to it sees the empty state, exactly as they would for a capability
 * that exists. What is missing is the workflow, and blueprint section 13
 * forbids building the tables for one ahead of the workflow that needs them.
 *
 * docs/handover/operator-workspace-screens.md says what this screen must do
 * and what has to exist first.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  await requireViewer(locale);

  const t = await getTranslations();
  const screen = screenFor(SEGMENT);
  if (!screen) notFound();

  // Same gate as every built screen. Entitlement is not waived because the
  // workflow is unfinished — a Property that has not bought this reaches
  // nothing, and that is what the empty state says.
  const properties = await entitledProperties({
    moduleKey: screen.module,
    capabilityKey: screen.capability,
  });

  if (properties.length === 0) {
    return (
      <EmptyState
        description={t("notEntitledDescription")}
        title={t("notEntitledTitle")}
      />
    );
  }

  return (
    <PlannedScreen
      blueprintSection={screen.blueprint}
      handoverHref="https://github.com/prizic/ranza/blob/main/docs/handover/operator-workspace-screens.md"
      handoverLabel={t("handoverLabel")}
      heading={t("planned")}
      summary={
        t.has(`screenSummary.${SEGMENT}`) ? t(`screenSummary.${SEGMENT}`) : ""
      }
      title={
        t.has(`navigation.${SEGMENT}`) ? t(`navigation.${SEGMENT}`) : SEGMENT
      }
    />
  );
}
