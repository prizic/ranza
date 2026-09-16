import type { SupportedLocale } from "@ranza/i18n";

export const staffDashboardCopy = {
  en: {
    activeBranch: "Active Branch",
    attendance: "Nightly attendance",
    balances: "Student balances",
    branchUnavailable:
      "The requested Branch is unavailable. Your authorized Branch is shown instead.",
    exportData: "Export Operator data",
    meals: "Meal responses",
    roster: "Student roster",
    staffAccess: "Staff access",
    switchBranch: "Switch Branch",
    wifi: "Branch Wi-Fi",
  },
  tr: {
    activeBranch: "Aktif şube",
    attendance: "Gece yoklaması",
    balances: "Öğrenci bakiyeleri",
    branchUnavailable:
      "İstenen şubeye erişilemiyor. Bunun yerine yetkili olduğunuz şube gösteriliyor.",
    exportData: "İşletme verilerini dışa aktar",
    meals: "Yemek yanıtları",
    roster: "Öğrenci listesi",
    staffAccess: "Personel erişimi",
    switchBranch: "Şube değiştir",
    wifi: "Şube Wi-Fi",
  },
  ar: {
    activeBranch: "الفرع النشط",
    attendance: "الحضور الليلي",
    balances: "أرصدة الطلاب",
    branchUnavailable: "الفرع المطلوب غير متاح. يظهر بدلًا منه فرع مصرح لك به.",
    exportData: "تصدير بيانات المشغّل",
    meals: "ردود الوجبات",
    roster: "قائمة الطلاب",
    staffAccess: "صلاحيات الموظف",
    switchBranch: "تبديل الفرع",
    wifi: "شبكة Wi-Fi للفرع",
  },
} as const;

const roles = {
  en: { branch_staff: "Branch staff", manager: "Manager", owner: "Owner" },
  tr: {
    branch_staff: "Şube personeli",
    manager: "Yönetici",
    owner: "İşletme sahibi",
  },
  ar: { branch_staff: "موظف الفرع", manager: "مدير", owner: "المالك" },
} as const;

const capabilities: Record<SupportedLocale, Record<string, string>> = {
  en: {
    "finance.manage": "Manage balances",
    "roster.manage": "Manage roster",
    "workflow.manage": "Manage daily workflows",
    "workflow.read": "View daily workflows",
  },
  tr: {
    "finance.manage": "Bakiyeleri yönet",
    "roster.manage": "Öğrenci listesini yönet",
    "workflow.manage": "Günlük iş akışlarını yönet",
    "workflow.read": "Günlük iş akışlarını görüntüle",
  },
  ar: {
    "finance.manage": "إدارة الأرصدة",
    "roster.manage": "إدارة قائمة الطلاب",
    "workflow.manage": "إدارة إجراءات العمل اليومية",
    "workflow.read": "عرض إجراءات العمل اليومية",
  },
};

export function roleLabel(
  locale: SupportedLocale,
  role: keyof (typeof roles)[SupportedLocale],
) {
  return roles[locale][role];
}

export function capabilityLabel(locale: SupportedLocale, capability: string) {
  return (
    capabilities[locale][capability] ?? staffDashboardCopy[locale].staffAccess
  );
}
