import type { SupportedLocale } from "@ranza/i18n";

const statusCopy = {
  en: {
    cancelled: "Cancelled",
    committed: "Completed",
    failed: "Failed",
    importing: "Importing",
    staged: "Ready to review",
  },
  tr: {
    cancelled: "İptal edildi",
    committed: "Tamamlandı",
    failed: "Başarısız",
    importing: "Aktarılıyor",
    staged: "İncelemeye hazır",
  },
  ar: {
    cancelled: "أُلغيت",
    committed: "اكتملت",
    failed: "فشلت",
    importing: "جارٍ الاستيراد",
    staged: "جاهزة للمراجعة",
  },
} as const;

const errorCopy: Record<SupportedLocale, Record<string, string>> = {
  en: {
    DUPLICATE_EXTERNAL_REFERENCE:
      "The external reference is repeated in this file.",
    EXISTING_EXTERNAL_REFERENCE: "The external reference already exists.",
    INVALID_COLUMN_COUNT: "The row has the wrong number of columns.",
    INVALID_DISPLAY_NAME: "Enter a name between 2 and 120 characters.",
    INVALID_EXTERNAL_REFERENCE:
      "Enter an external reference up to 120 characters.",
    INVALID_LOCALE: "Use tr, en, or ar for the language.",
    INVALID_ROW_NUMBER: "The row number is invalid.",
    MISSING_DISPLAY_NAME: "The student name is required.",
    MISSING_EXTERNAL_REFERENCE: "The external reference is required.",
  },
  tr: {
    DUPLICATE_EXTERNAL_REFERENCE: "Harici referans bu dosyada tekrarlanıyor.",
    EXISTING_EXTERNAL_REFERENCE: "Harici referans zaten mevcut.",
    INVALID_COLUMN_COUNT: "Satırdaki sütun sayısı yanlış.",
    INVALID_DISPLAY_NAME: "2–120 karakter arasında bir ad girin.",
    INVALID_EXTERNAL_REFERENCE:
      "En fazla 120 karakterlik harici referans girin.",
    INVALID_LOCALE: "Dil için tr, en veya ar kullanın.",
    INVALID_ROW_NUMBER: "Satır numarası geçersiz.",
    MISSING_DISPLAY_NAME: "Öğrenci adı zorunludur.",
    MISSING_EXTERNAL_REFERENCE: "Harici referans zorunludur.",
  },
  ar: {
    DUPLICATE_EXTERNAL_REFERENCE: "المرجع الخارجي مكرر في هذا الملف.",
    EXISTING_EXTERNAL_REFERENCE: "المرجع الخارجي موجود بالفعل.",
    INVALID_COLUMN_COUNT: "عدد الأعمدة في الصف غير صحيح.",
    INVALID_DISPLAY_NAME: "أدخل اسمًا من حرفين إلى 120 حرفًا.",
    INVALID_EXTERNAL_REFERENCE: "أدخل مرجعًا خارجيًا لا يتجاوز 120 حرفًا.",
    INVALID_LOCALE: "استخدم tr أو en أو ar للغة.",
    INVALID_ROW_NUMBER: "رقم الصف غير صالح.",
    MISSING_DISPLAY_NAME: "اسم الطالب مطلوب.",
    MISSING_EXTERNAL_REFERENCE: "المرجع الخارجي مطلوب.",
  },
};

export const studentImportCopy = {
  en: {
    back: "Student roster",
    cancel: "Cancel",
    confirm: "Import selected rows",
    errors: "Download row errors",
    fileHelp:
      "UTF-8 CSV with external reference, student name, and language (tr, en, or ar). Maximum 1,000 rows or 5 MB.",
    fileLabel: "Choose Student CSV file",
    history: "Recent imports",
    invalid: "Needs correction",
    locale: "Language",
    name: "Student name",
    reference: "External reference",
    row: "Row",
    select: "Select",
    selectRow: "Select valid row",
    status: "Status",
    supportReference: "Support reference",
    template: "Download UTF-8 template",
    title: "Import Students",
    upload: "Preview CSV",
    valid: "Valid",
  },
  tr: {
    back: "Öğrenci listesi",
    cancel: "İptal",
    confirm: "Seçilen satırları aktar",
    errors: "Satır hatalarını indir",
    fileHelp:
      "Harici referans, öğrenci adı ve dil (tr, en veya ar) içeren UTF-8 CSV. En fazla 1.000 satır veya 5 MB.",
    fileLabel: "Öğrenci CSV dosyasını seçin",
    history: "Son aktarımlar",
    invalid: "Düzeltme gerekli",
    locale: "Dil",
    name: "Öğrenci adı",
    reference: "Harici referans",
    row: "Satır",
    select: "Seç",
    selectRow: "Geçerli satırı seç",
    status: "Durum",
    supportReference: "Destek referansı",
    template: "UTF-8 şablonunu indir",
    title: "Öğrencileri içe aktar",
    upload: "CSV önizleme",
    valid: "Geçerli",
  },
  ar: {
    back: "قائمة الطلاب",
    cancel: "إلغاء",
    confirm: "استيراد الصفوف المحددة",
    errors: "تنزيل أخطاء الصفوف",
    fileHelp:
      "ملف CSV بترميز UTF-8 يحتوي المرجع الخارجي واسم الطالب واللغة (tr أو en أو ar). بحد أقصى 1000 صف أو 5 ميغابايت.",
    fileLabel: "اختر ملف CSV للطلاب",
    history: "عمليات الاستيراد الأخيرة",
    invalid: "يحتاج إلى تصحيح",
    locale: "اللغة",
    name: "اسم الطالب",
    reference: "المرجع الخارجي",
    row: "الصف",
    select: "تحديد",
    selectRow: "تحديد الصف الصالح",
    status: "الحالة",
    supportReference: "مرجع الدعم",
    template: "تنزيل قالب UTF-8",
    title: "استيراد الطلاب",
    upload: "معاينة CSV",
    valid: "صالح",
  },
} as const;

export function importStatusLabel(
  locale: SupportedLocale,
  status: keyof (typeof statusCopy)[SupportedLocale],
) {
  return statusCopy[locale][status];
}

export function importErrorLabel(locale: SupportedLocale, code: string) {
  return (
    errorCopy[locale][code] ??
    {
      ar: "تعذر التحقق من هذا الصف.",
      en: "This row could not be validated.",
      tr: "Bu satır doğrulanamadı.",
    }[locale]
  );
}
