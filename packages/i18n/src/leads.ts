import type { SupportedLocale } from "./index";
interface LeadMessages {
  demo: string;
  intro: string;
  branchesTitle: string;
  branches: string;
  languages: string;
  suite: string[];
  founding: string;
  name: string;
  contact: string;
  operator: string;
  beds: string;
  city: string;
  language: string;
  message: string;
  consent: string;
  privacy: string;
  privacyBody: string;
  sending: string;
  success: string;
  failed: string;
  invalid: string;
  reference: string;
  errors: Record<string, string>;
  leads: string;
  restricted: string;
  empty: string;
  status: string;
  save: string;
  statuses: Record<string, string>;
}
const messages: Record<SupportedLocale, LeadMessages> = {
  en: {
    demo: "Request a demo",
    intro:
      "Tell us about your dormitory. Prizic will contact you to discuss your workflow and arrange a demonstration.",
    branchesTitle: "One Operator. Every Branch.",
    branches:
      "Manage separate buildings, including male and female residences, under one account and one Subscription. Managers see their assigned Branches; Students see their own residence.",
    languages:
      "Turkish, English and Arabic. A phone-friendly Student App, with right-to-left Arabic support.",
    suite: [
      "Know who plans to stay tonight, and who has not responded.",
      "Give the kitchen a final count for tomorrow’s meals.",
      "Publish announcements and follow explicit acknowledgments.",
      "Record Student charges and external payments. Ranza does not collect money.",
      "Share Branch Wi-Fi information with signed-in residents or a public QR link, according to your settings.",
    ],
    founding:
      "Start with an agreed Founding Offer and a 14-day operational evaluation. We discuss scope and price together before the evaluation begins.",
    name: "Your name",
    contact: "Work email or phone",
    operator: "Dormitory / Operator name",
    beds: "Approximate bed count",
    city: "City",
    language: "Preferred language",
    message: "Message (optional)",
    consent: "I have read and accept the privacy notice for this request.",
    privacy: "Privacy notice",
    privacyBody:
      "Prizic uses your contact and dormitory details to respond to your request and arrange a demonstration. Requests are private and available only to authorized Prizic staff. We record the time and version of your acceptance. Do not include Student data or sensitive information. This form uses Cloudflare Turnstile to prevent automated abuse. Ask the Prizic staff responding to your request about access, correction or deletion of your information.",
    sending: "Sending…",
    success: "Your request has been received. Prizic will contact you.",
    failed:
      "We could not send your request. Your entries are still here; please try again.",
    invalid: "Check the highlighted fields and try again.",
    reference: "Request reference",
    errors: {
      required: "Complete this field.",
      contact: "Enter a work email or phone number.",
      beds: "Enter a whole number from 1 to 100,000.",
      consent: "Accept the privacy notice to send your request.",
      length: "This entry is too long or contains unsupported characters.",
    },
    leads: "Demo requests",
    restricted:
      "Sign in with an authorized Prizic account and complete MFA to review requests.",
    empty: "No demo requests to review.",
    status: "Status",
    save: "Save status",
    statuses: {
      new: "New",
      contacted: "Contacted",
      qualified: "Qualified",
      closed: "Closed",
    },
  },
  tr: {
    demo: "Demo talep edin",
    intro:
      "Yurdunuzdan bahsedin. Prizic, çalışma düzeninizi görüşmek ve bir demo planlamak için sizinle iletişime geçsin.",
    branchesTitle: "Tek İşletmeci. Tüm Şubeler.",
    branches:
      "Erkek ve kız yurtları dahil ayrı binaları tek hesap ve tek Abonelik altında yönetin. Yöneticiler yetkili oldukları Şubeleri, Öğrenciler kendi yurtlarını görür.",
    languages:
      "Türkçe, İngilizce ve Arapça. Sağdan sola Arapça desteğiyle telefonda rahat kullanılan Öğrenci Uygulaması.",
    suite: [
      "Bu gece kimlerin kalacağını ve kimlerin yanıt vermediğini görün.",
      "Mutfak için yarının öğün sayılarını kesinleştirin.",
      "Duyuru yayınlayın ve açık onayları takip edin.",
      "Öğrenci borçlarını ve dışarıdan alınan ödemeleri kaydedin. Ranza para tahsil etmez.",
      "Şube Wi-Fi bilgilerini ayarlarınıza göre oturum açmış sakinlerle veya herkese açık QR bağlantısıyla paylaşın.",
    ],
    founding:
      "Önceden kararlaştırılan Kurucu Teklif ve 14 günlük operasyonel değerlendirmeyle başlayın. Değerlendirmeden önce kapsamı ve fiyatı birlikte belirleyelim.",
    name: "Adınız",
    contact: "İş e-postası veya telefon",
    operator: "Yurt / İşletmeci adı",
    beds: "Yaklaşık yatak sayısı",
    city: "Şehir",
    language: "Tercih edilen dil",
    message: "Mesaj (isteğe bağlı)",
    consent: "Bu talebe ilişkin gizlilik bildirimini okudum ve kabul ediyorum.",
    privacy: "Gizlilik bildirimi",
    privacyBody:
      "Prizic, iletişim ve yurt bilgilerinizi talebinizi yanıtlamak ve demo düzenlemek için kullanır. Talepler özeldir ve yalnızca yetkili Prizic personeline açıktır. Kabulünüzün zamanını ve bildirim sürümünü kaydederiz. Öğrenci verisi veya hassas bilgi eklemeyin. Bu form, otomatik kötüye kullanımı önlemek için Cloudflare Turnstile kullanır. Bilgilerinize erişim, düzeltme veya silme hakkında talebinizi yanıtlayan Prizic personeline başvurabilirsiniz.",
    sending: "Gönderiliyor…",
    success: "Talebiniz alındı. Prizic sizinle iletişime geçecek.",
    failed:
      "Talebinizi gönderemedik. Girdileriniz korundu; lütfen tekrar deneyin.",
    invalid: "İşaretli alanları kontrol edip tekrar deneyin.",
    reference: "Talep referansı",
    errors: {
      required: "Bu alanı doldurun.",
      contact: "İş e-postası veya telefon numarası girin.",
      beds: "1 ile 100.000 arasında tam sayı girin.",
      consent: "Talebinizi göndermek için gizlilik bildirimini kabul edin.",
      length: "Bu giriş çok uzun veya desteklenmeyen karakterler içeriyor.",
    },
    leads: "Demo talepleri",
    restricted:
      "Talepleri incelemek için yetkili Prizic hesabıyla giriş yapın ve MFA doğrulamasını tamamlayın.",
    empty: "İncelenecek demo talebi yok.",
    status: "Durum",
    save: "Durumu kaydet",
    statuses: {
      new: "Yeni",
      contacted: "İletişime geçildi",
      qualified: "Uygun",
      closed: "Kapalı",
    },
  },
  ar: {
    demo: "اطلب عرضًا توضيحيًا",
    intro:
      "أخبرنا عن سكنك. سيتواصل معك Prizic لمناقشة سير العمل وترتيب عرض توضيحي.",
    branchesTitle: "مشغّل واحد. جميع الفروع.",
    branches:
      "أدِر المباني المنفصلة، بما فيها سكن الذكور والإناث، بحساب واحد واشتراك واحد. يرى المديرون الفروع المكلّفين بها ويرى الطلاب سكنهم فقط.",
    languages:
      "التركية والإنجليزية والعربية. تطبيق طلاب مريح على الهاتف مع دعم العربية من اليمين إلى اليسار.",
    suite: [
      "اعرف من ينوي البقاء الليلة ومن لم يرد بعد.",
      "زوّد المطبخ بأعداد نهائية لوجبات الغد.",
      "انشر الإعلانات وتابع التأكيدات الصريحة.",
      "سجّل رسوم الطلاب والمدفوعات الخارجية. لا يجمع Ranza الأموال.",
      "شارك معلومات شبكة الفرع مع المقيمين المسجلين أو عبر رابط QR عام وفق إعداداتك.",
    ],
    founding:
      "ابدأ بعرض تأسيسي متفق عليه وتقييم تشغيلي لمدة 14 يومًا. نناقش النطاق والسعر معًا قبل بدء التقييم.",
    name: "اسمك",
    contact: "البريد المهني أو الهاتف",
    operator: "اسم السكن / المشغّل",
    beds: "عدد الأسرّة التقريبي",
    city: "المدينة",
    language: "اللغة المفضلة",
    message: "الرسالة (اختياري)",
    consent: "قرأت إشعار الخصوصية لهذا الطلب وأوافق عليه.",
    privacy: "إشعار الخصوصية",
    privacyBody:
      "يستخدم Prizic بيانات الاتصال والسكن للرد على طلبك وترتيب عرض توضيحي. الطلبات خاصة ومتاحة فقط لموظفي Prizic المخوّلين. نسجّل وقت قبولك وإصدار الإشعار. لا تُدرج بيانات الطلاب أو معلومات حساسة. يستخدم هذا النموذج Cloudflare Turnstile لمنع الإساءة الآلية. اسأل موظف Prizic الذي يرد عليك عن الوصول إلى معلوماتك أو تصحيحها أو حذفها.",
    sending: "جارٍ الإرسال…",
    success: "تم استلام طلبك. سيتواصل معك Prizic.",
    failed: "تعذّر إرسال الطلب. بياناتك ما زالت هنا؛ يرجى المحاولة مجددًا.",
    invalid: "راجع الحقول المحددة وحاول مجددًا.",
    reference: "مرجع الطلب",
    errors: {
      required: "أكمل هذا الحقل.",
      contact: "أدخل بريدًا مهنيًا أو رقم هاتف.",
      beds: "أدخل عددًا صحيحًا بين 1 و100,000.",
      consent: "وافق على إشعار الخصوصية لإرسال الطلب.",
      length: "هذا الإدخال طويل جدًا أو يحتوي أحرفًا غير مدعومة.",
    },
    leads: "طلبات العرض",
    restricted:
      "سجّل الدخول بحساب Prizic مخوّل وأكمل المصادقة متعددة العوامل لمراجعة الطلبات.",
    empty: "لا توجد طلبات عرض للمراجعة.",
    status: "الحالة",
    save: "حفظ الحالة",
    statuses: {
      new: "جديد",
      contacted: "تم التواصل",
      qualified: "مؤهل",
      closed: "مغلق",
    },
  },
};
export function leadMessagesFor(locale: SupportedLocale): LeadMessages {
  return messages[locale];
}
