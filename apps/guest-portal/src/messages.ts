import type { OwnStay } from "@ranza/stays";
import type { SupportedLocale } from "@ranza/i18n";

/**
 * Portal copy in all three languages.
 *
 * Turkish, English and Arabic are written with the feature rather than
 * retrofitted, so there is no fallback locale: a missing string is a type
 * error, not a silent English leak into an Arabic page.
 *
 * The label maps are keyed on the module's own unions, so adding a Stay status
 * or a unit type to @ranza/stays or @ranza/accommodation fails to compile here
 * until all three languages have a word for it.
 */
export interface Messages {
  productName: string;
  skip: string;
  languageLabel: string;
  languageName: Record<SupportedLocale, string>;
  mainNavigation: string;
  back: string;
  account: string;
  stay: string;

  property: string;
  unit: string;
  arrival: string;
  departure: string;
  openEnded: string;
  sleeps: string;

  noStayTitle: string;
  noStayDescription: string;

  signInTitle: string;
  signInSummary: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  signInFailed: string;
  /** The auth route's rate limit answered 429 — not a wrong password. */
  signInThrottled: string;
  /** A 5xx, or no answer at all. */
  signInUnavailable: string;
  challengeSummary: string;
  code: string;
  verify: string;
  challengeFailed: string;
  /**
   * The second-factor challenge is spent — five wrong codes, or it timed out —
   * and only a new sign-in starts another. Shown back at the password step.
   */
  challengeExpired: string;

  stayType: Record<OwnStay["stayType"], string>;
  stayStatus: Record<OwnStay["status"], string>;
  unitType: Record<OwnStay["unitType"], string>;
}

export const messages: Record<SupportedLocale, Messages> = {
  tr: {
    productName: "Ranza",
    skip: "İçeriğe geç",
    languageLabel: "Dil",
    languageName: { tr: "Türkçe", en: "English", ar: "العربية" },
    mainNavigation: "Ana gezinme",
    back: "Geri",
    account: "Hesap",
    stay: "Konaklamam",

    property: "Tesis",
    unit: "Birim",
    arrival: "Giriş",
    departure: "Çıkış",
    openEnded: "Süresiz",
    // Türkçe sayıdan sonra çoğul almaz, so one form covers every count.
    sleeps: "{count} kişilik",

    noStayTitle: "Görüntülenecek bir konaklamanız yok",
    noStayDescription:
      "Bir tesis size konaklama tanımladığında ayrıntılar burada görünür.",

    signInTitle: "Oturum açın",
    signInSummary: "Konaklamanızı görmek için oturum açın.",
    email: "E-posta",
    password: "Parola",
    signIn: "Oturum aç",
    signingIn: "Açılıyor…",
    signInFailed: "E-posta veya parola hatalı.",
    signInThrottled: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.",
    signInUnavailable: "Giriş şu anda yapılamıyor. Biraz sonra tekrar deneyin.",
    challengeSummary:
      "Kimlik doğrulama uygulamanızdaki kodu veya bir yedek kodu girin.",
    code: "Kod",
    verify: "Doğrula",
    challengeFailed: "Kod geçerli değil.",
    challengeExpired:
      "Çok fazla kod denendi ya da süre doldu. Yeni bir kod girmek için yeniden oturum açın.",

    stayType: { guest: "Misafir", resident: "Sakin" },
    stayStatus: {
      reserved: "Rezerve",
      in_house: "Konaklıyor",
      departed: "Ayrıldı",
      cancelled: "İptal edildi",
    },
    unitType: {
      room: "Oda",
      bed: "Yatak",
      apartment: "Daire",
      suite: "Suit",
    },
  },
  en: {
    productName: "Ranza",
    skip: "Skip to content",
    languageLabel: "Language",
    languageName: { tr: "Türkçe", en: "English", ar: "العربية" },
    mainNavigation: "Main navigation",
    back: "Back",
    account: "Account",
    stay: "My stay",

    property: "Property",
    unit: "Unit",
    arrival: "Arrival",
    departure: "Departure",
    openEnded: "Open-ended",
    sleeps: "Sleeps {count}",

    noStayTitle: "You have no stay to show",
    noStayDescription:
      "Details appear here once a Property has set up your stay.",

    signInTitle: "Sign in",
    signInSummary: "Sign in to see your stay.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signInFailed: "That email and password did not match.",
    signInThrottled: "Too many attempts. Try again shortly.",
    signInUnavailable: "Signing in isn't working right now. Try again shortly.",
    challengeSummary:
      "Enter the code from your authenticator app, or one of your backup codes.",
    code: "Code",
    verify: "Verify",
    challengeFailed: "That code is not valid.",
    challengeExpired:
      "Too many codes were tried, or too much time passed. Sign in again to enter a new code.",

    stayType: { guest: "Guest", resident: "Resident" },
    stayStatus: {
      reserved: "Reserved",
      in_house: "In house",
      departed: "Departed",
      cancelled: "Cancelled",
    },
    unitType: {
      room: "Room",
      bed: "Bed",
      apartment: "Apartment",
      suite: "Suite",
    },
  },
  ar: {
    productName: "Ranza",
    skip: "تخطَّ إلى المحتوى",
    languageLabel: "اللغة",
    languageName: { tr: "Türkçe", en: "English", ar: "العربية" },
    mainNavigation: "التنقل الرئيسي",
    back: "رجوع",
    account: "الحساب",
    stay: "إقامتي",

    property: "المنشأة",
    unit: "الوحدة",
    arrival: "الوصول",
    departure: "المغادرة",
    openEnded: "غير محددة",
    // Arabic agrees with the number in six categories, which is the whole
    // reason this is ICU and not a label with a digit appended to it.
    sleeps:
      "{count, plural, one {تتسع لشخص واحد} two {تتسع لشخصين} few {تتسع لـ # أشخاص} many {تتسع لـ # شخصًا} other {تتسع لـ # شخص}}",

    noStayTitle: "لا توجد إقامة لعرضها",
    noStayDescription: "تظهر التفاصيل هنا بمجرد أن تُسجّل المنشأة إقامتك.",

    signInTitle: "تسجيل الدخول",
    signInSummary: "سجّل الدخول لعرض إقامتك.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    signInThrottled: "محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل.",
    signInUnavailable: "تسجيل الدخول لا يعمل الآن. حاول مرة أخرى بعد قليل.",
    challengeSummary:
      "أدخل الرمز من تطبيق المصادقة، أو أحد رموز النسخ الاحتياطي.",
    code: "الرمز",
    verify: "تحقّق",
    challengeFailed: "هذا الرمز غير صالح.",
    challengeExpired:
      "جُرّبت رموز كثيرة جدًا أو انتهت المهلة. سجّل الدخول مرة أخرى لإدخال رمز جديد.",

    stayType: { guest: "ضيف", resident: "مقيم" },
    stayStatus: {
      reserved: "محجوزة",
      in_house: "قيد الإقامة",
      departed: "منتهية",
      cancelled: "ملغاة",
    },
    unitType: {
      room: "غرفة",
      bed: "سرير",
      apartment: "شقة",
      suite: "جناح",
    },
  },
};
