import type { SupportedLocale } from "@ranza/i18n";

export const wifiCopy: Record<
  SupportedLocale,
  {
    branch: string;
    instructions: string;
    mode: string;
    networkName: string;
    noDetails: string;
    password: string;
    protectedMode: string;
    save: string;
    saved: string;
    title: string;
    unavailable: string;
    updated: string;
  }
> = {
  tr: {
    branch: "Şube",
    instructions: "Bağlantı yönergeleri",
    mode: "Görünürlük",
    networkName: "Ağ adı",
    noDetails: "Bu Şube için Wi‑Fi bilgisi henüz paylaşılmadı.",
    password: "Şifre",
    protectedMode: "Korumalı · yalnızca aktif Şube üyeleri",
    save: "Korumalı bilgiyi kaydet",
    saved: "Wi‑Fi bilgisi güvenli biçimde güncellendi.",
    title: "Şube Wi‑Fi bilgisi",
    unavailable: "Wi‑Fi bilgisine erişilemiyor veya değişiklik reddedildi.",
    updated: "Son güncelleme",
  },
  en: {
    branch: "Branch",
    instructions: "Connection instructions",
    mode: "Visibility",
    networkName: "Network name",
    noDetails: "Wi‑Fi information has not been shared for this Branch yet.",
    password: "Password",
    protectedMode: "Protected · active Branch members only",
    save: "Save protected details",
    saved: "Wi‑Fi information was updated securely.",
    title: "Branch Wi‑Fi information",
    unavailable: "Wi‑Fi information is unavailable or the change was denied.",
    updated: "Last updated",
  },
  ar: {
    branch: "الفرع",
    instructions: "تعليمات الاتصال",
    mode: "إمكانية العرض",
    networkName: "اسم الشبكة",
    noDetails: "لم تتم مشاركة معلومات Wi‑Fi لهذا الفرع بعد.",
    password: "كلمة المرور",
    protectedMode: "محمي · لأعضاء الفرع النشطين فقط",
    save: "حفظ المعلومات المحمية",
    saved: "تم تحديث معلومات Wi‑Fi بشكل آمن.",
    title: "معلومات Wi‑Fi للفرع",
    unavailable: "معلومات Wi‑Fi غير متاحة أو تم رفض التغيير.",
    updated: "آخر تحديث",
  },
};
