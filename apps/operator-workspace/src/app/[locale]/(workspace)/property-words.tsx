"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  NextIntlClientProvider,
  useLocale,
  useMessages,
  useTimeZone,
} from "next-intl";
import { dormitoryWords } from "../../../words/dormitory";
import { withOverlay } from "../../../words/overlay";

/**
 * The words of the Property the URL names (ADR 0057): a dormitory's screens
 * say Student and Registration, a hotel's say what they always have.
 *
 * A client component because the workspace layout is not rendered again on a
 * client navigation, and a layout cannot read search parameters, so moving
 * from a hotel to a dormitory in the switcher is noticed here. The server
 * chooses the same words for what it renders (`requestOperatingModel`).
 *
 * The same provider whichever the model, so switching remounts nothing, and
 * the dormitory catalogue is built once per language from the canonical one
 * the root layout keeps: both keep their identity, which every `t` and every
 * column built from one depends on (`StableIntlProvider`).
 */
export function PropertyWords({
  children,
  dormitoryIds,
}: {
  children: ReactNode;
  /** The Properties the viewer reaches that are run as dormitories. */
  dormitoryIds: readonly string[];
}) {
  const property = useSearchParams().get("property");
  const canonical = useMessages();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const dormitory = useMemo(
    () => withOverlay(canonical, dormitoryWords[locale]),
    [canonical, locale],
  );
  const isDormitory = property !== null && dormitoryIds.includes(property);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={isDormitory ? dormitory : canonical}
      {...(timeZone ? { timeZone } : {})}
    >
      {children}
    </NextIntlClientProvider>
  );
}
