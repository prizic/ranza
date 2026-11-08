import { notFound } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { PlannedScreen } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { gateOf, screenFor } from "../../../../lib/screens";
import { frontDeskProperty } from "../../../../server/front-desk";
import { ScreenDenied } from "../screen-denied";
import { HomeButton } from "../workspace-home";
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

  // Same gate as every built screen, asked about the Property named in the
  // address when one is: entitlement is not waived because the workflow is
  // unfinished, and a Property that has not bought this says so, not "soon"
  // (audit 2026-11-07, D-11). The Property is written into the address, as it
  // is on built screens, so the Go to Today button carries one that was checked.
  const search = await searchParams;
  const property = await frontDeskProperty(
    await screenProperties(gateOf("food-and-beverage")),
    search,
    localizeHref(locale, SEGMENT),
  );

  if (!property) {
    return (
      <ScreenDenied
        denial={await whyDenied(gateOf("food-and-beverage"), search.property)}
        locale={locale}
      />
    );
  }

  return (
    <PlannedScreen
      action={<HomeButton locale={locale} />}
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
