import type { useTranslations } from "next-intl";
import type { Figures } from "../../server/analytics";

type MonthTranslator = ReturnType<typeof useTranslations<"analytics.month">>;

/** A reason a figure is not what it appears, and where to see why. */
export interface Problem {
  text: string;
  link: string;
  href: string;
}

/** The section that lists the nights that earned no charge, and so explains an understated figure. */
export const UNCHARGED_ANCHOR = "analytics-uncharged";

/**
 * What a figure that rests on charges says when some of the nights it rests on
 * have none: the count, and the section that lists them. Said under revenue and
 * the rates that divide it, wherever they are shown (ANALYTICS-02): an
 * unpriced night is not a night that earned zero.
 */
export function unchargedProblem(
  figures: Pick<Figures, "unchargedGuestNights">,
  t: MonthTranslator,
): Problem | null {
  return figures.unchargedGuestNights > 0
    ? {
        text: t("understated", { count: figures.unchargedGuestNights }),
        link: t("seeUncharged"),
        href: `#${UNCHARGED_ANCHOR}`,
      }
    : null;
}
