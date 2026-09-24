import type { SupportedLocale } from "@ranza/i18n";

/**
 * Workspace copy in all three languages.
 *
 * No fallback locale: a missing string is a type error rather than English
 * quietly appearing on an Arabic page.
 */
export interface Messages {
  productName: string;
  skip: string;
  languageLabel: string;
  languageName: Record<SupportedLocale, string>;
  today: string;
  propertySwitcher: string;
  mainNavigation: string;
  sections: string;
  back: string;
  collapse: string;
  expand: string;
  workspaceBadge: string;
  navSections: {
    operations: string;
    management: string;
    system: string;
  };
  account: string;
  organization: string;
  property: string;
  noPropertyTitle: string;
  noPropertyDescription: string;
  signInTitle: string;
  signInSummary: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  signInFailed: string;

  challengeTitle: string;
  challengeSummary: string;
  code: string;
  verify: string;
  challengeFailed: string;

  security: string;
  securitySummary: string;
  twoFactor: string;
  twoFactorOn: string;
  twoFactorOff: string;
  twoFactorSummary: string;
  enable: string;
  disable: string;
  confirmWithPassword: string;
  scanHint: string;
  secretLabel: string;
  backupCodes: string;
  backupCodesWarning: string;
  enrolFailed: string;

  frontOffice: string;
  arrivalsAt: string;
  departuresAt: string;
  noFrontDeskTitle: string;
  noFrontDeskDescription: string;
  noArrivalsTitle: string;
  noArrivalsDescription: string;
  openEnded: string;
  checkIn: string;
  checkingIn: string;
  checkedIn: string;
  unitUnavailable: string;
  unitNotInService: string;
  roomNotReady: string;
  checkInAnyway: string;
  notNow: string;
  notReady: string;
  checkInRefused: string;

  /**
   * Withdrawing a check-in that should not have happened (ADR 0022).
   *
   * `undoCheckInFor` names the Guest, so a list of identical buttons is
   * distinguishable to a screen reader. It is interpolated after a postposition
   * in Turkish and Arabic, never into an inflected position, and the name
   * arrives already isolated.
   */
  undoCheckIn: string;
  undoingCheckIn: string;
  undoCheckInFor: string;
  undoCheckInTitle: string;
  undoCheckInSummary: string;
  keepCheckIn: string;
  reason: string;
  reasonHint: string;
  reasonTooShort: string;
  reasonTooLong: string;
  undoCheckInRefused: string;
  stayHasCharges: string;
  stayType: Record<"guest" | "resident", string>;
  unitType: Record<"room" | "bed" | "apartment" | "suite", string>;
  reservationStatus: Record<
    "requested" | "confirmed" | "cancelled" | "no_show" | "checked_in",
    string
  >;

  arrivals: string;
  departures: string;
  guest: string;
  period: string;
  unit: string;
  action: string;
  status: string;
  departure: string;
  overdue: string;
  onTime: string;
  checkOut: string;
  checkingOut: string;
  checkOutRefused: string;
  noDeparturesTitle: string;
  noDeparturesDescription: string;
  readiness: string;
  reservation: string;
  roomAndBed: string;
  notAssigned: string;
  ready: string;
  outOfOrder: string;
  occupied: string;
  daysLate: string;
  expectedEta: string;
  credit: string;
  moreActionsFor: string;
  reservationDetails: string;
  openFolio: string;
  showOnBedMap: string;
  profile: string;
  unitOutOfOrder: string;
  unitOccupied: string;
  leaves: string;
  overdueSince: string;
  untilDate: string;

  /**
   * Taking a booking.
   *
   * `arrival` is a field label beside the existing `departure`, which the
   * departures column already owns — one word for one idea, so a screen and a
   * form cannot end up calling the same date two things.
   */
  reservations: string;
  reservationsAt: string;

  /**
   * Staff and permissions.
   *
   * `awaitingPassword` rather than "pending": the membership is not pending —
   * it is active and the person simply has not set a password yet. Calling it
   * pending on a screen would teach the wrong model of the thing.
   */
  staff: {
    rosterOf: string;
    screenSummary: string;
    peopleTab: string;
    rolesTab: string;
    person: string;
    permission: string;
    heldByCount: string;
    shippedGroup: string;
    authoredGroup: string;
    invitationSent: string;
    inviteNotice: string;
    matrixNote: string;
    cannotGrant: string;
    invite: string;
    inviteTitle: string;
    inviteDescription: string;
    sendInvitation: string;
    cancel: string;
    linkToPassOn: string;
    linkExpires: string;
    email: string;
    role: string;
    properties: string;
    status: string;
    actions: string;
    active: string;
    awaitingPassword: string;
    revoked: string;
    revoke: string;
    undoRevoke: string;
    reachesNothing: string;
    alreadyAMember: string;
    refused: string;
    lastAdministrator: string;
    roleIsHeld: string;
    rolesHeading: string;
    defineRole: string;
    defineRoleTitle: string;
    defineRoleDescription: string;
    roleName: string;
    saveRole: string;
    mayDo: string;
    heldBy: string;
    shipped: string;
    retired: string;
    retire: string;
    reinstate: string;
    noCommands: string;
    /**
     * Keyed on a dotless name rather than the permission itself: next-intl
     * reads a dot as a namespace separator, so `front_desk.book` would be
     * looked up as a `book` inside a `front_desk` object. The mapping lives in
     * `features/staff/labels.ts`.
     */
    permissions: Record<
      | "book"
      | "checkIn"
      | "checkOut"
      | "manageFolio"
      | "postCharge"
      | "administerStaff"
      | "defineRoles"
      | "configureAccommodation"
      | "updateHousekeeping"
      | "reportMaintenance"
      | "manageMaintenance"
      | "takeOutOfOrder",
      string
    >;
    emptyRosterTitle: string;
    emptyRosterDescription: string;
    roles: Record<
      "owner" | "manager" | "front_desk" | "housekeeping" | "finance",
      string
    >;
  };
  noReservationsTitle: string;
  noReservationsDescription: string;
  newReservation: string;
  newReservationSummary: string;
  guestEmail: string;
  guestEmailHint: string;
  guestPhone: string;
  stayTypeLabel: string;
  arrival: string;
  departureHint: string;
  chooseUnit: string;
  takeBooking: string;
  takingBooking: string;
  discardBooking: string;
  bookingUnavailable: string;
  bookingPeriodInvalid: string;
  bookingGuestInvalid: string;
  bookingRefused: string;

  folios: string;
  foliosAt: string;
  allFolios: string;
  noFoliosTitle: string;
  noFoliosDescription: string;
  folioStatus: Record<"open" | "closed", string>;
  folioLines: string;
  balance: string;
  lines: string;
  amount: string;
  description: string;
  posted: string;
  noLines: string;
  addCharge: string;
  post: string;
  posting: string;
  chargeRefused: string;
  amountInvalid: string;
  reverse: string;
  reversing: string;
  reversed: string;
  reverseReason: string;
  reverseRefused: string;
  closeFolio: string;
  closing: string;
  closeRefused: string;
  folioClosedNote: string;

  rooms: string;
  roomsAt: string;
  roomsSubtitle: string;
  noRoomsTitle: string;
  noRoomsDescription: string;
  addRooms: string;
  addingRooms: string;
  firstNumber: string;
  firstNumberHint: string;
  roomCount: string;
  capacityPerRoom: string;
  building: string;
  floor: string;
  letByTheBed: string;
  letByTheBedHint: string;
  blockBed: string;
  blockingBed: string;
  unblockBed: string;
  unblockingBed: string;
  blockReason: string;
  blockReasonHint: string;
  blockReasonPlaceholder: string;
  statRooms: string;
  statBeds: string;
  statOccupied: string;
  statEmpty: string;
  statBlocked: string;
  bedMap: string;
  bedList: string;
  freeTonight: string;
  inHouseTonight: string;
  reservedTonight: string;
  blockedStatus: string;

  /** The Housekeeping screen (RANZ-28). */
  housekeeping: {
    subtitle: string;
    noRoomsTitle: string;
    noRoomsDescription: string;
    statRooms: string;
    statDirty: string;
    statClean: string;
    statInspected: string;
    statReady: string;
    room: string;
    location: string;
    status: string;
    changed: string;
    occupancy: string;
    dirty: string;
    clean: string;
    inspected: string;
    notRecorded: string;
    inHouse: string;
    vacant: string;
    outOfService: string;
    beds: string;
    floorNumber: string;
    markClean: string;
    markInspected: string;
    markDirty: string;
    saving: string;
    marked: string;
    refused: string;
    invalid: string;
    readOnly: string;
    roomActions: string;
    actions: string;
    inspectionTitle: string;
    inspectionHint: string;
    organizationDefault: string;
    thisProperty: string;
    useDefault: string;
    on: string;
    off: string;
    flow: string;
    flowReady: string;
    saved: string;
    settingRefused: string;
    defaultNeedsReach: string;
    settingReadOnly: string;
    awaitingInspection: string;
  };

  /** The Maintenance screen (RANZ-33). */
  maintenance: {
    heading: string;
    newRequest: string;
    requestsTab: string;
    settingsTab: string;
    statOpen: string;
    statUrgent: string;
    statOutOfOrder: string;
    statDone: string;
    reference: string;
    bedInRoom: string;
    outOfOrder: string;
    backOn: string;
    overdueSince: string;
    notAssigned: string;
    noLongerHere: string;
    formerStaff: string;
    emptyColumn: string;
    noRequestsTitle: string;
    noRequestsDescription: string;
    readOnly: string;
    filterPriority: string;
    filterAssignee: string;
    allPriorities: string;
    everyone: string;
    unassigned: string;
    outOfOrderOnly: string;
    showCancelled: string;
    moveTo: string;
    cardActions: string;
    openRequest: string;
    reportedBy: string;
    reportedOn: string;
    where: string;
    details: string;
    noDetails: string;
    assignee: string;
    priority: string;
    state: string;
    cancelReason: string;
    outOfOrderSince: string;
    heldAfterDone: string;
    assign: string;
    reopen: string;
    cancelRequest: string;
    cancelTitle: string;
    cancelHint: string;
    reason: string;
    reasonPlaceholder: string;
    keep: string;
    takeOutOfOrder: string;
    takeOutHint: string;
    expectedBack: string;
    returnToService: string;
    returnHint: string;
    note: string;
    notePlaceholder: string;
    reportTitle: string;
    reportDescription: string;
    whatIsWrong: string;
    whatPlaceholder: string;
    moreDetails: string;
    unit: string;
    chooseUnit: string;
    howUrgent: string;
    assignTo: string;
    decideLater: string;
    outOfOrderSwitch: string;
    unitBlocked: string;
    alreadyOut: string;
    send: string;
    saving: string;
    save: string;
    close: string;
    impactTitle: string;
    impactInHouse: string;
    impactInHouseOpen: string;
    impactBooking: string;
    aGuest: string;
    impactHint: string;
    confirmOutOfOrder: string;
    reported: string;
    saved: string;
    returned: string;
    heldElsewhere: string;
    stillOut: string;
    refused: string;
    invalid: string;
    stale: string;
    blocked: string;
    needsAssignee: string;
    outOfReach: string;
    needsReturnPermission: string;
    settingsTitle: string;
    settingsHint: string;
    assigneeRequired: string;
    whenReturns: string;
    onDone: string;
    onConfirmation: string;
    returnsAs: string;
    organizationDefault: string;
    thisProperty: string;
    useDefault: string;
    yes: string;
    no: string;
    settingRefused: string;
    defaultNeedsReach: string;
    settingReadOnly: string;
    reportProblem: string;
    states: Record<
      "new" | "in_progress" | "waiting_for_parts" | "done" | "cancelled",
      string
    >;
    priorities: Record<"urgent" | "this_week" | "can_wait", string>;
    returnAs: Record<"dirty" | "clean" | "inspected", string>;
  };

  auditLog: string;
  auditLogFor: string;
  allRecords: string;
  noAuditTitle: string;
  noAuditDescription: string;
  when: string;
  what: string;
  who: string;
  why: string;
  subject: string;
  context: string;
  contextKey: string;
  contextValue: string;
  noContext: string;
  you: string;
  noReason: string;
  actorUnnamed: string;
  /**
   * What each recorded action is called, nested noun → verb rather than keyed
   * on the dotted name the modules write: next-intl splits a key on `.`, so a
   * flat `"folio.closed"` would be looked up as `folio` then `closed` and never
   * found. The literals are `KNOWN_ACTIONS` in `features/audit-log/actions.ts`.
   */
  auditAction: {
    reservation: Record<"created" | "checked_in" | "check_in_reversed", string>;
    stay: Record<"checked_out", string>;
    folio: Record<"charge_posted" | "line_reversed" | "closed", string>;
    staff: Record<
      | "invited"
      | "role_changed"
      | "property_assigned"
      | "property_unassigned"
      | "revoked"
      | "revoke_undone"
      | "role_defined"
      | "role_retired"
      | "role_reinstated",
      string
    >;
    unit: Record<
      | "added"
      | "blocked"
      | "unblocked"
      | "taken_out_of_order"
      | "returned_to_service",
      string
    >;
    housekeeping: Record<"status_changed" | "inspection_set", string>;
    maintenance_request: Record<
      | "reported"
      | "moved"
      | "cancelled"
      | "assigned"
      | "prioritised"
      | "hold_released",
      string
    >;
    maintenance_setting: Record<"changed", string>;
  };
  auditSubject: Record<
    | "reservation"
    | "stay"
    | "folio"
    | "membership"
    | "role"
    | "property"
    | "accommodation_unit"
    | "organization"
    | "maintenance_request",
    string
  >;

  table: TableMessages;

  /** Rail and page-bar names, keyed by route segment. */
  navigation: Record<string, string>;
  /** What each planned screen will do, keyed by route segment. */
  screenSummary: Record<string, string>;
  planned: string;
  handoverLabel: string;
  notEntitledTitle: string;
  notEntitledDescription: string;
}

/** The listing kit's strings. `{n}`, `{of}` and `{columns}` are interpolated. */
export interface TableMessages {
  results: string;
  capped: string;
  cappedHint: string;
  perPage: string;
  page: string;
  first: string;
  previous: string;
  next: string;
  last: string;
  clearFilters: string;
  clearFilter: string;
  columns: string;
  visibleColumns: string;
  search: string;
  searchBy: string;
  selectAllRows: string;
  selectRow: string;
  selectedCount: string;
  clearSelection: string;
  noMatches: string;
  noRows: string;
}

export const messages: Record<SupportedLocale, Messages> = {
  tr: {
    productName: "Ranza",
    skip: "İçeriğe geç",
    languageLabel: "Dil",
    languageName: { tr: "Türkçe", en: "English", ar: "العربية" },
    today: "Bugün",
    propertySwitcher: "Tesisler",
    mainNavigation: "Ana gezinme",
    sections: "Bölümler",
    back: "Geri",
    collapse: "Menüyü daralt",
    expand: "Menüyü genişlet",
    workspaceBadge: "Çalışma Alanı",
    navSections: {
      operations: "Operasyon",
      management: "Yönetim",
      system: "Sistem",
    },
    account: "Hesap",
    organization: "Organizasyon",
    property: "Tesis",
    noPropertyTitle: "Henüz bir tesise atanmadınız",
    noPropertyDescription:
      "Organizasyonunuzdaki bir yönetici sizi bir tesise atadığında burada görünür.",
    signInTitle: "Oturum açın",
    signInSummary: "Ranza çalışma alanı",
    email: "E-posta",
    password: "Parola",
    signIn: "Oturum aç",
    signingIn: "Açılıyor",
    signInFailed: "E-posta veya parola hatalı.",

    challengeTitle: "İkinci adım",
    challengeSummary:
      "Kimlik doğrulama uygulamanızdaki kodu veya bir yedek kodu girin.",
    code: "Kod",
    verify: "Doğrula",
    challengeFailed: "Kod geçerli değil.",

    security: "Güvenlik",
    securitySummary: "Hesabınıza nasıl giriş yapıldığını yönetin.",
    twoFactor: "İki adımlı doğrulama",
    twoFactorOn: "Açık",
    twoFactorOff: "Kapalı",
    twoFactorSummary:
      "Açıkken parolanızın yanında kimlik doğrulama uygulamanızdan bir kod istenir.",
    enable: "Aç",
    disable: "Kapat",
    confirmWithPassword: "Parolanızla onaylayın",
    scanHint:
      "Bu anahtarı kimlik doğrulama uygulamanıza ekleyin, ardından gösterdiği kodu girin.",
    secretLabel: "Kurulum anahtarı",
    backupCodes: "Yedek kodlar",
    backupCodesWarning:
      "Bu kodları şimdi saklayın. Her biri bir kez kullanılır ve tekrar gösterilmez.",
    enrolFailed: "Parola doğrulanamadı.",

    frontOffice: "Ön büro",
    arrivalsAt: "Bugünkü girişler:",
    departuresAt: "Bugünkü çıkışlar:",
    noFrontDeskTitle: "Ön büro bu tesiste açık değil",
    noFrontDeskDescription:
      "Ön büro, organizasyonunuzun aboneliğinde yer aldığında ve tesiste etkinleştirildiğinde burada görünür.",
    noArrivalsTitle: "Bugün giriş yok",
    noArrivalsDescription:
      "Bugün için bu tesiste bekleyen bir rezervasyon bulunmuyor.",
    openEnded: "Açık uçlu",
    checkIn: "Giriş yap",
    checkingIn: "Yapılıyor",
    checkedIn: "Giriş yapıldı",
    unitUnavailable: "Bu birim seçilen tarihlerde dolu.",
    unitNotInService:
      "Bu oda hizmet dışı ya da bloke. Odayı hizmete döndürün ya da rezervasyonu taşıyın.",
    blockReasonPlaceholder: "Bakım ya da onarım",
    roomNotReady:
      "Bu oda henüz hazır değil: temizlenmedi ya da kontrol bekliyor.",
    checkInAnyway: "Yine de giriş yap",
    notNow: "Şimdi değil",
    notReady: "Hazır değil",
    checkInRefused: "Bu rezervasyon için giriş yapılamıyor.",
    undoCheckIn: "Girişi geri al",
    undoingCheckIn: "Geri alınıyor",
    undoCheckInFor: "{guest} için girişi geri al",
    undoCheckInTitle: "Bu giriş geri alınsın mı?",
    undoCheckInSummary:
      "Konaklama iptal edilir ve rezervasyon yeniden giriş yapılabilir duruma döner. Hiçbir kayıt silinmez; geri alınan giriş kayıtta kalır.",
    keepCheckIn: "Girişi koru",
    reason: "Gerekçe",
    reasonHint: "Geri alma kaydıyla birlikte saklanır.",
    reasonTooShort:
      "{min, plural, other {En az # karakterlik bir gerekçe gerekiyor.}}",
    reasonTooLong:
      "{max, plural, other {Gerekçe en fazla # karakter olabilir.}}",
    undoCheckInRefused: "Bu giriş geri alınamıyor.",
    stayHasCharges:
      "Bu konaklamaya tutarlar işlendi; artık gerçekleşmiş sayılır ve giriş geri alınamaz. Tutarları Finans'ta düzeltin.",
    stayType: { guest: "Misafir", resident: "Sakin" },
    unitType: {
      room: "Oda",
      bed: "Yatak",
      apartment: "Daire",
      suite: "Süit",
    },
    reservationStatus: {
      requested: "Talep edildi",
      confirmed: "Onaylandı",
      cancelled: "İptal edildi",
      no_show: "Gelmedi",
      checked_in: "Giriş yapıldı",
    },
    arrivals: "Girişler",
    departures: "Çıkışlar",
    guest: "Misafir",
    period: "Konaklama",
    unit: "Birim",
    action: "İşlem",
    status: "Durum",
    departure: "Çıkış",
    overdue: "Gecikmiş",
    onTime: "Bugün",
    checkOut: "Çıkış yap",
    checkingOut: "Yapılıyor",
    checkOutRefused: "Bu konaklama için çıkış yapılamıyor.",
    noDeparturesTitle: "Bugün çıkış yok",
    noDeparturesDescription:
      "Bu tesiste bugün ayrılması beklenen bir konaklama bulunmuyor.",
    readiness: "Hazırlık",
    reservation: "Rezervasyon",
    roomAndBed: "Oda ve yatak",
    notAssigned: "Atanmadı",
    ready: "Hazır",
    outOfOrder: "Hizmet dışı",
    occupied: "Dolu",
    daysLate: "{n} gün gecikmiş",
    expectedEta: "beklenen {eta}",
    credit: "alacak",
    moreActionsFor: "{guest} için diğer işlemler",
    reservationDetails: "Rezervasyon detayları",
    openFolio: "Folyoyu aç",
    showOnBedMap: "Yatak haritasında göster",
    profile: "Profil",
    unitOutOfOrder: "Birim hizmet dışı",
    unitOccupied: "Birim dolu",
    leaves: "Çıkış",
    overdueSince: "{date} tarihinden beri gecikmiş",
    untilDate: "{date} tarihine kadar",

    reservations: "Rezervasyonlar",
    reservationsAt: "Rezervasyonlar —",

    staff: {
      rosterOf: "Ekip —",
      screenSummary:
        "Burada kimler çalışıyor, hangi tesislere erişiyorlar ve her rol ne yapabilir.",
      peopleTab: "Kişiler",
      rolesTab: "Her rol ne yapabilir",
      person: "Kişi",
      permission: "Yetki",
      heldByCount:
        "{count, plural, =0 {kimse tutmuyor} one {# kişi} other {# kişi}}",
      shippedGroup: "Ranza’nın gönderdikleri",
      authoredGroup: "Sizin tanımladıklarınız",
      invitationSent: "Davet gönderildi",
      inviteNotice:
        "Bağlantıyı siz iletirsiniz: henüz e-posta gönderen bir modül yok. Yedi gün sonra geçersiz olur ve yalnızca bir kez gösterilir.",
      matrixNote:
        "Ranza\u2019nın gönderdiği roller bir sürümle gelir ve değiştirilmez. Her değişiklik denetim kaydına yazılır ve yalnızca düğmeler gizlenerek değil, veritabanında uygulanır.",
      cannotGrant: "Kendi rolünüzde olmayan bir yetkiyi veremezsiniz.",
      invite: "Davet et",
      inviteTitle: "Ekibe birini davet et",
      inviteDescription:
        "Üyelik hemen açılır. Davet bağlantısı yalnızca parola belirlemek içindir.",
      sendInvitation: "Daveti oluştur",
      cancel: "Vazgeç",
      linkToPassOn: "Bu bağlantıyı kendiniz iletin",
      linkExpires:
        "Bağlantı yedi gün sonra geçersiz olur ve bir daha gösterilmez.",
      email: "E-posta",
      role: "Rol",
      properties: "Tesisler",
      status: "Durum",
      actions: "İşlemler",
      active: "Aktif",
      awaitingPassword: "Parola bekleniyor",
      revoked: "Kaldırıldı",
      revoke: "Kaldır",
      undoRevoke: "Geri al",
      reachesNothing: "Henüz bir tesis atanmadı",
      alreadyAMember: "Bu kişinin bu organizasyonda zaten bir üyeliği var.",
      refused: "Bu işlem reddedildi.",
      lastAdministrator:
        "Bir organizasyonda ekip yönetebilen en az bir kişi kalmalıdır.",
      roleIsHeld: "Bu rolü tutan kişiler var; önce onları taşıyın.",
      rolesHeading: "Roller",
      defineRole: "Rol tanımla",
      defineRoleTitle: "Yeni bir rol tanımla",
      defineRoleDescription:
        "Bir rol, adı olan bir yetki kümesidir. Yalnızca kendi tuttuğunuz yetkileri verebilirsiniz.",
      roleName: "Rol adı",
      saveRole: "Rolü kaydet",
      mayDo: "Yapabilecekleri",
      heldBy: "Tutan kişi",
      shipped: "Ranza",
      retired: "Emekli",
      retire: "Emekliye ayır",
      reinstate: "Geri getir",
      noCommands: "Henüz bir yetki yok",
      permissions: {
        book: "Rezervasyon alma",
        checkIn: "Giriş yapma",
        checkOut: "Çıkış yapma",
        manageFolio: "Folyo açma ve kapatma",
        postCharge: "Folyoya ücret işleme",
        administerStaff: "Ekibi yönetme",
        defineRoles: "Rol tanımlama",
        configureAccommodation: "Odaları ve yatakları yapılandırma",
        updateHousekeeping: "Oda durumunu güncelleme",
        reportMaintenance: "Bakım sorunu bildirme",
        manageMaintenance: "Bakım taleplerini yönetme",
        takeOutOfOrder: "Odaları hizmet dışı bırakma ve geri alma",
      },
      emptyRosterTitle: "Henüz kimse yok",
      emptyRosterDescription:
        "Bu organizasyonda görünen bir ekip üyesi bulunmuyor.",
      roles: {
        owner: "Sahip",
        manager: "Müdür",
        front_desk: "Ön büro",
        housekeeping: "Kat hizmetleri",
        finance: "Finans",
      },
    },
    noReservationsTitle: "İleri tarihli rezervasyon yok",
    noReservationsDescription:
      "Bu tesiste bugünden itibaren bir rezervasyon bulunmuyor.",
    newReservation: "Yeni rezervasyon",
    newReservationSummary:
      "Misafir, birim ve geceler. Kaydedildiği anda birim tutulur.",
    guestEmail: "E-posta",
    guestEmailHint:
      "İsteğe bağlı. Kayıtlı bir adres, ikinci bir kayıt açmak yerine aynı misafiri yeniden kullanır.",
    guestPhone: "Telefon",
    stayTypeLabel: "Konaklama türü",
    arrival: "Giriş",
    departureHint: "Açık uçlu bir rezervasyon için boş bırakın.",
    chooseUnit: "Birim seçin",
    takeBooking: "Rezervasyon oluştur",
    takingBooking: "Oluşturuluyor",
    discardBooking: "Vazgeç",
    bookingUnavailable: "Bu birim o geceler için zaten dolu.",
    bookingPeriodInvalid:
      "Bu tarihler geçerli bir dönem değil. Rezervasyon en az bir gece sürer ve bugünden önce başlayamaz.",
    bookingGuestInvalid:
      "Misafirin adını, e-postasını ve telefonunu kontrol edin.",
    bookingRefused: "Bu rezervasyon oluşturulamıyor.",
    folios: "Folyolar",
    foliosAt: "Folyolar —",
    allFolios: "Tüm folyolar",
    noFoliosTitle: "Henüz folyo yok",
    noFoliosDescription:
      "Bu tesiste açık bir folyo bulunmuyor. Bir misafir giriş yaptığında folyosu açılır.",
    folioStatus: { open: "Açık", closed: "Kapalı" },
    folioLines: "Folyo satırları",
    balance: "Bakiye",
    lines: "Satır",
    amount: "Tutar",
    description: "Açıklama",
    posted: "İşlendi",
    noLines: "Bu folyoya henüz bir şey işlenmedi.",
    addCharge: "Ücret ekle",
    post: "İşle",
    posting: "İşleniyor…",
    chargeRefused: "Bu ücret işlenemedi.",
    amountInvalid:
      "Tutar, para biriminin izin verdiği ondalık basamakla pozitif bir sayı olmalıdır.",
    reverse: "Ters kaydet",
    reversing: "Kaydediliyor…",
    reversed: "ters kaydedildi",
    reverseReason: "Gerekçe",
    reverseRefused: "Bu satır ters kaydedilemedi.",
    closeFolio: "Folyoyu kapat",
    closing: "Kapatılıyor…",
    closeRefused: "Bu folyo kapatılamadı.",
    folioClosedNote:
      "Bu folyo kapalı. Satırlar olduğu gibi kalır; kapalı bir folyoya yeni satır işlenemez.",

    rooms: "Odalar ve yataklar",
    roomsAt: "{property} odaları ve yatakları",
    roomsSubtitle: "Bu tesisteki her oda ve yatak, ve her birinde kim kalıyor.",
    noRoomsTitle: "Henüz oda yok",
    noRoomsDescription:
      "Bu tesise henüz oda eklenmemiş. 'Oda ekle' düğmesini kullanarak odaları toplu ekleyebilirsiniz.",
    addRooms: "Oda ekle",
    addingRooms: "Ekleniyor...",
    firstNumber: "İlk oda numarası",
    firstNumberHint: "Odalar bu numaradan başlayarak sırayla numaralandırılır.",
    roomCount: "Oda sayısı",
    capacityPerRoom: "Oda kapasitesi (kişi)",
    building: "Bina (isteğe bağlı)",
    floor: "Kat (isteğe bağlı)",
    letByTheBed: "Yatak bazında kirala",
    letByTheBedHint:
      "Her yatak A, B, C... olarak ayrı ayrı kiralanabilir birim olur.",
    blockBed: "Yatağı kapat",
    blockingBed: "Kapatılıyor...",
    unblockBed: "Yatağı aç",
    unblockingBed: "Açılıyor...",
    blockReason: "Kapatma nedeni",
    blockReasonHint:
      "Neden kapalı olduğunu belirten en az 3 karakterlik açıklama.",
    statRooms: "Oda",
    statBeds: "Yatak",
    statOccupied: "Dolu",
    statEmpty: "Boş yatak bu gece",
    statBlocked: "Kapalı",
    bedMap: "Yatak haritası",
    bedList: "Yatak listesi",
    freeTonight: "Boş",
    inHouseTonight: "Konaklamada",
    reservedTonight: "Rezervasyonlu",
    blockedStatus: "Kapalı",

    housekeeping: {
      subtitle: "{property} — temizlik bekleyen odalar",
      noRoomsTitle: "Henüz oda yok",
      noRoomsDescription:
        "Odalar ve yataklar ekranında eklenen odalar, temizlik durumlarıyla birlikte burada görünür.",
      statRooms: "Odalar",
      statDirty: "Kirli",
      statClean: "Temiz",
      statInspected: "Kontrol edildi",
      statReady: "Satışa hazır",
      room: "Oda",
      location: "Konum",
      status: "Durum",
      changed: "Son değişiklik",
      occupancy: "Doluluk",
      dirty: "Kirli",
      clean: "Temiz",
      inspected: "Kontrol edildi",
      notRecorded: "Henüz kaydedilmedi",
      inHouse: "Misafir konaklıyor",
      vacant: "Boş",
      outOfService: "Hizmet dışı",
      beds: "{count, plural, other {# yatak}}",
      floorNumber: "{floor}. kat",
      markClean: "Temiz olarak işaretle",
      markInspected: "Kontrol edildi olarak işaretle",
      markDirty: "Kirli olarak işaretle",
      saving: "Kaydediliyor…",
      marked: "{count, plural, other {# oda güncellendi}}",
      refused:
        "Bu odalar güncellenemedi. Pano, şu anda değiştirebildiklerinizi gösteriyor.",
      invalid: "Bir ile altmış arasında oda seçin.",
      readOnly:
        "Buradaki tüm odaları görebilirsiniz ancak değiştiremezsiniz. Bir yönetici, rolünüze oda durumunu güncelleme izni verebilir.",
      roomActions: "{room} için işlemler",
      actions: "İşlemler",
      inspectionTitle: "Temizlikten sonra odaları kontrol et",
      inspectionHint:
        "Açıkken, temizlenen bir oda yeniden satılmadan önce birinin onu kontrol edildi olarak işaretlemesini bekler. Bunu değiştirmek hiçbir odanın durumunu değiştirmez.",
      organizationDefault: "Tüm organizasyon için",
      thisProperty: "Bu tesis için",
      useDefault: "Organizasyon ayarını kullan ({value})",
      on: "Açık",
      off: "Kapalı",
      flow: "Bir odanın geçtiği adımlar",
      flowReady: "Satışa hazır",
      saved: "Kaydedildi",
      settingRefused:
        "Bu ayar değiştirilemedi. Şu an gördüğünüz, geçerli olandır.",
      defaultNeedsReach:
        "Organizasyon ayarını yalnızca tüm tesislere erişimi olan biri değiştirebilir.",
      settingReadOnly: "Bunu bir yönetici değiştirebilir.",
      awaitingInspection: "Kontrol bekliyor",
    },
    maintenance: {
      heading: "{property} bakım",
      newRequest: "Yeni talep",
      requestsTab: "Talepler",
      settingsTab: "Ayarlar",
      statOpen: "Açık",
      statUrgent: "Acil",
      statOutOfOrder: "Hizmet dışı",
      statDone: "30 günde biten",
      reference: "MT-{number}",
      bedInRoom: "Yatak {bed} · {room}",
      outOfOrder: "Hizmet dışı",
      backOn: "Dönüş {date}",
      overdueSince: "{date} tarihinde dönmesi gerekiyordu",
      notAssigned: "Atanmadı",
      noLongerHere: "{name} (artık bu tesiste değil)",
      formerStaff: "Eski bir çalışan",
      emptyColumn: "Burada bir şey yok",
      noRequestsTitle: "{property} için talep yok",
      noRequestsDescription:
        "Bir şey bozulduğunda buradan ya da Odalar ekranından bildirin. Tesisteki herkes bildirebilir.",
      readOnly:
        "Tüm talepleri görebilirsiniz. Taşımak, atamak ve iptal etmek için bakım yönetme yetkisi gerekir.",
      filterPriority: "Öncelik",
      filterAssignee: "Atanan",
      allPriorities: "Tüm öncelikler",
      everyone: "Herkes",
      unassigned: "Atanmamış",
      outOfOrderOnly: "Yalnızca hizmet dışı",
      showCancelled: "İptal edilenleri göster",
      moveTo: "{state} durumuna taşı",
      cardActions: "MT-{number} işlemleri",
      openRequest: "MT-{number} aç",
      reportedBy: "Bildiren: {who}",
      reportedOn: "Bildirim: {when}",
      where: "Nerede",
      details: "Ayrıntılar",
      noDetails: "Ayrıntı verilmedi.",
      assignee: "Atanan kişi",
      priority: "Öncelik",
      state: "Durum",
      cancelReason: "İptal nedeni",
      outOfOrderSince: "{when} tarihinden beri",
      heldAfterDone:
        "Tamamlandı; oda biri hizmete döndürene kadar hizmet dışı kalır.",
      assign: "Ata",
      reopen: "Yeniden aç",
      cancelRequest: "Talebi iptal et",
      cancelTitle: "MT-{number} iptal edilsin mi?",
      cancelHint:
        "Yalnızca yanlışlıkla bildirilen ya da arıza olmayan talepleri iptal edin. Onarılan bir şeyi Tamamlandı'ya taşıyın.",
      reason: "Neden",
      reasonPlaceholder: "İki kez bildirildi",
      keep: "Vazgeç",
      takeOutOfOrder: "Odayı hizmet dışı bırak",
      takeOutHint:
        "Ön büro, oda hizmete dönene kadar onu satamaz ve kimseyi giriş yaptıramaz.",
      expectedBack: "Beklenen dönüş (isteğe bağlı)",
      returnToService: "Hizmete döndür",
      returnHint:
        "Oda yeniden kullanılabilir olur. Olduğundan daha temiz geri dönmez.",
      note: "Not (isteğe bağlı)",
      notePlaceholder: "Kontrol edildi, çalışıyor",
      reportTitle: "Sorun bildir",
      reportDescription:
        "Tesisteki herkes bildirebilir. Bakım ekibi hemen görür.",
      whatIsWrong: "Sorun ne?",
      whatPlaceholder: "Duş gideri tıkalı",
      moreDetails: "Ayrıntılar (isteğe bağlı)",
      unit: "Oda ya da yatak",
      chooseUnit: "Oda ya da yatak seçin",
      howUrgent: "Ne kadar acil?",
      assignTo: "Ata",
      decideLater: "Sonra karar ver",
      outOfOrderSwitch: "Onarılana kadar hizmet dışı bırak",
      unitBlocked: "Bu oda bloke; zaten satılmıyor.",
      alreadyOut: "Zaten hizmet dışı",
      send: "Talebi gönder",
      saving: "Kaydediliyor…",
      save: "Kaydet",
      close: "Kapat",
      impactTitle: "Etkilenen biri var",
      impactInHouse: "{guest}, {date} tarihine kadar {unit} biriminde kalıyor.",
      impactInHouseOpen: "{guest}, {unit} biriminde kalıyor.",
      impactBooking: "{guest}, {from} tarihinden itibaren {unit} için rezerve.",
      aGuest: "Bir konuk",
      impactHint:
        "Hiçbir şey iptal edilmez ya da taşınmaz. Ön büronun onları taşıması gerekecek.",
      confirmOutOfOrder: "Yine de hizmet dışı bırak",
      reported: "MT-{number} talebi gönderildi.",
      saved: "Kaydedildi.",
      returned: "Oda yeniden hizmette.",
      heldElsewhere:
        "Bırakıldı. Oda başka bir talep nedeniyle hizmet dışı kalıyor.",
      stillOut:
        "Tamamlandı. Oda, odaları hizmete döndürme yetkisi olan biri onaylayana kadar hizmet dışı kalır.",
      refused: "Bu işlem gerçekleşmedi. Sayfa şu anki durumu gösteriyor.",
      invalid: "Formda doğru olmayan bir şey var.",
      stale: "Bu talebi önce başka biri taşıdı. Şimdi {state} durumunda.",
      blocked: "Bu oda bloke; hizmet dışı bırakılamaz.",
      needsAssignee:
        "Önce birini atayın. Bu tesis iş başlamadan önce bir atama ister.",
      outOfReach: "Bu kişi bu tesiste çalışmıyor.",
      needsReturnPermission:
        "Odayı hizmete döndürmek için odaları hizmet dışı bırakma yetkisi gerekir.",
      settingsTitle: "Burada bakım nasıl işler",
      settingsHint:
        "Bir tesis, aksini belirtmedikçe organizasyonunu izler. Değişiklik bir sonraki işleme uygulanır, zaten hizmet dışı olana değil.",
      assigneeRequired: "İş başlamadan önce biri atanır",
      whenReturns: "Oda hizmete döner",
      onDone: "Talebi tamamlandığında",
      onConfirmation: "Yalnızca biri onayladığında",
      returnsAs: "Şu durumda döner",
      organizationDefault: "Organizasyon varsayılanı",
      thisProperty: "Bu tesis",
      useDefault: "Organizasyonunkini kullan ({value})",
      yes: "Evet",
      no: "Hayır",
      settingRefused: "Ayar kaydedilmedi.",
      defaultNeedsReach:
        "Varsayılanı değiştirmek için tüm tesislere erişim gerekir.",
      settingReadOnly: "Bunu değiştirmek için bakım yönetme yetkisi gerekir.",
      reportProblem: "Sorun bildir",
      states: {
        new: "Yeni",
        in_progress: "Sürüyor",
        waiting_for_parts: "Parça bekleniyor",
        done: "Tamamlandı",
        cancelled: "İptal edildi",
      },
      priorities: {
        urgent: "Acil",
        this_week: "Bu hafta",
        can_wait: "Bekleyebilir",
      },
      returnAs: {
        dirty: "Kirli",
        clean: "Temiz",
        inspected: "Kontrol edildi",
      },
    },

    auditLog: "Denetim kaydı",
    auditLogFor: "Son işlemler:",
    allRecords: "Tüm kayıtlar",
    noAuditTitle: "Henüz kayıt yok",
    noAuditDescription:
      "Bir giriş, çıkış, ücret veya ters kayıt yapıldığında burada görünür.",
    when: "Ne zaman",
    what: "Ne",
    who: "Kim",
    why: "Neden",
    subject: "Konu",
    context: "Ayrıntılar",
    contextKey: "Alan",
    contextValue: "Değer",
    noContext: "Bu kaydın ek ayrıntısı yok.",
    you: "Siz",
    noReason: "Gerekçe gerekmiyor",
    actorUnnamed: "Kimliğiyle kayıtlı ekip üyesi",
    auditAction: {
      reservation: {
        created: "Rezervasyon alındı",
        checked_in: "Giriş yapıldı",
        check_in_reversed: "Giriş geri alındı",
      },
      stay: { checked_out: "Çıkış yapıldı" },
      folio: {
        charge_posted: "Ücret işlendi",
        line_reversed: "Satır ters kaydedildi",
        closed: "Folyo kapatıldı",
      },
      staff: {
        invited: "Ekip üyesi davet edildi",
        role_changed: "Rol değiştirildi",
        property_assigned: "Tesise atandı",
        property_unassigned: "Tesis ataması kaldırıldı",
        revoked: "Üyelik iptal edildi",
        revoke_undone: "Üyelik iptali geri alındı",
        role_defined: "Rol tanımlandı",
        role_retired: "Rol kaldırıldı",
        role_reinstated: "Rol geri getirildi",
      },
      unit: {
        added: "Birim eklendi",
        blocked: "Birim kapatıldı",
        unblocked: "Birim açıldı",
        taken_out_of_order: "Hizmet dışı bırakıldı",
        returned_to_service: "Hizmete döndü",
      },
      housekeeping: {
        status_changed: "Oda durumu değiştirildi",
        inspection_set: "Temizlik sonrası kontrol ayarı değiştirildi",
      },
      maintenance_request: {
        reported: "Sorun bildirildi",
        moved: "Talep taşındı",
        cancelled: "Talep iptal edildi",
        assigned: "Talep atandı",
        prioritised: "Öncelik değişti",
        hold_released: "Oda bırakıldı, başka bir talep tutuyor",
      },
      maintenance_setting: {
        changed: "Bakım ayarı değişti",
      },
    },
    auditSubject: {
      reservation: "Rezervasyon",
      stay: "Konaklama",
      folio: "Folyo",
      membership: "Üyelik",
      role: "Rol",
      property: "Tesis",
      accommodation_unit: "Konaklama birimi",
      organization: "Organizasyon",
      maintenance_request: "Bakım talebi",
    },
    table: {
      results: "{n, plural, other {# sonuç}}",
      capped: "(son {n, number} / {of, number})",
      cappedHint: "Arama ve filtreler yalnızca yüklenen satırlarda çalışır.",
      perPage: "Sayfa başına",
      page: "Sayfa {n, number} / {of, number}",
      first: "İlk sayfa",
      previous: "Önceki",
      next: "Sonraki",
      last: "Son sayfa",
      clearFilters: "Filtreleri temizle",
      clearFilter: "Filtreyi kaldır",
      columns: "Sütunlar",
      visibleColumns: "Görünen sütunlar",
      search: "Ara",
      searchBy: "{columns} ara",
      selectAllRows: "Tüm satırları seç",
      selectRow: "Satırı seç",
      selectedCount: "{n, plural, other {# seçili}}",
      clearSelection: "Seçimi kaldır",
      noMatches: "Filtrelerle eşleşen sonuç yok.",
      noRows: "Henüz kayıt yok.",
    },
    navigation: {
      today: "Bugün",
      "front-office": "Ön büro",
      reservations: "Rezervasyonlar",
      rooms: "Odalar ve yataklar",
      arrivals: "Girişler",
      departures: "Çıkışlar",
      "guest-experience": "Konuk deneyimi",
      housekeeping: "Kat hizmetleri",
      maintenance: "Bakım",
      "food-and-beverage": "Yiyecek içecek",
      inventory: "Stok",
      finance: "Finans",
      people: "Ekip",
      analytics: "Analitik",
      configuration: "Ayarlar",
      "audit-log": "Denetim kaydı",
    },
    screenSummary: {
      "guest-experience":
        "Konuk ve sakin talepleri, duyurular ve hizmet takibi.",
      housekeeping: "Oda durumu, temizlik planı ve görev atamaları.",
      "food-and-beverage":
        "Öğün planları, satış noktaları ve tüketim kayıtları.",
      inventory: "Stok hareketleri, sayımlar ve satın alma.",
      people: "Personel kayıtları, vardiyalar ve yetkilendirme.",
      analytics: "Doluluk, gelir ve operasyon raporları.",
      configuration: "Organizasyon, tesis, birim ve yetkilendirme ayarları.",
    },
    planned: "Planlandı",
    handoverLabel: "Bu ekranın devir notu",
    notEntitledTitle: "Bu modül aboneliğinizde yok",
    notEntitledDescription:
      "Organizasyonunuz bu modüle abone olduğunda ve tesiste etkinleştirildiğinde burada görünür.",
  },
  en: {
    productName: "Ranza",
    skip: "Skip to content",
    languageLabel: "Language",
    languageName: { tr: "Türkçe", en: "English", ar: "العربية" },
    today: "Today",
    propertySwitcher: "Properties",
    mainNavigation: "Main navigation",
    sections: "Sections",
    back: "Back",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    workspaceBadge: "Workspace",
    navSections: {
      operations: "Operations",
      management: "Management",
      system: "System",
    },
    account: "Account",
    organization: "Organization",
    property: "Property",
    noPropertyTitle: "You are not assigned to a Property yet",
    noPropertyDescription:
      "A manager in your Organization assigns you to a Property, and it appears here.",
    signInTitle: "Sign in",
    signInSummary: "Ranza operator workspace",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in",
    signInFailed: "That email and password did not match.",

    challengeTitle: "Second step",
    challengeSummary:
      "Enter the code from your authenticator app, or one of your backup codes.",
    code: "Code",
    verify: "Verify",
    challengeFailed: "That code is not valid.",

    security: "Security",
    securitySummary: "Manage how your account is signed in to.",
    twoFactor: "Two-step verification",
    twoFactorOn: "On",
    twoFactorOff: "Off",
    twoFactorSummary:
      "When on, signing in asks for a code from your authenticator app as well as your password.",
    enable: "Turn on",
    disable: "Turn off",
    confirmWithPassword: "Confirm with your password",
    scanHint:
      "Add this key to your authenticator app, then enter the code it shows.",
    secretLabel: "Setup key",
    backupCodes: "Backup codes",
    backupCodesWarning:
      "Save these now. Each one works once, and they are not shown again.",
    enrolFailed: "That password did not match.",

    frontOffice: "Front Office",
    arrivalsAt: "Arriving today at",
    departuresAt: "Leaving today at",
    noFrontDeskTitle: "The front desk is not open at this Property",
    noFrontDeskDescription:
      "It appears here once your Organization's Subscription includes it and the Property has it enabled.",
    noArrivalsTitle: "No arrivals today",
    noArrivalsDescription: "Nobody is booked to arrive at this Property today.",
    openEnded: "Open-ended",
    checkIn: "Check in",
    checkingIn: "Checking in",
    checkedIn: "Checked in",
    unitUnavailable: "That Unit is occupied for those nights.",
    unitNotInService:
      "That room is out of order or blocked. Return it to service, or move the booking.",
    blockReasonPlaceholder: "Maintenance or repair",
    roomNotReady:
      "This room isn't ready yet — it hasn't been cleaned, or it's waiting for inspection.",
    checkInAnyway: "Check in anyway",
    notNow: "Not now",
    notReady: "Not ready",
    checkInRefused: "That Reservation cannot be checked in.",
    undoCheckIn: "Undo check-in",
    undoingCheckIn: "Undoing",
    undoCheckInFor: "Undo check-in for {guest}",
    undoCheckInTitle: "Undo this check-in?",
    undoCheckInSummary:
      "The Stay is cancelled and the Reservation becomes arrivable again. Nothing is deleted — the withdrawn check-in stays on the record.",
    keepCheckIn: "Keep check-in",
    reason: "Reason",
    reasonHint: "Recorded with the withdrawal and kept.",
    reasonTooShort:
      "{min, plural, one {A reason of at least # character is needed.} other {A reason of at least # characters is needed.}}",
    reasonTooLong:
      "{max, plural, one {A reason cannot be longer than # character.} other {A reason cannot be longer than # characters.}}",
    undoCheckInRefused: "That check-in cannot be withdrawn.",
    stayHasCharges:
      "Charges have been posted to this Stay, so it counts as having happened and the check-in can't be undone. Correct the charges in Finance.",
    stayType: { guest: "Guest", resident: "Resident" },
    unitType: {
      room: "Room",
      bed: "Bed",
      apartment: "Apartment",
      suite: "Suite",
    },
    reservationStatus: {
      requested: "Requested",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
      no_show: "No show",
      checked_in: "Checked in",
    },
    arrivals: "Arrivals",
    departures: "Departures",
    guest: "Guest",
    period: "Stay",
    unit: "Unit",
    action: "Action",
    status: "Status",
    departure: "Departure",
    overdue: "Overdue",
    onTime: "Today",
    checkOut: "Check out",
    checkingOut: "Checking out",
    checkOutRefused: "That Stay cannot be checked out.",
    noDeparturesTitle: "No departures today",
    noDeparturesDescription: "Nobody is due to leave this Property today.",
    readiness: "Readiness",
    reservation: "Reservation",
    roomAndBed: "Room and bed",
    notAssigned: "Not assigned",
    ready: "Ready",
    outOfOrder: "Out of order",
    occupied: "Occupied",
    daysLate: "{n, plural, one {# day late} other {# days late}}",
    expectedEta: "expected {eta}",
    credit: "credit",
    moreActionsFor: "More actions for {guest}",
    reservationDetails: "Reservation details",
    openFolio: "Open folio",
    showOnBedMap: "Show on bed map",
    profile: "Profile",
    unitOutOfOrder: "Unit is out of service",
    unitOccupied: "Unit is occupied",
    leaves: "Leaves",
    overdueSince: "Overdue since {date}",
    untilDate: "until {date}",

    reservations: "Reservations",
    reservationsAt: "Bookings at",

    staff: {
      rosterOf: "The team at",
      screenSummary:
        "Who works here, which Properties they reach, and what each role may do.",
      peopleTab: "People",
      rolesTab: "What each role can do",
      person: "Person",
      permission: "Permission",
      heldByCount:
        "{count, plural, =0 {nobody holds it} one {# person} other {# people}}",
      shippedGroup: "Ranza ships these",
      authoredGroup: "You defined these",
      invitationSent: "Invitation sent",
      inviteNotice:
        "You pass the link on yourself — nothing sends email yet. It lapses after seven days and is shown only once.",
      matrixNote:
        "The roles Ranza ships arrive in a release and are not editable. Every change is written to the audit log and enforced by the database, not only by hiding buttons.",
      cannotGrant: "You cannot grant a permission your own role does not hold.",
      invite: "Invite",
      inviteTitle: "Invite somebody to the team",
      inviteDescription:
        "The membership opens immediately. The link is only the way to a password.",
      sendInvitation: "Create the invitation",
      cancel: "Cancel",
      linkToPassOn: "Pass this link on yourself",
      linkExpires: "It lapses after seven days, and is never shown again.",
      email: "Email",
      role: "Role",
      properties: "Properties",
      status: "Status",
      actions: "Actions",
      active: "Active",
      awaitingPassword: "Awaiting a password",
      revoked: "Revoked",
      revoke: "Revoke",
      undoRevoke: "Undo",
      reachesNothing: "No Property yet",
      alreadyAMember:
        "That person already has a membership in this Organization.",
      refused: "That was refused.",
      lastAdministrator:
        "An Organization must keep somebody who can add staff.",
      roleIsHeld: "Somebody holds this role. Move them first.",
      rolesHeading: "Roles",
      defineRole: "Define a role",
      defineRoleTitle: "Define a new role",
      defineRoleDescription:
        "A role is a named set of permissions. You may only grant what your own role holds.",
      roleName: "Role name",
      saveRole: "Save the role",
      mayDo: "May do",
      heldBy: "Held by",
      shipped: "Ranza",
      retired: "Retired",
      retire: "Retire",
      reinstate: "Reinstate",
      noCommands: "Nothing yet",
      permissions: {
        book: "Take a booking",
        checkIn: "Check somebody in",
        checkOut: "Check somebody out",
        manageFolio: "Open and close a Folio",
        postCharge: "Post a charge",
        administerStaff: "Administer staff",
        defineRoles: "Define roles",
        configureAccommodation: "Configure rooms & beds",
        updateHousekeeping: "Update room status",
        reportMaintenance: "Report a maintenance problem",
        manageMaintenance: "Work maintenance requests",
        takeOutOfOrder: "Take rooms out of order and back",
      },
      emptyRosterTitle: "Nobody here yet",
      emptyRosterDescription: "This Organization has no Staff Member to show.",
      roles: {
        owner: "Owner",
        manager: "Manager",
        front_desk: "Front desk",
        housekeeping: "Housekeeping",
        finance: "Finance",
      },
    },
    noReservationsTitle: "Nothing booked ahead",
    noReservationsDescription:
      "Nothing is booked at this Property from today onwards.",
    newReservation: "New reservation",
    newReservationSummary:
      "The Guest, the Unit and the nights. The Unit is held as soon as this is saved.",
    guestEmail: "Email",
    guestEmailHint:
      "Optional. An address already on file books that same Guest again instead of opening a second record.",
    guestPhone: "Telephone",
    stayTypeLabel: "Stay type",
    arrival: "Arrival",
    departureHint: "Leave empty for an open-ended Reservation.",
    chooseUnit: "Choose a Unit",
    takeBooking: "Create reservation",
    takingBooking: "Creating",
    discardBooking: "Cancel",
    bookingUnavailable: "That Unit is already booked for those nights.",
    bookingPeriodInvalid:
      "Those dates are not a period a Reservation can have. It covers at least one night and cannot start before today.",
    bookingGuestInvalid:
      "Check the Guest's name, email address and telephone number.",
    bookingRefused: "That booking cannot be taken.",
    folios: "Folios",
    foliosAt: "Folios at",
    allFolios: "All folios",
    noFoliosTitle: "No folios yet",
    noFoliosDescription:
      "Nothing has been opened at this Property. A folio opens when a Guest checks in.",
    folioStatus: { open: "Open", closed: "Closed" },
    folioLines: "Folio lines",
    balance: "Balance",
    lines: "Lines",
    amount: "Amount",
    description: "Description",
    posted: "Posted",
    noLines: "Nothing has been posted to this folio yet.",
    addCharge: "Add a charge",
    post: "Post",
    posting: "Posting…",
    chargeRefused: "That charge could not be posted.",
    amountInvalid:
      "An amount must be a positive number with no more decimal places than the currency allows.",
    reverse: "Reverse",
    reversing: "Reversing…",
    reversed: "reversed",
    reverseReason: "Reason",
    reverseRefused: "That line could not be reversed.",
    closeFolio: "Close folio",
    closing: "Closing…",
    closeRefused: "That folio could not be closed.",
    folioClosedNote:
      "This folio is closed. Its lines stay exactly as they are, and nothing further can be posted to it.",

    rooms: "Rooms & beds",
    roomsAt: "Rooms & beds at {property}",
    roomsSubtitle:
      "Every room and bed at this Property, and who is in each one.",
    noRoomsTitle: "No rooms yet",
    noRoomsDescription:
      "No rooms have been added to this Property yet. Use 'Add rooms' to create a batch.",
    addRooms: "Add rooms",
    addingRooms: "Adding...",
    firstNumber: "First room number",
    firstNumberHint: "Rooms are numbered in sequence starting from here.",
    roomCount: "Number of rooms",
    capacityPerRoom: "Capacity per room (guests)",
    building: "Building (optional)",
    floor: "Floor (optional)",
    letByTheBed: "Let by the bed",
    letByTheBedHint: "Each bed becomes a separate unit named A, B, C...",
    blockBed: "Block bed",
    blockingBed: "Blocking...",
    unblockBed: "Unblock bed",
    unblockingBed: "Unblocking...",
    blockReason: "Reason for block",
    blockReasonHint:
      "A brief reason (at least 3 characters) why this unit is unavailable.",
    statRooms: "Rooms",
    statBeds: "Beds",
    statOccupied: "Occupied",
    statEmpty: "Empty beds tonight",
    statBlocked: "Blocked",
    bedMap: "Bed map",
    bedList: "Bed list",
    freeTonight: "Free",
    inHouseTonight: "In house",
    reservedTonight: "Reserved",
    blockedStatus: "Blocked",

    housekeeping: {
      subtitle: "Which rooms need cleaning at {property}",
      noRoomsTitle: "No rooms here yet",
      noRoomsDescription:
        "Rooms added under Rooms & beds appear here, with whether each one needs cleaning.",
      statRooms: "Rooms",
      statDirty: "Dirty",
      statClean: "Clean",
      statInspected: "Inspected",
      statReady: "Ready to let",
      room: "Room",
      location: "Where",
      status: "Status",
      changed: "Last changed",
      occupancy: "Occupancy",
      dirty: "Dirty",
      clean: "Clean",
      inspected: "Inspected",
      notRecorded: "Not recorded yet",
      inHouse: "Guest in house",
      vacant: "Vacant",
      outOfService: "Out of service",
      beds: "{count, plural, one {# bed} other {# beds}}",
      floorNumber: "Floor {floor}",
      markClean: "Mark clean",
      markInspected: "Mark inspected",
      markDirty: "Mark dirty",
      saving: "Saving…",
      marked: "{count, plural, one {# room updated} other {# rooms updated}}",
      refused:
        "Those rooms couldn't be updated. The board now shows what you can change.",
      invalid: "Choose between one and sixty rooms.",
      readOnly:
        "You can see every room here but not change it. A manager can give your role permission to update room status.",
      roomActions: "Actions for {room}",
      actions: "Actions",
      inspectionTitle: "Check rooms after cleaning",
      inspectionHint:
        "When on, a cleaned room waits for someone to mark it inspected before it can be let again. Switching this never changes what any room is marked.",
      organizationDefault: "For the whole Organization",
      thisProperty: "For this Property",
      useDefault: "Use the Organization's setting ({value})",
      on: "On",
      off: "Off",
      flow: "What a room goes through",
      flowReady: "Ready to let",
      saved: "Saved",
      settingRefused:
        "That setting couldn't be changed. What you see now is what applies.",
      defaultNeedsReach:
        "Only someone who reaches every Property can change the Organization's setting.",
      settingReadOnly: "A manager can change this.",
      awaitingInspection: "Waiting for inspection",
    },
    maintenance: {
      heading: "Maintenance at {property}",
      newRequest: "New request",
      requestsTab: "Requests",
      settingsTab: "Settings",
      statOpen: "Open",
      statUrgent: "Urgent",
      statOutOfOrder: "Out of order",
      statDone: "Done in 30 days",
      reference: "MT-{number}",
      bedInRoom: "Bed {bed} · {room}",
      outOfOrder: "Out of order",
      backOn: "Back {date}",
      overdueSince: "Was due back {date}",
      notAssigned: "Not assigned",
      noLongerHere: "{name} (no longer at this Property)",
      formerStaff: "A former Staff Member",
      emptyColumn: "Nothing here",
      noRequestsTitle: "No requests at {property}",
      noRequestsDescription:
        "When something breaks, report it here or from Rooms. Anyone at the Property can.",
      readOnly:
        "You can see every request. Moving, assigning and cancelling them needs the permission to manage maintenance.",
      filterPriority: "Priority",
      filterAssignee: "Assignee",
      allPriorities: "Any priority",
      everyone: "Anyone",
      unassigned: "Not assigned",
      outOfOrderOnly: "Out of order only",
      showCancelled: "Show cancelled",
      moveTo: "Move to {state}",
      cardActions: "Actions for MT-{number}",
      openRequest: "Open MT-{number}",
      reportedBy: "Reported by {who}",
      reportedOn: "Reported {when}",
      where: "Where",
      details: "Details",
      noDetails: "No details given.",
      assignee: "Assigned to",
      priority: "Priority",
      state: "State",
      cancelReason: "Why it was cancelled",
      outOfOrderSince: "Since {when}",
      heldAfterDone:
        "Done, and the room stays out of order until someone returns it to service.",
      assign: "Assign",
      reopen: "Reopen",
      cancelRequest: "Cancel request",
      cancelTitle: "Cancel MT-{number}?",
      cancelHint:
        "Cancel only what was reported by mistake or is not a fault. When something is fixed, move it to Done instead.",
      reason: "Reason",
      reasonPlaceholder: "Reported twice",
      keep: "Keep it",
      takeOutOfOrder: "Take room out of order",
      takeOutHint:
        "The front desk will not be able to sell it or check anyone into it until it returns to service.",
      expectedBack: "Expected back (optional)",
      returnToService: "Return to service",
      returnHint:
        "The room becomes available again. It comes back no cleaner than it was.",
      note: "Note (optional)",
      notePlaceholder: "Checked and working",
      reportTitle: "Report a problem",
      reportDescription:
        "Anyone at the Property can report. The people who work on maintenance see it straight away.",
      whatIsWrong: "What is wrong?",
      whatPlaceholder: "The shower drain is blocked",
      moreDetails: "Details (optional)",
      unit: "Room or bed",
      chooseUnit: "Choose a room or bed",
      howUrgent: "How urgent?",
      assignTo: "Assign to",
      decideLater: "Decide later",
      outOfOrderSwitch: "Take it out of order until it is fixed",
      unitBlocked: "This room is blocked, so it is already not sold.",
      alreadyOut: "Already out of order",
      send: "Send request",
      saving: "Saving…",
      save: "Save",
      close: "Close",
      impactTitle: "Somebody is affected",
      impactInHouse: "{guest} is staying in {unit} until {date}.",
      impactInHouseOpen: "{guest} is staying in {unit}.",
      impactBooking: "{guest} is booked into {unit} from {from}.",
      aGuest: "A Guest",
      impactHint:
        "Nothing will be cancelled or moved. The front desk will need to move them.",
      confirmOutOfOrder: "Take it out of order anyway",
      reported: "Request MT-{number} sent.",
      saved: "Saved.",
      returned: "The room is back in service.",
      heldElsewhere:
        "Let go. Another request still keeps the room out of order.",
      stillOut:
        "Done. The room stays out of order until someone who may return rooms confirms it.",
      refused: "That did not go through. The page now shows what is true.",
      invalid: "Something in the form is not right.",
      stale: "Someone else moved this request first. It is now {state}.",
      blocked: "This room is blocked, so it cannot be taken out of order.",
      needsAssignee:
        "Assign someone first. This Property asks for an assignee before work starts.",
      outOfReach: "That person does not work at this Property.",
      needsReturnPermission:
        "Returning the room needs the permission to take rooms out of order.",
      settingsTitle: "How maintenance works here",
      settingsHint:
        "A Property follows its Organization unless it says otherwise. A change applies to the next move, never to what is already out of order.",
      assigneeRequired: "Somebody is assigned before work starts",
      whenReturns: "A room comes back into service",
      onDone: "When its request is done",
      onConfirmation: "Only when someone confirms",
      returnsAs: "It comes back as",
      organizationDefault: "Organization default",
      thisProperty: "This Property",
      useDefault: "Use the Organization's ({value})",
      yes: "Yes",
      no: "No",
      settingRefused: "The setting was not saved.",
      defaultNeedsReach: "Changing the default needs access to every Property.",
      settingReadOnly:
        "Changing this needs the permission to manage maintenance.",
      reportProblem: "Report a problem",
      states: {
        new: "New",
        in_progress: "In progress",
        waiting_for_parts: "Waiting for parts",
        done: "Done",
        cancelled: "Cancelled",
      },
      priorities: {
        urgent: "Urgent",
        this_week: "This week",
        can_wait: "Can wait",
      },
      returnAs: {
        dirty: "Dirty",
        clean: "Clean",
        inspected: "Inspected",
      },
    },

    auditLog: "Audit log",
    auditLogFor: "Recent actions at",
    allRecords: "All records",
    noAuditTitle: "Nothing recorded yet",
    noAuditDescription:
      "A check-in, check-out, charge or reversal appears here once it happens.",
    when: "When",
    what: "What",
    who: "Who",
    why: "Why",
    subject: "Subject",
    context: "Details",
    contextKey: "Field",
    contextValue: "Value",
    noContext: "This record carries no further details.",
    you: "You",
    noReason: "No reason required",
    actorUnnamed: "Staff Member, identified by id",
    auditAction: {
      reservation: {
        created: "Reservation taken",
        checked_in: "Checked in",
        check_in_reversed: "Check-in withdrawn",
      },
      stay: { checked_out: "Checked out" },
      folio: {
        charge_posted: "Charge posted",
        line_reversed: "Line reversed",
        closed: "Folio closed",
      },
      staff: {
        invited: "Staff Member invited",
        role_changed: "Role changed",
        property_assigned: "Assigned to a Property",
        property_unassigned: "Unassigned from a Property",
        revoked: "Membership revoked",
        revoke_undone: "Revocation undone",
        role_defined: "Role defined",
        role_retired: "Role retired",
        role_reinstated: "Role reinstated",
      },
      unit: {
        added: "Unit added",
        blocked: "Unit blocked",
        unblocked: "Unit unblocked",
        taken_out_of_order: "Taken out of order",
        returned_to_service: "Returned to service",
      },
      housekeeping: {
        status_changed: "Room status changed",
        inspection_set: "Room check after cleaning changed",
      },
      maintenance_request: {
        reported: "Problem reported",
        moved: "Request moved",
        cancelled: "Request cancelled",
        assigned: "Request assigned",
        prioritised: "Priority changed",
        hold_released: "Room let go, still held by another request",
      },
      maintenance_setting: {
        changed: "Maintenance setting changed",
      },
    },
    auditSubject: {
      reservation: "Reservation",
      stay: "Stay",
      folio: "Folio",
      membership: "Membership",
      role: "Role",
      property: "Property",
      accommodation_unit: "Accommodation unit",
      organization: "Organization",
      maintenance_request: "Maintenance request",
    },
    table: {
      results: "{n, plural, one {# result} other {# results}}",
      capped: "(latest {n, number} of {of, number})",
      cappedHint: "Search and filters run over the loaded rows only.",
      perPage: "Per page",
      page: "Page {n, number} of {of, number}",
      first: "First page",
      previous: "Previous",
      next: "Next",
      last: "Last page",
      clearFilters: "Clear filters",
      clearFilter: "Remove filter",
      columns: "Columns",
      visibleColumns: "Visible columns",
      search: "Search",
      searchBy: "Search {columns}",
      selectAllRows: "Select all rows",
      selectRow: "Select row",
      selectedCount: "{n, plural, other {# selected}}",
      clearSelection: "Clear selection",
      noMatches: "Nothing matches these filters.",
      noRows: "Nothing here yet.",
    },
    navigation: {
      today: "Today",
      "front-office": "Front Office",
      reservations: "Reservations",
      rooms: "Rooms & beds",
      arrivals: "Arrivals",
      departures: "Departures",
      "guest-experience": "Guest Experience",
      housekeeping: "Housekeeping",
      maintenance: "Maintenance",
      "food-and-beverage": "Food & Beverage",
      inventory: "Inventory",
      finance: "Finance",
      people: "People",
      analytics: "Analytics",
      configuration: "Configuration",
      "audit-log": "Audit log",
    },
    screenSummary: {
      "guest-experience":
        "Guest and Resident requests, announcements and service tracking.",
      housekeeping: "Unit readiness, cleaning schedule and task assignment.",
      "food-and-beverage": "Meal plans, outlets and consumption records.",
      inventory: "Stock movements, counts and procurement.",
      people: "Staff records, shifts and permissions.",
      analytics: "Occupancy, revenue and operational reporting.",
      configuration: "Organization, Property, Unit and permission settings.",
    },
    planned: "Planned",
    handoverLabel: "This screen's handover note",
    notEntitledTitle: "This module is not in your Subscription",
    notEntitledDescription:
      "It appears here once your Organization subscribes to it and the Property has it enabled.",
  },
  ar: {
    productName: "Ranza",
    skip: "تخطَّ إلى المحتوى",
    languageLabel: "اللغة",
    languageName: { tr: "Türkçe", en: "English", ar: "العربية" },
    today: "اليوم",
    propertySwitcher: "المنشآت",
    mainNavigation: "التنقل الرئيسي",
    sections: "الأقسام",
    back: "رجوع",
    collapse: "طي القائمة",
    expand: "توسيع القائمة",
    workspaceBadge: "مساحة العمل",
    navSections: {
      operations: "العمليات",
      management: "الإدارة",
      system: "النظام",
    },
    account: "الحساب",
    organization: "المؤسسة",
    property: "المنشأة",
    noPropertyTitle: "لم يتم تعيينك إلى منشأة بعد",
    noPropertyDescription:
      "يقوم أحد المديرين في مؤسستك بتعيينك إلى منشأة، فتظهر هنا.",
    signInTitle: "تسجيل الدخول",
    signInSummary: "مساحة عمل رانزا",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ الدخول",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

    challengeTitle: "الخطوة الثانية",
    challengeSummary:
      "أدخل الرمز من تطبيق المصادقة، أو أحد رموز النسخ الاحتياطي.",
    code: "الرمز",
    verify: "تحقّق",
    challengeFailed: "هذا الرمز غير صالح.",

    security: "الأمان",
    securitySummary: "تحكّم في طريقة تسجيل الدخول إلى حسابك.",
    twoFactor: "التحقّق بخطوتين",
    twoFactorOn: "مفعّل",
    twoFactorOff: "غير مفعّل",
    twoFactorSummary:
      "عند تفعيله يُطلب رمز من تطبيق المصادقة إلى جانب كلمة المرور.",
    enable: "تفعيل",
    disable: "إيقاف",
    confirmWithPassword: "أكّد بكلمة المرور",
    scanHint: "أضف هذا المفتاح إلى تطبيق المصادقة، ثم أدخل الرمز الذي يعرضه.",
    secretLabel: "مفتاح الإعداد",
    backupCodes: "رموز النسخ الاحتياطي",
    backupCodesWarning:
      "احفظ هذه الرموز الآن. يُستخدم كل رمز مرة واحدة ولن تُعرض مجددًا.",
    enrolFailed: "كلمة المرور غير صحيحة.",

    frontOffice: "المكتب الأمامي",
    arrivalsAt: "الوصول اليوم في",
    departuresAt: "المغادرة اليوم في",
    noFrontDeskTitle: "المكتب الأمامي غير مفعّل في هذه المنشأة",
    noFrontDeskDescription:
      "يظهر هنا عندما يشمله اشتراك مؤسستك ويتم تفعيله في المنشأة.",
    noArrivalsTitle: "لا يوجد وصول اليوم",
    noArrivalsDescription: "لا توجد حجوزات وصول لهذه المنشأة اليوم.",
    openEnded: "مفتوح المدة",
    checkIn: "تسجيل الوصول",
    checkingIn: "جارٍ التسجيل",
    checkedIn: "تم تسجيل الوصول",
    unitUnavailable: "هذه الوحدة محجوزة في تلك الليالي.",
    unitNotInService:
      "هذه الغرفة خارج الخدمة أو محجوبة. أعدها إلى الخدمة أو انقل الحجز.",
    blockReasonPlaceholder: "صيانة أو إصلاح",
    roomNotReady:
      "هذه الغرفة ليست جاهزة بعد — لم تُنظَّف أو أنها بانتظار الفحص.",
    checkInAnyway: "تسجيل الدخول على أي حال",
    notNow: "ليس الآن",
    notReady: "غير جاهزة",
    checkInRefused: "لا يمكن تسجيل الوصول لهذا الحجز.",
    undoCheckIn: "التراجع عن تسجيل الوصول",
    undoingCheckIn: "جارٍ التراجع",
    undoCheckInFor: "التراجع عن تسجيل الوصول لـ {guest}",
    undoCheckInTitle: "هل تريد التراجع عن تسجيل الوصول؟",
    undoCheckInSummary:
      "تُلغى الإقامة ويعود الحجز قابلاً لتسجيل الوصول من جديد. لا يُحذف شيء — يبقى تسجيل الوصول المسحوب في السجل.",
    keepCheckIn: "إبقاء تسجيل الوصول",
    reason: "السبب",
    reasonHint: "يُحفَظ مع سجل التراجع.",
    reasonTooShort:
      "{min, plural, zero {يلزم سبب من حرف واحد على الأقل.} one {يلزم سبب من حرف واحد على الأقل.} two {يلزم سبب من حرفين على الأقل.} few {يلزم سبب من # أحرف على الأقل.} many {يلزم سبب من # حرفًا على الأقل.} other {يلزم سبب من # حرف على الأقل.}}",
    reasonTooLong:
      "{max, plural, zero {لا يمكن أن يزيد السبب على حرف واحد.} one {لا يمكن أن يزيد السبب على حرف واحد.} two {لا يمكن أن يزيد السبب على حرفين.} few {لا يمكن أن يزيد السبب على # أحرف.} many {لا يمكن أن يزيد السبب على # حرفًا.} other {لا يمكن أن يزيد السبب على # حرف.}}",
    undoCheckInRefused: "لا يمكن التراجع عن تسجيل الوصول هذا.",
    stayHasCharges:
      "سُجِّلت مبالغ على هذه الإقامة، لذلك تُعدّ قد حدثت فعلًا ولا يمكن التراجع عن تسجيل الوصول. صحِّح المبالغ من قسم المالية.",
    stayType: { guest: "ضيف", resident: "مقيم" },
    unitType: {
      room: "غرفة",
      bed: "سرير",
      apartment: "شقة",
      suite: "جناح",
    },
    reservationStatus: {
      requested: "مطلوب",
      confirmed: "مؤكّد",
      cancelled: "ملغى",
      no_show: "لم يحضر",
      checked_in: "تم تسجيل الوصول",
    },
    arrivals: "الوصول",
    departures: "المغادرة",
    guest: "الضيف",
    period: "الإقامة",
    unit: "الوحدة",
    action: "إجراء",
    status: "الحالة",
    departure: "المغادرة",
    overdue: "متأخرة",
    onTime: "اليوم",
    checkOut: "تسجيل المغادرة",
    checkingOut: "جارٍ التسجيل",
    checkOutRefused: "لا يمكن تسجيل مغادرة هذه الإقامة.",
    noDeparturesTitle: "لا توجد مغادرات اليوم",
    noDeparturesDescription: "لا أحد من المقرر أن يغادر هذه المنشأة اليوم.",
    readiness: "الجاهزية",
    reservation: "الحجز",
    roomAndBed: "الغرفة والسرير",
    notAssigned: "غير محدد",
    ready: "جاهزة",
    outOfOrder: "خارج الخدمة",
    occupied: "مشغولة",
    daysLate:
      "{n, plural, one {متأخر يوم واحد} two {متأخر يومان} few {متأخر # أيام} many {متأخر # يوماً} other {متأخر # يوم}}",
    expectedEta: "المتوقع {eta}",
    credit: "رصيد دائن",
    moreActionsFor: "مزيد من الإجراءات لـ {guest}",
    reservationDetails: "تفاصيل الحجز",
    openFolio: "فتح الحساب",
    showOnBedMap: "عرض على خريطة الأسرّة",
    profile: "الملف الشخصي",
    unitOutOfOrder: "الوحدة خارج الخدمة",
    unitOccupied: "الوحدة مشغولة",
    leaves: "المغادرة",
    overdueSince: "متأخر منذ {date}",
    untilDate: "حتى {date}",

    reservations: "الحجوزات",
    reservationsAt: "الحجوزات في",

    staff: {
      rosterOf: "فريق",
      screenSummary: "من يعمل هنا، وأي المنشآت يصلها، وما الذي يستطيعه كل دور.",
      peopleTab: "الأشخاص",
      rolesTab: "ما يستطيعه كل دور",
      person: "الشخص",
      permission: "الصلاحية",
      heldByCount:
        "{count, plural, =0 {لا أحد} one {شخص واحد} two {شخصان} few {# أشخاص} many {# شخصًا} other {# شخص}}",
      shippedGroup: "ترسلها رانزا",
      authoredGroup: "عرَّفتها أنت",
      invitationSent: "أُرسلت الدعوة",
      inviteNotice:
        "أنت من يمرّر الرابط: لا شيء يرسل البريد بعد. ينتهي بعد سبعة أيام ويُعرض مرة واحدة فقط.",
      matrixNote:
        "الأدوار التي ترسلها رانزا تأتي مع الإصدار ولا تُعدَّل. كل تغيير يُكتب في سجل التدقيق وتفرضه قاعدة البيانات، لا إخفاء الأزرار.",
      cannotGrant: "لا يمكنك منح صلاحية لا يحملها دورك.",
      invite: "دعوة",
      inviteTitle: "دعوة شخص إلى الفريق",
      inviteDescription:
        "تُفتح العضوية فورًا. الرابط ليس إلا وسيلة لتعيين كلمة المرور.",
      sendInvitation: "إنشاء الدعوة",
      cancel: "إلغاء",
      linkToPassOn: "مرِّر هذا الرابط بنفسك",
      linkExpires: "ينتهي بعد سبعة أيام، ولن يُعرض مرة أخرى.",
      email: "البريد الإلكتروني",
      role: "الدور",
      properties: "المنشآت",
      status: "الحالة",
      actions: "الإجراءات",
      active: "نشط",
      awaitingPassword: "بانتظار كلمة المرور",
      revoked: "مُلغى",
      revoke: "إلغاء العضوية",
      undoRevoke: "تراجع",
      reachesNothing: "لا منشأة بعد",
      alreadyAMember: "لهذا الشخص عضوية في هذه المؤسسة بالفعل.",
      refused: "رُفض هذا الإجراء.",
      lastAdministrator: "يجب أن يبقى في المؤسسة من يستطيع إدارة الفريق.",
      roleIsHeld: "هذا الدور يحمله أحدهم. انقلهم أولًا.",
      rolesHeading: "الأدوار",
      defineRole: "تعريف دور",
      defineRoleTitle: "تعريف دور جديد",
      defineRoleDescription:
        "الدور مجموعة صلاحيات لها اسم. لا يمكنك منح ما لا يحمله دورك.",
      roleName: "اسم الدور",
      saveRole: "حفظ الدور",
      mayDo: "ما يستطيعه",
      heldBy: "يحمله",
      shipped: "رانزا",
      retired: "متقاعد",
      retire: "إحالة إلى التقاعد",
      reinstate: "إعادة التفعيل",
      noCommands: "لا شيء بعد",
      permissions: {
        book: "أخذ حجز",
        checkIn: "تسجيل الدخول",
        checkOut: "تسجيل المغادرة",
        manageFolio: "فتح وإغلاق الحساب",
        postCharge: "تسجيل رسم على الحساب",
        administerStaff: "إدارة الفريق",
        defineRoles: "تعريف الأدوار",
        configureAccommodation: "تهيئة الغرف والأسرّة",
        updateHousekeeping: "تحديث حالة الغرف",
        reportMaintenance: "الإبلاغ عن مشكلة صيانة",
        manageMaintenance: "إدارة طلبات الصيانة",
        takeOutOfOrder: "إخراج الغرف من الخدمة وإعادتها",
      },
      emptyRosterTitle: "لا أحد هنا بعد",
      emptyRosterDescription: "لا يوجد في هذه المؤسسة موظف لعرضه.",
      roles: {
        owner: "المالك",
        manager: "المدير",
        front_desk: "الاستقبال",
        housekeeping: "التدبير الفندقي",
        finance: "المالية",
      },
    },
    noReservationsTitle: "لا توجد حجوزات قادمة",
    noReservationsDescription: "لا يوجد حجز في هذه المنشأة من اليوم فصاعدًا.",
    newReservation: "حجز جديد",
    newReservationSummary: "الضيف والوحدة والليالي. تُحجز الوحدة فور الحفظ.",
    guestEmail: "البريد الإلكتروني",
    guestEmailHint:
      "اختياري. العنوان المسجَّل يعيد استخدام الضيف نفسه بدل فتح سجل ثانٍ.",
    guestPhone: "الهاتف",
    stayTypeLabel: "نوع الإقامة",
    arrival: "الوصول",
    departureHint: "اتركه فارغًا لحجز مفتوح المدة.",
    chooseUnit: "اختر وحدة",
    takeBooking: "إنشاء الحجز",
    takingBooking: "جارٍ الإنشاء",
    discardBooking: "إلغاء",
    bookingUnavailable: "هذه الوحدة محجوزة بالفعل لتلك الليالي.",
    bookingPeriodInvalid:
      "هذه التواريخ ليست مدة صالحة. يغطي الحجز ليلة واحدة على الأقل ولا يبدأ قبل اليوم.",
    bookingGuestInvalid: "تحقق من اسم الضيف وبريده الإلكتروني وهاتفه.",
    bookingRefused: "لا يمكن إنشاء هذا الحجز.",
    folios: "الحسابات",
    foliosAt: "الحسابات في",
    allFolios: "كل الحسابات",
    noFoliosTitle: "لا توجد حسابات بعد",
    noFoliosDescription:
      "لم يُفتح أي حساب في هذه المنشأة. يُفتح الحساب عند تسجيل دخول نزيل.",
    folioStatus: { open: "مفتوح", closed: "مغلق" },
    folioLines: "بنود الحساب",
    balance: "الرصيد",
    lines: "البنود",
    amount: "المبلغ",
    description: "الوصف",
    posted: "تاريخ القيد",
    noLines: "لم يُقيَّد شيء على هذا الحساب بعد.",
    addCharge: "إضافة رسم",
    post: "قيد",
    posting: "جارٍ القيد…",
    chargeRefused: "تعذّر قيد هذا الرسم.",
    amountInvalid:
      "يجب أن يكون المبلغ رقمًا موجبًا بعدد خانات عشرية لا يتجاوز ما تسمح به العملة.",
    reverse: "عكس القيد",
    reversing: "جارٍ العكس…",
    reversed: "معكوس",
    reverseReason: "السبب",
    reverseRefused: "تعذّر عكس هذا البند.",
    closeFolio: "إغلاق الحساب",
    closing: "جارٍ الإغلاق…",
    closeRefused: "تعذّر إغلاق هذا الحساب.",
    folioClosedNote:
      "هذا الحساب مغلق. تبقى بنوده كما هي، ولا يمكن قيد أي شيء جديد عليه.",

    rooms: "الغرف والأسرّة",
    roomsAt: "الغرف والأسرّة في {property}",
    roomsSubtitle: "كل غرفة وسرير في هذا العقار، ومن يشغل كلًّا منها.",
    noRoomsTitle: "لا توجد غرف بعد",
    noRoomsDescription:
      "لم تتم إضافة أي غرف إلى هذا العقار بعد. استخدم 'إضافة غرف' لإنشائها دفعة واحدة.",
    addRooms: "إضافة غرف",
    addingRooms: "جارٍ الإضافة...",
    firstNumber: "رقم الغرفة الأولى",
    firstNumberHint: "يتم ترقيم الغرف بالتسلسل بدءاً من هذا الرقم.",
    roomCount: "عدد الغرف",
    capacityPerRoom: "سعة الغرفة (أشخاص)",
    building: "المبنى (اختياري)",
    floor: "الطابق (اختياري)",
    letByTheBed: "تأجير بالسرير",
    letByTheBedHint: "يصبح كل سرير وحدة منفصلة تسمى A، B، C...",
    blockBed: "إغلاق السرير",
    blockingBed: "جارٍ الإغلاق...",
    unblockBed: "فتح السرير",
    unblockingBed: "جارٍ الفتح...",
    blockReason: "سبب الإغلاق",
    blockReasonHint: "سبب موجز (لا يقل عن 3 أحرف) لعدم توفر هذه الوحدة.",
    statRooms: "الغرف",
    statBeds: "الأسرّة",
    statOccupied: "مشغولة",
    statEmpty: "أسرّة فارغة الليلة",
    statBlocked: "مغلقة",
    bedMap: "خريطة الأسرّة",
    bedList: "قائمة الأسرّة",
    freeTonight: "فارغ",
    inHouseTonight: "في الإقامة",
    reservedTonight: "محجوز",
    blockedStatus: "مغلق",

    housekeeping: {
      subtitle: "الغرف التي تحتاج إلى تنظيف في {property}",
      noRoomsTitle: "لا توجد غرف بعد",
      noRoomsDescription:
        "تظهر هنا الغرف المضافة من شاشة الغرف والأسرّة، مع ما إذا كانت كل غرفة تحتاج إلى تنظيف.",
      statRooms: "الغرف",
      statDirty: "متسخة",
      statClean: "نظيفة",
      statInspected: "تم فحصها",
      statReady: "جاهزة للتأجير",
      room: "الغرفة",
      location: "الموقع",
      status: "الحالة",
      changed: "آخر تغيير",
      occupancy: "الإشغال",
      dirty: "متسخة",
      clean: "نظيفة",
      inspected: "تم فحصها",
      notRecorded: "لم تُسجَّل بعد",
      inHouse: "نزيل مقيم",
      vacant: "شاغرة",
      outOfService: "خارج الخدمة",
      beds: "{count, plural, zero {لا أسرّة} one {سرير واحد} two {سريران} few {# أسرّة} many {# سريرًا} other {# سرير}}",
      floorNumber: "الطابق {floor}",
      markClean: "تعيين كنظيفة",
      markInspected: "تعيين كمفحوصة",
      markDirty: "تعيين كمتسخة",
      saving: "جارٍ الحفظ…",
      marked:
        "{count, plural, zero {لم تُحدَّث أي غرفة} one {تم تحديث غرفة واحدة} two {تم تحديث غرفتين} few {تم تحديث # غرف} many {تم تحديث # غرفة} other {تم تحديث # غرفة}}",
      refused: "تعذّر تحديث هذه الغرف. تعرض اللوحة الآن ما يمكنك تغييره.",
      invalid: "اختر ما بين غرفة واحدة وستين غرفة.",
      readOnly:
        "يمكنك رؤية جميع الغرف هنا دون تغييرها. يمكن للمدير منح دورك صلاحية تحديث حالة الغرف.",
      roomActions: "إجراءات {room}",
      actions: "الإجراءات",
      inspectionTitle: "فحص الغرف بعد التنظيف",
      inspectionHint:
        "عند التفعيل، تنتظر الغرفة المنظَّفة حتى يعلّمها أحدهم كمفحوصة قبل تأجيرها مجددًا. تغيير هذا الإعداد لا يغيّر حالة أي غرفة.",
      organizationDefault: "للمؤسسة بأكملها",
      thisProperty: "لهذا العقار",
      useDefault: "استخدام إعداد المؤسسة ({value})",
      on: "مفعّل",
      off: "معطّل",
      flow: "المراحل التي تمر بها الغرفة",
      flowReady: "جاهزة للتأجير",
      saved: "تم الحفظ",
      settingRefused: "تعذّر تغيير هذا الإعداد. ما تراه الآن هو المطبَّق.",
      defaultNeedsReach:
        "لا يمكن تغيير إعداد المؤسسة إلا لمن يصل إلى جميع العقارات.",
      settingReadOnly: "يمكن للمدير تغيير هذا.",
      awaitingInspection: "بانتظار الفحص",
    },
    maintenance: {
      heading: "الصيانة في {property}",
      newRequest: "طلب جديد",
      requestsTab: "الطلبات",
      settingsTab: "الإعدادات",
      statOpen: "مفتوحة",
      statUrgent: "عاجلة",
      statOutOfOrder: "خارج الخدمة",
      statDone: "منجزة خلال 30 يومًا",
      reference: "MT-{number}",
      bedInRoom: "السرير {bed} · {room}",
      outOfOrder: "خارج الخدمة",
      backOn: "يعود {date}",
      overdueSince: "كان يُفترض أن يعود {date}",
      notAssigned: "غير مُسنَد",
      noLongerHere: "{name} (لم يعد في هذا العقار)",
      formerStaff: "موظف سابق",
      emptyColumn: "لا شيء هنا",
      noRequestsTitle: "لا طلبات في {property}",
      noRequestsDescription:
        "عندما يتعطل شيء، أبلغ عنه هنا أو من شاشة الغرف. يمكن لأي شخص في العقار الإبلاغ.",
      readOnly:
        "يمكنك رؤية كل الطلبات. نقلها وإسنادها وإلغاؤها يتطلب صلاحية إدارة الصيانة.",
      filterPriority: "الأولوية",
      filterAssignee: "المُسنَد إليه",
      allPriorities: "كل الأولويات",
      everyone: "الجميع",
      unassigned: "غير مُسنَدة",
      outOfOrderOnly: "خارج الخدمة فقط",
      showCancelled: "إظهار الملغاة",
      moveTo: "نقل إلى {state}",
      cardActions: "إجراءات MT-{number}",
      openRequest: "فتح MT-{number}",
      reportedBy: "أبلغ عنه {who}",
      reportedOn: "تاريخ الإبلاغ: {when}",
      where: "المكان",
      details: "التفاصيل",
      noDetails: "لم تُذكر تفاصيل.",
      assignee: "مُسنَد إلى",
      priority: "الأولوية",
      state: "الحالة",
      cancelReason: "سبب الإلغاء",
      outOfOrderSince: "منذ {when}",
      heldAfterDone:
        "تم الإنجاز، وتبقى الغرفة خارج الخدمة حتى يعيدها أحدهم إلى الخدمة.",
      assign: "إسناد",
      reopen: "إعادة فتح",
      cancelRequest: "إلغاء الطلب",
      cancelTitle: "إلغاء MT-{number}؟",
      cancelHint:
        "ألغِ فقط ما أُبلغ عنه خطأً أو ما ليس عطلًا. وإذا أُصلح شيء فانقله إلى «منجز» بدلًا من ذلك.",
      reason: "السبب",
      reasonPlaceholder: "أُبلغ عنه مرتين",
      keep: "الإبقاء عليه",
      takeOutOfOrder: "إخراج الغرفة من الخدمة",
      takeOutHint:
        "لن يتمكن المكتب الأمامي من بيعها أو تسجيل دخول أي شخص إليها حتى تعود إلى الخدمة.",
      expectedBack: "العودة المتوقعة (اختياري)",
      returnToService: "إعادة إلى الخدمة",
      returnHint: "تصبح الغرفة متاحة مجددًا. ولا تعود أنظف مما كانت عليه.",
      note: "ملاحظة (اختيارية)",
      notePlaceholder: "تم الفحص ويعمل",
      reportTitle: "الإبلاغ عن مشكلة",
      reportDescription:
        "يمكن لأي شخص في العقار الإبلاغ. يراه فريق الصيانة فورًا.",
      whatIsWrong: "ما المشكلة؟",
      whatPlaceholder: "مصرف الدش مسدود",
      moreDetails: "التفاصيل (اختيارية)",
      unit: "الغرفة أو السرير",
      chooseUnit: "اختر غرفة أو سريرًا",
      howUrgent: "ما مدى الاستعجال؟",
      assignTo: "إسناد إلى",
      decideLater: "القرار لاحقًا",
      outOfOrderSwitch: "إخراجها من الخدمة حتى تُصلح",
      unitBlocked: "هذه الغرفة محجوبة، فهي لا تُباع أصلًا.",
      alreadyOut: "خارج الخدمة بالفعل",
      send: "إرسال الطلب",
      saving: "جارٍ الحفظ…",
      save: "حفظ",
      close: "إغلاق",
      impactTitle: "هناك من يتأثر",
      impactInHouse: "{guest} يقيم في {unit} حتى {date}.",
      impactInHouseOpen: "{guest} يقيم في {unit}.",
      impactBooking: "{guest} محجوز في {unit} ابتداءً من {from}.",
      aGuest: "ضيف",
      impactHint: "لن يُلغى أو يُنقل أي شيء. سيحتاج المكتب الأمامي إلى نقلهم.",
      confirmOutOfOrder: "إخراجها من الخدمة على أي حال",
      reported: "أُرسل الطلب MT-{number}.",
      saved: "تم الحفظ.",
      returned: "عادت الغرفة إلى الخدمة.",
      heldElsewhere: "أُفرج عنها، وما زال طلب آخر يبقي الغرفة خارج الخدمة.",
      stillOut:
        "تم الإنجاز. تبقى الغرفة خارج الخدمة حتى يؤكد ذلك من يملك صلاحية إعادة الغرف.",
      refused: "لم يتم ذلك. تعرض الصفحة الآن الوضع الحالي.",
      invalid: "هناك خطأ في النموذج.",
      stale: "نقل شخص آخر هذا الطلب أولًا. حالته الآن {state}.",
      blocked: "هذه الغرفة محجوبة، فلا يمكن إخراجها من الخدمة.",
      needsAssignee:
        "أسند الطلب إلى شخص أولًا. يطلب هذا العقار إسنادًا قبل بدء العمل.",
      outOfReach: "هذا الشخص لا يعمل في هذا العقار.",
      needsReturnPermission:
        "إعادة الغرفة إلى الخدمة تتطلب صلاحية إخراج الغرف من الخدمة.",
      settingsTitle: "كيف تعمل الصيانة هنا",
      settingsHint:
        "يتبع العقار مؤسسته ما لم يحدد غير ذلك. ينطبق التغيير على الإجراء التالي، لا على ما هو خارج الخدمة بالفعل.",
      assigneeRequired: "يُسند الطلب إلى شخص قبل بدء العمل",
      whenReturns: "تعود الغرفة إلى الخدمة",
      onDone: "عند إنجاز طلبها",
      onConfirmation: "فقط عندما يؤكد أحدهم",
      returnsAs: "تعود بحالة",
      organizationDefault: "الإعداد الافتراضي للمؤسسة",
      thisProperty: "هذا العقار",
      useDefault: "استخدام إعداد المؤسسة ({value})",
      yes: "نعم",
      no: "لا",
      settingRefused: "لم يُحفظ الإعداد.",
      defaultNeedsReach:
        "تغيير الإعداد الافتراضي يتطلب الوصول إلى كل العقارات.",
      settingReadOnly: "تغيير هذا يتطلب صلاحية إدارة الصيانة.",
      reportProblem: "الإبلاغ عن مشكلة",
      states: {
        new: "جديد",
        in_progress: "قيد التنفيذ",
        waiting_for_parts: "بانتظار قطع الغيار",
        done: "منجز",
        cancelled: "ملغى",
      },
      priorities: {
        urgent: "عاجل",
        this_week: "هذا الأسبوع",
        can_wait: "يمكن أن ينتظر",
      },
      returnAs: {
        dirty: "متسخة",
        clean: "نظيفة",
        inspected: "مفحوصة",
      },
    },

    auditLog: "سجل التدقيق",
    auditLogFor: "آخر الإجراءات في",
    allRecords: "كل السجلات",
    noAuditTitle: "لا توجد سجلات بعد",
    noAuditDescription:
      "يظهر هنا أي تسجيل وصول أو مغادرة أو رسم أو إلغاء فور حدوثه.",
    when: "متى",
    what: "ماذا",
    who: "من",
    why: "لماذا",
    subject: "الموضوع",
    context: "التفاصيل",
    contextKey: "الحقل",
    contextValue: "القيمة",
    noContext: "لا يحمل هذا السجل تفاصيل إضافية.",
    you: "أنت",
    noReason: "لا يلزم سبب",
    actorUnnamed: "عضو فريق معرَّف بالمعرّف",
    auditAction: {
      reservation: {
        created: "تم أخذ حجز",
        checked_in: "تم تسجيل الوصول",
        check_in_reversed: "تم سحب تسجيل الوصول",
      },
      stay: { checked_out: "تم تسجيل المغادرة" },
      folio: {
        charge_posted: "تم إدراج رسم",
        line_reversed: "تم عكس بند",
        closed: "تم إغلاق الفوليو",
      },
      staff: {
        invited: "تمت دعوة عضو فريق",
        role_changed: "تم تغيير الدور",
        property_assigned: "تم التعيين في منشأة",
        property_unassigned: "تم إلغاء التعيين من منشأة",
        revoked: "تم إلغاء العضوية",
        revoke_undone: "تم التراجع عن إلغاء العضوية",
        role_defined: "تم تعريف دور",
        role_retired: "تم سحب الدور",
        role_reinstated: "تمت إعادة الدور",
      },
      unit: {
        added: "تمت إضافة وحدة",
        blocked: "تم إغلاق الوحدة",
        unblocked: "تم فتح الوحدة",
        taken_out_of_order: "أُخرجت من الخدمة",
        returned_to_service: "أُعيدت إلى الخدمة",
      },
      housekeeping: {
        status_changed: "تم تغيير حالة الغرفة",
        inspection_set: "تم تغيير إعداد الفحص بعد التنظيف",
      },
      maintenance_request: {
        reported: "أُبلغ عن مشكلة",
        moved: "نُقل الطلب",
        cancelled: "أُلغي الطلب",
        assigned: "أُسند الطلب",
        prioritised: "تغيرت الأولوية",
        hold_released: "أُفرج عن الغرفة وما زال طلب آخر يحجزها",
      },
      maintenance_setting: {
        changed: "تغير إعداد الصيانة",
      },
    },
    auditSubject: {
      reservation: "حجز",
      stay: "إقامة",
      folio: "فوليو",
      membership: "عضوية",
      role: "دور",
      property: "منشأة",
      accommodation_unit: "وحدة إقامة",
      organization: "المؤسسة",
      maintenance_request: "طلب صيانة",
    },
    table: {
      results:
        "{n, plural, zero {لا نتائج} one {نتيجة واحدة} two {نتيجتان} few {# نتائج} many {# نتيجة} other {# نتيجة}}",
      capped: "(أحدث {n, number} من {of, number})",
      cappedHint: "البحث والفلاتر تعمل على الصفوف المحمّلة فقط.",
      perPage: "لكل صفحة",
      page: "صفحة {n, number} من {of, number}",
      first: "الصفحة الأولى",
      previous: "السابق",
      next: "التالي",
      last: "الصفحة الأخيرة",
      clearFilters: "إزالة الفلاتر",
      clearFilter: "إزالة الفلتر",
      columns: "الأعمدة",
      visibleColumns: "الأعمدة الظاهرة",
      search: "بحث",
      searchBy: "ابحث في {columns}",
      selectAllRows: "تحديد كل الصفوف",
      selectRow: "تحديد الصف",
      selectedCount:
        "{n, plural, zero {لا شيء محدد} one {واحدة محددة} two {اثنتان محددتان} few {# محددة} many {# محددة} other {# محددة}}",
      clearSelection: "إلغاء التحديد",
      noMatches: "لا نتائج مطابقة للفلاتر.",
      noRows: "لا توجد بيانات بعد.",
    },
    navigation: {
      today: "اليوم",
      "front-office": "المكتب الأمامي",
      reservations: "الحجوزات",
      rooms: "الغرف والأسرّة",
      arrivals: "الوصول",
      departures: "المغادرة",
      "guest-experience": "تجربة الضيف",
      housekeeping: "خدمة الغرف",
      maintenance: "الصيانة",
      "food-and-beverage": "الأطعمة والمشروبات",
      inventory: "المخزون",
      finance: "المالية",
      people: "الفريق",
      analytics: "التحليلات",
      configuration: "الإعدادات",
      "audit-log": "سجل التدقيق",
    },
    screenSummary: {
      "guest-experience": "طلبات الضيوف والمقيمين والإعلانات ومتابعة الخدمة.",
      housekeeping: "جاهزية الوحدات وجدول التنظيف وتوزيع المهام.",
      "food-and-beverage": "خطط الوجبات والمنافذ وسجلات الاستهلاك.",
      inventory: "حركات المخزون والجرد والمشتريات.",
      people: "سجلات الموظفين والورديات والصلاحيات.",
      analytics: "تقارير الإشغال والإيرادات والتشغيل.",
      configuration: "إعدادات المؤسسة والمنشأة والوحدات والصلاحيات.",
    },
    planned: "مخطط له",
    handoverLabel: "ملاحظة التسليم لهذه الشاشة",
    notEntitledTitle: "هذه الوحدة غير مشمولة في اشتراكك",
    notEntitledDescription:
      "تظهر هنا عندما تشترك مؤسستك فيها ويتم تفعيلها في المنشأة.",
  },
};
