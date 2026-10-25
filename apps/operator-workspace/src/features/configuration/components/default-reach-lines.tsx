"use client";

import { useLocale, useTranslations } from "next-intl";
import { isolate } from "@ranza/i18n";

/** Past this many, the rest of the names are counted rather than listed. */
const NAMES_SHOWN = 4;

/**
 * Whom a change of the Organization's default would reach, said before it is
 * made: how many Properties follow the default and so change, and which keep an
 * answer of their own and so do not (CONFIGURATION-11). The confirm that used
 * to say "for every Property" overstated it whenever one had its own answer.
 */
export function DefaultReachLines({
  reach,
}: {
  reach: { following: number; keepingOwn: readonly string[] } | null;
}) {
  const t = useTranslations("configuration");
  const locale = useLocale();
  if (!reach) return null;

  const listed = new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(reach.keepingOwn.slice(0, NAMES_SHOWN).map(isolate));
  const unlisted = reach.keepingOwn.length - NAMES_SHOWN;

  return (
    <>
      <p className="m-0">{t("reachFollowing", { count: reach.following })}</p>
      {reach.keepingOwn.length > 0 ? (
        <p className="m-0">
          {t("reachKeeping", {
            count: reach.keepingOwn.length,
            names:
              unlisted > 0
                ? t("reachMore", { count: unlisted, names: listed })
                : listed,
          })}
        </p>
      ) : null}
    </>
  );
}
