type Locale = "tr" | "en" | "ar";
export interface AnnouncementContent {
  sourceLocale: Locale;
  sourceContent: string;
  translations: Partial<Record<Locale, string>>;
}
export function selectAnnouncementContent(
  revision: AnnouncementContent,
  preferred: Locale,
  operatorDefault: Locale,
) {
  for (const locale of [preferred, operatorDefault, revision.sourceLocale]) {
    const content =
      locale === revision.sourceLocale
        ? revision.sourceContent
        : revision.translations[locale];
    if (content?.trim())
      return { locale, content, fallback: locale !== preferred };
  }
  throw new Error("Announcement source content is required");
}
