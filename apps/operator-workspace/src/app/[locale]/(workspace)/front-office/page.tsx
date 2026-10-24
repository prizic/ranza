import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf, screenFor } from "../../../../lib/screens";
import {
  requireViewer,
  screenProperties,
  whyDenied,
} from "../../../../server/viewer";
import { ScreenDenied } from "../screen-denied";

/**
 * Front Office is a heading in the rail, not a page, but it is the name people
 * type and bookmark. It opens the first of its pages the viewer may open, with
 * the Property they named, rather than the 404 it used to be (SHELL-03).
 */
export default async function FrontOfficePage({
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

  const pages = screenFor("front-office")?.children ?? [];
  const { property } = await searchParams;
  for (const page of pages) {
    if ((await screenProperties(gateOf(page.segment))).length > 0) {
      const query = property ? `?property=${encodeURIComponent(property)}` : "";
      redirect(`${localizeHref(locale, page.segment)}${query}`);
    }
  }

  const first = pages[0];
  if (!first) notFound();
  return (
    <ScreenDenied
      denial={await whyDenied(gateOf(first.segment), property)}
      locale={locale}
    />
  );
}
