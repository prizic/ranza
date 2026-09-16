export const supportedLocales = ["tr", "en", "ar"] as const;
export const defaultLocale = "tr" as const;

export type SupportedLocale = (typeof supportedLocales)[number];

const intlLocales: Record<SupportedLocale, string> = {
  ar: "ar-TR",
  en: "en-TR",
  tr: "tr-TR",
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

export function directionFor(locale: SupportedLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function localeFromPathname(pathname: string): SupportedLocale {
  const segment = pathname.split("/").filter(Boolean)[0];
  return isSupportedLocale(segment) ? segment : defaultLocale;
}

export function localizeHref(
  locale: SupportedLocale,
  pathname: string,
): string {
  const suffix = pathname === "/" ? "" : `/${pathname.replace(/^\/+/, "")}`;
  return `/${locale}${suffix}`;
}

export function replaceLocaleInPathname(
  pathname: string,
  locale: SupportedLocale,
): string {
  const segments = pathname.split("/").filter(Boolean);
  if (isSupportedLocale(segments[0])) segments.shift();
  return localizeHref(locale, `/${segments.join("/")}`);
}

export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocales[locale], options).format(value);
}

export function formatDate(
  value: Date | number,
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(value);
}

export interface Messages {
  common: { branchCode: string; supportReference: string };
  control: { description: string; title: string };
  language: { ar: string; en: string; label: string; tr: string };
  navigation: {
    announcements: string;
    attendance: string;
    balance: string;
    branches: string;
    contact: string;
    home: string;
    meals: string;
    operators: string;
    serviceHealth: string;
    skipToContent: string;
    wifi: string;
  };
  product: {
    description: string;
    install: { action: string; description: string; title: string };
    title: string;
  };
  states: {
    formError: { description: string; title: string };
    loading: string;
    maintenance: { action: string; description: string; title: string };
    notFound: { action: string; description: string; title: string };
    unexpected: { action: string; description: string; title: string };
  };
  storefront: { description: string; title: string };
}

const messages: Record<SupportedLocale, Messages> = {
  ar: {
    common: { branchCode: "رمز الفرع", supportReference: "مرجع الدعم" },
    control: {
      description:
        "مساحة داخلية منفصلة لإدارة دورة حياة المشغّلين وإجراءات الدعم الخاضعة للتدقيق.",
      title: "لوحة تحكم Ranza",
    },
    language: { ar: "العربية", en: "English", label: "اللغة", tr: "Türkçe" },
    navigation: {
      announcements: "الإعلانات",
      attendance: "الحضور",
      balance: "الرصيد",
      branches: "الفروع",
      contact: "طلب عرض",
      home: "الرئيسية",
      meals: "الوجبات",
      operators: "المشغّلون",
      serviceHealth: "حالة الخدمة",
      skipToContent: "تخطَّ إلى المحتوى",
      wifi: "شبكة Wi‑Fi",
    },
    product: {
      description:
        "المهام اليومية للطلاب وفرق السكن في مساحة واضحة وآمنة ومتعددة اللغات.",
      install: {
        action: "تعليمات التثبيت",
        description:
          "أضف Ranza إلى شاشتك الرئيسية من قائمة المتصفح عندما يكون التثبيت مدعوماً.",
        title: "Ranza معك دائماً",
      },
      title: "تبدأ أيام السكن بصورة أوضح.",
    },
    states: {
      formError: {
        description: "راجع الحقل المحدد ثم حاول مرة أخرى.",
        title: "تعذّر إرسال النموذج",
      },
      loading: "جارٍ تحميل المحتوى…",
      maintenance: {
        action: "العودة إلى الرئيسية",
        description:
          "نجري صيانة مخططة الآن. عُد بعد قليل؛ لن تُعرض أي عملية غير محفوظة على أنها ناجحة.",
        title: "سنعود قريباً",
      },
      notFound: {
        action: "العودة إلى الرئيسية",
        description: "قد يكون الرابط قديماً أو أن الصفحة نُقلت.",
        title: "تعذّر العثور على هذه الصفحة",
      },
      unexpected: {
        action: "حاول مرة أخرى",
        description:
          "حدث خطأ غير متوقع. لم نعرض العملية على أنها مكتملة. حاول مجدداً أو شارك مرجع الدعم.",
        title: "لم تكتمل العملية",
      },
    },
    storefront: {
      description:
        "نظّم الحضور والوجبات والإعلانات والأرصدة ومعلومات Wi‑Fi لكل فروع سكن الطلاب من مكان واحد.",
      title: "إيقاع يومي أوضح لكل سكن.",
    },
  },
  en: {
    common: {
      branchCode: "Branch code",
      supportReference: "Support reference",
    },
    control: {
      description:
        "A separate internal surface for Operator lifecycle and audited support work.",
      title: "Ranza Control Plane",
    },
    language: { ar: "العربية", en: "English", label: "Language", tr: "Türkçe" },
    navigation: {
      announcements: "Announcements",
      attendance: "Attendance",
      balance: "Balance",
      branches: "Branches",
      contact: "Request a demo",
      home: "Home",
      meals: "Meals",
      operators: "Operators",
      serviceHealth: "Service health",
      skipToContent: "Skip to content",
      wifi: "Wi‑Fi",
    },
    product: {
      description:
        "Daily work for students and dormitory teams in one clear, secure, multilingual space.",
      install: {
        action: "Installation guidance",
        description:
          "Add Ranza to your home screen from the browser menu when installation is supported.",
        title: "Keep Ranza close",
      },
      title: "Clearer dormitory days start here.",
    },
    states: {
      formError: {
        description: "Review the highlighted field and try again.",
        title: "The form could not be submitted",
      },
      loading: "Loading content…",
      maintenance: {
        action: "Return home",
        description:
          "Planned maintenance is underway. Come back shortly; unsaved work will never be shown as successful.",
        title: "We will be back shortly",
      },
      notFound: {
        action: "Return home",
        description: "The link may be outdated or the page may have moved.",
        title: "This page could not be found",
      },
      unexpected: {
        action: "Try again",
        description:
          "Something unexpected happened. The action was not shown as complete. Try again or share the support reference.",
        title: "The action was not completed",
      },
    },
    storefront: {
      description:
        "Coordinate attendance, meals, announcements, balances, and Wi‑Fi information across every student-dormitory Branch from one place.",
      title: "A clearer daily rhythm for every dormitory.",
    },
  },
  tr: {
    common: { branchCode: "Şube kodu", supportReference: "Destek referansı" },
    control: {
      description:
        "Operatör yaşam döngüsü ve denetimli destek işlemleri için ayrı iç çalışma alanı.",
      title: "Ranza Kontrol Merkezi",
    },
    language: { ar: "العربية", en: "English", label: "Dil", tr: "Türkçe" },
    navigation: {
      announcements: "Duyurular",
      attendance: "Yoklama",
      balance: "Bakiye",
      branches: "Şubeler",
      contact: "Demo talebi",
      home: "Ana sayfa",
      meals: "Öğünler",
      operators: "Operatörler",
      serviceHealth: "Servis durumu",
      skipToContent: "İçeriğe geç",
      wifi: "Wi‑Fi",
    },
    product: {
      description:
        "Öğrencilerin ve yurt ekiplerinin günlük işleri, açık, güvenli ve çok dilli tek alanda.",
      install: {
        action: "Kurulum yönergesi",
        description:
          "Desteklendiğinde tarayıcı menüsünden Ranza’yı ana ekranınıza ekleyin.",
        title: "Ranza hep yakınınızda",
      },
      title: "Daha net yurt günleri burada başlar.",
    },
    states: {
      formError: {
        description: "İşaretli alanı gözden geçirip yeniden deneyin.",
        title: "Form gönderilemedi",
      },
      loading: "İçerik yükleniyor…",
      maintenance: {
        action: "Ana sayfaya dön",
        description:
          "Planlı bakım yapıyoruz. Kısa süre sonra yeniden deneyin; kaydedilmeyen işlem başarılı gösterilmez.",
        title: "Kısa süre sonra buradayız",
      },
      notFound: {
        action: "Ana sayfaya dön",
        description: "Bağlantı eski olabilir veya sayfa taşınmış olabilir.",
        title: "Bu sayfa bulunamadı",
      },
      unexpected: {
        action: "Yeniden dene",
        description:
          "Beklenmeyen bir sorun oluştu. İşlem tamamlandı olarak gösterilmedi. Yeniden deneyin veya destek referansını paylaşın.",
        title: "İşlem tamamlanamadı",
      },
    },
    storefront: {
      description:
        "Yoklama, öğün, duyuru, bakiye ve Wi‑Fi bilgilerini tüm öğrenci yurdu Şubeleriniz için tek yerden yönetin.",
      title: "Her yurt için daha net bir günlük ritim.",
    },
  },
};

export function messagesFor(locale: SupportedLocale): Messages {
  return messages[locale];
}
