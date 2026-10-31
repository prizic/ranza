import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { buttonVariants } from "@ranza/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { InviteRefusal } from "../../../../messages";
import { invitationLink } from "../../../../server/portal-invitation";
import { currentViewer } from "../../../../server/viewer";
import { PortalAuthFrame } from "../../auth-frame";
import { InviteForm } from "./invite-form";

/**
 * The address the desk hands a Guest: `/<language>/invite/<token>` (RANZ-87).
 *
 * The token is the credential, so the page keeps it out of the two places a
 * page leaks an address: the referrer, which says nothing here, and search,
 * which has no business indexing it. The page learns the link's state, the
 * Organization's name, the Guest's name and the address on file and nothing
 * else (GP-S3-11), and a link that does not work says why in the visitor's
 * language and how to ask for another (GP-S3-03 to GP-S3-06).
 *
 * Outside the (portal) group for the reason sign-in is: that layout requires a
 * viewer, and the person holding this link may have no account yet.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return {
    title: t("invite.pageTitle"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const [t, link, viewer] = await Promise.all([
    getTranslations(),
    invitationLink(token),
    currentViewer(),
  ]);
  const languageHref = `/{locale}/invite/${token}`;

  if (!link || link.state !== "pending") {
    const reason: InviteRefusal = !link
      ? "unknown"
      : link.state === "accepted"
        ? "used"
        : link.state === "revoked"
          ? "revoked"
          : "expired";
    return (
      <PortalAuthFrame
        languageHref={languageHref}
        locale={locale}
        subtitle={t(`invite.refused.${reason}.body`)}
        title={t(`invite.refused.${reason}.title`)}
      >
        {/* The way on is the one this visitor can use: their stay when they are
            signed in, sign-in when they are not, so a used link is not a dead end. */}
        <Link
          className={buttonVariants({
            className: "h-13 w-full rounded-md text-[15px] font-medium",
          })}
          href={localizeHref(locale, viewer ? "stay" : "sign-in")}
        >
          {viewer ? t("goToStay") : t("backToSignIn")}
        </Link>
      </PortalAuthFrame>
    );
  }

  return (
    <PortalAuthFrame
      languageHref={languageHref}
      locale={locale}
      subtitle={
        viewer
          ? t("invite.connectSummary", {
              email: viewer.email,
              name: link.guestName,
              organization: link.organizationName,
            })
          : t("invite.summary", { organization: link.organizationName })
      }
      title={
        viewer
          ? t("invite.connectTitle")
          : t("invite.welcome", { name: link.guestName })
      }
    >
      <InviteForm
        guestEmail={link.guestEmail}
        guestName={link.guestName}
        signedInAs={viewer ? viewer.email : null}
        signInHref={localizeHref(locale, "sign-in")}
        stayHref={localizeHref(locale, "stay")}
        token={token}
      />
    </PortalAuthFrame>
  );
}
