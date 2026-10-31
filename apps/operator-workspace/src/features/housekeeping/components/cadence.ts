import type { useTranslations } from "next-intl";
import type { StayoverCadence } from "@ranza/housekeeping";
import type { SupportedLocale } from "@ranza/i18n";
import { weekdayName } from "../stayover";

/** A schedule in the reader's words: "Every day", "Every week on Monday". */
export function cadenceLabel(
  t: ReturnType<typeof useTranslations<"housekeeping">>,
  locale: SupportedLocale,
  cadence: StayoverCadence,
): string {
  if (cadence.kind === "none") return t("cadenceNone");
  if (cadence.kind === "every_n_days") {
    return t("cadenceEvery", { count: cadence.everyDays });
  }
  return t("cadenceWeekly", { day: weekdayName(cadence.weekday, locale) });
}
