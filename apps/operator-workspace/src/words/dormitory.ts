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
    reservations: "Kayıtlar",
    newBooking: "Yeni kayıt",
    newReservation: "Yeni kayıt",
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
    dashboard: { newBooking: "Yeni kayıt" },
    configuration: {
      operatingModelHints: {
        dormitory:
          "Dönemlik öğrenciler. Ekranlar Öğrenci ve Kayıt der; yeni kayıtlar öğrenci konaklaması olarak başlar.",
      },
    },
    dataExport: { datasets: { residents_guests: "Konuklar ve öğrenciler" } },
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
    reservations: "Registrations",
    newBooking: "New registration",
    newReservation: "New registration",
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
    dashboard: { newBooking: "New registration" },
    configuration: {
      operatingModelHints: {
        dormitory:
          "Students for a term. The screens say Student and Registration, and new registrations start as a Student stay.",
      },
    },
    dataExport: { datasets: { residents_guests: "Guests and students" } },
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
    reservations: "التسجيلات",
    newBooking: "تسجيل جديد",
    newReservation: "تسجيل جديد",
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
    dashboard: { newBooking: "تسجيل جديد" },
    configuration: {
      operatingModelHints: {
        dormitory:
          "طلاب لفصل دراسي. تقول الشاشات طالب وتسجيل، ويبدأ التسجيل الجديد إقامةَ طالب.",
      },
    },
    dataExport: { datasets: { residents_guests: "الضيوف والطلاب" } },
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
      reservations: "التسجيلات",
      rooms: "الغرف والأسرّة",
      "guest-experience": "طلبات الطلاب",
    },
    screenSummary: {
      "guest-experience": "طلبات الطلاب والضيوف والإعلانات ومتابعة الخدمة.",
    },
  },
};
