import type { SupportedLocale } from "@ranza/i18n";

export const attendanceCopy: Record<
  SupportedLocale,
  {
    away: string;
    branch: string;
    cutoff: string;
    failed: string;
    late: string;
    pending: string;
    profile: string;
    saved: string;
    staying: string;
    submit: string;
    title: string;
    unconfirmed: string;
  }
> = {
  tr: {
    away: "Bu gece dışarıdayım",
    branch: "Şube",
    cutoff: "Son bildirim zamanı",
    failed: "Bildirim kaydedilemedi. Lütfen tekrar deneyin.",
    late: "Son bildirim zamanı geçti; önceki durumunuz değişmedi.",
    pending: "Kaydediliyor…",
    profile: "Öğrenci",
    saved: "Son bildiriminiz kaydedildi.",
    staying: "Bu gece yurtta kalıyorum",
    submit: "Bildirimi kaydet",
    title: "Gece yoklaması",
    unconfirmed: "Bildirilmedi",
  },
  en: {
    away: "I am away tonight",
    branch: "Branch",
    cutoff: "Declaration deadline",
    failed: "The declaration was not saved. Please try again.",
    late: "The deadline has passed; your previous status was not changed.",
    pending: "Saving…",
    profile: "Student",
    saved: "Your latest declaration was saved.",
    staying: "I am staying tonight",
    submit: "Save declaration",
    title: "Nightly attendance",
    unconfirmed: "Unconfirmed",
  },
  ar: {
    away: "سأكون خارج السكن الليلة",
    branch: "الفرع",
    cutoff: "آخر موعد للتصريح",
    failed: "لم يُحفظ التصريح. حاول مرة أخرى.",
    late: "انتهى الموعد؛ لم تتغير حالتك السابقة.",
    pending: "جارٍ الحفظ…",
    profile: "الطالب",
    saved: "تم حفظ أحدث تصريح لك.",
    staying: "سأبقى في السكن الليلة",
    submit: "حفظ التصريح",
    title: "الحضور الليلي",
    unconfirmed: "غير مؤكّد",
  },
};
