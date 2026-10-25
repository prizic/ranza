import { notFound } from "next/navigation";
import Link from "next/link";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { Button, PlannedScreen } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { gateOf, screenFor } from "../../../../lib/screens";
import { ScreenDenied } from "../screen-denied";
import {
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";

const SEGMENT = "food-and-beverage";

/**
 * Food And Beverage — a destination with nothing behind it yet.
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  await requireViewer(locale);

  const t = await getTranslations();
  const screen = screenFor(SEGMENT);
  if (!screen) notFound();

  // Same gate as every built screen. Entitlement is not waived because the
  // workflow is unfinished — a Property that has not bought this reaches
  // nothing, and that is what the empty state says.
  const { property } = await searchParams;
  const properties = await screenProperties(gateOf("food-and-beverage"));

  if (properties.length === 0) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("food-and-beverage"), property)}
        locale={locale}
      />
    );
  }

  return (
    <PlannedScreen
      action={
        <Button asChild>
          <Link
            href={`${localizeHref(locale, "today")}${property ? `?property=${encodeURIComponent(property)}` : ""}`}
          >
            {t("denied.goToToday")}
          </Link>
        </Button>
      }
      heading={t("planned")}
      lead={t("plannedLead")}
      summary={
        t.has(`screenSummary.${SEGMENT}`) ? t(`screenSummary.${SEGMENT}`) : ""
      }
      title={
        t.has(`navigation.${SEGMENT}`) ? t(`navigation.${SEGMENT}`) : SEGMENT
      }
    />
  );
}
