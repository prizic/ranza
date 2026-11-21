import type { SupportedLocale } from "@ranza/i18n";

/**
 * Copy for guided import, in all three languages (IMP-S1-27).
 *
 * Typed from the English, so a key missing in Turkish or Arabic is a type
 * error rather than English quietly appearing on an Arabic page. Arabic
 * plurals carry every form ICU names for the language. The column headings
 * are not here: they are the template's own, in `@ranza/imports`, so the
 * preview and the file a person downloads cannot disagree.
 *
 * `problems`, `outcomes` and `rowStates` are plain sentences with no
 * arguments, because the result file is worded from them outside a page.
 * `problems` and `outcomes` are by kind: a duplicate room and a duplicate
 * person are not fixed the same way.
 */
const en = {
  intro:
    "Bring your rooms, and the people living in them, in from a spreadsheet. Nothing is added until you have seen every row and pressed Import.",
  kinds: { rooms: "Rooms and beds", people: "People" },
  upload: {
    heading: "Upload a file",
    file: "File",
    hint: "Excel (.xlsx) or CSV, up to {megabytes} MB and {rows} rows. The first sheet is read.",
    template: "Download the template",
    templateHint:
      "Fill it in, or use your own file: the columns are matched by their headings.",
    peopleLead:
      "Each row books one person into a room or bed. Somebody who already lives here is booked from today and checked in. A person on file with the same email is booked, not added twice.",
    peopleNotPermitted:
      "Importing people books them, so it needs the permission to book at this Property. An owner can add it to your role.",
    submit: "Preview",
    reading: "Reading the file…",
    chooseFirst: "Choose a file first.",
  },
  refusals: {
    unsupported_type:
      "That is not an Excel or CSV file. Save it as .xlsx or .csv and upload it again.",
    too_large:
      "That file is over {megabytes} MB. Split it into smaller files and upload each.",
    unreadable:
      "That workbook could not be opened. If it is protected with a password, remove the password and upload it again.",
    empty: "That file is empty.",
    no_rows: "That file has headings and no rows under them.",
    too_many_rows:
      "That file has more than {rows} rows. Split it into smaller files and upload each.",
    no_known_column:
      "None of that file's headings is one this import knows. Download the template to see them.",
  },
  notPermitted:
    "You cannot import at this Property. An owner or a manager can.",
  error: "The file could not be read just now. Nothing was added. Try again.",
  mapping: {
    heading: "Which column is which?",
    lead: "Some headings in your file were not recognised. Say which column holds each, and the preview follows.",
    required: "Required",
    none: "Not in my file",
    submit: "Preview with these columns",
    missing: "Choose a column for every required field.",
  },
  list: {
    heading: "Past imports",
    empty: "Nothing has been imported here yet.",
    emptyLead:
      "Download the template, fill it in and upload it. You will see every row before anything is added.",
    file: "File",
    uploadedBy: "Uploaded by",
    when: "When",
    status: "Status",
    result: "Result",
    open: "Open",
    you: "You",
    someone: "Another Staff Member",
  },
  status: {
    staged: "Previewed, not imported",
    importing: "Importing",
    finished: "Finished",
    discarded: "Discarded",
  },
  counts: {
    ready: "{count, plural, one {# row ready} other {# rows ready}}",
    wrong: "{count, plural, one {# row to fix} other {# rows to fix}}",
    skipped: "{count, plural, one {# already here} other {# already here}}",
    imported: "{count, plural, one {# imported} other {# imported}}",
    refused: "{count, plural, one {# refused} other {# refused}}",
    left: "{count, plural, one {# not imported} other {# not imported}}",
  },
  detail: {
    back: "All imports",
    sheetsIgnored:
      "{count, plural, one {Only the first sheet was read. # other sheet was ignored.} other {Only the first sheet was read. # other sheets were ignored.}}",
    stagedLead:
      "Nothing has been added yet. Check the rows, then import the ones that are ready.",
    nothingReady:
      "No row is ready to import. Fix the rows below in your file and upload it again.",
    importRooms: "{count, plural, one {Import # room} other {Import # rooms}}",
    importPeople:
      "{count, plural, one {Import # person} other {Import # people}}",
    discard: "Discard this preview",
    running: "Importing… {done} of {total}",
    keepOpen:
      "Keep this page open. If you close it the import pauses, and you can carry on from here.",
    pausedLead:
      "This import was paused with {count, plural, one {# row} other {# rows}} still to do.",
    carryOn: "Carry on",
    stop: "Stop and leave the rest",
    finishedLead: "This import is finished.",
    discardedLead: "This preview was discarded. Nothing was added.",
    notMine: "Uploaded by {name}. Only they can read its rows or carry it on.",
    runningElsewhere:
      "{name} is importing here now. Only one import runs at a Property at a time.",
    forgotten:
      "The rows of this import were forgotten after {days} days. The counts above are kept.",
    downloadResult: "Download the result",
    downloadFix: "Download the rows to fix",
    fixHint:
      "Correct them in that file and upload it again. Rows already imported are skipped.",
    row: "Row",
    outcome: "Outcome",
    reason: "What to fix",
    more: "{count, plural, one {And # more row. Download the result to see every row.} other {And # more rows. Download the result to see every row.}}",
    openRooms: "Open Rooms",
    openReservations: "Open Reservations",
    alreadyRunning:
      "Another import is running at this Property. Wait for it to finish, or open it from the list and stop it.",
    stale:
      "This import has moved on since the page was loaded. It has been refreshed.",
    failed: "That did not go through. Nothing more was added. Try again.",
  },
  notFound: {
    title: "That import is not here",
    description: "It may belong to another Property, or the link may be wrong.",
  },
  rowStates: {
    ready: "Ready",
    wrong: "To fix",
    skipped: "Already here",
    imported: "Imported",
    refused: "Refused",
    left: "Not imported",
  },
  problems: {
    rooms: {
      required: "This cell is empty.",
      not_digits:
        "A room number is one to eight digits. Put a building name in its own column.",
      not_a_whole_number: "This must be a whole number.",
      out_of_range: "This number is outside what a room allows.",
      too_long: "A building name is at most sixty characters.",
      unknown_type: "Use Room, Apartment or Suite.",
      unknown_yes_no: "Use Yes or No.",
      only_a_room: "Only a room is let by the bed.",
      too_many_beds: "A room let by the bed holds at most twenty-six beds.",
      unknown_admits: "Use Women, Men or Anyone.",
      duplicate_in_file: "This room is already on an earlier row of the file.",
    },
    people: {
      required: "This cell is empty.",
      too_long: "This is longer than the Property keeps.",
      too_short: "This is too short to be a name.",
      not_an_email: "This is not an email address.",
      unknown_gender: "Use Woman or Man.",
      gender_required:
        "This room admits only women or only men. Say which this person is.",
      not_admitted:
        "This room admits the other gender. Choose another room or bed.",
      unknown_document_type:
        "Use TC Kimlik, Passport, Residence permit or Other.",
      document_type_required: "Say what kind of document this number is from.",
      invalid_tc_kimlik:
        "This is not a valid TC Kimlik number. Check the digits.",
      document_number_length:
        "An identity number is six to twenty letters and digits.",
      too_early: "A date of birth cannot be before 1900.",
      not_a_date: "This is not a date. Write it as 31.12.2026.",
      ambiguous_date:
        "This date could be read two ways. Write it as 31.12.2026.",
      leaving_before_first_night:
        "The leaving day must come after the first night.",
      leaving_required: "A Guest's stay has an end. Give the day they leave.",
      unknown_stay_type: "Use Resident or Guest.",
      already_left:
        "They have already left. Only people living here or coming are imported.",
      no_such_room:
        "The Property has no room with this number. Import your rooms first, or correct it.",
      bed_required: "This room is let by the bed. Say which bed.",
      no_such_bed: "This room has no bed with this name.",
      bed_taken: "This bed is already booked over these nights.",
      duplicate_in_file:
        "This person is already on an earlier row of the file.",
      bed_twice_in_file:
        "Somebody on an earlier row has this bed over the same nights.",
    },
  },
  outcomes: {
    rooms: {
      already_there:
        "This room is already at the Property. It was left as it is.",
      not_permitted:
        "You do not have the permission to add rooms. Ask an owner to add it to your role.",
      invalid: "The Property refused this row as it is written.",
      failed: "Something went wrong on this row. It was not added.",
    },
    people: {
      not_permitted:
        "You do not have the permission to book at this Property. Ask an owner to add it to your role.",
      invalid:
        "The Property refused this person's details as they are written.",
      failed: "Something went wrong on this row. Nobody was booked.",
      bed_taken: "This bed was booked for somebody else since the preview.",
      not_admitted: "This room admits the other gender.",
      price_changed:
        "This bed's price changed while importing. Upload this row again to book it at the new price.",
      not_in_service: "This room or bed is out of service over these nights.",
      already_left: "They had left by the time the import ran.",
      no_such_place: "This room or bed is no longer at the Property.",
    },
  },
  failed: {
    title: "Imports could not be loaded",
    description: "Nothing was changed. Try again in a moment.",
    retry: "Try again",
  },
  roomsAction: "Import from a file",
};

export type ImportsMessages = typeof en;

const tr: ImportsMessages = {
  intro:
    "Odalarınızı ve onlarda kalan kişileri bir Excel dosyasından aktarın. Her satırı görüp İçe aktar'a basana kadar hiçbir şey eklenmez.",
  kinds: { rooms: "Odalar ve yataklar", people: "Kişiler" },
  upload: {
    heading: "Dosya yükle",
    file: "Dosya",
    hint: "Excel (.xlsx) veya CSV, en fazla {megabytes} MB ve {rows} satır. İlk sayfa okunur.",
    template: "Şablonu indir",
    templateHint:
      "Şablonu doldurun ya da kendi dosyanızı kullanın: sütunlar başlıklarına göre eşleştirilir.",
    peopleLead:
      "Her satır bir kişiyi bir odaya ya da yatağa ayırır. Zaten burada kalan biri bugünden itibaren ayrılır ve girişi yapılır. Aynı e-postayla kayıtlı bir kişi yeniden eklenmez, onun için rezervasyon yapılır.",
    peopleNotPermitted:
      "Kişileri aktarmak onlar için rezervasyon yapar; bu yüzden bu tesiste rezervasyon yetkisi gerekir. Sahip bunu rolünüze ekleyebilir.",
    submit: "Önizle",
    reading: "Dosya okunuyor…",
    chooseFirst: "Önce bir dosya seçin.",
  },
  refusals: {
    unsupported_type:
      "Bu bir Excel ya da CSV dosyası değil. .xlsx veya .csv olarak kaydedip yeniden yükleyin.",
    too_large:
      "Bu dosya {megabytes} MB'tan büyük. Daha küçük dosyalara bölüp ayrı ayrı yükleyin.",
    unreadable:
      "Bu çalışma kitabı açılamadı. Parola korumalıysa parolayı kaldırıp yeniden yükleyin.",
    empty: "Bu dosya boş.",
    no_rows: "Bu dosyada başlıklar var ama altlarında satır yok.",
    too_many_rows:
      "Bu dosyada {rows} satırdan fazlası var. Daha küçük dosyalara bölüp ayrı ayrı yükleyin.",
    no_known_column:
      "Bu dosyanın başlıklarından hiçbiri tanınmadı. Başlıkları görmek için şablonu indirin.",
  },
  notPermitted:
    "Bu tesiste içe aktarma yapamazsınız. Tesis sahibi ya da bir müdür yapabilir.",
  error: "Dosya şu anda okunamadı. Hiçbir şey eklenmedi. Yeniden deneyin.",
  mapping: {
    heading: "Hangi sütun hangisi?",
    lead: "Dosyanızdaki bazı başlıklar tanınmadı. Her alanın hangi sütunda olduğunu seçin; önizleme ardından gelir.",
    required: "Zorunlu",
    none: "Dosyamda yok",
    submit: "Bu sütunlarla önizle",
    missing: "Her zorunlu alan için bir sütun seçin.",
  },
  list: {
    heading: "Önceki aktarımlar",
    empty: "Burada henüz hiçbir şey içe aktarılmadı.",
    emptyLead:
      "Şablonu indirin, doldurun ve yükleyin. Bir şey eklenmeden önce her satırı görürsünüz.",
    file: "Dosya",
    uploadedBy: "Yükleyen",
    when: "Zaman",
    status: "Durum",
    result: "Sonuç",
    open: "Aç",
    you: "Siz",
    someone: "Başka bir personel",
  },
  status: {
    staged: "Önizlendi, aktarılmadı",
    importing: "Aktarılıyor",
    finished: "Tamamlandı",
    discarded: "Vazgeçildi",
  },
  counts: {
    ready: "{count, plural, one {# satır hazır} other {# satır hazır}}",
    wrong:
      "{count, plural, one {# satır düzeltilecek} other {# satır düzeltilecek}}",
    skipped: "{count, plural, one {# zaten var} other {# zaten var}}",
    imported: "{count, plural, one {# aktarıldı} other {# aktarıldı}}",
    refused: "{count, plural, one {# reddedildi} other {# reddedildi}}",
    left: "{count, plural, one {# aktarılmadı} other {# aktarılmadı}}",
  },
  detail: {
    back: "Tüm aktarımlar",
    sheetsIgnored:
      "{count, plural, one {Yalnızca ilk sayfa okundu. # sayfa dikkate alınmadı.} other {Yalnızca ilk sayfa okundu. # sayfa dikkate alınmadı.}}",
    stagedLead:
      "Henüz hiçbir şey eklenmedi. Satırları kontrol edin, sonra hazır olanları içe aktarın.",
    nothingReady:
      "İçe aktarmaya hazır satır yok. Aşağıdaki satırları dosyanızda düzeltip yeniden yükleyin.",
    importRooms:
      "{count, plural, one {# odayı içe aktar} other {# odayı içe aktar}}",
    importPeople:
      "{count, plural, one {# kişiyi aktar} other {# kişiyi aktar}}",
    discard: "Bu önizlemeden vazgeç",
    running: "Aktarılıyor… {done} / {total}",
    keepOpen:
      "Bu sayfayı açık tutun. Kapatırsanız aktarım duraklar; buradan devam edebilirsiniz.",
    pausedLead:
      "Bu aktarım duraklatıldı; {count, plural, one {# satır} other {# satır}} kaldı.",
    carryOn: "Devam et",
    stop: "Durdur, kalanı bırak",
    finishedLead: "Bu aktarım tamamlandı.",
    discardedLead: "Bu önizlemeden vazgeçildi. Hiçbir şey eklenmedi.",
    notMine:
      "Yükleyen: {name}. Satırlarını yalnızca o okuyabilir ve aktarımı yalnızca o sürdürebilir.",
    runningElsewhere:
      "{name} şu anda burada aktarım yapıyor. Bir tesiste aynı anda tek aktarım çalışır.",
    forgotten:
      "Bu aktarımın satırları {days} gün sonra silindi. Yukarıdaki sayılar saklanır.",
    downloadResult: "Sonucu indir",
    downloadFix: "Düzeltilecek satırları indir",
    fixHint:
      "O dosyada düzeltip yeniden yükleyin. Zaten aktarılmış satırlar atlanır.",
    row: "Satır",
    outcome: "Sonuç",
    reason: "Ne düzeltilecek",
    more: "{count, plural, one {Ve # satır daha. Tüm satırları görmek için sonucu indirin.} other {Ve # satır daha. Tüm satırları görmek için sonucu indirin.}}",
    openRooms: "Odalar'ı aç",
    openReservations: "Rezervasyonlar'ı aç",
    alreadyRunning:
      "Bu tesiste başka bir aktarım çalışıyor. Bitmesini bekleyin ya da listeden açıp durdurun.",
    stale: "Sayfa yüklendikten sonra bu aktarım ilerledi. Sayfa yenilendi.",
    failed: "İşlem tamamlanamadı. Başka bir şey eklenmedi. Yeniden deneyin.",
  },
  notFound: {
    title: "Bu aktarım burada yok",
    description:
      "Başka bir tesise ait olabilir ya da bağlantı hatalı olabilir.",
  },
  rowStates: {
    ready: "Hazır",
    wrong: "Düzeltilecek",
    skipped: "Zaten var",
    imported: "Aktarıldı",
    refused: "Reddedildi",
    left: "Aktarılmadı",
  },
  problems: {
    rooms: {
      required: "Bu hücre boş.",
      not_digits:
        "Oda numarası bir ile sekiz rakam arasındadır. Blok adını kendi sütununa yazın.",
      not_a_whole_number: "Buraya tam sayı yazılmalı.",
      out_of_range: "Bu sayı bir odanın izin verdiği aralığın dışında.",
      too_long: "Blok adı en fazla altmış karakter olabilir.",
      unknown_type: "Oda, Daire ya da Süit yazın.",
      unknown_yes_no: "Evet ya da Hayır yazın.",
      only_a_room: "Yalnızca oda yatak bazında kiralanır.",
      too_many_beds:
        "Yatak bazında kiralanan bir odada en fazla yirmi altı yatak olur.",
      unknown_admits: "Kadın, Erkek ya da Herkes yazın.",
      duplicate_in_file: "Bu oda dosyanın daha önceki bir satırında zaten var.",
    },
    people: {
      required: "Bu hücre boş.",
      too_long: "Bu, tesisin sakladığından uzun.",
      too_short: "Bu bir isim için fazla kısa.",
      not_an_email: "Bu bir e-posta adresi değil.",
      unknown_gender: "Kadın ya da Erkek yazın.",
      gender_required:
        "Bu oda yalnızca kadınlara ya da yalnızca erkeklere açık. Kişinin hangisi olduğunu yazın.",
      not_admitted:
        "Bu oda diğer cinsiyete açık. Başka bir oda ya da yatak seçin.",
      unknown_document_type:
        "TC Kimlik, Pasaport, İkamet izni ya da Diğer yazın.",
      document_type_required: "Bu numaranın hangi belgeye ait olduğunu yazın.",
      invalid_tc_kimlik:
        "Bu geçerli bir TC Kimlik numarası değil. Rakamları kontrol edin.",
      document_number_length:
        "Kimlik numarası altı ile yirmi arasında harf ve rakamdır.",
      too_early: "Doğum tarihi 1900'den önce olamaz.",
      not_a_date: "Bu bir tarih değil. 31.12.2026 biçiminde yazın.",
      ambiguous_date:
        "Bu tarih iki türlü okunabilir. 31.12.2026 biçiminde yazın.",
      leaving_before_first_night: "Çıkış tarihi giriş tarihinden sonra olmalı.",
      leaving_required:
        "Misafirin konaklamasının bir sonu vardır. Çıkış tarihini yazın.",
      unknown_stay_type: "Öğrenci ya da Misafir yazın.",
      already_left:
        "Bu kişi zaten ayrılmış. Yalnızca burada kalan ya da gelecek kişiler aktarılır.",
      no_such_room:
        "Tesiste bu numarada bir oda yok. Önce odalarınızı aktarın ya da numarayı düzeltin.",
      bed_required:
        "Bu oda yatak bazında kiralanıyor. Hangi yatak olduğunu yazın.",
      no_such_bed: "Bu odada bu adla bir yatak yok.",
      bed_taken: "Bu yatak bu geceler için zaten dolu.",
      duplicate_in_file: "Bu kişi dosyanın önceki bir satırında zaten var.",
      bed_twice_in_file:
        "Önceki bir satırdaki kişi bu yatağı aynı gecelerde alıyor.",
    },
  },
  outcomes: {
    rooms: {
      already_there: "Bu oda tesiste zaten var. Olduğu gibi bırakıldı.",
      not_permitted:
        "Oda ekleme yetkiniz yok. Tesis sahibinden rolünüze eklemesini isteyin.",
      invalid: "Tesis bu satırı yazıldığı haliyle kabul etmedi.",
      failed: "Bu satırda bir sorun oluştu. Eklenmedi.",
    },
    people: {
      not_permitted:
        "Bu tesiste rezervasyon yapma yetkiniz yok. Rolünüze eklemesi için sahibe başvurun.",
      invalid: "Tesis bu kişinin bilgilerini yazıldığı haliyle kabul etmedi.",
      failed: "Bu satırda bir sorun oluştu. Kimse için rezervasyon yapılmadı.",
      bed_taken: "Bu yatak önizlemeden sonra başka biri için ayrıldı.",
      not_admitted: "Bu oda diğer cinsiyete açık.",
      price_changed:
        "Aktarım sırasında bu yatağın fiyatı değişti. Yeni fiyatla ayırmak için bu satırı yeniden yükleyin.",
      not_in_service: "Bu oda ya da yatak bu gecelerde hizmet dışı.",
      already_left: "Aktarım çalıştığında bu kişi ayrılmıştı.",
      no_such_place: "Bu oda ya da yatak artık tesiste yok.",
    },
  },
  failed: {
    title: "İçe aktarmalar yüklenemedi",
    description: "Hiçbir şey değişmedi. Birazdan yeniden deneyin.",
    retry: "Yeniden dene",
  },
  roomsAction: "Dosyadan içe aktar",
};

const ar: ImportsMessages = {
  intro:
    "أدخل غرفك ومن يقيم فيها من جدول بيانات. لا يُضاف شيء حتى ترى كل صف وتضغط استيراد.",
  kinds: { rooms: "الغرف والأسرّة", people: "الأشخاص" },
  upload: {
    heading: "رفع ملف",
    file: "الملف",
    hint: "ملف Excel (.xlsx) أو CSV، بحد أقصى {megabytes} ميغابايت و{rows} صف. تُقرأ الورقة الأولى.",
    template: "تنزيل القالب",
    templateHint: "املأ القالب أو استخدم ملفك: تُطابَق الأعمدة بعناوينها.",
    peopleLead:
      "يحجز كل صف لشخص واحد غرفة أو سريرًا. من يقيم هنا من قبل يُحجز له من اليوم ويُسجَّل دخوله. ومن له سجل بالبريد الإلكتروني نفسه يُحجز له ولا يُضاف مرة ثانية.",
    peopleNotPermitted:
      "استيراد الأشخاص يحجز لهم، لذا يحتاج إلى صلاحية الحجز في هذه المنشأة. يستطيع المالك إضافتها إلى دورك.",
    submit: "معاينة",
    reading: "جارٍ قراءة الملف…",
    chooseFirst: "اختر ملفًا أولًا.",
  },
  refusals: {
    unsupported_type:
      "هذا ليس ملف Excel أو CSV. احفظه بصيغة ‎.xlsx أو ‎.csv ثم ارفعه مجددًا.",
    too_large:
      "هذا الملف أكبر من {megabytes} ميغابايت. قسّمه إلى ملفات أصغر وارفع كلًّا منها.",
    unreadable:
      "تعذّر فتح هذا المصنف. إن كان محميًا بكلمة مرور فأزلها ثم ارفعه مجددًا.",
    empty: "هذا الملف فارغ.",
    no_rows: "في هذا الملف عناوين ولا صفوف تحتها.",
    too_many_rows:
      "في هذا الملف أكثر من {rows} صف. قسّمه إلى ملفات أصغر وارفع كلًّا منها.",
    no_known_column:
      "لا يعرف هذا الاستيراد أيًّا من عناوين الملف. نزّل القالب لتراها.",
  },
  notPermitted: "لا يمكنك الاستيراد في هذه المنشأة. يستطيع ذلك المالك أو مدير.",
  error: "تعذّرت قراءة الملف الآن. لم يُضَف شيء. حاول مجددًا.",
  mapping: {
    heading: "أيّ عمود هو أيّ حقل؟",
    lead: "بعض عناوين ملفك لم تُعرَف. حدّد العمود الذي يحوي كل حقل، ثم تظهر المعاينة.",
    required: "مطلوب",
    none: "غير موجود في ملفي",
    submit: "معاينة بهذه الأعمدة",
    missing: "اختر عمودًا لكل حقل مطلوب.",
  },
  list: {
    heading: "عمليات الاستيراد السابقة",
    empty: "لم يُستورَد شيء هنا بعد.",
    emptyLead: "نزّل القالب واملأه وارفعه. سترى كل صف قبل إضافة أي شيء.",
    file: "الملف",
    uploadedBy: "رفعه",
    when: "الوقت",
    status: "الحالة",
    result: "النتيجة",
    open: "فتح",
    you: "أنت",
    someone: "موظف آخر",
  },
  status: {
    staged: "تمت المعاينة ولم يُستورَد",
    importing: "جارٍ الاستيراد",
    finished: "اكتمل",
    discarded: "أُلغي",
  },
  counts: {
    ready:
      "{count, plural, zero {لا صفوف جاهزة} one {صف واحد جاهز} two {صفان جاهزان} few {# صفوف جاهزة} many {# صفًا جاهزًا} other {# صف جاهز}}",
    wrong:
      "{count, plural, zero {لا صفوف للتصحيح} one {صف واحد للتصحيح} two {صفان للتصحيح} few {# صفوف للتصحيح} many {# صفًا للتصحيح} other {# صف للتصحيح}}",
    skipped:
      "{count, plural, zero {لا شيء موجود مسبقًا} one {واحد موجود مسبقًا} two {اثنان موجودان مسبقًا} few {# موجودة مسبقًا} many {# موجودًا مسبقًا} other {# موجود مسبقًا}}",
    imported:
      "{count, plural, zero {لم يُستورَد شيء} one {استُورد واحد} two {استُورد اثنان} few {استُوردت #} many {استُورد #} other {استُورد #}}",
    refused:
      "{count, plural, zero {لم يُرفَض شيء} one {رُفض واحد} two {رُفض اثنان} few {رُفضت #} many {رُفض #} other {رُفض #}}",
    left: "{count, plural, zero {لا شيء غير مستورَد} one {واحد لم يُستورَد} two {اثنان لم يُستورَدا} few {# لم تُستورَد} many {# لم يُستورَد} other {# لم يُستورَد}}",
  },
  detail: {
    back: "كل عمليات الاستيراد",
    sheetsIgnored:
      "{count, plural, zero {قُرئت الورقة الأولى فقط.} one {قُرئت الورقة الأولى فقط. أُهملت ورقة واحدة أخرى.} two {قُرئت الورقة الأولى فقط. أُهملت ورقتان أخريان.} few {قُرئت الورقة الأولى فقط. أُهملت # أوراق أخرى.} many {قُرئت الورقة الأولى فقط. أُهملت # ورقة أخرى.} other {قُرئت الورقة الأولى فقط. أُهملت # ورقة أخرى.}}",
    stagedLead: "لم يُضَف شيء بعد. راجع الصفوف ثم استورد الجاهز منها.",
    nothingReady:
      "لا يوجد صف جاهز للاستيراد. صحّح الصفوف أدناه في ملفك وارفعه مجددًا.",
    importRooms:
      "{count, plural, zero {لا غرف للاستيراد} one {استيراد غرفة واحدة} two {استيراد غرفتين} few {استيراد # غرف} many {استيراد # غرفة} other {استيراد # غرفة}}",
    importPeople:
      "{count, plural, zero {لا أشخاص للاستيراد} one {استيراد شخص واحد} two {استيراد شخصين} few {استيراد # أشخاص} many {استيراد # شخصًا} other {استيراد # شخص}}",
    discard: "إلغاء هذه المعاينة",
    running: "جارٍ الاستيراد… {done} من {total}",
    keepOpen:
      "أبقِ هذه الصفحة مفتوحة. إن أغلقتها توقف الاستيراد مؤقتًا، ويمكنك المتابعة من هنا.",
    pausedLead:
      "توقف هذا الاستيراد مؤقتًا وبقي {count, plural, zero {لا صفوف} one {صف واحد} two {صفان} few {# صفوف} many {# صفًا} other {# صف}}.",
    carryOn: "متابعة",
    stop: "إيقاف وترك الباقي",
    finishedLead: "اكتمل هذا الاستيراد.",
    discardedLead: "أُلغيت هذه المعاينة. لم يُضَف شيء.",
    notMine: "رفعه {name}. هو وحده يقرأ صفوفه أو يتابعه.",
    runningElsewhere:
      "{name} يستورد هنا الآن. يعمل استيراد واحد فقط في المنشأة في الوقت نفسه.",
    forgotten:
      "حُذفت صفوف هذا الاستيراد بعد {days} أيام. الأعداد أعلاه محفوظة.",
    downloadResult: "تنزيل النتيجة",
    downloadFix: "تنزيل الصفوف المطلوب تصحيحها",
    fixHint:
      "صحّحها في ذلك الملف وارفعه مجددًا. الصفوف المستورَدة مسبقًا تُتخطّى.",
    row: "الصف",
    outcome: "النتيجة",
    reason: "ما يجب تصحيحه",
    more: "{count, plural, zero {} one {وصف واحد آخر. نزّل النتيجة لترى كل الصفوف.} two {وصفان آخران. نزّل النتيجة لترى كل الصفوف.} few {و# صفوف أخرى. نزّل النتيجة لترى كل الصفوف.} many {و# صفًا آخر. نزّل النتيجة لترى كل الصفوف.} other {و# صف آخر. نزّل النتيجة لترى كل الصفوف.}}",
    openRooms: "فتح الغرف",
    openReservations: "فتح الحجوزات",
    alreadyRunning:
      "يعمل استيراد آخر في هذه المنشأة. انتظر انتهاءه أو افتحه من القائمة وأوقفه.",
    stale: "تغيّر هذا الاستيراد منذ تحميل الصفحة. جرى تحديثها.",
    failed: "لم تتم العملية. لم يُضَف شيء آخر. حاول مجددًا.",
  },
  notFound: {
    title: "هذا الاستيراد غير موجود هنا",
    description: "قد يكون تابعًا لمنشأة أخرى، أو أن الرابط غير صحيح.",
  },
  rowStates: {
    ready: "جاهز",
    wrong: "للتصحيح",
    skipped: "موجود مسبقًا",
    imported: "استُورد",
    refused: "مرفوض",
    left: "لم يُستورَد",
  },
  problems: {
    rooms: {
      required: "هذه الخانة فارغة.",
      not_digits:
        "رقم الغرفة من رقم واحد إلى ثمانية أرقام. اكتب اسم المبنى في عموده.",
      not_a_whole_number: "يجب أن يكون هذا عددًا صحيحًا.",
      out_of_range: "هذا العدد خارج ما تسمح به الغرفة.",
      too_long: "اسم المبنى ستون حرفًا على الأكثر.",
      unknown_type: "اكتب غرفة أو شقة أو جناح.",
      unknown_yes_no: "اكتب نعم أو لا.",
      only_a_room: "الغرفة وحدها تؤجَّر بالسرير.",
      too_many_beds:
        "الغرفة المؤجَّرة بالسرير تحوي ستة وعشرين سريرًا على الأكثر.",
      unknown_admits: "اكتب نساء أو رجال أو الجميع.",
      duplicate_in_file: "هذه الغرفة موجودة في صف سابق من الملف.",
    },
    people: {
      required: "هذه الخانة فارغة.",
      too_long: "هذا أطول مما تحفظه المنشأة.",
      too_short: "هذا أقصر من أن يكون اسمًا.",
      not_an_email: "هذا ليس عنوان بريد إلكتروني.",
      unknown_gender: "اكتب أنثى أو ذكر.",
      gender_required:
        "هذه الغرفة للنساء فقط أو للرجال فقط. اذكر أيّهما هذا الشخص.",
      not_admitted: "هذه الغرفة للجنس الآخر. اختر غرفة أو سريرًا آخر.",
      unknown_document_type: "اكتب TC Kimlik أو جواز سفر أو إقامة أو أخرى.",
      document_type_required: "اذكر نوع الوثيقة التي يعود إليها هذا الرقم.",
      invalid_tc_kimlik: "هذا ليس رقم TC Kimlik صالحًا. تحقّق من الأرقام.",
      document_number_length: "رقم الهوية من ستة إلى عشرين حرفًا ورقمًا.",
      too_early: "لا يمكن أن يكون تاريخ الميلاد قبل 1900.",
      not_a_date: "هذا ليس تاريخًا. اكتبه هكذا: 31.12.2026.",
      ambiguous_date:
        "يمكن قراءة هذا التاريخ بطريقتين. اكتبه هكذا: 31.12.2026.",
      leaving_before_first_night: "يجب أن يأتي يوم المغادرة بعد الليلة الأولى.",
      leaving_required: "لإقامة الضيف نهاية. اذكر يوم مغادرته.",
      unknown_stay_type: "اكتب مقيم أو ضيف.",
      already_left:
        "غادر هذا الشخص من قبل. لا يُستورد إلا من يقيم هنا أو سيصل.",
      no_such_room:
        "لا توجد في المنشأة غرفة بهذا الرقم. استورد غرفك أولًا أو صحّح الرقم.",
      bed_required: "تُؤجَّر هذه الغرفة بالسرير. اذكر أيّ سرير.",
      no_such_bed: "لا يوجد في هذه الغرفة سرير بهذا الاسم.",
      bed_taken: "هذا السرير محجوز في هذه الليالي.",
      duplicate_in_file: "هذا الشخص موجود في صف سابق من الملف.",
      bed_twice_in_file: "لشخص في صف سابق هذا السرير في الليالي نفسها.",
    },
  },
  outcomes: {
    rooms: {
      already_there: "هذه الغرفة موجودة في المنشأة. تُركت كما هي.",
      not_permitted:
        "ليست لديك صلاحية إضافة الغرف. اطلب من المالك إضافتها إلى دورك.",
      invalid: "رفضت المنشأة هذا الصف كما كُتب.",
      failed: "حدث خطأ في هذا الصف. لم يُضَف.",
    },
    people: {
      not_permitted:
        "ليست لديك صلاحية الحجز في هذه المنشأة. اطلب من المالك إضافتها إلى دورك.",
      invalid: "رفضت المنشأة بيانات هذا الشخص كما كُتبت.",
      failed: "حدث خطأ في هذا الصف. لم يُحجز لأحد.",
      bed_taken: "حُجز هذا السرير لشخص آخر بعد المعاينة.",
      not_admitted: "هذه الغرفة للجنس الآخر.",
      price_changed:
        "تغيّر سعر هذا السرير أثناء الاستيراد. ارفع هذا الصف مجددًا ليُحجز بالسعر الجديد.",
      not_in_service: "هذه الغرفة أو هذا السرير خارج الخدمة في هذه الليالي.",
      already_left: "كان هذا الشخص قد غادر عندما جرى الاستيراد.",
      no_such_place: "لم تعد هذه الغرفة أو هذا السرير في المنشأة.",
    },
  },
  failed: {
    title: "تعذّر تحميل عمليات الاستيراد",
    description: "لم يتغيّر شيء. حاول مرة أخرى بعد قليل.",
    retry: "حاول مرة أخرى",
  },
  roomsAction: "استيراد من ملف",
};

export const importsMessages: Record<SupportedLocale, ImportsMessages> = {
  en,
  tr,
  ar,
};
