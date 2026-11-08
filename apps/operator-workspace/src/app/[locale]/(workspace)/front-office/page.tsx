import { notFound, redirect } from "next/navigation";
import { isSupportedLocale, localizeHref } from "@ranza/i18n";
import { setRequestLocale } from "next-intl/server";
import { gateOf, screensFor } from "../../../../lib/screens";
import { operatingModelOf } from "../../../../server/operating-model";
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
 *
 * "First" is first at that Property, in the order its rail lists them: a page
 * open at another Property is no reason to send somebody to a refusal here, and
 * a dormitory starts at its beds, not at Reservations (audit 2026-11-07, D-11).
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

  const { property } = await searchParams;
  const named = property ? await operatingModelOf(property) : null;
  const pages =
    screensFor(named).find((screen) => screen.segment === "front-office")
      ?.children ?? [];

  for (const page of pages) {
    const open = await screenProperties(gateOf(page.segment));
    const opensHere = property
      ? open.some((candidate) => candidate.propertyId === property)
      : open.length > 0;
    if (opensHere) {
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
