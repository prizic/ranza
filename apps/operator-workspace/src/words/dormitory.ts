import type { SupportedLocale } from "@ranza/i18n";
import type { Messages } from "../messages";

/**
 * Some of a catalogue: the strings one operating model says differently.
 * Typed against `Messages`, so a key that does not exist, or a group given a
 * string, is a compile error rather than a word that silently never shows.
 */
export type WordsOverlay<T> = {
  [K in keyof T]?: T[K] extends string ? string : WordsOverlay<T[K]>;
};

/**
 * What a student dormitory's screens say instead (ADR 0057).
 *
 * The code, the database and the canonical vocabulary keep Resident and
 * Reservation (blueprint section 2); this is only what a dormitory's staff
 * read. A Resident is a Student here, a booking is a Registration, and the
 * Guest Experience screen is where students' requests arrive. A Guest stays a
 * Guest: a yurt lets rooms to summer guests too.
 *
 * Arabic مقيم mostly means "in house" in this catalogue, not the Resident stay
 * type, so only the strings about the stay type change there. Every locale
 * overrides the same keys (`tests/unit/dormitory-words.test.ts`), so no
 * language is left saying the hotel word.
 *
 * Client-safe: it imports only types, so the workspace can merge it in the
 * browser without shipping the whole catalogue a second time.
 */
export const dormitoryWords: Record<SupportedLocale, WordsOverlay<Messages>> = {
  tr: {
    openInHousekeeping: "Temizlikte aç",
    roomsPage: {
      housekeepingLink: "Hangileri temiz, hangileri kirli? Temizliğe bakın",
    },
    housekeeping: {
      stayoverSettingsHint:
        "İçinde kalan olan bir odanın ne sıklıkla temizleneceği. Odalar bu düzene göre sıraya girer ve Temizlik ekranında Dolu oda temizliği altında görünür. Çıkış sonrası temizlik etkilenmez.",
    },
    bedNarrowing: { blockLabel: "Blok", allBlocks: "Tüm bloklar" },
    reservations: "Kayıtlar",
    newBooking: "Yeni kayıt",
    newReservation: "Yeni kayıt",
    takeBooking: "Kayıt oluştur",
    reservationDetails: "Kayıt ayrıntıları",
    particulars: {
      title: "Öğrenci bilgileri",
      show: "Öğrenci bilgisi ekle",
    },
    portalInvite: {
      title: "Öğrenci portalı",
      hint: "Öğrenciye kendi girişini verin; yatağını, dönemini ve bakiyesini telefonundan görsün.",
      connected:
        "{date} tarihinde bağlandı. Öğrenci kaydını portaldan görüyor.",
    },
    stayType: { resident: "Öğrenci konaklaması" },
    departureRequiredHint:
      "Misafir rezervasyonunun bir ayrılış tarihi olmalı. Yalnızca bir öğrencinin kaydı açık uçlu bırakılabilir.",
    quoteResident:
      "Öğrenci gecelik ücretlendirilmez. Yurt ücretini Finans folyoya işler.",
    changeDepartureLongerResident:
      "{count, plural, other {# gece daha}}; öğrencinin ücretini gecelik değil, Finans işler",
    changeDepartureNeedsEnd:
      "Misafirin konaklamasının bir çıkış tarihi olmalı; yalnızca öğrencinin konaklaması açık uçlu olabilir.",
    roomCalendar: { resident: "Öğrenci" },
    staff: {
      permissions: {
        takeAttendance: "Yoklama alma (öğrenciyi var veya yok işaretleme)",
        grantLeave:
          "Öğrenciye izin verme, izni bitirme veya iptal etme ve izin nedenini görme",
      },
    },
    dashboard: {
      newBooking: "Yeni kayıt",
      expectedTonight: "Bu gece beklenen {count} / {of} uygun yatak ({value})",
      readyRooms: "Boş yatak",
      openWorkRequests: "Öğrenci talepleri",
      overdueHint: "Taksit tarihi geçmiş öğrenciler. Rakam onları açar.",
      overdueResidents: "{count, plural, other {öğrenci gecikmiş}}",
      overdueLink:
        "Taksidi geciken {count, plural, other {# öğrenci}}, {amount}",
      rollCallHint:
        "{count, plural, other {# öğrenci}} içeride. Her rakam yoklamayı açar.",
    },
    todayLayouts: {
      rooms: {
        vacant:
          "Bu gece {free, plural, other {# odada}} kimse yok, {count} tanesi temiz ve hazır.",
      },
      figure: {
        tonight: "{available} yataktan {count} tanesi bu gece dolu bekleniyor",
        readyToSell: "Boş yatak",
      },
    },
    configuration: {
      housekeepingTitle: "Temizlik",
      operatingModelHints: {
        dormitory:
          "Dönemlik öğrenciler. Ekranlar Öğrenci ve Kayıt der; yeni kayıtlar öğrenci konaklaması olarak başlar.",
      },
    },
    dataExport: { datasets: { residents_guests: "Konuklar ve öğrenciler" } },
    finance: {
      overdueResident: "Öğrenci",
      overdueNotice:
        "Taksit tarihi geçmiş {count, plural, other {# öğrenci}}. Toplam borç değil, yalnızca geciken tutar.",
    },
    analytics: {
      month: {
        residentNights: "Öğrenci geceleri",
        residentNote:
          "Öğrenci geceleri oda gecesi olarak ücretlendirilmez; bu yüzden çok sayıda öğrenci gecelemesi olan bir yurtta oda geliri burada düşük görünür.",
        unchargedReason: {
          resident: "Öğrenci konaklaması, gecelik ücretlendirilmez",
        },
      },
    },
    guestExperience: {
      subheading:
        "Öğrencilerden ve misafirlerden gelen talepler: kimde olduğu, ne kadar acil olduğu ve ne kadardır beklediği.",
    },
    closeDay: {
      nightsHint:
        "Geceler, öğrenciler dahil konaklayan herkesi sayar. Oda geceleri yalnızca misafirlerindir; öğrenciler gecelik ücretlendirilmez.",
    },
    navigation: {
      housekeeping: "Temizlik",
      reservations: "Kayıtlar",
      rooms: "Odalar ve yataklar",
      "guest-experience": "Öğrenci talepleri",
    },
    screenSummary: {
      "guest-experience":
        "Öğrenci ve misafir talepleri, duyurular ve hizmet takibi.",
    },
  },
  en: {
    openInHousekeeping: "Open in Cleaning",
    roomsPage: { housekeepingLink: "Which are clean or dirty? See Cleaning" },
    housekeeping: {
      stayoverSettingsHint:
        "How often a room somebody is staying in is cleaned. Rooms fall due on this schedule and appear under Stayover due on the Cleaning screen. Cleaning after a departure is not affected.",
    },
    bedNarrowing: { blockLabel: "Block", allBlocks: "All blocks" },
    reservations: "Registrations",
    newBooking: "New registration",
    newReservation: "New registration",
    takeBooking: "Create registration",
    reservationDetails: "Registration details",
    particulars: { title: "Student details", show: "Add student details" },
    portalInvite: {
      title: "Student portal",
      hint: "Give the student their own login to see their bed, term and balance on their phone.",
      connected:
        "Connected on {date}. The student sees their stay on the portal.",
    },
    stayType: { resident: "Student stay" },
    departureRequiredHint:
      "A Guest booking needs a departure date. Only a Student's registration may be left open-ended.",
    quoteResident:
      "A Student is not charged by the night. Finance posts their fees to the Folio.",
    changeDepartureLongerResident:
      "{count, plural, one {# more night} other {# more nights}}; Finance posts a Student's fees, not by the night",
    changeDepartureNeedsEnd:
      "A Guest's stay needs a departure; only a Student's may be open-ended.",
    roomCalendar: { resident: "Student" },
    staff: {
      permissions: {
        takeAttendance:
          "Call the nightly roll (mark students present or absent)",
        grantLeave:
          "Give, end and cancel students' leave, and read why it was given",
      },
    },
    dashboard: {
      newBooking: "New registration",
      expectedTonight:
        "Expected tonight {count} / {of} available beds ({value})",
      readyRooms: "Empty beds",
      openWorkRequests: "Student requests",
      overdueHint:
        "Students with an instalment past its date. The figure opens them.",
      overdueResidents:
        "{count, plural, one {student overdue} other {students overdue}}",
      overdueLink:
        "{count, plural, one {# student} other {# students}} with an overdue instalment, {amount}",
      rollCallHint:
        "{count, plural, one {# student is} other {# students are}} in house. Each figure opens the roll call.",
    },
    todayLayouts: {
      rooms: {
        vacant:
          "{free, plural, one {# room has} other {# rooms have}} nobody in them tonight, {count} cleaned and ready.",
      },
      figure: {
        tonight: "{count} expected tonight, of {available} beds",
        readyToSell: "Empty beds",
      },
    },
    configuration: {
      housekeepingTitle: "Cleaning",
      operatingModelHints: {
        dormitory:
          "Students for a term. The screens say Student and Registration, and new registrations start as a Student stay.",
      },
    },
    dataExport: { datasets: { residents_guests: "Guests and students" } },
    finance: {
      overdueResident: "Student",
      overdueNotice:
        "{count, plural, one {# student has} other {# students have}} an instalment past its date. This is the money overdue, not the money owed in all.",
    },
    analytics: {
      month: {
        residentNights: "Student nights",
        residentNote:
          "A Student's nights are not charged as room nights, so a dormitory with many Student nights shows low room revenue here.",
        unchargedReason: { resident: "Student stay, not charged by the night" },
      },
    },
    guestExperience: {
      subheading:
        "Requests from students and guests: who has them, how urgent they are and how long they have waited.",
    },
    closeDay: {
      nightsHint:
        "Nights counts every Stay in house, Students included. Room nights are Guests' only: a Student is not charged by the night.",
    },
    navigation: {
      housekeeping: "Cleaning",
      reservations: "Registrations",
      rooms: "Rooms and beds",
      "guest-experience": "Student requests",
    },
    screenSummary: {
      "guest-experience":
        "Student and guest requests, announcements and service tracking.",
    },
  },
  ar: {
    openInHousekeeping: "فتح في التنظيف",
    roomsPage: { housekeepingLink: "أيها نظيفة وأيها متسخة؟ افتح التنظيف" },
    housekeeping: {
      stayoverSettingsHint:
        "كم مرة تُنظَّف غرفة يقيم فيها شخص. تستحق الغرف التنظيف وفق هذا الجدول وتظهر تحت «تنظيف الغرف المشغولة» في شاشة التنظيف. لا يتأثر التنظيف بعد المغادرة.",
    },
    bedNarrowing: { blockLabel: "المبنى", allBlocks: "كل المباني" },
    reservations: "التسجيلات",
    newBooking: "تسجيل جديد",
    newReservation: "تسجيل جديد",
    takeBooking: "إنشاء التسجيل",
    reservationDetails: "تفاصيل التسجيل",
    particulars: { title: "بيانات الطالب", show: "إضافة بيانات الطالب" },
    portalInvite: {
      title: "بوابة الطالب",
      hint: "امنح الطالب حسابه الخاص ليرى سريره وفترة إقامته ورصيده من هاتفه.",
      connected: "تم الربط في {date}. يرى الطالب إقامته على البوابة.",
    },
    stayType: { resident: "إقامة طالب" },
    departureRequiredHint:
      "يحتاج حجز الضيف إلى تاريخ مغادرة. يمكن ترك تسجيل الطالب وحده مفتوح المدة.",
    quoteResident:
      "لا يُحاسَب الطالب بسعر الليلة. يقيّد قسم المالية رسومه في الفوليو.",
    changeDepartureLongerResident:
      "{count, plural, one {ليلة إضافية واحدة} two {ليلتان إضافيتان} few {# ليالٍ إضافية} many {# ليلة إضافية} other {# ليلة إضافية}}؛ يقيّد قسم المالية رسوم الطالب، لا بسعر الليلة",
    changeDepartureNeedsEnd:
      "تحتاج إقامة الضيف إلى موعد مغادرة؛ الإقامة المفتوحة للطالب وحده.",
    roomCalendar: { resident: "طالب" },
    staff: {
      permissions: {
        takeAttendance: "أخذ التحضير الليلي (تسجيل حضور الطلاب أو غيابهم)",
        grantLeave: "منح الطلاب إجازات وإنهاؤها وإلغاؤها وقراءة سبب منحها",
      },
    },
    dashboard: {
      newBooking: "تسجيل جديد",
      expectedTonight: "المتوقع الليلة {count} من {of} سريرًا متاحًا ({value})",
      readyRooms: "أسرّة فارغة",
      openWorkRequests: "طلبات الطلاب",
      overdueHint: "طلاب فات موعد قسط عليهم. يفتحهم الرقم.",
      overdueResidents: "{count, plural, other {طلاب متأخرون}}",
      overdueLink:
        "{count, plural, one {طالب واحد} two {طالبان} few {# طلاب} many {# طالبًا} other {# طالب}} عليهم قسط متأخر، {amount}",
      rollCallHint:
        "{count, plural, one {طالب واحد في السكن} two {طالبان في السكن} few {# طلاب في السكن} many {# طالبًا في السكن} other {# طالب في السكن}}. كل رقم يفتح كشف الحضور.",
    },
    todayLayouts: {
      rooms: {
        vacant:
          "{free, plural, zero {لا غرف خالية} one {غرفة خالية واحدة} two {غرفتان خاليتان} few {# غرف خالية} many {# غرفة خالية} other {# غرفة خالية}} من النزلاء الليلة، {count} نظيفة وجاهزة.",
      },
      figure: {
        tonight: "{count} متوقعون الليلة من {available} سريرًا",
        readyToSell: "أسرّة فارغة",
      },
    },
    configuration: {
      housekeepingTitle: "التنظيف",
      operatingModelHints: {
        dormitory:
          "طلاب لفصل دراسي. تقول الشاشات طالب وتسجيل، ويبدأ التسجيل الجديد إقامةَ طالب.",
      },
    },
    dataExport: { datasets: { residents_guests: "الضيوف والطلاب" } },
    finance: {
      overdueResident: "الطالب",
      overdueNotice:
        "{count, plural, one {طالب واحد فات موعد قسطه} two {طالبان فات موعد قسطهما} few {# طلاب فات موعد قسطهم} many {# طالبًا فات موعد قسطهم} other {# طالب فات موعد قسطهم}}. هذا هو المبلغ المتأخر لا ما يُستحق في المجمل.",
    },
    analytics: {
      month: {
        residentNights: "ليالي الطلاب",
        residentNote:
          "لا تُحتسب ليالي الطلاب ليالي غرف، لذا يُظهر السكن ذو ليالي الطلاب الكثيرة إيرادات غرف منخفضة هنا.",
        unchargedReason: { resident: "إقامة طالب، لا تُحاسَب بسعر الليلة" },
      },
    },
    guestExperience: {
      subheading:
        "طلبات الطلاب والضيوف: من يتولاها، ومدى استعجالها، ومنذ متى تنتظر.",
    },
    closeDay: {
      nightsHint:
        "تحسب الليالي كل إقامة في المنشأة، بما فيها الطلاب. أما ليالي الغرف فللضيوف وحدهم: لا يُحاسَب الطالب بسعر الليلة.",
    },
    navigation: {
      housekeeping: "التنظيف",
      reservations: "التسجيلات",
      rooms: "الغرف والأسرّة",
      "guest-experience": "طلبات الطلاب",
    },
    screenSummary: {
      "guest-experience": "طلبات الطلاب والضيوف والإعلانات ومتابعة الخدمة.",
    },
  },
};
