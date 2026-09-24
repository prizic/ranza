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
  portalBadge: string;
  skip: string;
  languageLabel: string;
  mainNavigation: string;
  collapse: string;
  expand: string;
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

  signInSummary: string;
  /** The sign-in screen's slogan: set in heavy capitals, so written in
      sentence case and uppercased by the locale's own rules. */
  authSlogan: string;
  authSubSlogan: string;
  welcomeBack: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  signInFailed: string;
  challengeSummary: string;
  code: string;
  verify: string;
  challengeFailed: string;

  stayType: Record<OwnStay["stayType"], string>;
  stayStatus: Record<OwnStay["status"], string>;
  unitType: Record<OwnStay["unitType"], string>;
}

export const messages: Record<SupportedLocale, Messages> = {
  tr: {
    productName: "Ranza",
    portalBadge: "Portal",
    skip: "İçeriğe geç",
    languageLabel: "Dil",
    mainNavigation: "Ana gezinme",
    collapse: "Menüyü daralt",
    expand: "Menüyü genişlet",
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

    signInSummary: "Konaklamanızı görmek için oturum açın.",
    authSlogan: "Huzurlu konaklama, dijital kolaylık.",
    authSubSlogan:
      "Konaklamanızı, odanızı ve rezervasyon detaylarınızı zahmetsizce yönetin.",
    welcomeBack: "Tekrar hoş geldiniz",
    email: "E-posta",
    password: "Parola",
    signIn: "Oturum aç",
    signingIn: "Açılıyor…",
    signInFailed: "E-posta veya parola hatalı.",
    challengeSummary:
      "Kimlik doğrulama uygulamanızdaki kodu veya bir yedek kodu girin.",
    code: "Kod",
    verify: "Doğrula",
    challengeFailed: "Kod geçerli değil.",

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
    portalBadge: "Portal",
    skip: "Skip to content",
    languageLabel: "Language",
    mainNavigation: "Main navigation",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
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

    signInSummary: "Sign in to see your stay.",
    authSlogan: "Your stay, elevated.",
    authSubSlogan:
      "Access your residence details, accommodation unit, and stay history seamlessly.",
    welcomeBack: "Welcome back",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signInFailed: "That email and password did not match.",
    challengeSummary:
      "Enter the code from your authenticator app, or one of your backup codes.",
    code: "Code",
    verify: "Verify",
    challengeFailed: "That code is not valid.",

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
    portalBadge: "البوابة",
    skip: "تخطَّ إلى المحتوى",
    languageLabel: "اللغة",
    mainNavigation: "التنقل الرئيسي",
    collapse: "طي القائمة",
    expand: "توسيع القائمة",
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

    signInSummary: "سجّل الدخول لعرض إقامتك.",
    authSlogan: "إقامتك بكل راحة واطمئنان.",
    authSubSlogan:
      "تابع تفاصيل إقامتك ووحدتك السكنية وسجل الحجوزات بكل سهولة ويسر.",
    welcomeBack: "مرحبًا بك من جديد",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول…",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    challengeSummary:
      "أدخل الرمز من تطبيق المصادقة، أو أحد رموز النسخ الاحتياطي.",
    code: "الرمز",
    verify: "تحقّق",
    challengeFailed: "هذا الرمز غير صالح.",

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
