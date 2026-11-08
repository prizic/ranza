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
/** Why a link does not work, each said on its own (GP-S3-03 to GP-S3-07). */
export type InviteRefusal =
  "unknown" | "expired" | "revoked" | "used" | "another_guest";

export interface Messages {
  productName: string;
  portalBadge: string;
  skip: string;
  languageLabel: string;
  mainNavigation: string;
  collapse: string;
  expand: string;
  account: string;
  signOut: string;
  signingOut: string;
  signOutFailed: string;
  stay: string;

  arrival: string;
  departure: string;
  openEnded: string;
  stayKind: string;
  serviceRoom: string;
  serviceProperty: string;
  serviceDates: string;
  signInHelp: string;
  helpTitle: string;
  helpBody: string;
  backToSignIn: string;
  notFoundTitle: string;
  notFoundBody: string;
  goToStay: string;
  errorTitle: string;
  errorBody: string;
  tryAgain: string;
  signInMissing: string;
  codeMissing: string;
  sleeps: string;

  noStayTitle: string;
  noStayDescription: string;

  signInSummary: string;
  /** The sign-in screen's slogan: large and light, in a serif italic — an
      upright sans in Arabic, which has no italic. Written in sentence case. */
  authSlogan: string;
  authSubSlogan: string;
  welcomeBack: string;
  email: string;
  password: string;
  showPassword: string;
  hidePassword: string;
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

  /** The page behind the link a desk hands a Guest (RANZ-87, GP-S3-12). */
  invite: {
    pageTitle: string;
    welcome: string;
    summary: string;
    createAccount: string;
    haveAccount: string;
    name: string;
    emailHint: string;
    passwordHint: string;
    passwordTooShort: string;
    missing: string;
    accountExists: string;
    createSubmit: string;
    signInSubmit: string;
    working: string;
    twoFactor: string;
    goSignIn: string;
    connectTitle: string;
    connectSummary: string;
    connect: string;
    useAnother: string;
    failed: string;
    refused: Record<InviteRefusal, { title: string; body: string }>;
  };

  /** What My stay says about the bed, the term and the balance (GP-S4-08). */
  myStay: {
    bed: string;
    floor: string;
    balance: string;
    owed: string;
    credit: string;
    settled: string;
    /** The next instalment of the student's payment plan (GP-S4-11 to GP-S4-17). */
    instalment: {
      heading: string;
      position: string;
      dueOn: string;
      dueToday: string;
      wasDueOn: string;
      overdueNote: string;
      overdueAll: string;
    };
  };

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
    signOut: "Oturumu kapat",
    signingOut: "Oturum kapatılıyor",
    signOutFailed: "Oturum kapatılamadı. Yeniden deneyin.",
    stay: "Konaklamam",

    arrival: "Giriş",
    departure: "Çıkış",
    openEnded: "Bitiş tarihi yok",
    stayKind: "Konaklama türü",
    serviceRoom: "Odanız",
    serviceProperty: "Tesisiniz",
    serviceDates: "Giriş ve çıkış",
    signInHelp:
      "Hesabınız yok ya da parolanızı mı unuttunuz? Tesisin resepsiyonuna danışın.",
    helpTitle: "Yeniden giriş yapma",
    helpBody:
      "Parolayı e-postayla sıfırlama henüz yok. Tesisin resepsiyonuna başvurun, oturum açmanıza yardımcı olurlar.",
    backToSignIn: "Oturum açmaya dön",
    notFoundTitle: "Bu sayfa yok",
    notFoundBody: "Adresi kontrol edin ya da konaklamanıza dönün.",
    goToStay: "Konaklamama git",
    errorTitle: "Bir şeyler ters gitti",
    errorBody:
      "Bu sayfa gösterilemedi. Yeniden deneyin; sürerse resepsiyona başvurun.",
    tryAgain: "Yeniden dene",
    signInMissing: "E-postanızı ve parolanızı girin.",
    codeMissing: "Kodu girin.",
    // Türkçe sayıdan sonra çoğul almaz, so one form covers every count.
    sleeps: "{count} kişilik",

    noStayTitle: "Şu anda bir konaklamanız yok",
    noStayDescription: "Bir konaklama bekliyorsanız tesisle iletişime geçin.",

    signInSummary: "Konaklamanızı görmek için oturum açın.",
    authSlogan: "Huzurlu konaklama, dijital kolaylık.",
    authSubSlogan:
      "Odanızı, tesisinizi ve tarihlerinizi nerede olursanız olun görün.",
    welcomeBack: "Tekrar hoş geldiniz",
    email: "E-posta",
    password: "Parola",
    showPassword: "Parolayı göster",
    hidePassword: "Parolayı gizle",
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

    invite: {
      pageTitle: "Portalınızı açın",
      welcome: "Merhaba {name}",
      summary:
        "{organization} sizin için portalı açtı. Odanızı, tarihlerinizi ve bakiyenizi görmek için kendi hesabınızı oluşturun.",
      createAccount: "Hesap oluştur",
      haveAccount: "Zaten hesabım var",
      name: "Ad soyad",
      emailHint:
        "Resepsiyonda kayıtlı adres hazır geldi. Oturum açarken kullanacağınız adresi yazın.",
      passwordHint: "Yalnızca sizin bileceğiniz bir parola seçin.",
      passwordTooShort: "Parola çok kısa. Daha uzun bir parola seçin.",
      missing: "Adınızı, e-postanızı ve parolanızı girin.",
      accountExists:
        "Bu adresle bir hesap zaten var. Aynı adresle oturum açın.",
      createSubmit: "Hesap oluştur ve devam et",
      signInSubmit: "Oturum aç ve devam et",
      working: "Bağlanıyor…",
      twoFactor:
        "Bu hesapta ikinci bir doğrulama adımı var. Oturum açma sayfasından giriş yapın, sonra bu bağlantıyı yeniden açın.",
      goSignIn: "Oturum açma sayfasına git",
      connectTitle: "Hesabınızı bağlayın",
      connectSummary:
        "Bu bağlantı, {organization} içinde {name} adına kayıtlı konaklamayı açar. {email} olarak oturum açtınız.",
      connect: "Hesabımı bağla",
      useAnother: "Başka bir hesap kullan",
      failed:
        "Bir şeyler ters gitti ve hiçbir şey değişmedi. Yeniden deneyin; sürerse resepsiyona başvurun.",
      refused: {
        unknown: {
          title: "Bu bağlantı çalışmıyor",
          body: "Yanlış yazılmış ya da eksik kopyalanmış olabilir. Resepsiyondan yeni bir bağlantı isteyin.",
        },
        expired: {
          title: "Bağlantının süresi doldu",
          body: "Bağlantılar sınırlı süre geçerlidir. Resepsiyondan yeni bir bağlantı isteyin.",
        },
        revoked: {
          title: "Bu bağlantı yenisiyle değiştirildi",
          body: "Resepsiyon daha yeni bir bağlantı oluşturdu ve bu artık çalışmıyor. Size verilen en son bağlantıyı kullanın ya da resepsiyondan isteyin.",
        },
        used: {
          title: "Bu bağlantı zaten kullanıldı",
          body: "Kullanan sizseniz oturum açıp konaklamanızı görün. Değilse resepsiyondan yeni bir bağlantı isteyin.",
        },
        another_guest: {
          title: "Bu hesap başka bir kişiye bağlı",
          body: "Bir hesap tek bir kişiye aittir. Başka bir e-posta adresiyle yeni bir hesap açın ya da resepsiyona danışın.",
        },
      },
    },

    myStay: {
      bed: "{name} yatağı",
      floor: "{floor}. kat",
      balance: "Bakiye",
      owed: "Ödemeniz gereken tutar",
      credit: "Hesabınızdaki alacak",
      settled: "Ödenecek tutar yok",
      instalment: {
        heading: "Sonraki taksit",
        position: "{number} / {total}. taksit",
        dueOn: "Son ödeme tarihi {date}",
        dueToday: "Son ödeme günü bugün",
        wasDueOn: "Son ödeme tarihi {date} idi",
        overdueNote:
          "Bu taksitin ödeme tarihi geçti. Lütfen resepsiyonla görüşün.",
        overdueAll:
          "{count, plural, other {# taksitin}} ödeme tarihi geçti, toplam {amount}.",
      },
    },

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
    signOut: "Sign out",
    signingOut: "Signing out",
    signOutFailed: "Could not sign out. Try again.",
    stay: "My stay",

    arrival: "Arrival",
    departure: "Departure",
    openEnded: "No end date",
    stayKind: "Stay type",
    serviceRoom: "Your room",
    serviceProperty: "Your property",
    serviceDates: "Arrival and departure",
    signInHelp:
      "No account, or forgot your password? Ask the front desk at your property.",
    helpTitle: "Getting back in",
    helpBody:
      "Resetting a password by email is not available yet. Ask the front desk at your property and they will help you sign in.",
    backToSignIn: "Back to sign in",
    notFoundTitle: "This page doesn't exist",
    notFoundBody: "Check the address, or go back to your stay.",
    goToStay: "Go to my stay",
    errorTitle: "Something went wrong",
    errorBody:
      "This page could not be shown. Try again; if it keeps happening, ask the front desk.",
    tryAgain: "Try again",
    signInMissing: "Enter your email and your password.",
    codeMissing: "Enter the code.",
    sleeps: "Sleeps {count}",

    noStayTitle: "You have no current stay",
    noStayDescription: "If you expected one, contact the property.",

    signInSummary: "Sign in to see your stay.",
    authSlogan: "Your stay, elevated.",
    authSubSlogan:
      "See your room, your property and your dates, wherever you are.",
    welcomeBack: "Welcome back",
    email: "Email",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
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

    invite: {
      pageTitle: "Open your portal",
      welcome: "Hello, {name}",
      summary:
        "{organization} has opened the portal for you. Create your own login to see your room, your dates and what you owe.",
      createAccount: "Create an account",
      haveAccount: "I already have an account",
      name: "Full name",
      emailHint:
        "The address the front desk has on file is filled in. Use the one you will sign in with.",
      passwordHint: "Choose a password only you know.",
      passwordTooShort: "That password is too short. Choose a longer one.",
      missing: "Enter your name, your email and a password.",
      accountExists:
        "An account with this address already exists. Sign in with it instead.",
      createSubmit: "Create account and continue",
      signInSubmit: "Sign in and continue",
      working: "Connecting…",
      twoFactor:
        "This account has a second sign-in step. Sign in on the sign-in page, then open this link again.",
      goSignIn: "Go to sign in",
      connectTitle: "Connect your account",
      connectSummary:
        "This link opens the stay of {name} at {organization}. You are signed in as {email}.",
      connect: "Connect my account",
      useAnother: "Use a different account",
      failed:
        "Something went wrong and nothing was changed. Try again; if it keeps happening, ask the front desk.",
      refused: {
        unknown: {
          title: "This link does not work",
          body: "It may have been typed or copied wrongly. Ask the front desk for a new one.",
        },
        expired: {
          title: "This link has expired",
          body: "Links only work for a limited time. Ask the front desk for a new one.",
        },
        revoked: {
          title: "This link was replaced",
          body: "The front desk made a newer link and this one no longer works. Use the newest link you were given, or ask the front desk.",
        },
        used: {
          title: "This link has already been used",
          body: "If that was you, sign in to see your stay. If not, ask the front desk for a new link.",
        },
        another_guest: {
          title: "This account is connected to someone else",
          body: "An account belongs to one person. Create an account with a different email, or ask the front desk.",
        },
      },
    },

    myStay: {
      bed: "Bed {name}",
      floor: "Floor {floor}",
      balance: "Balance",
      owed: "You owe",
      credit: "In your favour",
      settled: "Nothing owed",
      instalment: {
        heading: "Next instalment",
        position: "Instalment {number} of {total}",
        dueOn: "Due {date}",
        dueToday: "Due today",
        wasDueOn: "Was due {date}",
        overdueNote:
          "This instalment is overdue. Please speak to the front desk.",
        overdueAll:
          "{count, plural, one {# instalment is} other {# instalments are}} overdue, {amount} in all.",
      },
    },

    stayType: { guest: "Guest", resident: "Resident" },
    stayStatus: {
      reserved: "Reserved",
      in_house: "Staying now",
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
    signOut: "تسجيل الخروج",
    signingOut: "جارٍ تسجيل الخروج",
    signOutFailed: "تعذّر تسجيل الخروج. حاول مرة أخرى.",
    stay: "إقامتي",

    arrival: "الوصول",
    departure: "المغادرة",
    openEnded: "بلا تاريخ انتهاء",
    stayKind: "نوع الإقامة",
    serviceRoom: "غرفتك",
    serviceProperty: "منشأتك",
    serviceDates: "الوصول والمغادرة",
    signInHelp:
      "ليس لديك حساب أو نسيت كلمة المرور؟ اطلب المساعدة من مكتب الاستقبال في منشأتك.",
    helpTitle: "العودة إلى حسابك",
    helpBody:
      "إعادة تعيين كلمة المرور عبر البريد الإلكتروني غير متاحة بعد. اطلب المساعدة من مكتب الاستقبال في منشأتك وسيساعدونك على تسجيل الدخول.",
    backToSignIn: "العودة إلى تسجيل الدخول",
    notFoundTitle: "هذه الصفحة غير موجودة",
    notFoundBody: "تحقق من العنوان أو عد إلى إقامتك.",
    goToStay: "اذهب إلى إقامتي",
    errorTitle: "حدث خطأ ما",
    errorBody:
      "تعذّر عرض هذه الصفحة. حاول مرة أخرى؛ وإن استمرت المشكلة فاسأل مكتب الاستقبال.",
    tryAgain: "حاول مرة أخرى",
    signInMissing: "أدخل بريدك الإلكتروني وكلمة المرور.",
    codeMissing: "أدخل الرمز.",
    // Arabic agrees with the number in six categories, which is the whole
    // reason this is ICU and not a label with a digit appended to it.
    sleeps:
      "{count, plural, one {تتسع لشخص واحد} two {تتسع لشخصين} few {تتسع لـ # أشخاص} many {تتسع لـ # شخصًا} other {تتسع لـ # شخص}}",

    noStayTitle: "لا توجد إقامة حالية",
    noStayDescription: "إذا كنت تتوقع إقامة، فتواصل مع المنشأة.",

    signInSummary: "سجّل الدخول لعرض إقامتك.",
    authSlogan: "إقامتك بكل راحة واطمئنان.",
    authSubSlogan: "اطّلع على غرفتك ومنشأتك وتواريخ إقامتك أينما كنت.",
    welcomeBack: "مرحبًا بك من جديد",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
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

    invite: {
      pageTitle: "افتح بوابتك",
      welcome: "مرحبًا {name}",
      summary:
        "فتح {organization} البوابة من أجلك. أنشئ حسابك الخاص لترى غرفتك وتواريخ إقامتك والمبلغ المستحق عليك.",
      createAccount: "إنشاء حساب",
      haveAccount: "لدي حساب بالفعل",
      name: "الاسم الكامل",
      emailHint:
        "العنوان المسجّل لدى الاستقبال مكتوب هنا. اكتب العنوان الذي ستسجّل الدخول به.",
      passwordHint: "اختر كلمة مرور لا يعرفها غيرك.",
      passwordTooShort: "كلمة المرور قصيرة جدًا. اختر كلمة أطول.",
      missing: "أدخل اسمك وبريدك الإلكتروني وكلمة المرور.",
      accountExists: "يوجد حساب بهذا العنوان بالفعل. سجّل الدخول بنفس العنوان.",
      createSubmit: "أنشئ الحساب وتابع",
      signInSubmit: "سجّل الدخول وتابع",
      working: "جارٍ الربط…",
      twoFactor:
        "لهذا الحساب خطوة تحقق ثانية. سجّل الدخول من صفحة تسجيل الدخول ثم افتح هذا الرابط مرة أخرى.",
      goSignIn: "اذهب إلى تسجيل الدخول",
      connectTitle: "اربط حسابك",
      connectSummary:
        "يفتح هذا الرابط إقامة {name} لدى {organization}. أنت مسجّل الدخول بالبريد {email}.",
      connect: "اربط حسابي",
      useAnother: "استخدم حسابًا آخر",
      failed:
        "حدث خطأ ولم يتغيّر شيء. حاول مرة أخرى، وإن استمر فاسأل الاستقبال.",
      refused: {
        unknown: {
          title: "هذا الرابط لا يعمل",
          body: "ربما كُتب أو نُسخ بشكل خاطئ. اطلب من الاستقبال رابطًا جديدًا.",
        },
        expired: {
          title: "انتهت صلاحية هذا الرابط",
          body: "الروابط صالحة لمدة محدودة. اطلب من الاستقبال رابطًا جديدًا.",
        },
        revoked: {
          title: "استُبدل هذا الرابط برابط أحدث",
          body: "أنشأ الاستقبال رابطًا أحدث ولم يعد هذا الرابط يعمل. استخدم آخر رابط وصلك أو اطلبه من الاستقبال.",
        },
        used: {
          title: "استُخدم هذا الرابط من قبل",
          body: "إن كنت أنت فسجّل الدخول لترى إقامتك. وإن لم تكن فاطلب رابطًا جديدًا من الاستقبال.",
        },
        another_guest: {
          title: "هذا الحساب مرتبط بشخص آخر",
          body: "الحساب الواحد لشخص واحد. أنشئ حسابًا ببريد إلكتروني آخر أو اسأل الاستقبال.",
        },
      },
    },

    myStay: {
      bed: "السرير {name}",
      floor: "الطابق {floor}",
      balance: "الرصيد",
      owed: "المبلغ المستحق عليك",
      credit: "رصيد لصالحك",
      settled: "لا شيء مستحق",
      instalment: {
        heading: "القسط التالي",
        position: "القسط {number} من {total}",
        dueOn: "يستحق في {date}",
        dueToday: "يستحق اليوم",
        wasDueOn: "كان مستحقًا في {date}",
        overdueNote: "تأخّر سداد هذا القسط. يُرجى مراجعة مكتب الاستقبال.",
        overdueAll:
          "{count, plural, one {قسط واحد متأخر} two {قسطان متأخران} few {# أقساط متأخرة} many {# قسطًا متأخرًا} other {# قسط متأخر}}، بإجمالي {amount}.",
      },
    },

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
