import Link from "next/link";
import { localizeHref, type SupportedLocale } from "@ranza/i18n";
import { buttonVariants } from "@ranza/ui";
import { getLocale, getTranslations } from "next-intl/server";
import { currentViewer } from "../../server/viewer";
import { PortalAuthFrame } from "./auth-frame";

/**
 * A Portal address that is nothing, in the visitor's language, in the same
 * frame as the pages that lead into the Portal, so a mistyped address still
 * says whose it is and offers the language menu (GP-04, PORTAL-06).
 *
 * Its title is set here, as an element, because Next does not read a
 * not-found page's metadata and the tab would otherwise say only "Ranza".
 *
 * The way back is the one the visitor can use: their Stay when they are signed
 * in, sign-in when they are not. Sending a signed-out visitor to "my stay"
 * only bounces them to sign-in under a label that promised something else.
 */
export default async function NotFound() {
  const t = await getTranslations();
  const locale = (await getLocale()) as SupportedLocale;
  const signedIn = (await currentViewer()) !== null;
  const way = signedIn ? "stay" : "sign-in";

  return (
    <PortalAuthFrame
      languageHref={`/{locale}/${way}`}
      locale={locale}
      subtitle={t("notFoundBody")}
      title={t("notFoundTitle")}
    >
      <title>{`${t("notFoundTitle")} · ${t("productName")}`}</title>
      <Link
        className={buttonVariants({
          className: "h-13 w-full rounded-md text-[15px] font-medium",
        })}
        href={localizeHref(locale, way)}
      >
        {signedIn ? t("goToStay") : t("signIn")}
      </Link>
    </PortalAuthFrame>
  );
}
