import type { SupportedLocale } from "@ranza/i18n";

/**
 * Workspace copy in all three languages.
 *
 * No fallback locale: a missing string is a type error rather than English
 * quietly appearing on an Arabic page.
 */
export interface Messages {
  productName: string;
  skip: string;
  languageLabel: string;
  today: string;
  propertySwitcher: string;
  organization: string;
  property: string;
  noPropertyTitle: string;
  noPropertyDescription: string;
  signInTitle: string;
  signInSummary: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  signInFailed: string;

  challengeTitle: string;
  challengeSummary: string;
  code: string;
  verify: string;
  challengeFailed: string;

  security: string;
  securitySummary: string;
  twoFactor: string;
  twoFactorOn: string;
  twoFactorOff: string;
  twoFactorSummary: string;
  enable: string;
  disable: string;
  confirmWithPassword: string;
  scanHint: string;
  secretLabel: string;
  backupCodes: string;
  backupCodesWarning: string;
  enrolFailed: string;

  frontOffice: string;
  arrivalsAt: string;
  noFrontDeskTitle: string;
  noFrontDeskDescription: string;
  noArrivalsTitle: string;
  noArrivalsDescription: string;
  openEnded: string;
  checkIn: string;
  checkingIn: string;
  checkedIn: string;
  unitUnavailable: string;
  checkInRefused: string;
  stayType: Record<"guest" | "resident", string>;
  unitType: Record<"room" | "bed" | "apartment" | "suite", string>;
  reservationStatus: Record<
    "requested" | "confirmed" | "cancelled" | "no_show" | "checked_in",
    string
  >;
}

export const messages: Record<SupportedLocale, Messages> = {
  tr: {
    productName: "Ranza",
    skip: "İçeriğe geç",
    languageLabel: "Dil",
    today: "Bugün",
    propertySwitcher: "Tesisler",
    organization: "Organizasyon",
    property: "Tesis",
    noPropertyTitle: "Henüz bir tesise atanmadınız",
    noPropertyDescription:
      "Organizasyonunuzdaki bir yönetici sizi bir tesise atadığında burada görünür.",
    signInTitle: "Oturum açın",
    signInSummary: "Ranza çalışma alanı",
    email: "E-posta",
    password: "Parola",
    signIn: "Oturum aç",
    signingIn: "Açılıyor",
    signInFailed: "E-posta veya parola hatalı.",

    challengeTitle: "İkinci adım",
    challengeSummary:
      "Kimlik doğrulama uygulamanızdaki kodu veya bir yedek kodu girin.",
    code: "Kod",
    verify: "Doğrula",
    challengeFailed: "Kod geçerli değil.",

    security: "Güvenlik",
    securitySummary: "Hesabınıza nasıl giriş yapıldığını yönetin.",
    twoFactor: "İki adımlı doğrulama",
    twoFactorOn: "Açık",
    twoFactorOff: "Kapalı",
    twoFactorSummary:
      "Açıkken parolanızın yanında kimlik doğrulama uygulamanızdan bir kod istenir.",
    enable: "Aç",
    disable: "Kapat",
    confirmWithPassword: "Parolanızla onaylayın",
    scanHint:
      "Bu anahtarı kimlik doğrulama uygulamanıza ekleyin, ardından gösterdiği kodu girin.",
    secretLabel: "Kurulum anahtarı",
    backupCodes: "Yedek kodlar",
    backupCodesWarning:
      "Bu kodları şimdi saklayın. Her biri bir kez kullanılır ve tekrar gösterilmez.",
    enrolFailed: "Parola doğrulanamadı.",

    frontOffice: "Ön büro",
    arrivalsAt: "Bugünkü girişler:",
    noFrontDeskTitle: "Ön büro bu tesiste açık değil",
    noFrontDeskDescription:
      "Ön büro, organizasyonunuzun aboneliğinde yer aldığında ve tesiste etkinleştirildiğinde burada görünür.",
    noArrivalsTitle: "Bugün giriş yok",
    noArrivalsDescription:
      "Bugün için bu tesiste bekleyen bir rezervasyon bulunmuyor.",
    openEnded: "Açık uçlu",
    checkIn: "Giriş yap",
    checkingIn: "Yapılıyor",
    checkedIn: "Giriş yapıldı",
    unitUnavailable: "Bu birim seçilen tarihlerde dolu.",
    checkInRefused: "Bu rezervasyon için giriş yapılamıyor.",
    stayType: { guest: "Misafir", resident: "Sakin" },
    unitType: {
      room: "Oda",
      bed: "Yatak",
      apartment: "Daire",
      suite: "Süit",
    },
    reservationStatus: {
      requested: "Talep edildi",
      confirmed: "Onaylandı",
      cancelled: "İptal edildi",
      no_show: "Gelmedi",
      checked_in: "Giriş yapıldı",
    },
  },
  en: {
    productName: "Ranza",
    skip: "Skip to content",
    languageLabel: "Language",
    today: "Today",
    propertySwitcher: "Properties",
    organization: "Organization",
    property: "Property",
    noPropertyTitle: "You are not assigned to a Property yet",
    noPropertyDescription:
      "A manager in your Organization assigns you to a Property, and it appears here.",
    signInTitle: "Sign in",
    signInSummary: "Ranza operator workspace",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in",
    signInFailed: "That email and password did not match.",

    challengeTitle: "Second step",
    challengeSummary:
      "Enter the code from your authenticator app, or one of your backup codes.",
    code: "Code",
    verify: "Verify",
    challengeFailed: "That code is not valid.",

    security: "Security",
    securitySummary: "Manage how your account is signed in to.",
    twoFactor: "Two-step verification",
    twoFactorOn: "On",
    twoFactorOff: "Off",
    twoFactorSummary:
      "When on, signing in asks for a code from your authenticator app as well as your password.",
    enable: "Turn on",
    disable: "Turn off",
    confirmWithPassword: "Confirm with your password",
    scanHint:
      "Add this key to your authenticator app, then enter the code it shows.",
    secretLabel: "Setup key",
    backupCodes: "Backup codes",
    backupCodesWarning:
      "Save these now. Each one works once, and they are not shown again.",
    enrolFailed: "That password did not match.",

    frontOffice: "Front Office",
    arrivalsAt: "Arriving today at",
    noFrontDeskTitle: "The front desk is not open at this Property",
    noFrontDeskDescription:
      "It appears here once your Organization's Subscription includes it and the Property has it enabled.",
    noArrivalsTitle: "No arrivals today",
    noArrivalsDescription: "Nobody is booked to arrive at this Property today.",
    openEnded: "Open-ended",
    checkIn: "Check in",
    checkingIn: "Checking in",
    checkedIn: "Checked in",
    unitUnavailable: "That Unit is occupied for those nights.",
    checkInRefused: "That Reservation cannot be checked in.",
    stayType: { guest: "Guest", resident: "Resident" },
    unitType: {
      room: "Room",
      bed: "Bed",
      apartment: "Apartment",
      suite: "Suite",
    },
    reservationStatus: {
      requested: "Requested",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
      no_show: "No show",
      checked_in: "Checked in",
    },
  },
  ar: {
    productName: "Ranza",
    skip: "تخطَّ إلى المحتوى",
    languageLabel: "اللغة",
    today: "اليوم",
    propertySwitcher: "المنشآت",
    organization: "المؤسسة",
    property: "المنشأة",
    noPropertyTitle: "لم يتم تعيينك إلى منشأة بعد",
    noPropertyDescription:
      "يقوم أحد المديرين في مؤسستك بتعيينك إلى منشأة، فتظهر هنا.",
    signInTitle: "تسجيل الدخول",
    signInSummary: "مساحة عمل رانزا",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ الدخول",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

    challengeTitle: "الخطوة الثانية",
    challengeSummary:
      "أدخل الرمز من تطبيق المصادقة، أو أحد رموز النسخ الاحتياطي.",
    code: "الرمز",
    verify: "تحقّق",
    challengeFailed: "هذا الرمز غير صالح.",

    security: "الأمان",
    securitySummary: "تحكّم في طريقة تسجيل الدخول إلى حسابك.",
    twoFactor: "التحقّق بخطوتين",
    twoFactorOn: "مفعّل",
    twoFactorOff: "غير مفعّل",
    twoFactorSummary:
      "عند تفعيله يُطلب رمز من تطبيق المصادقة إلى جانب كلمة المرور.",
    enable: "تفعيل",
    disable: "إيقاف",
    confirmWithPassword: "أكّد بكلمة المرور",
    scanHint: "أضف هذا المفتاح إلى تطبيق المصادقة، ثم أدخل الرمز الذي يعرضه.",
    secretLabel: "مفتاح الإعداد",
    backupCodes: "رموز النسخ الاحتياطي",
    backupCodesWarning:
      "احفظ هذه الرموز الآن. يُستخدم كل رمز مرة واحدة ولن تُعرض مجددًا.",
    enrolFailed: "كلمة المرور غير صحيحة.",

    frontOffice: "المكتب الأمامي",
    arrivalsAt: "الوصول اليوم في",
    noFrontDeskTitle: "المكتب الأمامي غير مفعّل في هذه المنشأة",
    noFrontDeskDescription:
      "يظهر هنا عندما يشمله اشتراك مؤسستك ويتم تفعيله في المنشأة.",
    noArrivalsTitle: "لا يوجد وصول اليوم",
    noArrivalsDescription: "لا توجد حجوزات وصول لهذه المنشأة اليوم.",
    openEnded: "مفتوح المدة",
    checkIn: "تسجيل الوصول",
    checkingIn: "جارٍ التسجيل",
    checkedIn: "تم تسجيل الوصول",
    unitUnavailable: "هذه الوحدة محجوزة في تلك الليالي.",
    checkInRefused: "لا يمكن تسجيل الوصول لهذا الحجز.",
    stayType: { guest: "ضيف", resident: "مقيم" },
    unitType: {
      room: "غرفة",
      bed: "سرير",
      apartment: "شقة",
      suite: "جناح",
    },
    reservationStatus: {
      requested: "مطلوب",
      confirmed: "مؤكّد",
      cancelled: "ملغى",
      no_show: "لم يحضر",
      checked_in: "تم تسجيل الوصول",
    },
  },
};
