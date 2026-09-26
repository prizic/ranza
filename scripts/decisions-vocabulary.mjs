// The words an edge-case table may use, as the decision register reads them.
// Shared by the register and the branch reader so that a row read off a branch
// is held to the same vocabulary the page renders — a word the page has no
// label for is a row it cannot draw. edge-cases-check.mjs is the gate that
// keeps the tables on this tree inside it; a branch has passed no such gate.
export const HEADER = [
  "id",
  "situation",
  "given",
  "when",
  "then",
  "enforced_by",
  "test_name",
  "status",
];

export const KINDS = {
  decided: { en: "Decided", ar: "تقرّر", statuses: ["approved", "resolved"] },
  pending: {
    en: "Awaiting a decision",
    ar: "بانتظار قرار",
    statuses: ["open", "proposed"],
  },
  gap: {
    en: "Known gap",
    ar: "فجوة معروفة",
    statuses: ["prerequisite_missing", "current_behaviour_differs"],
  },
  parked: { en: "Parked", ar: "مُرجأ", statuses: ["deferred", "out_of_scope"] },
};

export const STATUS_AR = {
  approved: "معتمد",
  resolved: "محلول",
  open: "مفتوح",
  proposed: "مقترح",
  deferred: "مؤجل",
  out_of_scope: "خارج النطاق",
  prerequisite_missing: "متطلب مسبق ناقص",
  current_behaviour_differs: "السلوك الحالي مختلف",
};

export const ENFORCED_AR = {
  database_constraint: "قيد في قاعدة البيانات",
  policy: "سياسة أمان على مستوى الصف",
  trigger: "مُشغِّل في قاعدة البيانات",
  database_function: "دالة في قاعدة البيانات",
  module: "الوحدة البرمجية",
  ui_only: "الواجهة فقط",
};

export const hasKind = (status) =>
  Object.values(KINDS).some((kind) => kind.statuses.includes(status));
