import type { ApplicationLocale } from "@ranza/domain";

export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function localeFromFormData(formData: FormData): ApplicationLocale {
  const locale = formText(formData, "locale");
  return locale === "en" || locale === "ar" ? locale : "tr";
}
