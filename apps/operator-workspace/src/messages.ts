import type { SupportedLocale } from "@ranza/i18n";

/**
 * Workspace copy in all three languages.
 *
 * Turkish, English and Arabic are written with the feature rather than
 * retrofitted, so there is no fallback locale here: a missing string is a type
 * error, not a silent English leak into an Arabic page.
 */
export interface Messages {
  productName: string;
  skip: string;
  languageLabel: string;
  today: string;
  todaySummary: string;
  noPropertyTitle: string;
  noPropertyDescription: string;
  propertySwitcher: string;
  organization: string;
  property: string;
  timezone: string;
  signInTitle: string;
  signInSummary: string;
  email: string;
  password: string;
  signIn: string;
  signInFailed: string;
  signedInAs: string;
}

export const messages: Record<SupportedLocale, Messages> = {
  tr: {
    productName: "Ranza",
    skip: "İçeriğe geç",
    languageLabel: "Dil",
    today: "Bugün",
    todaySummary: "Erişebildiğiniz tesisler.",
    noPropertyTitle: "Henüz bir tesise erişiminiz yok",
    noPropertyDescription:
      "Bir organizasyon size erişim verdiğinde tesisler burada görünür.",
    propertySwitcher: "Tesis seçimi",
    organization: "Organizasyon",
    property: "Tesis",
    timezone: "Saat dilimi",
    signInTitle: "Oturum açın",
    signInSummary: "Çalışma alanınıza erişmek için oturum açın.",
    email: "E-posta",
    password: "Parola",
    signIn: "Oturum aç",
    signInFailed: "E-posta veya parola hatalı.",
    signedInAs: "Oturum açan",
  },
  en: {
    productName: "Ranza",
    skip: "Skip to content",
    languageLabel: "Language",
    today: "Today",
    todaySummary: "The Properties you can reach.",
    noPropertyTitle: "No Property is available to you yet",
    noPropertyDescription:
      "Properties appear here once an Organization grants you access.",
    propertySwitcher: "Property switcher",
    organization: "Organization",
    property: "Property",
    timezone: "Timezone",
    signInTitle: "Sign in",
    signInSummary: "Sign in to reach your workspace.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signInFailed: "That email and password did not match.",
    signedInAs: "Signed in as",
  },
  ar: {
    productName: "Ranza",
    skip: "تخطَّ إلى المحتوى",
    languageLabel: "اللغة",
    today: "اليوم",
    todaySummary: "المنشآت التي يمكنك الوصول إليها.",
    noPropertyTitle: "لا توجد منشأة متاحة لك بعد",
    noPropertyDescription:
      "تظهر المنشآت هنا بمجرد أن تمنحك إحدى المؤسسات صلاحية الوصول.",
    propertySwitcher: "مبدّل المنشآت",
    organization: "المؤسسة",
    property: "المنشأة",
    timezone: "المنطقة الزمنية",
    signInTitle: "تسجيل الدخول",
    signInSummary: "سجّل الدخول للوصول إلى مساحة عملك.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    signedInAs: "تم تسجيل الدخول باسم",
  },
};
