import { useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import type { RoomHold } from "../../../server/viewer";

export interface HoldText {
  /** The request's reference, `MT-12`. */
  reference: string;
  /** When the room is expected back, or that no day is set. */
  back: string;
  /** Both, for a tooltip or a sentence. */
  full: string;
}

/**
 * What a room held out of order is held by, in the words Rooms uses. Day and
 * month only — a calendar row has no room for the year.
 */
export function useHoldText(
  locale: SupportedLocale,
): (hold: RoomHold) => HoldText {
  const t = useTranslations();
  return (hold) => {
    const reference = t("maintenance.reference", { number: hold.number });
    const back =
      hold.expectedBackOn === null
        ? t("outOfOrderNoReturnDate")
        : t("maintenance.backOn", {
            date: formatDate(
              new Date(`${hold.expectedBackOn}T12:00:00Z`),
              locale,
              { timeZone: "UTC", year: undefined },
            ),
          });
    return { reference, back, full: `${reference} · ${back}` };
  };
}
