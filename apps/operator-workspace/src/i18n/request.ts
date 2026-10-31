import { getRequestConfig } from "next-intl/server";
import {
  defaultLocale,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import type { Messages } from "../messages";
import { requestOperatingModel } from "../server/operating-model";
import { catalogueFor } from "../words/catalogue";

/**
 * Where next-intl gets the copy for a request.
 *
 * The catalogue stays TypeScript rather than becoming JSON, which is why this
 * file holds so little logic and why a language missing a string is still a
 * compile error — [ADR 0023](../../../../docs/adr/0023-copy-is-icu-through-next-intl-and-the-catalogue-stays-typed.md)
 * has the reasoning and the cost. The other application has this file too,
 * pointed at its own catalogue: they share a vocabulary, not a set of screens.
 *
 * `requestLocale` is whatever the `[locale]` segment held, so it is
 * unvalidated. Falling back to Turkish rather than throwing is deliberate: the
 * layout above is where an unsupported prefix becomes a 404, and this config is
 * also reached for metadata and error pages, where throwing would turn a wrong
 * URL into a crash instead of a not-found.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: SupportedLocale = isSupportedLocale(requested)
    ? requested
    : defaultLocale;

  // The Property's words (ADR 0057): a dormitory's screens say Student and
  // Registration. Chosen per request from the `?property=` the proxy saw, so a
  // server-rendered page and its title read in the same words; the client
  // follows a navigation between Properties itself (`PropertyWords`).
  return {
    locale,
    messages: catalogueFor(locale, await requestOperatingModel()),
  };
});

/**
 * What `useTranslations` and `getTranslations` accept as a key. Pointed at the
 * interface rather than at one locale's object, so every locale is checked
 * against the same shape.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: SupportedLocale;
    Messages: Messages;
  }
}
