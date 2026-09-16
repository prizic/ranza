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
  stay: string;
  signedInAs: string;
  signOut: string;

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
  signInFailed: string;

  stayType: Record<OwnStay["stayType"], string>;
  stayStatus: Record<OwnStay["status"], string>;
  unitType: Record<OwnStay["unitType"], string>;
}

export const messages: Record<SupportedLocale, Messages> = {
  tr: {
    productName: "Ranza",
    skip: "İçeriğe geç",
    languageLabel: "Dil",
    stay: "Konaklamam",
    signedInAs: "Oturum açan",
    signOut: "Çıkış yap",

    property: "Tesis",
    unit: "Birim",
    arrival: "Giriş",
    departure: "Çıkış",
    openEnded: "Süresiz",
    sleeps: "Kapasite",

    noStayTitle: "Görüntülenecek bir konaklamanız yok",
    noStayDescription:
      "Bir tesis size konaklama tanımladığında ayrıntılar burada görünür.",

    signInTitle: "Oturum açın",
    signInSummary: "Konaklamanızı görmek için oturum açın.",
    email: "E-posta",
    password: "Parola",
    signIn: "Oturum aç",
    signInFailed: "E-posta veya parola hatalı.",

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
    stay: "My stay",
    signedInAs: "Signed in as",
    signOut: "Sign out",

    property: "Property",
    unit: "Unit",
    arrival: "Arrival",
    departure: "Departure",
    openEnded: "Open-ended",
    sleeps: "Sleeps",

    noStayTitle: "You have no stay to show",
    noStayDescription:
      "Details appear here once a Property has set up your stay.",

    signInTitle: "Sign in",
    signInSummary: "Sign in to see your stay.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signInFailed: "That email and password did not match.",

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
    stay: "إقامتي",
    signedInAs: "تم تسجيل الدخول باسم",
    signOut: "تسجيل الخروج",

    property: "المنشأة",
    unit: "الوحدة",
    arrival: "الوصول",
    departure: "المغادرة",
    openEnded: "غير محددة",
    sleeps: "السعة",

    noStayTitle: "لا توجد إقامة لعرضها",
    noStayDescription: "تظهر التفاصيل هنا بمجرد أن تُسجّل المنشأة إقامتك.",

    signInTitle: "تسجيل الدخول",
    signInSummary: "سجّل الدخول لعرض إقامتك.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

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
