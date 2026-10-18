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
  today: string;
  propertySwitcher: string;
  /** The switcher's label when the URL names a Property it does not list. */
  chooseProperty: string;
  /** Shown to an Owner while a Subscription is past due (ADR 0040). */
  billingNotice: {
    title: string;
    description: string;
  };
  mainNavigation: string;
  sections: string;
  breadcrumb: string;
  back: string;
  collapse: string;
  expand: string;
  workspaceBadge: string;
  account: string;
  organization: string;
  property: string;
  noPropertyTitle: string;
  noPropertyDescription: string;
  signInSummary: string;
  /** The sign-in screen's slogan: large and light, in a serif italic — an
      upright sans in Arabic, which has no italic. Written in sentence case. */
  authSlogan: string;
  authSubSlogan: string;
  welcomeBack: string;
  email: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  signIn: string;
  signingIn: string;
  signInFailed: string;
  /** The auth route's rate limit answered 429 — not a wrong password. */
  signInThrottled: string;
  /** A 5xx, or no answer at all. */
  signInUnavailable: string;

  challengeTitle: string;
  challengeSummary: string;
  code: string;
  verify: string;
  challengeFailed: string;
  /**
   * The second-factor challenge is spent — five wrong codes, or it timed out —
   * and only a new sign-in starts another. Shown back at the password step.
   */
  challengeExpired: string;

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
  /** Finance is off at the Property named, or at every one the viewer reaches. */
  noFinanceTitle: string;
  noFinanceDescription: string;
  noArrivalsTitle: string;
  noArrivalsDescription: string;
  openEnded: string;
  checkIn: string;
  checkingIn: string;
  checkedIn: string;
  unitUnavailable: string;
  unitOccupied: string;
  unitNotInService: string;
  roomNotReady: string;
  checkInAnyway: string;
  notNow: string;
  ready: string;
  notReady: string;
  checkInRefused: string;
  /** A booking whose first business date has not come (CI-S1-07). */
  checkInTooEarly: string;

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
  checkInDayClosed: string;
  /** The Guest has been moved since check-in, so it is corrected, not withdrawn. */
  checkInMoved: string;
  stayType: Record<"guest" | "resident", string>;
  unitType: Record<"room" | "bed" | "apartment" | "suite", string>;
  reservationStatus: Record<
    | "requested"
    | "confirmed"
    | "cancelled"
    | "no_show"
    | "checked_in"
    | "checked_out",
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
  awaitingConfirmation: string;
  occupiedDueOut: string;
  occupied: string;
  occupiedOverstay: string;
  cancelBooking: string;
  cancelBookingTitle: string;
  cancelBookingSummary: string;
  noShowTitle: string;
  noShowSummary: string;
  markNoShow: string;
  keepBooking: string;
  endBookingRefused: string;
  saving: string;
  checkInBlocked: Record<
    "not_confirmed" | "unit_blocked" | "unit_out_of_service" | "unit_occupied",
    string
  >;
  checkOutFor: string;
  checkOutTitle: string;
  checkOutSummary: string;
  confirmCheckOut: string;
  keepInHouse: string;
  plannedDeparture: string;
  plannedFor: string;
  noFolio: string;
  reviewFolio: string;
  checkOutEarlyAcknowledge: string;
  checkOutEarlyRequired: string;
  checkOutBalanceReason: string;
  checkOutBalanceHint: string;
  /** The check-out review's label for nights no close has charged (ADR 0038). */
  checkOutNightsToCharge: string;
  /** ICU plural on `count` nights; `{amount}` formatted. */
  checkOutPendingNights: string;
  checkOutUnpriced: string;
  /** The balance label once check-out's own nights are in it. */
  balanceAfterCheckOut: string;
  checkOutBalanceReasonRequired: string;
  checkOutFolioChanged: string;
  departuresViews: string;
  inHouseAt: string;
  departuresDue: string;
  departuresInHouse: string;
  nobodyInHouseTitle: string;
  nobodyInHouseDescription: string;
  noGuestRecorded: string;
  walkIn: string;
  showOnRoomMap: string;
  noDeparturesTitle: string;
  noDeparturesDescription: string;
  /** The departures screen's list of who has already gone today. */
  leftToday: string;
  leftAt: string;
  nobodyLeftYet: string;
  readiness: string;
  reservation: string;
  roomAndBed: string;
  notAssigned: string;
  outOfOrder: string;
  daysLate: string;
  credit: string;
  moreActionsFor: string;
  openFolio: string;
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
  copyReference: string;
  referenceCopied: string;
  dueToday: string;
  viewDetails: string;
  reservationDetails: string;
  stayTimeline: string;
  contactDetails: string;
  financialDetails: string;

  /**
   * Staff and permissions.
   *
   * `awaitingPassword` rather than "pending": the membership is not pending —
   * it is active and the person simply has not set a password yet. Calling it
   * pending on a screen would teach the wrong model of the thing.
   */
  /** The page behind an invitation link (PEOPLE-01). */
  acceptInvitation: {
    /** `{organization}`, `{role}`. */
    summary: string;
    title: Record<"set_password" | "sign_in" | "accept", string>;
    name: string;
    passwordHint: string;
    signInHint: string;
    working: string;
    goToSignIn: string;
    submit: Record<"set_password" | "sign_in" | "accept", string>;
    errors: Record<
      | "weak_password"
      | "throttled"
      | "account_exists"
      | "unavailable"
      | "secondStep",
      string
    >;
    refused: Record<
      | "unknown"
      | "expired"
      | "accepted"
      | "withdrawn"
      | "membership_revoked"
      | "other_account",
      { title: string; body: string; next: string }
    >;
  };
  staff: {
    search: string;
    /** ICU plural on `count`. */
    showRevoked: string;
    /** `{query}`. */
    noMatch: string;
    showAll: string;
    /** `{until}`: the time a revoke can be undone until. */
    undoUntil: string;
    /** `{hours}`. */
    undoOver: string;
    linkNoLonger: string;
    renewLink: string;
    addBack: string;
    done: string;
    chooseRole: string;
    everyProperty: string;
    reachesNothingWarning: string;
    roleDescriptions: Record<
      "owner" | "manager" | "front_desk" | "housekeeping" | "finance",
      string
    >;
    copyLink: string;
    linkCopied: string;
    copyFailed: string;
    linkNotSent: string;
    showSection: string;
    allSections: string;
    sections: Record<
      "frontDesk" | "money" | "rooms" | "guests" | "people" | "setup",
      string
    >;
    revenueGateNote: string;
    allowed: string;
    notAllowed: string;
    /** ICU plurals on `count` roles and `people`. */
    unsavedRoles: string;
    discardChanges: string;
    saveChanges: string;
    confirmSaveTitle: string;
    /** `{roles}`. */
    confirmSaveRoles: string;
    confirmSaveNobody: string;
    /** ICU plural on `people`. */
    confirmSavePeople: string;
    /** `{role}`. */
    confirmRetireTitle: string;
    retireBody: string;
    /** `{role}`, ICU plural on `count`. */
    retireHeld: string;
    startFrom: string;
    startFromPlaceholder: string;
    /** `{permissions}`. */
    confirmRoleGains: string;
    confirmRoleLosses: string;
    hrPointer: string;
    hrPointerLink: string;
    /** What each action on a membership says before it is done (PEOPLE-02). */
    membership: {
      revoke: Record<
        "title" | "body" | "keeps" | "undo" | "self" | "confirm",
        string
      >;
      restore: Record<"title" | "body" | "until" | "confirm", string>;
      renew: Record<"title" | "body" | "done" | "confirm", string>;
      readd: Record<"title" | "body" | "done" | "confirm", string>;
    };
    rosterOf: string;
    screenSummary: string;
    readOnly: string;
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
    aboveYou: string;
    active: string;
    awaitingPassword: string;
    revoked: string;
    revoke: string;
    undoRevoke: string;
    reachesNothing: string;
    /** An organization-wide member reaches every Property, whatever is assigned. */
    reachesEverywhere: string;
    alreadyAMember: string;
    refused: string;
    lastAdministrator: string;
    roleIsHeld: string;
    confirmRoleTitle: string;
    confirmRoleChange: string;
    confirmRoleSessions: string;
    confirmRoleSelf: string;
    confirmRoleSelfLosesAccess: string;
    confirmRoleConfirm: string;
    confirmRoleClose: string;
    roleChangedMeanwhile: string;
    roleRetired: string;
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
      | "cancel"
      | "amend"
      | "closeDay"
      | "manageFolio"
      | "postCharge"
      | "reverseCharge"
      | "postPayment"
      | "reversePayment"
      | "viewLedger"
      | "administerStaff"
      | "defineRoles"
      | "configureAccommodation"
      | "updateHousekeeping"
      | "reportMaintenance"
      | "manageMaintenance"
      | "takeOutOfOrder"
      | "manageEquipment"
      | "readAudit"
      | "manageConfiguration"
      | "manageRates"
      | "readDataExports"
      | "createDataExports"
      | "createServiceRequests"
      | "manageServiceRequests"
      | "viewHr"
      | "manageHr"
      | "viewIntegrations"
      | "manageIntegrations"
      | "manageBranding",
      string
    >;
    emptyRosterTitle: string;
    emptyRosterDescription: string;
    roles: Record<
      "owner" | "manager" | "front_desk" | "housekeeping" | "finance",
      string
    >;
  };
  reservationsViews: string;
  reservationsTab: Record<
    "all" | "arriving" | "inHouse" | "departing" | "upcoming",
    string
  >;
  reservationsTabEmpty: Record<
    "arriving" | "inHouse" | "departing" | "upcoming",
    string
  >;
  reservationsTabEmptyHint: string;
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
  /** Shown instead of `departureHint` while the stay type is Guest (RG-S1-11). */
  departureRequiredHint: string;
  /** Why New reservation is disabled when no Unit can be sold (RG-S3-04). */
  noBookableUnit: string;
  openRooms: string;
  /** `{price}`: one night of the chosen Unit's kind, formatted (ADR 0038). */
  quotePerNight: string;
  /** ICU plural on `count` nights; `{total}` formatted. */
  quoteStay: string;
  /** `{type}`: the kind of Unit that has no price. */
  quoteUnpriced: string;
  quoteResident: string;
  /** A booking's own price per night on the list; `{price}` formatted. */
  bookedPerNight: string;
  bookedUnpriced: string;
  /** The reservations list's price column. */
  priceColumn: string;
  /** One field for arrival and departure; the halves keep those names. */
  stayDates: string;
  bookingAddDate: string;
  bookingOpenEnded: string;
  bookingPickArrival: string;
  bookingPickDeparture: string;
  bookingPickDepartureRequired: string;
  /** ICU plural on `count`. */
  stayNights: string;
  dateRangeClear: string;
  dateRangeDone: string;
  chooseUnit: string;
  takeBooking: string;
  takingBooking: string;
  discardBooking: string;
  bookingUnavailable: string;
  unitBookedThoseNights: string;
  unitOccupiedThoseNights: string;
  chosenUnitTakenThoseNights: string;
  bookingAvailabilityUnknown: string;
  bookingOverOccupant: string;
  bookingPeriodInvalid: string;
  bookingGuestInvalid: string;
  bookingArrivalInvalid: string;
  expectedArrival: string;
  expectedAt: string;
  expectedArrivalHint: string;
  expectedArrivalNone: string;
  expectedArrivalPassed: string;
  guestRequired: string;
  guestEmailInvalid: string;
  bookingRefused: string;
  /** The price list changed while the booking dialog was open (RT-S2-12). */
  bookingPriceChanged: string;

  /** Changing a booking that has not arrived (amend-booking slice 1). */
  changeBooking: string;
  changeBookingSummary: string;
  changeBookingChecking: string;
  changeBookingLoadFailed: string;
  changeBookingUnitFree: string;
  /** A Unit another booking holds over those nights, with that booking's reference. */
  changeBookingUnitBooked: string;
  changeBookingUnitOccupied: string;
  /** The booking's own Unit, out of order or let by the bed since it was taken. */
  changeBookingUnitNotTaking: string;
  changeBookingCurrentNotTaking: string;
  changeBookingBlockedBooked: string;
  changeBookingBlockedOccupied: string;
  changeBookingBeforeToday: string;
  changeBookingPriceKept: string;
  /** Another kind of Unit: the old price and the new, per night. */
  changeBookingPriceChanges: string;
  changeBookingPriceNone: string;
  changeBookingNote: string;
  changeBookingNoteHint: string;
  saveChange: string;
  keepAsItWas: string;
  changeBookingChanged: string;
  changeBookingNotInService: string;
  changeBookingNoteInvalid: string;
  changeBookingNothing: string;
  changeBookingRefused: string;

  /** Changing an in-house Guest's departure (amend-booking slice 2). */
  changeDeparture: string;
  changeDepartureSummary: string;
  /** Extra nights, charged at the booking's own price as each one closes. */
  changeDepartureLonger: string;
  changeDepartureLongerUnpriced: string;
  /** A Resident's extra nights: billed by the month, never by the night (RT-S3-05). */
  changeDepartureLongerResident: string;
  changeDepartureShorter: string;
  changeDepartureOpen: string;
  /** A Guest's departure cleared: only a Resident's Stay may be open-ended. */
  changeDepartureNeedsEnd: string;
  changeDepartureBlocked: string;
  changeDepartureNothing: string;
  changeDepartureRefused: string;
  saveDeparture: string;
  /** Beside a Guest past their departure on Close the day (AB-S2-05). */
  extendStay: string;

  /** Moving an in-house Guest (amend-booking slice 3). */
  moveGuest: string;
  moveGuestSummary: string;
  moveGuestReason: string;
  moveReason: Record<"fault" | "upgrade" | "guest_request" | "other", string>;
  moveGuestUnitNotReady: string;
  /** The price a move keeps (AB-S3-05). */
  moveGuestPriceKept: string;
  moveGuestUnpriced: string;
  moveGuestNoteRequired: string;
  moveGuestNotReady: string;
  moveGuestRefused: string;

  folios: string;
  foliosAt: string;
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
  addPayment: string;
  paymentMethod: string;
  paymentMethods: Record<"cash" | "card" | "bank_transfer" | "other", string>;
  paymentRefused: string;
  amountInvalid: string;
  reverse: string;
  reversing: string;
  reversed: string;
  /** A room night on a Folio (ADR 0038); `{date}` the night it is for. */
  roomNightLine: string;
  reverseReason: string;
  reverseRefused: string;
  closeFolio: string;
  closing: string;
  closeRefused: string;
  folioClosedNote: string;
  /** Why an open Folio offers no Close while its Guest is in house (FO-S5-01). */
  folioInHouseNote: string;

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
  /** Headings and columns, where "(optional)" belongs to the form alone. */
  buildingColumn: string;
  floorColumn: string;
  floorNumber: string;
  noFloor: string;
  bedCount: string;
  sleeps: string;
  tonightColumn: string;
  unitActions: string;
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
  statReserved: string;
  nextArrivalOn: string;
  outOfOrderBeds: string;
  blockedStatus: string;

  /** The Configuration screen (ADR 0036). */
  configuration: {
    subtitle: string;
    sections: string;
    organizationTitle: string;
    organizationHint: string;
    organizationName: string;
    organizationNeedsReach: string;
    propertyTitle: string;
    propertyHint: string;
    propertyName: string;
    currency: string;
    currencyFixed: string;
    searchCurrency: string;
    noCurrency: string;
    timeTitle: string;
    timeHint: string;
    timezone: string;
    searchTimezone: string;
    noTimezone: string;
    cutoff: string;
    businessDateNow: string;
    businessDateAfter: string;
    businessDateForward: string;
    businessDateBack: string;
    housekeepingTitle: string;
    modulesTitle: string;
    modulesHint: string;
    elsewhereTitle: string;
    elsewhereHint: string;
    roomsHint: string;
    peopleHint: string;
    save: string;
    discard: string;
    saving: string;
    saved: string;
    unchanged: string;
    refused: string;
    stale: string;
    currencyFixedRefused: string;
    closedDay: string;
    invalid: string;
    invalidName: string;
    invalidTimezone: string;
    invalidCurrency: string;
    invalidCutoff: string;
    readOnly: string;
    fields: Record<
      "name" | "timezone" | "currency" | "businessDateCutoff",
      string
    >;
  };

  /** The Integrations screen: webhook endpoints and failed deliveries (ADR 0045). */
  integrations: {
    subtitle: string;
    endpointsCount: string;
    deliveringCount: string;
    failingCount: string;
    openFailuresCount: string;
    endpointsTitle: string;
    endpointsDescription: string;
    noEndpointsTitle: string;
    noEndpointsDescription: string;
    noEndpointsReadOnly: string;
    readOnly: string;
    addEndpoint: string;
    addTitle: string;
    addDescription: string;
    nameLabel: string;
    namePlaceholder: string;
    urlLabel: string;
    urlPlaceholder: string;
    urlHint: string;
    eventsLabel: string;
    events: {
      reservation_created: string;
      reservation_cancelled: string;
      reservation_no_show: string;
      stay_checked_in: string;
      stay_checked_out: string;
      folio_line_posted: string;
    };
    register: string;
    registering: string;
    secretTitle: string;
    secretWarning: string;
    secretUse: string;
    secretCopy: string;
    secretCopied: string;
    secretDone: string;
    invalid: {
      name: { empty: string; too_long: string };
      url: {
        invalid: string;
        too_long: string;
        not_https: string;
        has_credentials: string;
        blocked_host: string;
      };
      events: { none: string; unknown: string };
    };
    refused: {
      not_permitted: string;
      duplicate_url: string;
      too_many_endpoints: string;
      test_in_flight: string;
      unavailable: string;
      reason_required: string;
    };
    failed: string;
    health: { delivering: string; failing: string; unused: string };
    lastDelivered: string;
    neverDelivered: string;
    queued: string;
    openFailures: string;
    sends: string;
    sendTest: string;
    testEvent: string;
    sendingTest: string;
    testQueued: string;
    remove: string;
    removing: string;
    removeTitle: string;
    removeDescription: string;
    removeConfirm: string;
    dismiss: string;
    failedOperationsTitle: string;
    failedOperationsDescription: string;
    noFailedOperations: string;
    columns: {
      endpoint: string;
      whatHappened: string;
      attempts: string;
      nextAttempt: string;
      actions: string;
      closed: string;
      reason: string;
    };
    lastAttemptAt: string;
    operationStatuses: {
      failed: string;
      retrying: string;
      resolved: string;
      cancelled: string;
    };
    dueNow: string;
    noMoreAttempts: string;
    failures: {
      http_error: string;
      timeout: string;
      connection_failed: string;
      tls_failed: string;
      blocked_address: string;
      invalid_target: string;
      redirect_refused: string;
      source_mismatch: string;
    };
    httpStatus: string;
    receiverSaid: string;
    retry: string;
    retrying: string;
    cancelOperation: string;
    resolveOperation: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    reasonHint: string;
    reasonInvalid: { reason_too_short: string; reason_too_long: string };
    cancelTitle: string;
    cancelDescription: string;
    cancelConfirm: string;
    resolveTitle: string;
    resolveDescription: string;
    resolveConfirm: string;
    failureAdvice: {
      http_error: string;
      timeout: string;
      connection_failed: string;
      tls_failed: string;
      blocked_address: string;
      invalid_target: string;
      redirect_refused: string;
      source_mismatch: string;
    };
    othersNotAvailable: string;
    noPermissionTitle: string;
    noPermissionDescription: string;
    addressPartHidden: string;
    /** ICU plural on `count`: deliveries due more than five minutes ago and not sent. */
    overdue: string;
    technicalDetails: string;
    closedFailuresTitle: string;
    closedFailuresDescription: string;
    noClosedFailures: string;
    /** `{count}`: how many failures are open. */
    tabOpen: string;
    tabClosed: string;
    failuresViewLabel: string;
    pagesLabel: string;
    /** `{from}`, `{to}` and `{total}`. */
    showing: string;
    newer: string;
    older: string;
    closedByRanza: string;
    closedByYou: string;
    closedByColleague: string;
    closedReasonDelivered: string;
    closedReasonEndpointRemoved: string;
    retryAll: string;
    retryAllTitle: string;
    retryAllDescription: string;
    retryAllConfirm: string;
    /** ICU plural on `count`. */
    retriedAll: string;
  };

  /**
   * The Branding screen (blueprint 8, ADR 0046): the colour and the logo the
   * Guest/Resident Portal is drawn in. `{ratio}` is a contrast ratio already
   * rounded to one decimal.
   */
  branding: {
    /** `{organization}`. */
    subtitle: string;
    colorTitle: string;
    colorHint: string;
    colorLabel: string;
    colorPicker: string;
    colorEmpty: string;
    /** What a record names a colour or a logo that was not set. */
    defaultTheme: string;
    colorInvalid: string;
    /** `{foreground}`: the word below for the text on the colour; `{ratio}` its contrast. */
    colorReadable: string;
    /** `{ratio}`: the colour's own contrast against white, where it reads. */
    colorTextSame: string;
    /** `{shade}`, a hex value, and `{ratio}`: the shade's contrast against white. */
    colorTextDarker: string;
    swatchFill: string;
    swatchText: string;
    foreground: Record<"white" | "black", string>;
    logoTitle: string;
    logoHint: string;
    logoLabel: string;
    logoCurrent: string;
    logoNone: string;
    logoRemove: string;
    logoKeep: string;
    logoWillBeRemoved: string;
    logoErrors: Record<
      | "empty"
      | "too_large"
      | "svg"
      | "unsupported_type"
      | "corrupt"
      | "too_small"
      | "dimensions_too_large",
      string
    >;
    previewTitle: string;
    previewHint: string;
    previewHeader: string;
    previewButton: string;
    previewLink: string;
    previewActive: string;
    save: string;
    discard: string;
    saving: string;
    saved: string;
    reset: string;
    resetDone: string;
    refused: string;
    error: string;
    needsReachTitle: string;
    needsReach: string;
    failedTitle: string;
    failedDescription: string;
    retry: string;
  };

  /** The Data Export screen (Blueprint 7.5, Phase 1 data lifecycle). */
  dataExport: {
    heading: string;
    subtitle: string;
    tabs: {
      exports: string;
      schedules: string;
      newExport: string;
    };
    newExportTitle: string;
    newExportDescription: string;
    datasetsTitle: string;
    datasetsDescription: string;
    datasets: {
      residents_guests: string;
      reservations_stays: string;
      rooms_beds: string;
      folios_payments: string;
      audit_log: string;
    };
    datasetDescriptions: {
      residents_guests: string;
      reservations_stays: string;
      rooms_beds: string;
      folios_payments: string;
      audit_log: string;
    };
    formatTitle: string;
    formatDescription: string;
    requestButton: string;
    requesting: string;
    requestSuccess: string;
    requestFailed: string;
    scheduleTitle: string;
    scheduleDescription: string;
    scheduleName: string;
    scheduleNamePlaceholder: string;
    frequencyTitle: string;
    frequencies: {
      daily: string;
      weekly: string;
      monthly: string;
    };
    createScheduleButton: string;
    creatingSchedule: string;
    scheduleSuccess: string;
    scheduleFailed: string;
    recentExportsTitle: string;
    recentExportsDescription: string;
    schedulesTitle: string;
    schedulesDescription: string;
    noExports: string;
    noSchedules: string;
    tableHeaders: {
      requester: string;
      datasets: string;
      format: string;
      status: string;
      size: string;
      records: string;
      requestedAt: string;
      actions: string;
    };
    scheduleHeaders: {
      name: string;
      datasets: string;
      format: string;
      frequency: string;
      status: string;
      nextRun: string;
      actions: string;
    };
    statuses: {
      pending: string;
      processing: string;
      ready: string;
      failed: string;
      expired: string;
    };
    scheduleStatuses: {
      active: string;
      paused: string;
    };
    download: string;
    pause: string;
    resume: string;
    pausing: string;
    resuming: string;
    /** Why an export failed, by the code the database holds for it. */
    failures: {
      requester_not_permitted: string;
      too_large: string;
      worker_stopped: string;
      internal_error: string;
    };
    formats: {
      csv: { title: string; hint: string };
      json: { title: string; hint: string };
    };
    /** `{date}`: when a ready export stops being downloadable. */
    expiresOn: string;
    requestRefused: string;
    scheduleRefused: string;
    failedTitle: string;
    failedDescription: string;
    retry: string;
  };

  /** The Human Resources and Payroll screen (Blueprint 5.11, Phase 4). */
  hr: {
    heading: string;
    subtitle: string;
    tabs: {
      employees: string;
      rota: string;
      leave: string;
      payroll: string;
    };
    employees: {
      title: string;
      register: string;
      registerTitle: string;
      registerDescription: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      department: string;
      position: string;
      contract: string;
      since: string;
      grossPay: string;
      /** `{currency}`: what the Property pays in, already a code. */
      grossPayIn: string;
      iban: string;
      ibanHint: string;
      status: string;
      noEmployeesTitle: string;
      /** Says that employment records are kept apart from sign-in access. */
      noEmployeesDescription: string;
      unregisteredTitle: string;
      /** Says why a login with no employment record is not on the rota or in payroll. */
      unregisteredDescription: string;
      registerAsEmployee: string;
      /** `{email}`: the login the new record will be linked to. */
      registerForLogin: string;
      submit: string;
      submitting: string;
      cancel: string;
      contracts: {
        full_time: string;
        part_time: string;
        seasonal: string;
        fixed_term: string;
      };
      statuses: {
        active: string;
        terminated: string;
      };
      /** `{date}`: the last day of employment, already formatted. */
      leftOn: string;
      terminate: string;
      /** `{name}` */
      terminateTitle: string;
      /** Says that ending employment does not end access to the system. */
      terminateDescription: string;
      terminateDate: string;
      terminateConfirm: string;
      terminating: string;
    };
    rota: {
      title: string;
      hint: string;
      staffMember: string;
      today: string;
      shifts: {
        morning: string;
        evening: string;
        day: string;
        off: string;
      };
      shiftTimes: {
        morning: string;
        evening: string;
        day: string;
        off: string;
      };
    };
    leave: {
      title: string;
      requestLeave: string;
      requestLeaveTitle: string;
      staffMember: string;
      type: string;
      dates: string;
      days: string;
      status: string;
      actions: string;
      approve: string;
      decline: string;
      clashWarning: string;
      noLeaves: string;
      startsOn: string;
      endsOn: string;
      notes: string;
      notesPlaceholder: string;
      submit: string;
      submitting: string;
      cancel: string;
      employeeLeft: string;
      types: {
        annual: string;
        sick: string;
        unpaid: string;
        emergency: string;
        maternity: string;
      };
      statuses: {
        pending: string;
        approved: string;
        rejected: string;
      };
    };
    payroll: {
      period: string;
      /** `{amount}` and `{total}`, already formatted in the run's currency. */
      summaryGrossNet: string;
      gross: string;
      net: string;
      socialSecurity: string;
      incomeTax: string;
      stampDuty: string;
      approve: string;
      approving: string;
      approved: string;
      draft: string;
      previousPeriod: string;
      nextPeriod: string;
      /** `{period}`. */
      confirmTitle: string;
      /** `{count}` employees, `{currency}` a code, `{amount}` and `{total}` formatted. */
      confirmBody: string;
      /** Says the run locks, and that nothing yet reverses or revises one. */
      confirmLocked: string;
      confirm: string;
      cancel: string;
      /** `{date}`: when the run was approved, already formatted. */
      approvedOn: string;
      /** What approving covers: every employee of the Organization. */
      organizationWide: string;
      payslip: string;
      payslipTitle: string;
      paidTo: string;
      noBankAccount: string;
      downloadPdf: string;
      actions: string;
      /** The deductions are not approved figures (HR-S1-28). */
      placeholderTitle: string;
      placeholderBody: string;
      /** Shown instead of the run to somebody who does not reach every Property. */
      needsReach: {
        title: string;
        description: string;
      };
      blocked: {
        period_not_ended: string;
        no_employees: string;
        mixed_currency: string;
      };
    };
    /** What a command that did not happen says, by the module's own reasons. */
    outcomes: {
      invalid: {
        name: string;
        department: string;
        position: string;
        email: string;
        grossPay: string;
        currency: string;
        iban: string;
        period: string;
        dates: string;
        terminatedOn: string;
        shiftTime: string;
        request: string;
      };
      refused: {
        not_permitted: string;
        employee_terminated: string;
        already_terminated: string;
        already_registered: string;
        other_property: string;
        leave_overlap: string;
        leave_decided: string;
        payroll_needs_organization_reach: string;
        payroll_no_employees: string;
        payroll_mixed_currency: string;
        payroll_draft_exists: string;
        payroll_period_not_ended: string;
      };
      error: string;
    };
  };

  /**
   * The Rates section of the Configuration screen (ADR 0038): a nightly price
   * per kind of Unit.
   */
  rates: {
    title: string;
    hint: string;
    perNight: string;
    /** ICU plural on `count`: the Units of one kind a booking can be placed on. */
    units: string;
    noPrice: string;
    unpricedHint: string;
    /** `{currency}` the price was set in, `{property}` what the Property trades in now. */
    stale: string;
    /** `{currency}`: what a price is typed in. */
    invalid: string;
    readOnly: string;
    /** `{type}`: the kind of Unit, for the field's accessible name. */
    priceFor: string;
  };

  /**
   * The room calendar (RANZ-25). Grouped, so the screen's copy reads as one
   * block in each language and `useTranslations("roomCalendar")` scopes it.
   */
  roomCalendar: {
    subtitle: string;
    previous: string;
    next: string;
    today: string;
    goTo: string;
    chosenDay: string;
    length: string;
    lengthOption: string;
    floorFilter: string;
    allFloors: string;
    floorOption: string;
    noFloor: string;
    noBuilding: string;
    search: string;
    filters: string;
    filtersCount: string;
    showRequested: string;
    showDeparted: string;
    collapseAll: string;
    expandAll: string;
    overlapCount: string;
    bookedWhileBlockedCount: string;
    legend: string;
    requested: string;
    confirmed: string;
    inHouse: string;
    overdue: string;
    departed: string;
    overlap: string;
    clashes: string;
    bookedWhileBlocked: string;
    blocked: string;
    outOfService: string;
    gridLabel: string;
    roomColumn: string;
    freeRow: string;
    freeOn: string;
    expand: string;
    collapse: string;
    bedsTakenLabel: string;
    barLabel: string;
    barLabelOverdue: string;
    barOverdueCard: string;
    noGuestRecorded: string;
    noEndDate: string;
    refreshFailed: string;
    noRoomsTitle: string;
    noRoomsDescription: string;
    goToRooms: string;
    noMatchTitle: string;
    noMatchDescription: string;
    clearFilters: string;
    filteredNote: string;
    nothingBooked: string;
    failedTitle: string;
    failedDescription: string;
    retry: string;
    loading: string;
    goneTitle: string;
    goneNote: string;
    changedNote: string;
    overlapNote: string;
    clashNote: string;
    clashStayNote: string;
    clashesStay: string;
    windowFailed: string;
    blockedNote: string;
    overdueNote: string;
    arrives: string;
    arrived: string;
    /** The first night in this room, for a Guest moved into it (AB-S3-06). */
    inRoomSince: string;
    leaves: string;
    wasDue: string;
    daysLate: string;
    left: string;
    booked: string;
    nightsLabel: string;
    nightsSoFar: string;
    nights: string;
    stayType: string;
    reservationCode: string;
    roomStatus: string;
    roomReadiness: Record<
      "ready" | "awaiting_inspection" | "dirty" | "occupied",
      string
    >;
    guest: string;
    resident: string;
    balance: string;
    balanceAsOfCharge: string;
    laterNightsPost: string;
    folioClosed: string;
    open: Record<"arrivals" | "departures" | "reservations", string>;
    /** The short word a bar carries beside a warning's icon, when it fits. */
    barWord: Record<"overlap" | "bookedWhileBlocked" | "clashes", string>;
    typeFilter: string;
    allTypes: string;
    stateFilter: string;
    allStates: string;
    unitState: Record<
      "available" | "occupied" | "blocked" | "out_of_service",
      string
    >;
    /** Beneath the subtitle, for a viewer who may move bookings. */
    moveHint: string;
    /** On a bar the viewer may drag, in its tooltip. */
    dragHint: string;
    /** On the grip at the end of a bar. */
    resizeHint: string;
    /** On the outline a drag draws where the bar cannot go. */
    dropBlocked: string;
    /** The drawer's way to move a booking without a mouse. */
    moveAction: string;
    moveBooking: string;
    moveBookingSummary: string;
    confirmMove: string;
    moveFrom: string;
    moveTo: string;
    cannotMoveTitle: string;
    /** What the calendar already knows against a move; `{unit}` or `{guest}`. */
    moveConflict: Record<
      | "past"
      | "notSellable"
      | "blocked"
      | "outOfService"
      | "booked"
      | "occupied"
      | "leavesToday"
      | "ended"
      | "noBooking",
      string
    >;
  };
  /** The Today dashboard (docs/features/today-dashboard). */
  dashboard: {
    /** Greeting before noon, followed by the name. */
    greetingMorning: string;
    greetingAfternoon: string;
    greetingEvening: string;
    /** When the figures were read, {time}. */
    updated: string;
    /** A refresh failed; the figures are from {time}. */
    stale: string;
    /** Between midnight and the cutoff: the clock is on {date}, the Property still works the day shown. */
    workingDayStill: string;
    newBooking: string;
    attentionTitle: string;
    nothingNeedsAttention: string;
    attentionIncomplete: string;
    attentionMore: string;
    notReady: string;
    notReadyDetail: string;
    notReadyDirty: string;
    notReadyAwaitingInspection: string;
    notReadyOccupied: string;
    notReadyOutOfService: string;
    blocked: string;
    blockerNotConfirmed: string;
    blockerUnitBlocked: string;
    blockerUnitOutOfService: string;
    blockerUnitOccupied: string;
    overdue: string;
    overdueDetail: string;
    overdueLabel: string;
    leavesOwing: string;
    leavesOwingDetail: string;
    outOfService: string;
    outOfServiceDetail: string;
    openArrivals: string;
    openDepartures: string;
    openFolio: string;
    openBoard: string;
    openRooms: string;
    urgentRepair: string;
    dueBack: string;
    dueBackDetail: string;
    requestReference: string;
    openMaintenance: string;
    maintenanceTitle: string;
    openRequests: string;
    statusNew: string;
    statusInProgress: string;
    statusWaitingForParts: string;
    roomsOutOfOrder: string;
    arrivals: string;
    checkedIn: string;
    departures: string;
    checkedOut: string;
    leaveOverdue: string;
    occupancy: string;
    inHouseOf: string;
    expectedTonight: string;
    /** Between a figure and the whole it is of: 3 / 9, or 3 من 9 where a slash reads either way. */
    ofSeparator: string;
    noUnits: string;
    roomsReadyForArrivals: string;
    roomsNotReadyYet: string;
    toClean: string;
    awaitingInspection: string;
    readyRooms: string;
    arrivalsWaiting: string;
    arrivalRooms: string;
    owedOnDepartures: string;
    guests: string;
    openFolios: string;
    openBalance: string;
    overdueOwing: string;
    movements: string;
    tabArrivals: string;
    tabDepartures: string;
    stateReady: string;
    stateNotReady: string;
    stateBlocked: string;
    nights: string;
    openEnded: string;
    leavesToday: string;
    allArrivals: string;
    allDepartures: string;
    noArrivalsTitle: string;
    noArrivalsDescription: string;
    noDeparturesTitle: string;
    noDeparturesDescription: string;
    openReservations: string;
    cleanFirst: string;
    roomCount: string;
    priorityArrival: string;
    priorityInspect: string;
    priorityLeaving: string;
    priorityQueue: string;
    floor: string;
    noFloor: string;
    nothingToClean: string;
    rooms: string;
    ready: string;
    awaiting: string;
    dirty: string;
    roomsByFloor: string;
    floorReady: string;
    owing: string;
    largestBalances: string;
    allFolios: string;
    /** The largest-balances list when no open Folio is owed anything. */
    noBalances: string;
    noOwingTitle: string;
    noOwingDescription: string;
    sectionUnavailable: string;
    sectionUnavailableDescription: string;
    retry: string;
    nothingForRole: string;
    filterArrivalsToCome: string;
    filterOwing: string;
    filterOverdueOwing: string;
    filterInService: string;
    filterReady: string;
    filterAwaitingInspection: string;
    filterDirty: string;
    filterOutOfService: string;
    filterForArrival: string;
    filterCleanFirst: string;
    filterFloor: string;
    filterNoFloor: string;
    filterOpenFolios: string;
    filterShowAll: string;
    filterReadyCount: string;
    roomOccupiedNoMark: string;
    activityTitle: string;
    activityEmpty: string;
    openAuditLog: string;
    chargesTitle: string;
    chargesNote: string;
    openFinance: string;
    bookedTitle: string;
    bookedNote: string;
    bookedColNight: string;
    bookedColUnits: string;
    bookedColShare: string;
    bookedOf: string;
    openCalendar: string;
    stripTitle: string;
    stripAttention: string;
    stripUnread: string;
    stripPartial: string;
    allRoomsToClean: string;
    allOpenFolios: string;
    allOwing: string;
  };
  /** The Housekeeping screen (RANZ-28). */
  housekeeping: {
    subtitle: string;
    /** No Property the viewer may use housekeeping at, or not the one named. */
    unavailableTitle: string;
    unavailableDescription: string;
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
    /** Opens the booking in Change booking, in a new tab (AB-S1-17). */
    impactChangeBooking: string;
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
    equipmentTab: string;
    planTab: string;
    addEquipment: string;
    editEquipment: string;
    equipmentName: string;
    equipmentNamePlaceholder: string;
    category: string;
    categoryPlaceholder: string;
    whereIs: string;
    atRoom: string;
    atPlace: string;
    place: string;
    placePlaceholder: string;
    interval: string;
    intervalHint: string;
    lastServiced: string;
    nextService: string;
    notScheduled: string;
    neverServiced: string;
    retire: string;
    restore: string;
    retired: string;
    showRetired: string;
    noEquipmentTitle: string;
    noEquipmentDescription: string;
    equipmentReadOnly: string;
    noPlanTitle: string;
    noPlanDescription: string;
    daysOverdue: string;
    dueToday: string;
    inDays: string;
    everyMonths: string;
    createWorkOrder: string;
    workOrderOpen: string;
    workOrderTitle: string;
    service: string;
    equipment: string;
    noEquipmentChosen: string;
    noRoomChosen: string;
    chooseRoomOrEquipment: string;
    costTitle: string;
    cost: string;
    vendor: string;
    vendorPlaceholder: string;
    noCost: string;
    chargeTitle: string;
    chargeHint: string;
    guest: string;
    chooseGuest: string;
    amount: string;
    charge: string;
    noChargeable: string;
    reversedCharge: string;
    inHouseNow: string;
    leftOn: string;
    loading: string;
    chargeUnavailable: string;
    actions: string;
    change: string;
    conditions: Record<"working" | "due" | "overdue" | "fault", string>;
    states: Record<
      "new" | "in_progress" | "waiting_for_parts" | "done" | "cancelled",
      string
    >;
    priorities: Record<"urgent" | "this_week" | "can_wait", string>;
    returnAs: Record<"dirty" | "clean" | "inspected", string>;
  };

  analytics: {
    heading: string;
    subheading: string;
    rangeToday: string;
    range7d: string;
    range30d: string;
    rangeMonth: string;
    rangeSelectorLabel: string;
    occupancyRate: string;
    occupancyRateDesc: string;
    sellableUnits: string;
    occupiedNights: string;
    availableNights: string;
    roomRevenue: string;
    roomRevenueDesc: string;
    totalRevenue: string;
    adr: string;
    adrDesc: string;
    revPar: string;
    revParDesc: string;
    netPayments: string;
    netPaymentsDesc: string;
    financialsMaskedNotice: string;
    dailyBreakdownTitle: string;
    dailyBreakdownDesc: string;
    dateCol: string;
    occupiedUnitsCol: string;
    availableUnitsCol: string;
    occupancyCol: string;
    roomRevenueCol: string;
    paymentsBreakdownTitle: string;
    cash: string;
    card: string;
    bankTransfer: string;
    other: string;
    /** One month, explained (docs/features/analytics, slice 2). */
    month: {
      navigation: string;
      previousMonth: string;
      nextMonth: string;
      /** `{closed}` of `{total}` business days have closed. */
      monthToDate: string;
      openNote: string;
      /** `{date}`: the Property's business date today. */
      asOf: string;
      /** `{month}`: the month's name. */
      noActivityTitle: string;
      noActivityDescription: string;
      notFoundTitle: string;
      notFoundDescription: string;
      headline: string;
      occupancy: string;
      /** `{occupied}` of `{available}` nights. */
      occupancyArithmetic: string;
      occupancyNone: string;
      adr: string;
      /** `{revenue}` over `{nights}` charged Guest nights. */
      adrArithmetic: string;
      adrNone: string;
      revPar: string;
      /** `{revenue}` over `{nights}` available nights. */
      revParArithmetic: string;
      revParNone: string;
      /** The prior month's `{month}` and its figure `{value}`. */
      againstPrior: string;
      /** `{value}`: a signed number of percentage points. */
      pointsChange: string;
      /** `{month}`: the prior month, compared over the same elapsed days. */
      sameElapsedDays: string;
      noPrior: string;
      revenue: string;
      roomNightsCharged: string;
      corrections: string;
      netRoomRevenue: string;
      otherRevenue: string;
      totalRevenue: string;
      collected: string;
      revenueBooked: string;
      moneyCollected: string;
      owedChange: string;
      owedChangeNote: string;
      collectedByMethod: string;
      nights: string;
      availableNights: string;
      occupiedNights: string;
      guestNights: string;
      residentNights: string;
      residentNote: string;
      days: string;
      dayCol: string;
      occupiedCol: string;
      occupancyCol: string;
      revenueCol: string;
      openDay: string;
      notYetCharged: string;
      monthTotal: string;
      /** The month by unit type (docs/features/analytics, slice 3). */
      unitTypes: string;
      unitTypeCol: string;
      unitTypeNote: string;
      adrCol: string;
      /** Occupied nights with no room night charge, by reason. */
      uncharged: string;
      unchargedNote: string;
      unchargedNone: string;
      /** ICU plural on `n`. */
      unchargedNights: string;
      /** The close's own reasons (closeDay.notChargedReason), plus a Resident and a night not charged yet. */
      unchargedReason: Record<
        | "resident"
        | "unpriced"
        | "billing_unavailable"
        | "no_folio"
        | "folio_closed"
        | "currency"
        | "not_yet_charged",
        string
      >;
      /** One day opened from the table. `{date}`: the day, for the row's link. */
      showDay: string;
      dayDescription: string;
      dayOpenNote: string;
      dayStays: string;
      dayNoStays: string;
      dayCharged: string;
      nightCharged: string;
      noGuestName: string;
      dayCorrections: string;
      /** `{date}`: the business date the correction was posted on. */
      correctionPosted: string;
      /** The accessible name of the previous and next day controls. */
      dayNavigation: string;
      previousDay: string;
      nextDay: string;
    };
  };

  /** All Properties (docs/features/portfolio): every reached Property side by side. */
  portfolio: {
    /** `{organization}`. */
    subtitle: string;
    /** `{time}`: when the figures were read, in the working Property's zone. */
    asOf: string;
    listLabel: string;
    occupancyTitle: string;
    /** `{reporting}` of `{total}` Properties, when some withhold a figure. */
    coverage: string;
    notReporting: string;
    moneyOwedTitle: string;
    moneyOwedNote: string;
    maintenanceTitle: string;
    maintenanceNote: string;
    cardOccupancy: string;
    /** `{date}`: the Property's own business date. */
    businessDate: string;
    noSellableUnits: string;
    arrivals: string;
    departures: string;
    maintenance: string;
    moneyOwed: string;
    /** A figure the viewer's role keeps from them. */
    hidden: string;
    /** A figure whose module is off at that Property. */
    unavailable: string;
    withheld: string;
    moneyHiddenNotice: string;
    /** `{property}`. */
    open: string;
    oneTitle: string;
    /** `{property}`. */
    oneDescription: string;
    noneTitle: string;
    noneDescription: string;
    goToToday: string;
    tooLargeTitle: string;
    /** `{count}` reached and `{max}` compared at most. */
    tooLargeDescription: string;
    failedTitle: string;
    failedDescription: string;
    retry: string;
  };

  guestExperience: {
    heading: string;
    subheading: string;
    newRequest: string;
    allRequests: string;
    openRequests: string;
    resolvedRequests: string;
    title: string;
    details: string;
    category: string;
    priority: string;
    status: string;
    room: string;
    guest: string;
    assignee: string;
    unassigned: string;
    reportedAt: string;
    resolvedAt: string;
    actions: string;
    categories: Record<
      "housekeeping" | "maintenance" | "amenities" | "front_desk" | "other",
      string
    >;
    priorities: Record<"low" | "normal" | "high" | "urgent", string>;
    statuses: Record<"new" | "in_progress" | "resolved" | "cancelled", string>;
    markInProgress: string;
    resolve: string;
    cancel: string;
    reopen: string;
    cancelReason: string;
    cancelReasonPlaceholder: string;
    resolutionNotes: string;
    resolutionNotesPlaceholder: string;
    createDialogTitle: string;
    createDialogDesc: string;
    titlePlaceholder: string;
    detailsPlaceholder: string;
    selectCategory: string;
    selectPriority: string;
    selectRoom: string;
    noRoom: string;
    submit: string;
    cancelling: string;
    saving: string;
    emptyTitle: string;
    emptyDesc: string;
  };

  auditLog: string;
  auditLogFor: string;
  noAuditTitle: string;
  /**
   * Said to a Staff Member who holds `audit.read` at no Property they reach —
   * usually a role without the permission; occasionally a role with it and no
   * Property assigned, so the remedy names both. Giving them a role that has it
   * comes first: a shipped role cannot be edited, and the shipped Front desk
   * and Housekeeping roles are who mostly lands here. Not the Subscription copy: audit is not something an
   * Organization buys (ADR 0031).
   */
  auditNotPermittedTitle: string;
  auditNotPermittedDescription: string;
  /**
   * Said instead when the switcher names a Property the viewer cannot read the
   * log from while there is one they can: the refusal above would be untrue
   * for them. Since #63 a named Property no longer falls back to another one.
   */
  auditNotHereTitle: string;
  auditNotHereDescription: string;
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
  auditWhere: string;
  auditOrganizationWide: string;
  auditFilters: string;
  auditActionFilter: string;
  auditAnyAction: string;
  auditProperty: string;
  auditEveryProperty: string;
  auditFrom: string;
  auditTo: string;
  auditPeriod: string;
  auditFromEmpty: string;
  auditToEmpty: string;
  auditPickFrom: string;
  auditPickTo: string;
  /** ICU plural on `count`: the days a filter covers, both ends included. */
  auditSpanDays: string;
  auditPresetLast7: string;
  auditPresetLast30: string;
  auditPresetThisMonth: string;
  auditSearch: string;
  auditSearchHint: string;
  auditSearchTooShort: string;
  auditApply: string;
  auditClearFilters: string;
  auditOlder: string;
  auditNewest: string;
  /** How many records match the filters, across every page. */
  auditMatching: string;
  auditNoMatchesTitle: string;
  auditNoMatchesDescription: string;
  auditRecordMissingTitle: string;
  auditRecordMissingDescription: string;
  /** Said once under the list, because the times in it are not all one clock. */
  auditLocalTime: string;
  auditYes: string;
  auditNo: string;
  auditNone: string;
  /** Read aloud between a setting's old value and its new one. */
  auditChangedTo: string;
  /**
   * The inspection setting a Property had before it had one of its own: it
   * followed the Organization's. Written by the housekeeping module as
   * `default`, beside `on` and `off`, which reuse the Housekeeping screen's words.
   */
  auditInspectionFollowsOrganization: string;
  /**
   * What each context fact is called. Keyed on what the modules write, which
   * is why the keys are camelCase; a key this does not know shows as itself.
   */
  auditContext: Record<
    | "amountMinor"
    | "balanceMinor"
    | "totalGrossMinor"
    | "totalNetMinor"
    | "employeeId"
    | "leaveFrom"
    | "leaveTo"
    | "contractType"
    | "hasSystemAccess"
    | "terminatedOn"
    | "period"
    | "employeeCount"
    | "description"
    | "lineId"
    | "reversedLineId"
    | "reversalLineId"
    | "stayId"
    | "folioId"
    | "accommodationUnitId"
    | "guestId"
    | "guestCreated"
    | "startsOn"
    | "endsOn"
    | "from"
    | "to"
    | "role"
    | "added"
    | "removed"
    | "permissions"
    | "propertyIds"
    | "properties"
    | "propertyId"
    | "userId"
    | "name"
    | "names"
    | "key"
    | "holders"
    | "unitIds"
    | "unitType"
    | "capacity"
    | "building"
    | "floor"
    | "letByTheBed"
    | "hadBeenBlockedFor"
    | "status"
    | "previousStatus",
    string
  >;
  /**
   * What each recorded action is called, nested noun → verb rather than keyed
   * on the dotted name the modules write: next-intl splits a key on `.`, so a
   * flat `"folio.closed"` would be looked up as `folio` then `closed` and never
   * found. The literals are `KNOWN_ACTIONS` in `features/audit-log/actions.ts`.
   */
  auditAction: {
    reservation: Record<
      | "created"
      | "checked_in"
      | "check_in_reversed"
      | "cancelled"
      | "no_show"
      | "amended"
      | "arrival_time_changed",
      string
    >;
    stay: Record<"checked_out" | "departure_changed" | "moved", string>;
    folio: Record<
      "charge_posted" | "payment_posted" | "line_reversed" | "closed",
      string
    >;
    staff: Record<
      | "invited"
      | "invitation_renewed"
      | "invitation_accepted"
      | "readded"
      | "role_changed"
      | "role_permissions_changed"
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
    business_day: Record<"closed", string>;
    property: Record<"configured", string>;
    organization: Record<"configured", string>;
    price_list: Record<"changed", string>;
    data_export: Record<"requested" | "downloaded", string>;
    maintenance_request: Record<
      | "reported"
      | "moved"
      | "cancelled"
      | "assigned"
      | "prioritised"
      | "hold_released"
      | "costed"
      | "guest_charged",
      string
    >;
    maintenance_equipment: Record<
      "added" | "changed" | "retired" | "restored" | "serviced",
      string
    >;
    maintenance_setting: Record<"changed", string>;
    employee: Record<"registered" | "terminated", string>;
    leave: Record<"approved" | "declined", string>;
    payroll_run: Record<"approved", string>;
    branding: Record<"changed" | "reset", string>;
    webhook_endpoint: Record<"registered" | "removed" | "test_sent", string>;
    failed_operation: Record<"retried" | "cancelled" | "resolved", string>;
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
    | "maintenance_request"
    | "maintenance_equipment"
    | "business_day_close"
    | "data_export"
    | "employee"
    | "leave_request"
    | "payroll_run"
    | "organization_brand"
    | "webhook_endpoint"
    | "failed_operation",
    string
  >;

  /**
   * Close the day (ADR 0034). `{date}` is a business date, already formatted;
   * `{time}` is the Property's cutoff. Nothing here mentions Accounting or says
   * a close cannot be undone: nothing receives the day's totals yet, and
   * reopening a day is designed and deferred.
   */
  closeDay: {
    at: string;
    dueTitle: string;
    dueDescription: string;
    waiting: string;
    waitingBadge: string;
    preparingTitle: string;
    preparingDescription: string;
    automatic: string;
    notArrivedTitle: string;
    notArrivedHelp: string;
    notDepartedTitle: string;
    notDepartedHelp: string;
    roomNightsTitle: string;
    roomNightsHelp: string;
    foliosTitle: string;
    foliosHelp: string;
    nothingOpen: string;
    stepDone: string;
    stepOpen: string;
    notBlocking: string;
    /** While no day waits: today's nights are charged when today closes. */
    roomNightsTodayHelp: string;
    /** ICU plural on `n`: the nights the waiting close will charge. */
    roomNightsToCharge: string;
    roomNightsAllCharged: string;
    /** Why a Guest's night will not be charged (ADR 0038). */
    notChargedReason: Record<
      | "unpriced"
      | "no_folio"
      | "folio_closed"
      | "currency"
      | "billing_unavailable",
      string
    >;
    roomNightsColumn: string;
    /** ICU plural on `n`: the Guest nights a close could not charge. */
    roomNightsNotCharged: string;
    /** Why Nights and Room nights differ in the recent closes. */
    nightsHint: string;
    dueOn: string;
    dueOutOn: string;
    leftOn: string;
    openArrivals: string;
    openDepartures: string;
    openFolio: string;
    close: string;
    closing: string;
    dialogTitle: string;
    dialogQuiet: string;
    dialogOpen: string;
    final: string;
    keepOpen: string;
    dismissed: string;
    reasonHint: string;
    noPermission: string;
    alreadyClosed: string;
    reasonRequired: string;
    refused: string;
    recentTitle: string;
    recentEmpty: string;
    day: string;
    closedBy: string;
    automatically: string;
    arrived: string;
    departed: string;
    nights: string;
    leftOpen: string;
    foliosOpen: string;
  };

  table: TableMessages;
  picker: PickerMessages;

  /** Rail and page-bar names, keyed by route segment. */
  navigation: Record<string, string>;
  /** What each planned screen will do, keyed by route segment. */
  screenSummary: Record<string, string>;
  planned: string;
  handoverLabel: string;
  notEntitledTitle: string;
  notEntitledDescription: string;
}

/** The searchable pickers' own strings; each field brings its placeholder. */
export interface PickerMessages {
  search: string;
  noMatches: string;
  clear: string;
  selectedCount: string;
  required: string;
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
    today: "Bugün",
    propertySwitcher: "Tesisler",
    chooseProperty: "Tesis seçin",
    billingNotice: {
      title: "{organization} için ödeme gecikti",
      description:
        "Çalışma alanı şimdilik her şeyiyle çalışmaya devam ediyor. Lütfen ödemeyi tamamlayın.",
    },
    mainNavigation: "Ana gezinme",
    sections: "Bölümler",
    breadcrumb: "Konum",
    back: "Geri",
    collapse: "Menüyü daralt",
    expand: "Menüyü genişlet",
    workspaceBadge: "Çalışma Alanı",
    account: "Hesap",
    organization: "Organizasyon",
    property: "Tesis",
    noPropertyTitle: "Henüz bir tesise atanmadınız",
    noPropertyDescription:
      "Organizasyonunuzdaki bir yönetici sizi bir tesise atadığında burada görünür.",
    signInSummary: "Tesislerinizi yönetmek için oturum açın.",
    authSlogan: "Konaklama yönetimi, yeniden tanımlandı.",
    authSubSlogan:
      "Tesisler, sakinler, rezervasyonlar ve folyolar için bütünleşik çalışma alanı.",
    welcomeBack: "Tekrar hoş geldiniz",
    email: "E-posta",
    password: "Parola",
    showPassword: "Parolayı göster",
    hidePassword: "Parolayı gizle",
    signIn: "Oturum aç",
    signingIn: "Açılıyor",
    signInFailed: "E-posta veya parola hatalı.",
    signInThrottled: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.",
    signInUnavailable: "Giriş şu anda yapılamıyor. Biraz sonra tekrar deneyin.",

    challengeTitle: "İkinci adım",
    challengeSummary:
      "Kimlik doğrulama uygulamanızdaki kodu veya bir yedek kodu girin.",
    code: "Kod",
    verify: "Doğrula",
    challengeFailed: "Kod geçerli değil.",
    challengeExpired:
      "Çok fazla kod denendi ya da süre doldu. Yeni bir kod girmek için yeniden oturum açın.",

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
    noFinanceTitle: "Finans bu tesiste açık değil",
    noFinanceDescription:
      "Finans, organizasyonunuzun aboneliğinde yer aldığında ve tesiste etkinleştirildiğinde burada görünür.",
    noArrivalsTitle: "Bugün giriş yok",
    noArrivalsDescription:
      "Bugün için bu tesiste bekleyen bir rezervasyon bulunmuyor.",
    openEnded: "Açık uçlu",
    checkIn: "Giriş yap",
    checkingIn: "Yapılıyor",
    checkedIn: "Giriş yapıldı",
    unitUnavailable: "Bu birim seçilen tarihlerde dolu.",
    unitOccupied:
      "Bu birimde hâlâ konaklayan biri var. Önce onun çıkışını yapın ya da misafiri başka bir birime alın.",
    unitNotInService:
      "Bu birim bloke ya da hizmet dışı. Blokeyi kaldırın ya da hizmete döndürün, veya misafiri başka bir birime alın.",
    blockReasonPlaceholder: "Bakım ya da onarım",
    roomNotReady:
      "Bu oda henüz hazır değil: temizlenmedi ya da kontrol bekliyor.",
    checkInAnyway: "Yine de giriş yap",
    notNow: "Şimdi değil",
    ready: "Hazır",
    notReady: "Hazır değil",
    checkInRefused: "Bu rezervasyon için giriş yapılamıyor.",
    checkInTooEarly:
      "Bu rezervasyon henüz başlamadı — ilk gecesi daha sonraki bir iş gününde. Misafirin girişini o gün yapın ya da rezervasyonu bugünden başlayacak şekilde değiştirin.",
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
    checkInDayClosed:
      "Bu girişin yapıldığı iş günü kapatıldı, bu yüzden giriş geri alınamaz. Misafir kalmıyorsa çıkışını Çıkışlar ekranından yapın.",
    checkInMoved:
      "Misafir girişten sonra başka bir odaya taşındı, bu yüzden giriş geri alınamaz. Kalmıyorsa çıkışını Çıkışlar ekranından yapın.",
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
      checked_out: "Çıkış yapıldı",
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
    awaitingConfirmation: "Onay bekliyor",
    occupiedDueOut: "Dolu — bugün çıkacak",
    occupied: "Dolu",
    occupiedOverstay: "Dolu — çıkışı gecikmiş",
    cancelBooking: "Rezervasyonu iptal et",
    cancelBookingTitle: "Rezervasyonu iptal et",
    cancelBookingSummary:
      "Geceler serbest kalır ve başkasına satılabilir. İptal geri alınamaz.",
    noShowTitle: "Gelmedi olarak işaretle",
    noShowSummary: "Misafir gelmedi. Geceler serbest kalır; bu geri alınamaz.",
    markNoShow: "Gelmedi olarak işaretle",
    keepBooking: "Rezervasyonu koru",
    endBookingRefused: "Bu rezervasyon artık sonlandırılamıyor.",
    saving: "Kaydediliyor…",
    checkInBlocked: {
      not_confirmed: "Önce rezervasyonun onaylanması gerekiyor.",
      unit_blocked: "Birim bloke. Blokeyi kaldırın ya da başka birim seçin.",
      unit_out_of_service: "Birim hizmet dışı. Başka birim seçin.",
      unit_occupied: "Birimde hâlâ konaklayan var. Önce onun çıkışını yapın.",
    },
    checkOutFor: "{guest} için çıkış yap",
    checkOutTitle: "Çıkış yap",
    checkOutSummary:
      "Misafir odadan ayrılır ve oda başkasına verilebilir. Çıkış geri alınamaz; önce hesabı kontrol edin.",
    confirmCheckOut: "Çıkışı onayla",
    keepInHouse: "Konaklamaya devam",
    plannedDeparture: "Planlanan çıkış",
    plannedFor: "Planlanan: {date}",
    noFolio: "Hesap yok",
    reviewFolio: "Hesabı aç",
    checkOutEarlyAcknowledge:
      "Misafir planlanan çıkış tarihinden ({date}) önce ayrılıyor.",
    checkOutEarlyRequired: "Misafirin erken ayrıldığını onaylayın.",
    checkOutBalanceReason: "Bakiye neden açık kalıyor",
    checkOutNightsToCharge: "Çıkışta ücretlendirilecek",
    checkOutPendingNights:
      "{count, plural, one {# gece} other {# gece}} · {amount}",
    checkOutUnpriced:
      "Bu rezervasyon fiyatsız alındı; geceleri ücretlendirilmez.",
    balanceAfterCheckOut: "Çıkıştan sonraki bakiye",
    checkOutBalanceHint:
      "Hesap {balance} bakiyesiyle açık kalır ve gerekçeniz kaydedilir. Ödeme, hesap üzerinden kaydedilir.",
    checkOutBalanceReasonRequired:
      "Hesapta bakiye var. Açık kalmasının gerekçesini yazın.",
    checkOutFolioChanged:
      "Siz bakarken hesaba yeni bir kayıt eklendi. Hesabı yeniden kontrol edip tekrar deneyin.",
    departuresViews: "Çıkış listesi görünümleri",
    inHouseAt: "Şu anda konaklayanlar:",
    departuresDue: "Bugün ve gecikenler",
    departuresInHouse: "Konaklayan herkes",
    nobodyInHouseTitle: "Konaklayan kimse yok",
    nobodyInHouseDescription:
      "Bu tesiste şu anda giriş yapmış bir misafir bulunmuyor.",
    noGuestRecorded: "Kayıtlı misafir yok",
    walkIn: "Rezervasyonsuz",
    showOnRoomMap: "Oda haritasında göster",
    noDeparturesTitle: "Bugün çıkış yok",
    noDeparturesDescription:
      "Bu tesiste bugün ayrılması beklenen bir konaklama bulunmuyor.",
    leftToday: "Bugün ayrılanlar",
    leftAt: "Ayrılış",
    nobodyLeftYet: "Bugün henüz ayrılan olmadı.",
    readiness: "Hazırlık",
    reservation: "Rezervasyon",
    roomAndBed: "Oda ve yatak",
    notAssigned: "Atanmadı",
    outOfOrder: "Hizmet dışı",
    daysLate: "{n} gün gecikmiş",
    credit: "alacak",
    moreActionsFor: "{guest} için diğer işlemler",
    openFolio: "Folyoyu aç",
    leaves: "Çıkış",
    overdueSince: "{date} tarihinden beri gecikmiş",
    untilDate: "{date} tarihine kadar",

    reservations: "Rezervasyonlar",
    reservationsAt: "Rezervasyonlar —",
    copyReference: "Referansı kopyala",
    referenceCopied: "Kopyalandı",
    dueToday: "Bugün çıkış",
    viewDetails: "Ayrıntıları görüntüle",
    reservationDetails: "Rezervasyon ayrıntıları",
    stayTimeline: "Konaklama zaman çizelgesi",
    contactDetails: "İletişim bilgileri",
    financialDetails: "Ücret ve hesap bilgileri",

    acceptInvitation: {
      summary: "{organization} sizi {role} olarak davet etti.",
      title: {
        set_password: "Parolanızı belirleyin",
        sign_in: "Kabul etmek için oturum açın",
        accept: "Davetinizi kabul edin",
      },
      name: "Adınız",
      passwordHint: "En az 8 karakter. Oturum açarken kullanacaksınız.",
      signInHint: "Bu adres için zaten bir hesabınız var.",
      working: "Bir saniye...",
      goToSignIn: "Oturum açmaya git",
      submit: {
        set_password: "Parolayı belirle ve katıl",
        sign_in: "Oturum aç ve kabul et",
        accept: "Daveti kabul et",
      },
      errors: {
        weak_password:
          "Bu parola çok kısa ya da çok uzun. 8 ile 128 karakter kullanın.",
        throttled: "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.",
        account_exists:
          "Bu adres için zaten bir hesap var. Onun parolasıyla oturum açın.",
        unavailable:
          "Bu çalışmadı. Tekrar deneyin; sürerse sizi davet eden kişiye bildirin.",
        secondStep: "Bu hesap burada yapılamayan bir ikinci adım istiyor.",
      },
      refused: {
        unknown: {
          title: "Bu bağlantı çalışmıyor",
          body: "Eksik kopyalanmış olabilir ya da bir davet değil.",
          next: "Sizi davet eden kişiden bağlantının tamamını yeniden göndermesini isteyin.",
        },
        expired: {
          title: "Bu davetin süresi doldu",
          body: "Davet bağlantısı yedi gün geçerlidir.",
          next: "Sizi davet eden kişiden yeni bir bağlantı isteyin. Sizden başka bir şey gerekmez.",
        },
        accepted: {
          title: "Bu davet zaten kullanıldı",
          body: "Bir bağlantı yalnızca bir kez çalışır ve bu kullanıldı.",
          next: "Kullanan sizseniz oturum açın. Siz değilseniz sizi davet eden kişiye bildirin.",
        },
        withdrawn: {
          title: "Bu davet geri çekildi",
          body: "Gönderen kişi daveti iptal etti ya da daha yeni bir bağlantı gönderdi.",
          next: "Sizi davet eden kişiden güncel bir bağlantı isteyin.",
        },
        membership_revoked: {
          title: "Bu erişim kaldırıldı",
          body: "Bağlantıyı kullanmadan önce bu Kuruluştaki yeriniz kaldırıldı.",
          next: "Kuruluşun bir yöneticisinden yerinizi geri vermesini ve yeni bir bağlantı göndermesini isteyin.",
        },
        other_account: {
          title: "Bu davet başkası için",
          body: "Davet edilen kişiden farklı biri olarak oturum açtınız.",
          next: "Oturumu kapatın, sonra bağlantıyı yeniden açın.",
        },
      },
    },
    staff: {
      search: "Ekipte ara",
      showRevoked: "Erişimi kaldırılan {count} kişiyi göster",
      noMatch: "Listede “{query}” ile eşleşen kimse yok.",
      showAll: "Herkesi göster",
      undoUntil: "{until} saatine kadar geri alınabilir",
      undoOver: "{hours} saatlik geri alma süresi doldu",
      linkNoLonger: "Çalışan bağlantı yok",
      renewLink: "Yeni davet bağlantısı",
      addBack: "Yeniden ekle",
      done: "Tamam",
      chooseRole: "Bir rol seçin",
      everyProperty: "Bu Kuruluştaki her Tesis, sonradan eklenenler dahil",
      reachesNothingWarning:
        "Bu kişi hiçbir Tesise ulaşamayacak. Oturum açabilir ama siz bir Tesis atayana kadar hiçbir şey göremez.",
      roleDescriptions: {
        owner:
          "Her şey, Kuruluşun markası dahil. Özenle verin: bir Sahip herkesin rolünü değiştirebilir.",
        manager:
          "Bir Tesisi günlük yönetir: rezervasyonlar, odalar, fiyatlar, ekip, İK ve bordro, defter. Kuruluşun markasını değiştiremez.",
        front_desk:
          "Rezervasyonlar, giriş ve çıkış, ödeme alma ve günü kapatma. Bordro, defter ve ekip değişikliği yok.",
        housekeeping:
          "Oda durumunu günceller ve bakım bildirir. Başka bir şey yok.",
        finance:
          "Masraflar, ödemeler ve iptalleri, defter ve veri dışa aktarımları. Rezervasyon yok.",
      },
      copyLink: "Bağlantıyı kopyala",
      linkCopied: "Kopyalandı",
      copyFailed: "Kopyalanamadı. Bağlantıyı seçip elle kopyalayın.",
      linkNotSent:
        "E-posta gönderilmedi. Bağlantıyı kopyalayıp kişiye kendiniz iletin.",
      showSection: "Bölümü göster",
      allSections: "Tüm bölümler",
      sections: {
        frontDesk: "Ön büro",
        money: "Para",
        rooms: "Odalar ve kat hizmetleri",
        guests: "Misafir hizmetleri",
        people: "Kişiler ve İK",
        setup: "Ayarlar ve kayıtlar",
      },
      revenueGateNote:
        "Analitik, Bugün ve Portföy’de ciroyu ve bakiyeleri de gösterir.",
      allowed: "İzinli",
      notAllowed: "İzinli değil",
      unsavedRoles:
        "{count, plural, one {# rolde kaydedilmemiş değişiklik var} other {# rolde kaydedilmemiş değişiklik var}}. {people, plural, =0 {Bu rolleri kimse tutmuyor.} other {Kaydetmek # kişinin oturumunu kapatır.}}",
      discardChanges: "Değişiklikleri at",
      saveChanges: "Değişiklikleri kaydet",
      confirmSaveTitle: "Bu rol değişiklikleri kaydedilsin mi?",
      confirmSaveRoles: "{roles} rollerinin yapabileceklerini değiştirdiniz.",
      confirmSaveNobody:
        "Bu rolleri henüz kimse tutmuyor, kimsenin oturumu kapanmaz.",
      confirmSavePeople:
        "Bu rolleri {people} kişi tutuyor. Kaydetmek oturumlarını kapatır; yeni izinleri yeniden oturum açtıklarında alırlar.",
      confirmRetireTitle: "{role} sunulmayı bıraksın mı?",
      retireBody:
        "{role} artık birini davet ederken ya da rol değiştirirken sunulmaz. Kimse tutmadığı için kimse etkilenmez. İstediğiniz zaman yeniden sunabilirsiniz.",
      retireHeld:
        "{role} rolünü {count} kişi tutuyor. Önce onlara başka bir rol verin, sonra sunmayı bırakın.",
      startFrom: "Şundan başla",
      startFromPlaceholder: "Boş bir rol",
      confirmRoleGains: "Kazandıkları: {permissions}.",
      confirmRoleLosses: "Kaybettikleri: {permissions}.",
      hrPointer:
        "Bu liste, kimin oturum açabildiği ve neler yapabildiğidir. Maaş, vardiya ve izinler şurada tutulur:",
      hrPointerLink: "İK ve bordro",
      membership: {
        revoke: {
          title: "{member} için erişim kaldırılsın mı?",
          body: "{member} bu Kuruluşa erişimini hemen kaybeder. Tuttuğu her oturum, her cihazda bir anda sona erer.",
          keeps:
            "Hiçbir şey silinmez. Kişi bu listede erişimi kaldırılmış olarak durur, kaydettiği her şey geçmişte adıyla kalır ve kullanılmamış davet bağlantısı çalışmaz olur.",
          undo: "Bunu {hours} saat boyunca geri alabilirsiniz. Sonrasında yalnızca yeni bir bağlantıyla yeniden eklenebilir ve siz bir Tesis atayana kadar hiçbir Tesise ulaşamaz.",
          self: "Bu sizin kendi erişiminiz. Onayladığınız anda oturumunuz kapanır ve bunu kendiniz geri alamazsınız.",
          confirm: "Erişimi kaldır",
        },
        restore: {
          title: "{member} için erişim geri verilsin mi?",
          body: "{member} sahip olduğu rolü ve Tesisleri geri alır. Erişim kaldırılırken oturumları kapandığı için yeniden oturum açmalıdır.",
          until: "{until} saatine kadar geri verebilirsiniz.",
          confirm: "Erişimi geri ver",
        },
        renew: {
          title: "{member} için yeni bağlantı oluşturulsun mu?",
          body: "Eski bağlantı hemen çalışmaz olur. E-posta gönderilmez: yeni bağlantıyı kopyalayıp kendiniz iletirsiniz.",
          done: "Yeni bağlantı hazır. Eskisi artık çalışmıyor.",
          confirm: "Yeni bağlantı oluştur",
        },
        readd: {
          title: "{member} yeniden eklensin mi?",
          body: "{member} eski rolüyle ({role}) ekibe yeniden katılır. Siz bir Tesis atayana kadar hiçbir Tesise ulaşamaz. Yeni bir bağlantı oluşturulur; e-posta gönderilmez.",
          done: "Kişi ekibe geri döndü. Bağlantıyı iletin; henüz hiçbir Tesise ulaşamaz.",
          confirm: "Yeniden ekle",
        },
      },
      rosterOf: "Ekip —",
      screenSummary:
        "Burada kimler çalışıyor, hangi tesislere erişiyorlar ve her rol ne yapabilir.",
      readOnly:
        "Ekibi görebilirsiniz. Bir sahip ya da yönetici değiştirebilir.",
      peopleTab: "Kişiler",
      rolesTab: "Her rol ne yapabilir",
      person: "Kişi",
      permission: "Yetki",
      heldByCount:
        "{count, plural, =0 {kimse tutmuyor} one {# kişi} other {# kişi}}",
      shippedGroup: "Ranza’nın gönderdikleri",
      authoredGroup: "Sizin tanımladıklarınız",
      invitationSent: "Bağlantı henüz kullanılmadı",
      inviteNotice:
        "E-posta gönderilmez. Bağlantıyı kopyalayıp kendiniz iletirsiniz. Bir kez çalışır ve yedi gün sonra geçerliliğini yitirir.",
      matrixNote:
        "Ranza’nın getirdiği roller bir sürümle gelir ve düzenlenemez. Kendi rollerinizdeki değişiklikler birlikte kaydedilir ve veritabanı bunları uygular.",
      cannotGrant:
        "{roles} için kaydedilemedi: kendi rolünüzde olmayan bir yetkiyi veremezsiniz. Diğer roller kaydedildi.",
      invite: "Davet et",
      inviteTitle: "Ekibe birini davet et",
      inviteDescription:
        "Üyelik hemen açılır. Davet bağlantısı yalnızca parola belirlemek içindir.",
      sendInvitation: "Davet bağlantısı oluştur",
      cancel: "Vazgeç",
      linkToPassOn: "Davet bağlantısı",
      linkExpires:
        "Bir kez çalışır, {date} tarihine kadar geçerlidir. Bu pencereyi kapatmak onu silmez: yenisi için listedeki “Yeni davet bağlantısı”nı kullanın.",
      email: "E-posta",
      role: "Rol",
      properties: "Tesisler",
      status: "Durum",
      actions: "İşlemler",
      aboveYou: "Rolü ya da erişimi sizinkinden geniş.",
      active: "Aktif",
      awaitingPassword: "Parola bekleniyor",
      revoked: "Erişim kaldırıldı",
      revoke: "Erişimi kaldır",
      undoRevoke: "Erişimi geri ver",
      reachesNothing: "Henüz bir tesis atanmadı",
      reachesEverywhere: "Tüm tesisler",
      alreadyAMember: "Bu kişinin bu organizasyonda zaten bir üyeliği var.",
      refused: "Bu işlem reddedildi.",
      lastAdministrator:
        "Bir Kuruluşta ekip ekleyebilen biri kalmalı. Önce başka birine Sahip rolünü verin.",
      roleIsHeld: "Bu rolü tutan kişiler var; önce onları taşıyın.",
      confirmRoleTitle: "Bu rol değiştirilsin mi?",
      confirmRoleChange: "{member}, {from} rolünden {to} rolüne geçecek.",
      confirmRoleSessions:
        "Sahip olduğu tüm oturumlar sona erecek ve yeniden giriş yapması gerekecek.",
      confirmRoleSelf: "Bu sizin kendi rolünüz; oturumunuz kapatılacak.",
      confirmRoleSelfLosesAccess:
        "{to} ekip yönetemez; bu nedenle artık kimsenin rolünü değiştiremez veya ekip daveti gönderemezsiniz.",
      confirmRoleConfirm: "Rolü değiştir",
      confirmRoleClose: "Kapat",
      roleChangedMeanwhile:
        "Bu rol siz karar verirken değiştirildi. {member} artık {role} rolünde. Hiçbir şey değişmedi.",
      roleRetired: "Bu rol artık sunulmuyor. Hiçbir şey değişmedi.",
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
      retired: "Artık sunulmuyor",
      retire: "Sunmayı bırak",
      reinstate: "Yeniden sun",
      noCommands: "Henüz bir yetki yok",
      permissions: {
        book: "Rezervasyon alma",
        checkIn: "Giriş yapma",
        checkOut: "Çıkış yapma",
        cancel: "Rezervasyon iptali ve gelmedi kaydı",
        amend: "Rezervasyon ve konaklama değiştirme, oda taşıma",
        closeDay: "Günü kapatma",
        manageFolio: "Folyo açma ve kapatma",
        postCharge: "Folyoya ücret işleme",
        reverseCharge: "Folyodaki ücreti ters kaydetme",
        postPayment: "Ödeme kaydetme",
        reversePayment: "Folyodaki ödemeyi ters kaydetme",
        viewLedger: "Muhasebe defterini okuma",
        administerStaff: "Ekibi yönetme",
        defineRoles: "Rol tanımlama",
        configureAccommodation: "Odaları ve yatakları yapılandırma",
        updateHousekeeping: "Oda durumunu güncelleme",
        reportMaintenance: "Bakım sorunu bildirme",
        manageMaintenance: "Bakım taleplerini yönetme",
        takeOutOfOrder: "Odaları hizmet dışı bırakma ve geri alma",
        manageEquipment: "Ekipman kaydını yönetme",
        readAudit: "Denetim kaydını okuma",
        manageConfiguration: "Ayarları yönetme",
        manageRates: "Gecelik fiyatları belirleme",
        readDataExports: "Dışa aktarımları görme",
        createDataExports: "Veri dışa aktarımı isteme",
        createServiceRequests: "Misafir talebi oluşturma",
        manageServiceRequests: "Misafir taleplerini yönetme",
        viewHr: "Personel kayıtlarını ve bordroyu görme",
        manageHr: "Personel kayıtlarını ve bordroyu yönetme",
        viewIntegrations: "Entegrasyonları görme",
        manageIntegrations: "Entegrasyonları yönetme",
        manageBranding: "Organizasyonun markasını (renk ve logo) yönetme",
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
    reservationsViews: "Rezervasyonları göster",
    reservationsTab: {
      all: "Tümü",
      arriving: "Bugün gelenler",
      inHouse: "Konaklayanlar",
      departing: "Bugün çıkanlar",
      upcoming: "Yaklaşanlar",
    },
    reservationsTabEmpty: {
      arriving: "Bugün gelecek kimse yok",
      inHouse: "Konaklayan kimse yok",
      departing: "Bugün ayrılacak kimse yok",
      upcoming: "Daha sonrası için rezervasyon yok",
    },
    reservationsTabEmptyHint:
      "Tüm rezervasyonları görmek için Tümü sekmesine geçin.",
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
    departureRequiredHint:
      "Misafir rezervasyonunun bir ayrılış tarihi olmalı. Yalnızca bir Sakinin rezervasyonu açık uçlu bırakılabilir.",
    noBookableUnit:
      "Burada rezerve edilebilecek birim yok — tüm birimler bloke, hizmet dışı ya da yatak bazında kiralanıyor.",
    openRooms: "Odalar ve yataklara git",
    quotePerNight: "Gecelik {price}",
    quoteStay: "{count, plural, one {# gece} other {# gece}}: toplam {total}",
    quoteUnpriced:
      "Bu tesiste {type} için fiyat belirlenmemiş; rezervasyon fiyatsız alınır ve geceleri ücretlendirilmez.",
    quoteResident: "Bir Sakin gecelik değil, aylık faturalandırılır.",
    bookedPerNight: "{price} / gece",
    bookedUnpriced: "Fiyat yok",
    priceColumn: "Fiyat",
    stayDates: "Konaklama tarihleri",
    bookingAddDate: "Tarih seçin",
    bookingOpenEnded: "Açık uçlu",
    bookingPickArrival: "Giriş gününü seçin",
    bookingPickDeparture: "Çıkış gününü seçin ya da açık bırakın",
    bookingPickDepartureRequired: "Çıkış gününü seçin",
    stayNights: "{count, plural, other {# gece}}",
    dateRangeClear: "Temizle",
    dateRangeDone: "Tamam",
    chooseUnit: "Birim seçin",
    takeBooking: "Rezervasyon oluştur",
    takingBooking: "Oluşturuluyor",
    discardBooking: "Vazgeç",
    bookingUnavailable: "Bu birim o geceler için zaten dolu.",
    unitBookedThoseNights: "Bu geceler dolu",
    unitOccupiedThoseNights: "Bu gecelerde konaklayan var",
    chosenUnitTakenThoseNights:
      "Bu birim seçtiğiniz geceler için dolu. Başka bir birim ya da başka tarihler seçin.",
    bookingAvailabilityUnknown:
      "Bu geceler için hangi birimlerin boş olduğu kontrol edilemedi. Yine de seçebilirsiniz; çakışma varsa kayıt reddedilir.",
    bookingOverOccupant:
      "Bu birimde o gecelerin bazısında konaklayan biri var.",
    bookingPeriodInvalid:
      "Bu tarihler geçerli bir dönem değil. Rezervasyon en az bir gece sürer ve bugünden önce başlayamaz.",
    guestRequired: "Misafirin adını girin.",
    guestEmailInvalid:
      "Geçerli bir e-posta adresi girin (ad@ornek.com gibi) ya da boş bırakın.",
    bookingGuestInvalid:
      "Misafirin adını, e-postasını ve telefonunu kontrol edin.",
    bookingArrivalInvalid: "Beklenen varışı bir saat olarak girin.",
    expectedArrival: "Beklenen varış",
    expectedAt: "Beklenen {time}",
    expectedArrivalHint:
      "İsteğe bağlı. Misafirin gelmeyi beklediği saat, tesisin saatine göre.",
    expectedArrivalNone: "Beklenen saat yok",
    expectedArrivalPassed: "Beklenen saat geçti",
    bookingPriceChanged:
      "Bu birimin fiyatı siz rezervasyon yaparken değişti. Yeni fiyatı kontrol edip rezervasyonu yeniden alın.",
    bookingRefused: "Bu rezervasyon oluşturulamıyor.",
    changeBooking: "Rezervasyonu değiştir",
    changeBookingSummary:
      "Başka gecelere veya başka bir birime taşıyın. Birim başka türdense fiyatı değişir; aksi hâlde alındığı fiyat kalır.",
    changeBookingChecking: "O geceler kontrol ediliyor…",
    changeBookingLoadFailed:
      "O geceler kontrol edilemedi. Tarihleri yeniden seçin.",
    changeBookingUnitFree: "Boş",
    changeBookingUnitBooked: "Dolu · {reference}",
    changeBookingUnitOccupied: "Konaklayan var",
    changeBookingUnitNotTaking: "Şu anda rezervasyon almıyor",
    changeBookingCurrentNotTaking:
      "Bu birim hizmet dışı ya da yatak yatak kiralanıyor. Rezervasyonun tarihleri burada değişebilir; başka bir birime de taşınabilir.",
    changeBookingBlockedBooked:
      "O gecelerin bir kısmı {reference} rezervasyonuna ait. İki rezervasyonun yerini değiştirmek için önce birini boş bir birime taşıyın.",
    changeBookingBlockedOccupied:
      "Bu birimde o gecelerin bir kısmında konaklayan biri var.",
    changeBookingBeforeToday: "Giriş bugün veya daha sonra olmalı.",
    changeBookingPriceKept: "Gecelik {price}, rezervasyondaki gibi",
    changeBookingPriceChanges: "Gecelik {from} → {to}",
    changeBookingPriceNone:
      "{type} için fiyat yok: rezervasyon fiyatsız kalır.",
    changeBookingNote: "Not (isteğe bağlı)",
    changeBookingNoteHint: "Değişiklik geçmişinde ve denetim kaydında görünür.",
    saveChange: "Değişikliği kaydet",
    keepAsItWas: "Olduğu gibi bırak",
    changeBookingChanged:
      "Bu rezervasyon az önce başka biri tarafından değiştirildi. Şimdiki hâli gösteriliyor.",
    changeBookingNotInService: "Bu birim şu anda bu rezervasyonu alamaz.",
    changeBookingNoteInvalid: "Not 3 ile 500 karakter arasında olmalı.",
    changeBookingNothing: "Tarihler ve birim aynı; değiştirilecek bir şey yok.",
    changeBookingRefused: "Bu rezervasyon değiştirilemiyor.",
    changeDeparture: "Çıkışı değiştir",
    changeDepartureSummary:
      "Konaklamayı uzatın ya da kısaltın. Misafirin ek geceleri rezervasyonun kendi fiyatından ücretlendirilir; bugün ayrılmak bir çıkıştır.",
    changeDepartureLonger:
      "{count, plural, other {# gece daha}}, gecelik {price} üzerinden",
    changeDepartureLongerUnpriced:
      "{count, plural, other {# gece daha}}; rezervasyon fiyatsız alındığı için ücretlendirilmez",
    changeDepartureLongerResident:
      "{count, plural, other {# gece daha}}; sakin aylık faturalandırılır",
    changeDepartureShorter: "{count, plural, other {# gece daha az}}",
    changeDepartureOpen: "Çıkış tarihi yok: konaklama açık uçlu kalır.",
    changeDepartureNeedsEnd:
      "Misafirin konaklamasının bir çıkış tarihi olmalı; yalnızca sakinin konaklaması açık uçlu olabilir.",
    changeDepartureBlocked:
      "O gecelerin bir kısmı {reference} rezervasyonuna ait. Önce misafiri ya da o rezervasyonu taşıyın.",
    changeDepartureNothing: "Çıkış zaten bu gün.",
    changeDepartureRefused: "Bu konaklama değiştirilemiyor.",
    saveDeparture: "Çıkışı kaydet",
    extendStay: "Uzat",
    moveGuest: "Misafiri taşı",
    moveGuestSummary:
      "Bu geceden itibaren başka bir birime taşıyın. Konaklama, folyosu ve fiyatı onunla gider; ayrılan oda temizliğe işaretlenir.",
    moveGuestReason: "Neden",
    moveReason: {
      fault: "Odada arıza var",
      upgrade: "Oda yükseltmesi",
      guest_request: "Misafir istedi",
      other: "Başka bir neden",
    },
    moveGuestUnitNotReady: "Hazır değil",
    moveGuestPriceKept:
      "Gecelik {price}, rezervasyondaki gibi: taşımak fiyatı değiştirmez",
    moveGuestUnpriced: "Rezervasyonun fiyatı yok; taşımak bunu değiştirmez.",
    moveGuestNoteRequired: "Başka bir neden için notta açıklayın.",
    moveGuestNotReady:
      "O birim henüz hazır değil. Başka birini seçin ya da önce temizletin.",
    moveGuestRefused: "Bu misafir taşınamıyor.",
    folios: "Folyolar",
    foliosAt: "Folyolar —",
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
    addPayment: "Ödeme al",
    paymentMethod: "Ödeme yöntemi",
    paymentMethods: {
      cash: "Nakit",
      card: "Kredi kartı",
      bank_transfer: "Banka havalesi",
      other: "Diğer",
    },
    paymentRefused: "Bu ödeme kaydedilemedi.",
    amountInvalid:
      "Tutar, para biriminin izin verdiği ondalık basamakla pozitif bir sayı olmalıdır.",
    reverse: "Ters kaydet",
    reversing: "Kaydediliyor…",
    reversed: "ters kaydedildi",
    roomNightLine: "Oda gecesi · {date}",
    reverseReason: "Gerekçe",
    reverseRefused: "Bu satır ters kaydedilemedi.",
    closeFolio: "Folyoyu kapat",
    closing: "Kapatılıyor…",
    closeRefused: "Bu folyo kapatılamadı.",
    folioInHouseNote:
      "Misafir hâlâ konaklıyor, bu yüzden folyo açık kalır: kalan geceleri buraya ücretlendirilir. Çıkıştan sonra kapatılabilir.",
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
    buildingColumn: "Bina",
    floorColumn: "Kat",
    floorNumber: "{floor}. kat",
    noFloor: "Katı belirtilmemiş",
    bedCount: "{count} yatak",
    sleeps: "{count} kişilik",
    tonightColumn: "Bu gece",
    unitActions: "İşlemler",
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
    statReserved: "Bu gece rezervasyonlu",
    nextArrivalOn: "Sonraki varış {date}",
    outOfOrderBeds: "{count, number} hizmet dışı",
    blockedStatus: "Kapalı",
    roomCalendar: {
      subtitle: "Odalar ve yataklar, tesisin iş günlerine göre.",
      previous: "Önceki 7 gün",
      next: "Sonraki 7 gün",
      today: "Bugün",
      goTo: "Tarihe git",
      chosenDay: "Seçtiğiniz tarih",
      length: "Gösterilen gün",
      lengthOption: "{days, plural, other {# gün}}",
      floorFilter: "Kat",
      allFloors: "Tüm katlar",
      floorOption: "Kat {floor}",
      noFloor: "Katsız",
      noBuilding: "Binasız",
      search: "Oda veya misafir ara",
      filters: "Filtreler",
      filtersCount: "Filtreler ({count})",
      showRequested: "Göster: Talep",
      showDeparted: "Göster: Ayrıldı",
      collapseAll: "Tüm yatakları daralt",
      expandAll: "Tüm yatakları göster",
      overlapCount: "{count, plural, other {# çakışma}}",
      bookedWhileBlockedCount:
        "{count, plural, other {# kapalı odada rezervasyon}}",
      legend: "İşaretlerin anlamı",
      requested: "Talep",
      confirmed: "Onaylı",
      inHouse: "Konaklıyor",
      overdue: "Gecikmiş",
      departed: "Ayrıldı",
      overlap: "Çakışma",
      clashes: "Bir rezervasyonla çakışıyor",
      bookedWhileBlocked: "Kapalı odada rezervasyon",
      blocked: "Kapalı",
      outOfService: "Hizmet dışı",
      gridLabel: "Gecelere göre odalar ve yataklar",
      roomColumn: "Oda",
      freeRow: "Boş",
      freeOn: "{date}: {of, number} içinden {n, plural, other {# boş}}",
      expand: "{room} yataklarını göster",
      collapse: "{room} yataklarını daralt",
      bedsTakenLabel: "{of, number} yatağın {n, number} tanesi dolu",
      barLabel: "{guest}, {status}, {from} – {to}",
      barLabelOverdue:
        "{guest}, gecikmiş, geliş {from}, planlanan çıkış {to}, bu gece hâlâ odada",
      barOverdueCard: "Gecikmiş · bu geceye kadar odada (planlanan çıkış {to})",
      noGuestRecorded: "Kayıtlı misafir yok",
      noEndDate: "Bitiş tarihi yok",
      refreshFailed: "Yenilenemedi. Takvim {time} itibarıyla gösteriliyor.",
      noRoomsTitle: "Henüz oda yok",
      noRoomsDescription:
        "Oda ve yatak eklediğinizde burada günlere göre görünür.",
      goToRooms: "Odalar ve yataklara git",
      noMatchTitle: "Eşleşen oda yok",
      noMatchDescription:
        "Seçilen kat, arama veya filtrelerle eşleşen bir şey yok.",
      clearFilters: "Filtreleri temizle",
      filteredNote:
        "Filtrelendi. Boş ve çakışma sayıları yine tüm odaları kapsar.",
      nothingBooked: "{from} – {to} arasında rezervasyon yok.",
      failedTitle: "Oda takvimi gösterilemedi",
      failedDescription: "Hiçbir şey değiştirilmedi. Birazdan tekrar deneyin.",
      retry: "Tekrar dene",
      loading: "Oda takvimi yükleniyor",
      goneTitle: "Artık takvimde değil",
      goneNote:
        "Bu rezervasyon, açtığınızdan beri iptal edildi, çıkış yaptı ya da bu aralığın dışına çıktı.",
      changedNote: "Bu rezervasyon, açtığınızdan beri değişti.",
      overlapNote:
        "Bu odada bu gecelerin bir kısmını başka bir rezervasyon tutuyor. Misafir gelmeden çözün.",
      clashNote:
        "Bu talep onaylı bir rezervasyonla çakışıyor; bu haliyle onaylanırsa reddedilir.",
      clashStayNote:
        "Bu talep bu gecelerde konaklayan bir misafirle çakışıyor; bu haliyle onaylanırsa reddedilir.",
      clashesStay: "Konaklayan bir misafirle çakışıyor",
      windowFailed:
        "Bu aralık açılamadı. {time} itibarıyla önceki aralık gösteriliyor.",
      blockedNote:
        "Bu oda kullanım dışı ({reason}); serbest bırakılana kadar girişi reddedilir.",
      overdueNote:
        "Hâlâ odada: planlanan çıkış tarihi {date}, {days} gün geçti. Çıkış yapın ya da çıkış tarihini değiştirin.",
      arrives: "Geliş",
      arrived: "Geldi",
      inRoomSince: "Bu odada şu tarihten beri",
      leaves: "Ayrılış",
      wasDue: "Planlanan çıkış",
      daysLate: "{days} gün",
      left: "Ayrıldı",
      booked: "Rezervasyon",
      nightsLabel: "Gece",
      nightsSoFar: "Bu geceye kadar geceler",
      nights: "{count, plural, other {# gece}}",
      stayType: "Kayıt türü",
      reservationCode: "Rezervasyon",
      roomStatus: "Oda durumu",
      roomReadiness: {
        ready: "Hazır",
        awaiting_inspection: "Temiz, kontrol bekliyor",
        dirty: "Kirli",
        occupied: "İçinde misafir var",
      },
      guest: "Misafir",
      resident: "Sakin",
      balance: "Bakiye",
      balanceAsOfCharge: "Son ücrete göre bakiye",
      laterNightsPost: "Sonraki geceler gün kapanışında ya da çıkışta işlenir.",
      folioClosed: "Folyo kapalı",
      open: {
        arrivals: "Girişlerde aç",
        departures: "Çıkışlarda aç",
        reservations: "Rezervasyonlarda aç",
      },
      barWord: {
        overlap: "Çakışma",
        bookedWhileBlocked: "Kapalı",
        clashes: "Çakışıyor",
      },
      typeFilter: "Birim türü",
      allTypes: "Tüm türler",
      stateFilter: "Birim durumu",
      allStates: "Tüm durumlar",
      unitState: {
        available: "Müsait",
        occupied: "Dolu",
        blocked: "Kapalı",
        out_of_service: "Hizmet dışı",
      },
      moveHint:
        "Bir rezervasyonu başka bir odaya ya da güne sürükleyerek taşıyın; siz onaylayana kadar hiçbir şey kaydedilmez.",
      dragHint:
        "Taşımak için sürükleyin ya da ayrıntılarındaki Taşı… düğmesini kullanın.",
      resizeHint: "Çıkış gününü değiştirmek için sürükleyin",
      dropBlocked: "Buraya taşınamaz",
      moveAction: "Taşı…",
      moveBooking: "Rezervasyonu taşı",
      moveBookingSummary:
        "Hiçbir şey kaydedilmeden önce nereye gideceğine bakın. Birim başka türdeyse fiyat değişir, değilse korunur.",
      confirmMove: "Rezervasyonu taşı",
      moveFrom: "Nereden",
      moveTo: "Nereye",
      cannotMoveTitle: "Bu taşınamaz",
      moveConflict: {
        past: "Giriş bugün ya da daha sonra olmalı.",
        notSellable:
          "{unit} yatak yatak kiralanıyor: yataklarından birini seçin.",
        blocked: "{unit} bu gecelerin bir kısmında kapalı.",
        outOfService: "{unit} bu gecelerin bir kısmında hizmet dışı.",
        booked: "{guest} bu gecelerin bir kısmını rezerve etmiş.",
        occupied: "{guest} bu gecelerin bir kısmında o birimde konaklıyor.",
        leavesToday:
          "Bugün ayrılmak bir çıkış işlemidir. Yarını ya da daha sonrasını seçin.",
        ended: "Sona ermiş bir konaklama taşınamaz.",
        noBooking: "Rezervasyonu olmayan bir konaklama buradan taşınamaz.",
      },
    },

    dashboard: {
      greetingMorning: "Günaydın,",
      greetingAfternoon: "İyi günler,",
      greetingEvening: "İyi akşamlar,",
      updated: "Güncellendi {time}",
      stale: "Yenilenemedi · {time} verisi",
      workingDayStill: "Saat {date}; tesis {time} itibarıyla yeni güne geçer.",
      newBooking: "Yeni rezervasyon",
      attentionTitle: "Dikkat gerekiyor",
      nothingNeedsAttention: "Dikkat gerektiren bir şey yok.",
      attentionIncomplete: "Bazı bölümler okunamadı; bu liste eksik olabilir.",
      attentionMore: "{count, plural, one {# tane daha} other {# tane daha}}",
      notReady: "Oda hazır değil",
      notReadyDetail: "Bugün geliş var; oda henüz hazır değil.",
      notReadyDirty: "Bugün geliş var; oda henüz temizlenmedi.",
      notReadyAwaitingInspection:
        "Bugün geliş var; oda temiz, kontrol bekliyor.",
      notReadyOccupied: "Bugün geliş var; odada hâlâ biri var.",
      notReadyOutOfService: "Bugün geliş var; oda kapalı ya da hizmet dışı.",
      blocked: "Giriş yapılamaz",
      blockerNotConfirmed: "Rezervasyon henüz onaylanmadı.",
      blockerUnitBlocked: "Birim satışa kapalı.",
      blockerUnitOutOfService: "Birim hizmet dışı.",
      blockerUnitOccupied: "Birimde hâlâ bir konuk var.",
      overdue: "Gecikmiş çıkış",
      overdueDetail: "{days} gün gecikmiş · {date} tarihinde ayrılacaktı.",
      overdueLabel: "Gecikmiş · {days} gün",
      leavesOwing: "Bakiyeyle ayrılıyor",
      leavesOwingDetail: "Bugün ayrılıyor · bakiye {balance}",
      outOfService: "Hizmet dışı",
      outOfServiceDetail: "Satışa kapalı.",
      openArrivals: "Gelişleri aç",
      openDepartures: "Çıkışları aç",
      openFolio: "Folyoyu aç",
      openBoard: "Panoyu aç",
      openRooms: "Odaları aç",
      urgentRepair: "Acil onarım",
      dueBack: "Dönüşü gecikti",
      dueBackDetail: "{date} tarihinde dönmesi gerekiyordu.",
      requestReference: "MT-{number}",
      openMaintenance: "Bakımı aç",
      maintenanceTitle: "Bakım",
      openRequests: "Açık talepler",
      statusNew: "Yeni",
      statusInProgress: "Sürüyor",
      statusWaitingForParts: "Parça bekleniyor",
      roomsOutOfOrder: "Bakımda",
      arrivals: "Gelişler",
      checkedIn: "Giriş yapıldı",
      departures: "Çıkışlar",
      checkedOut: "Çıkış yapıldı",
      leaveOverdue:
        "{count, plural, one {# kişi ayrılmadı, {days} gün gecikmiş} other {# kişi ayrılmadı, en uzun {days} gün gecikmiş}}",
      occupancy: "Doluluk",
      inHouseOf: "Konaklayan · {count} / {of}",
      expectedTonight: "Bu gece beklenen {count} / {of} uygun oda ({value})",
      ofSeparator: "/",
      noUnits: "Kiralanacak birim yok",
      roomsReadyForArrivals: "Bekleyen gelişe hazır oda",
      roomsNotReadyYet:
        "{count, plural, one {# oda henüz hazır değil} other {# oda henüz hazır değil}}",
      toClean: "Temizlenecek",
      awaitingInspection: "Kontrol bekliyor",
      readyRooms: "Hazır oda",
      arrivalsWaiting: "Oda bekleyen geliş",
      arrivalRooms: "Geliş odaları",
      owedOnDepartures: "Bugün ayrılanlarda bakiye",
      guests: "{count, plural, one {# misafir} other {# misafir}}",
      openFolios: "Açık folyo",
      openBalance: "Açık folyolarda bakiye",
      overdueOwing: "Gecikmiş, bakiyeli",
      movements: "Bugünkü hareket",
      tabArrivals: "Gelişler · {count}",
      tabDepartures: "Çıkışlar · {count}",
      stateReady: "Hazır",
      stateNotReady: "Hazır değil",
      stateBlocked: "Giriş yapılamaz",
      nights: "{count, plural, one {# gece} other {# gece}}",
      openEnded: "Açık uçlu",
      leavesToday: "Bugün",
      allArrivals: "{count, plural, one {Gelişi aç} other {# gelişin tümü}}",
      allDepartures: "{count, plural, one {Çıkışı aç} other {# çıkışın tümü}}",
      noArrivalsTitle: "Bugün kimse gelmiyor",
      noArrivalsDescription:
        "Gelecek rezervasyonlar ve yenileri Rezervasyonlar ekranında.",
      noDeparturesTitle: "Bugün kimse ayrılmıyor",
      noDeparturesDescription: "Konaklayanların tümü Çıkışlar ekranında.",
      openReservations: "Rezervasyonları aç",
      cleanFirst: "Önce bunları temizleyin",
      roomCount: "{count, plural, one {# oda} other {# oda}}",
      priorityArrival: "Bugün geliş",
      priorityInspect: "Geliş · kontrol",
      priorityLeaving: "Bugün boşalıyor",
      priorityQueue: "Sırada",
      floor: "{floor}. kat",
      noFloor: "Katsız",
      nothingToClean: "Temizlenecek oda yok.",
      rooms: "Odalar",
      ready: "Hazır",
      awaiting: "Temiz, kontrol bekliyor",
      dirty: "Kirli",
      roomsByFloor: "Katlara göre hazır odalar",
      floorReady: "{count} / {of}",
      owing: "Bakiyesiyle ayrılanlar",
      largestBalances: "En yüksek açık bakiyeler",
      allFolios: "Tüm folyolar",
      noBalances: "Açık bakiye yok.",
      noOwingTitle: "Bakiyeyle ayrılan yok",
      noOwingDescription:
        "Bugün ya da daha önce ayrılması gerekenlerin bakiyesi kapalı.",
      sectionUnavailable: "Bu bölüm okunamadı",
      sectionUnavailableDescription:
        "Diğer bölümler güncel. Yeniden deneyin ya da ekranı açın.",
      retry: "Yeniden dene",
      nothingForRole:
        "Bu tesiste rolünüz için burada gösterilecek bir şey henüz yok.",
      filterArrivalsToCome:
        "{count, plural, one {# geliş bekleniyor} other {# geliş bekleniyor}}",
      filterOwing:
        "{count, plural, one {# misafir bakiyeyle ayrılıyor} other {# misafir bakiyeyle ayrılıyor}}",
      filterOverdueOwing:
        "{count, plural, one {# gecikmiş çıkış, bakiyeli} other {# gecikmiş çıkış, bakiyeli}}",
      filterInService:
        "{count, plural, one {# hizmetteki oda} other {# hizmetteki oda}}",
      filterReady: "{count, plural, one {# hazır oda} other {# hazır oda}}",
      filterAwaitingInspection:
        "{count, plural, one {# temiz oda, kontrol bekliyor} other {# temiz oda, kontrol bekliyor}}",
      filterDirty: "{count, plural, one {# kirli oda} other {# kirli oda}}",
      filterOutOfService:
        "{count, plural, one {# hizmet dışı oda} other {# hizmet dışı oda}}",
      filterForArrival:
        "{count, plural, one {Gelenin beklediği # oda} other {Gelenlerin beklediği # oda}}",
      filterCleanFirst:
        "{count, plural, one {Önce temizlenecek # oda} other {Önce temizlenecek # oda}}",
      filterFloor:
        "{count, plural, one {{floor}. katta # oda} other {{floor}. katta # oda}}",
      filterNoFloor: "{count, plural, one {Katsız # oda} other {Katsız # oda}}",
      filterOpenFolios:
        "{count, plural, one {# açık folyo} other {# açık folyo}}",
      filterShowAll: "Tümünü göster",
      filterReadyCount: "{count, plural, one {# hazır} other {# hazır}}",
      roomOccupiedNoMark: "İçinde misafir var; ayrılınca temizlenir.",
      activityTitle: "Son hareketler",
      activityEmpty: "Dünden bu yana kayıt yok.",
      openAuditLog: "Denetim kaydını aç",
      chargesTitle: "Bugünkü ücretler",
      chargesNote: "Bugün işlenen ücretler, iadeler düşülmüş",
      openFinance: "Finansı aç",
      bookedTitle: "Önümüzdeki doluluk",
      bookedNote: "Rezervasyonlar ve konaklamalar; tahmin değil",
      bookedColNight: "Gece",
      bookedColUnits: "Tutulan birim",
      bookedColShare: "Doluluk",
      bookedOf: "{count} / {of}",
      openCalendar: "Oda takvimini aç",
      stripTitle: "Tesisleriniz",
      stripAttention:
        "{count, plural, =0 {Dikkat gerektiren bir şey yok} one {# şey dikkat gerektiriyor} other {# şey dikkat gerektiriyor}}",
      stripUnread: "Okunamadı",
      stripPartial: "bazı bölümler okunamadı",
      allRoomsToClean:
        "{count, plural, one {Temizlenecek odayı aç} other {Temizlenecek # odanın tümü}}",
      allOpenFolios:
        "{count, plural, one {Açık folyoyu aç} other {# açık folyonun tümü}}",
      allOwing:
        "{count, plural, one {Bakiyeyle ayrılan misafiri aç} other {Bakiyeyle ayrılan # misafirin tümü}}",
    },
    rates: {
      title: "Gecelik fiyatlar",
      hint: "Bir gecenin, konaklanan birimin türüne göre fiyatı. Bir rezervasyon, alındığı andaki fiyatı korur.",
      perNight: "gecelik",
      units:
        "{count, plural, =0 {Bu tesiste henüz yok} one {# birim} other {# birim}}",
      noPrice: "Fiyat yok",
      unpricedHint:
        "Bu türdeki rezervasyonlar fiyatsız alınır ve geceleri ücretlendirilmez.",
      stale:
        "{currency} olarak girildi. Tesis artık {property} kullanıyor; bu fiyat yeniden kaydedilene kadar hiçbir rezervasyona uygulanmaz.",
      invalid: "Bu, {currency} cinsinden geçerli bir fiyat değil.",
      readOnly:
        "Fiyatları fiyat belirleme yetkisi olanlar değiştirir. Siz burada görebilirsiniz.",
      priceFor: "{type} için gecelik fiyat",
    },
    configuration: {
      subtitle: "{property} ve organizasyonu için ayarlar",
      sections: "Bu sayfada",
      organizationTitle: "Organizasyon",
      organizationHint:
        "Ekibinizin gördüğü ad. Organizasyonunuzun tüm tesisleri için geçerlidir.",
      organizationName: "Organizasyon adı",
      organizationNeedsReach:
        "Organizasyonu yalnızca tüm tesislere erişimi olan biri yeniden adlandırabilir.",
      propertyTitle: "Tesis",
      propertyHint: "Bu tesisin adı ve hesap tuttuğu para birimi.",
      propertyName: "Tesis adı",
      currency: "Para birimi",
      currencyFixed:
        "Bu tesiste bir folyo açıldığından ya da fiyatlı bir rezervasyon alındığından beri sabit. Her folyo ve rezervasyon kendi para birimini korur.",
      searchCurrency: "Para birimi ara",
      noCurrency: "Eşleşen para birimi yok.",
      timeTitle: "Saat ve iş günü",
      timeHint:
        "Tesisin hangi saate göre çalıştığı ve iş gününün ne zaman bittiği. Bitişten önceki gece vardiyası hâlâ önceki günde çalışır.",
      timezone: "Saat dilimi",
      searchTimezone: "Saat dilimi ara",
      noTimezone: "Eşleşen saat dilimi yok.",
      cutoff: "İş günü şu saatte biter",
      businessDateNow: "Şu anki iş günü",
      businessDateAfter: "Kaydettikten sonra",
      businessDateForward: "Bugün {date} tarihine ilerler.",
      businessDateBack:
        "Bugün {date} tarihine geri döner. Kaydettikten sonra girişleri ve çıkışları kontrol edin.",
      housekeepingTitle: "Kat hizmetleri",
      modulesTitle: "Bu tesiste açık olanlar",
      modulesHint: "Ekibinizin bu tesiste kullanabildikleri.",
      elsewhereTitle: "Kendi ekranlarında yönetilenler",
      elsewhereHint: "Bu ayarların her birinin tek bir yeri var.",
      roomsHint: "Oda ve yatak ekleyin, bir birimi gerekçesiyle kapatın.",
      peopleHint:
        "Personel davet edin, rollerini ve erişecekleri tesisleri seçin.",
      save: "Değişiklikleri kaydet",
      discard: "Vazgeç",
      saving: "Kaydediliyor…",
      saved: "Kaydedildi",
      unchanged: "Kaydedilecek bir değişiklik yok.",
      refused: "Bu ayarlar değiştirilemedi. Şu an gördüğünüz, geçerli olandır.",
      stale:
        "Biri bu ayarları az önce kaydetti. Şimdi onun kaydettiğini görüyorsunuz; gerekiyorsa değişikliğinizi yeniden yapın.",
      currencyFixedRefused:
        "Siz düzenlerken bu tesiste bir folyo açıldı ya da fiyatlı bir rezervasyon alındı; para birimi artık sabit.",
      closedDay:
        "Bu değişiklik bugünü zaten kapatılmış bir iş gününe çevirirdi. Başka bir bitiş saati ya da saat dilimi seçin.",
      invalid: "Değerleri kontrol edip yeniden deneyin.",
      invalidName: "Ad 2 ile 120 karakter arasında olmalı.",
      invalidTimezone: "Listeden bir saat dilimi seçin.",
      invalidCurrency: "Listeden bir para birimi seçin.",
      invalidCutoff: "03:00 ile 11:45 arasında bir saat seçin.",
      readOnly:
        "Bu ayarları görebilirsiniz. Bir sahip ya da yönetici değiştirebilir.",
      fields: {
        name: "Ad",
        timezone: "Saat dilimi",
        currency: "Para birimi",
        businessDateCutoff: "İş gününün bitişi",
      },
    },
    integrations: {
      subtitle:
        "{organization} olaylarını nereye gönderiyor ve nelerin ulaşmadığı.",
      endpointsCount: "Uç nokta",
      deliveringCount: "İleten uç nokta",
      failingCount: "Hata veren uç nokta",
      openFailuresCount: "Ulaşmayan gönderim",
      endpointsTitle: "Webhook uç noktaları",
      endpointsDescription:
        "Ranza seçtiğiniz olayları, gerçekleştikçe imzalayarak bu adreslere gönderir.",
      noEndpointsTitle: "Henüz webhook uç noktası yok",
      noEndpointsDescription:
        "Bir HTTPS adresi ekleyin ve ona gönderilecek olayları seçin. Her gönderim imzalanır; her birine ne olduğu burada görünür.",
      noEndpointsReadOnly: "Bu kuruluş için kayıtlı webhook uç noktası yok.",
      readOnly:
        "Bu uç noktaları görebilirsiniz. Eklemek, denemek ve kaldırmak için tüm kuruluşa erişimle birlikte integrations.manage yetkisi gerekir.",
      addEndpoint: "Uç nokta ekle",
      addTitle: "Webhook uç noktası ekle",
      addDescription:
        "Ranza seçtiğiniz her olayı bu adrese imzalı JSON olarak gönderecek.",
      nameLabel: "Ad",
      namePlaceholder: "Kanal yöneticisi",
      urlLabel: "HTTPS adresi",
      urlPlaceholder: "https://example.com/ranza/webhooks",
      urlHint:
        "https:// ile başlamalıdır. Özel ağlardaki ve bu makinedeki adresler reddedilir.",
      eventsLabel: "Gönderilecek olaylar",
      events: {
        reservation_created: "Rezervasyon alınır",
        reservation_cancelled: "Rezervasyon iptal edilir",
        reservation_no_show: "Misafir gelmez",
        stay_checked_in: "Misafir giriş yapar",
        stay_checked_out: "Misafir çıkış yapar",
        folio_line_posted: "Folyoya masraf veya ödeme işlenir",
      },
      register: "Uç nokta ekle",
      registering: "Ekleniyor...",
      secretTitle: "İmza anahtarı",
      secretWarning:
        "Bu anahtarı şimdi kopyalayın. Yalnızca bir kez gösterilir ve bir daha okunamaz. Kaybederseniz uç noktayı kaldırıp yeniden ekleyin.",
      secretUse:
        "Her gönderim X-Ranza-Timestamp ve X-Ranza-Signature başlıklarını taşır. İmza, sha256= ifadesinin ardından zaman damgası, bir nokta ve ham istek gövdesinin bu anahtarla hesaplanan HMAC-SHA256 değeridir.",
      secretCopy: "Anahtarı kopyala",
      secretCopied: "Kopyalandı",
      secretDone: "Kaydettim",
      invalid: {
        name: {
          empty: "Uç noktaya bir ad verin.",
          too_long: "Ad 80 karakteri geçmemeli.",
        },
        url: {
          invalid: "Bu bir adres değil.",
          too_long: "Adres 2.048 karakteri geçmemeli.",
          not_https: "Adres https:// ile başlamalıdır.",
          has_credentials: "Adres kullanıcı adı veya parola içermemelidir.",
          blocked_host:
            "Bu adres özel bir ağda veya bu makinede; Ranza oraya göndermez.",
        },
        events: {
          none: "En az bir olay seçin.",
          unknown: "Bu olaylardan biri gönderilemez.",
        },
      },
      refused: {
        not_permitted:
          "Bunu burada yapamazsınız. Tüm kuruluşa erişimle birlikte integrations.manage yetkisi gerekir.",
        duplicate_url: "Bu adreste zaten bir uç nokta var.",
        too_many_endpoints: "Bir kuruluşun en fazla on uç noktası olabilir.",
        test_in_flight: "Bu uç noktaya zaten bir deneme olayı gidiyor.",
        unavailable: "Bu zaten kapatılmış ya da uç noktası kaldırılmış.",
        reason_required: "Nedenini en az 3 karakterle yazın.",
      },
      failed: "Bu işlem yapılamadı ve bildirildi. Tekrar deneyin.",
      health: {
        delivering: "İletiyor",
        failing: "Hata veriyor",
        unused: "Henüz gönderim yok",
      },
      lastDelivered: "Son ulaşan",
      neverDelivered: "Henüz hiçbir şey ulaşmadı",
      queued: "Sırada",
      openFailures: "Açık hata",
      sends: "Gönderir",
      sendTest: "Deneme olayı gönder",
      testEvent: "Deneme olayı",
      sendingTest: "Sıraya alınıyor...",
      testQueued:
        "Deneme olayı sıraya alındı. Birkaç saniye içinde gönderilir; sonuç burada görünür.",
      remove: "Kaldır",
      removing: "Kaldırılıyor...",
      removeTitle: "Bu uç nokta kaldırılsın mı?",
      removeDescription:
        "{name} artık olay almaz ve yoldaki gönderimler iptal edilir. Geçmişi kalır.",
      removeConfirm: "Uç noktayı kaldır",
      dismiss: "Şimdi değil",
      failedOperationsTitle: "Ulaşmayan gönderimler",
      failedOperationsDescription:
        "Başarısız bir gönderim 1 dakika, 5 dakika, 30 dakika, 2 saat ve 12 saat sonra yeniden denenir, sonra durur. Yeniden dene onu hemen tekrar gönderir.",
      noFailedOperations: "Bu tesiste hiçbir şey başarısız olmadı.",
      columns: {
        endpoint: "Uç nokta",
        whatHappened: "Ne oldu",
        attempts: "Deneme",
        nextAttempt: "Sonraki deneme",
        actions: "İşlemler",
        closed: "Kapatıldı",
        reason: "Neden",
      },
      lastAttemptAt: "Son: {when}",
      operationStatuses: {
        failed: "Durdu",
        retrying: "Deneniyor",
        resolved: "Çözüldü",
        cancelled: "İptal edildi",
      },
      dueNow: "Şimdi",
      noMoreAttempts: "Başka deneme yok",
      failures: {
        http_error: "Alıcı hata ile yanıt verdi",
        timeout: "Alıcı 10 saniyede yanıt vermedi",
        connection_failed: "Alıcıya bağlanılamadı",
        tls_failed: "Alıcının sertifikası kabul edilmedi",
        blocked_address: "Adres özel bir ağa veya bu makineye çıkıyor",
        invalid_target: "Bu adrese gönderilemez",
        redirect_refused: "Alıcı yönlendirdi; yönlendirmeler izlenmez",
        source_mismatch:
          "Olay, adını verdiği kayıtla uyuşmadı; bu yüzden gönderilmedi",
      },
      httpStatus: "HTTP {code}",
      receiverSaid: "Yanıtı: {excerpt}",
      retry: "Yeniden dene",
      retrying: "Deneniyor...",
      cancelOperation: "Denemeyi bırak",
      resolveOperation: "Çözüldü olarak işaretle",
      reasonLabel: "Neden",
      reasonPlaceholder: "Ne olduğunu birkaç sözcükle yazın",
      reasonHint: "En az 3 karakter. Adınızla birlikte kaydedilir.",
      reasonInvalid: {
        reason_too_short: "Nedenini en az 3 karakterle yazın.",
        reason_too_long: "Neden 500 karakteri geçmemeli.",
      },
      cancelTitle: "Bu gönderimin denenmesi bırakılsın mı?",
      cancelDescription:
        "Başka deneme yapılmaz. Olay bu uç noktaya gönderilmez.",
      cancelConfirm: "Denemeyi bırak",
      resolveTitle: "Bu hata çözüldü olarak işaretlensin mi?",
      resolveDescription:
        "Gönderim başarısız kalır. Başka bir yolla halledildiğini kaydediyorsunuz.",
      resolveConfirm: "Çözüldü olarak işaretle",
      failureAdvice: {
        http_error:
          "Alıcının günlüklerinde reddetme nedenine bakın, sonra Yeniden dene.",
        timeout:
          "Alıcı yavaş ya da kapalı. Otomatik yeniden denenir; Yeniden dene şimdi dener.",
        connection_failed: "Alıcıya internetten ulaşılabildiğini kontrol edin.",
        tls_failed: "Alıcının HTTPS sertifikasını düzeltin ya da yenileyin.",
        blocked_address:
          "Bu uç noktayı kaldırın ve herkese açık bir adresle yenisini ekleyin.",
        invalid_target:
          "Bu uç noktayı kaldırın ve geçerli bir https:// adresiyle yenisini ekleyin.",
        redirect_refused: "Yönlendirdiği adresi kaydedin.",
        source_mismatch:
          "Yeniden denenecek bir şey yok. İnceledikten sonra çözüldü olarak işaretleyin.",
      },
      othersNotAvailable:
        "Bugün kullanılabilen tek entegrasyon webhook'tur. Kanal yöneticileri, KBS bildirimi, e-fatura ve ödeme sağlayıcıları henüz kullanılamıyor.",
      noPermissionTitle: "Entegrasyonlara erişiminiz yok",
      noPermissionDescription:
        "Entegrasyonlar için entegrasyon yetkisi gerekir. Kuruluşunuzda personel erişimini yöneten birinden bunu isteyin.",
      addressPartHidden: "Bu adresin bir kısmı sizden gizlidir.",
      overdue:
        "{count, plural, one {# gönderim 5 dakikadan uzun süredir gönderilmeyi bekliyor. Bu sürerse gönderim durmuş olabilir.} other {# gönderim 5 dakikadan uzun süredir gönderilmeyi bekliyor. Bu sürerse gönderim durmuş olabilir.}}",
      technicalDetails: "Teknik ayrıntılar",
      closedFailuresTitle: "Kapatılan hatalar",
      closedFailuresDescription:
        "Sonunda ulaşan, bir kişi tarafından durdurulan ya da çözüldü işaretlenen hatalar. En yenisi üstte.",
      noClosedFailures: "Bu tesiste henüz kapatılmış hata yok.",
      tabOpen: "Açık ({count})",
      tabClosed: "Kapatılan",
      failuresViewLabel: "Hangi hatalar",
      pagesLabel: "Sayfalar",
      showing: "{from}–{to} / {total}",
      newer: "Daha yeni",
      older: "Daha eski",
      closedByRanza: "Otomatik",
      closedByYou: "Siz",
      closedByColleague: "Bir çalışma arkadaşı",
      closedReasonDelivered: "Gönderim ulaştı.",
      closedReasonEndpointRemoved: "Uç nokta kaldırıldı.",
      retryAll: "Durananların hepsini yeniden dene",
      retryAllTitle: "Durmuş tüm gönderimler yeniden gönderilsin mi?",
      retryAllDescription:
        "Bu tesiste durmuş her gönderim şimdi yeniden denenir. Yeniden başarısız olanlar olağan takvimi izler. Kaydıyla uyuşmadığı için gönderilmeyen olaylara dokunulmaz. Her yeniden deneme adınızla kaydedilir.",
      retryAllConfirm: "Hepsini yeniden dene",
      retriedAll:
        "{count, plural, one {# durmuş gönderim yeniden gönderildi.} other {# durmuş gönderim yeniden gönderildi.}}",
    },
    branding: {
      subtitle: "{organization} misafirlerine nasıl görünüyor",
      colorTitle: "Marka rengi",
      colorHint:
        "Misafir portalındaki birincil düğmeler, bağlantılar, etkin menü öğesi ve üst çubuk bu renkle çizilir. Başarı, uyarı ve hata renkleri değişmez.",
      colorLabel: "Renk (#rrggbb)",
      colorPicker: "Rengi seç",
      colorEmpty: "Renk seçilmedi: Ranza'nın kendi teması kullanılır.",
      defaultTheme: "Varsayılan tema",
      colorInvalid: "Rengi #0f5132 gibi, # ile ve altı hanede yazın.",
      colorReadable:
        "Renkli yüzeylerdeki yazı {foreground}; karşıtlığı {ratio} : 1.",
      colorTextSame:
        "Bağlantılar ve yazılar rengin kendisiyle çizilir; beyaz zeminde karşıtlığı {ratio} : 1.",
      colorTextDarker:
        "Bağlantılar ve yazılar beyaz zeminde okunabilsin diye aynı tonun daha koyu bir gölgesiyle çizilir: {shade} ({ratio} : 1).",
      swatchFill: "Düğmeler ve dolgular",
      swatchText: "Bağlantılar ve yazı",
      foreground: { white: "beyaz", black: "siyah" },
      logoTitle: "Logo",
      logoHint:
        "PNG, JPEG veya WebP; en fazla 512 KB, en az 128 piksel yüksekliğinde. SVG kabul edilmez, çünkü kod taşıyabilir.",
      logoLabel: "Logo dosyası",
      logoCurrent: "Geçerli logo",
      logoNone: "Logo yok: Ranza'nın işareti gösterilir.",
      logoRemove: "Logoyu kaldır",
      logoKeep: "Logoyu koru",
      logoWillBeRemoved: "Kaydettiğinizde logo kaldırılacak.",
      logoErrors: {
        empty: "Dosya boş.",
        too_large: "Dosya 512 KB'tan büyük.",
        svg: "SVG kabul edilmez, çünkü kod taşıyabilir. PNG, JPEG veya WebP kullanın.",
        unsupported_type:
          "Bu bir PNG, JPEG veya WebP görseli değil. Dosya adı değil, içeriği denetlenir.",
        corrupt: "Görsel okunamadı. Dosya bozuk olabilir.",
        too_small: "Görsel en az 128 piksel yüksekliğinde olmalı.",
        dimensions_too_large:
          "Görselin genişliği ve yüksekliği 4096 pikseli geçemez.",
      },
      previewTitle: "Önizleme",
      previewHint:
        "Misafir portalının üst çubuğu ve denetimleri böyle görünür.",
      previewHeader: "Portal üst çubuğu",
      previewButton: "Birincil düğme",
      previewLink: "Bir bağlantı",
      previewActive: "Etkin öğe",
      save: "Kaydet",
      discard: "Vazgeç",
      saving: "Kaydediliyor…",
      saved: "Kaydedildi. Misafirler sayfayı bir sonraki açışlarında görür.",
      reset: "Varsayılana döndür",
      resetDone: "Varsayılan tema geri geldi.",
      refused:
        "Bu değişiklik yapılamadı. Yetkiniz değişmiş olabilir; sayfayı yenileyin.",
      error: "Bir şeyler ters gitti. Yeniden deneyin.",
      needsReachTitle: "Markayı yalnızca tüm tesislere erişen biri değiştirir",
      needsReach:
        "Marka bütün Organizasyonun markasıdır. Değiştirmek, yetkiye ek olarak tüm tesislere erişimi gerektirir.",
      failedTitle: "Marka ekranı açılamadı",
      failedDescription:
        "Marka okunamadı. Yeniden deneyin; sürerse destek ekibine bildirin.",
      retry: "Yeniden dene",
    },
    dataExport: {
      heading: "Veri Dışa Aktarma",
      subtitle:
        "İsteğe bağlı ve zamanlanmış veri dışa aktarma kayıtları ve dosya indirmeleri.",
      tabs: {
        exports: "Dışa Aktarma Geçmişi",
        schedules: "Zamanlanmış Görevler",
        newExport: "Yeni Dışa Aktarma",
      },
      newExportTitle: "Yeni Veri Dışa Aktarma Talebi",
      newExportDescription:
        "Dışa aktarmak istediğiniz veri setlerini ve dosya formatını seçin.",
      datasetsTitle: "Veri Setleri",
      datasetsDescription: "Dışa aktarılacak varlık ve operasyon kayıtları.",
      datasets: {
        residents_guests: "Konuklar ve Sakinler",
        reservations_stays: "Rezervasyonlar ve Konaklamalar",
        rooms_beds: "Odalar ve Yataklar",
        folios_payments: "Folyolar ve Ödemeler",
        audit_log: "Denetim Günlüğü",
      },
      datasetDescriptions: {
        residents_guests: "Adlar, e-posta adresleri ve telefon numaraları",
        reservations_stays: "Tarihler, durumlar ve oda eşleşmeleri",
        rooms_beds: "Oda numaraları, katlar, tipler ve kapasite",
        folios_payments: "Ücret satırları, ödemeler ve bakiye dökümleri",
        audit_log: "Operasyonel eylemler, zaman damgaları ve kullanıcılar",
      },
      formatTitle: "Dosya Formatı",
      formatDescription: "Tablo (CSV) veya yapılandırılmış veri (JSON).",
      requestButton: "Dışa Aktarmayı Başlat",
      requesting: "Hazırlanıyor...",
      requestSuccess: "Dışa aktarma talebi başarıyla oluşturuldu.",
      requestFailed: "Dışa aktarma talebi oluşturulamadı.",
      scheduleTitle: "Otomatik Zamanlama Oluştur",
      scheduleDescription:
        "Düzenli aralıklarla otomatik olarak veri dışa aktarın.",
      scheduleName: "Plan Adı",
      scheduleNamePlaceholder: "Örn: Haftalık Finans Yedeklemesi",
      frequencyTitle: "Sıklık",
      frequencies: {
        daily: "Günlük",
        weekly: "Haftalık",
        monthly: "Aylık",
      },
      createScheduleButton: "Planı Kaydet",
      creatingSchedule: "Kaydediliyor...",
      scheduleSuccess: "Zamanlanmış dışa aktarma planı oluşturuldu.",
      scheduleFailed: "Plan oluşturulamadı.",
      recentExportsTitle: "Son Dışa Aktarma Kayıtları",
      recentExportsDescription:
        "Talebi gönderilen ve indirilebilir durumda olan dışa aktarma dosyaları.",
      schedulesTitle: "Aktif Zamanlama Planları",
      schedulesDescription:
        "Otomatik olarak çalışan periyodik dışa aktarma kuralları.",
      noExports: "Henüz bir dışa aktarma kaydı bulunmuyor.",
      noSchedules: "Yapılandırılmış zamanlanmış dışa aktarma bulunmuyor.",
      tableHeaders: {
        requester: "Talep Eden",
        datasets: "Veri Setleri",
        format: "Format",
        status: "Durum",
        size: "Boyut",
        records: "Kayıt Sayısı",
        requestedAt: "Talep Zamanı",
        actions: "İşlem",
      },
      scheduleHeaders: {
        name: "Plan Adı",
        datasets: "Veri Setleri",
        format: "Format",
        frequency: "Sıklık",
        status: "Durum",
        nextRun: "Sonraki Çalışma",
        actions: "İşlem",
      },
      statuses: {
        pending: "Bekliyor",
        processing: "İşleniyor",
        ready: "Hazır",
        failed: "Hata",
        expired: "Süresi doldu",
      },
      scheduleStatuses: {
        active: "Aktif",
        paused: "Duraklatıldı",
      },
      download: "İndir",
      pause: "Duraklat",
      resume: "Sürdür",
      pausing: "Duraklatılıyor...",
      resuming: "Başlatılıyor...",
      failures: {
        requester_not_permitted:
          "İsteyenin bu verileri dışa aktarma yetkisi artık yok.",
        too_large: "Dışa aktarma izin verilen boyutu aşıyor.",
        worker_stopped: "Dışa aktarma tamamlanamadan durdu.",
        internal_error: "Dışa aktarma tamamlanamadı.",
      },
      formats: {
        csv: { title: "CSV (e-tablo)", hint: "Excel, Numbers, Sheets" },
        json: {
          title: "JSON (yapılandırılmış)",
          hint: "Geliştirici API'leri, yedekleme",
        },
      },
      expiresOn: "{date} tarihine kadar indirilebilir",
      requestRefused:
        "Bu veri kümelerinin dışa aktarılmasını isteme yetkiniz yok.",
      scheduleRefused: "Bu zamanlamayı oluşturma yetkiniz yok.",
      failedTitle: "Veri dışa aktarma açılamadı",
      failedDescription: "Dışa aktarma kayıtları okunamadı. Tekrar deneyin.",
      retry: "Tekrar dene",
    },
    hr: {
      heading: "İnsan kaynakları ve bordro",
      subtitle:
        "Personel sözleşmeleri, haftalık vardiya çizelgesi, izinler ve bordro.",
      tabs: {
        employees: "Personel",
        rota: "Bu hafta",
        leave: "İzinler",
        payroll: "Bordro",
      },
      employees: {
        title: "Personel listesi",
        register: "Personel ekle",
        registerTitle: "Yeni personel kaydı",
        registerDescription:
          "Personelin sözleşme, görev ve maaş bilgilerini girin.",
        firstName: "Ad",
        lastName: "Soyad",
        email: "E-posta",
        phone: "Telefon",
        department: "Departman",
        position: "Görev",
        contract: "Sözleşme türü",
        since: "Başlangıç",
        grossPay: "Brüt maaş",
        grossPayIn: "Brüt maaş ({currency})",
        iban: "IBAN",
        ibanHint: "Kaydedildikten sonra maskelenmiş gösterilir.",
        status: "Durum",
        noEmployeesTitle: "Kayıtlı personel yok",
        noEmployeesDescription:
          "Personel kayıtları giriş yetkisinden ayrı tutulur; bu yüzden Ekip ekranından eklenen kişiler siz kaydedene kadar burada görünmez.",
        unregisteredTitle: "Personel kaydı olmayan ekip üyeleri",
        unregisteredDescription:
          "Bu kişiler sisteme girebilir, ancak personel olarak kaydedilene kadar vardiya listesinde ve bordroda yer almazlar.",
        registerAsEmployee: "Personel olarak kaydet",
        registerForLogin: "{email} girişine bağlanacak.",
        submit: "Kaydet",
        submitting: "Kaydediliyor...",
        cancel: "Vazgeç",
        contracts: {
          full_time: "Tam zamanlı",
          part_time: "Yarı zamanlı",
          seasonal: "Sezonluk",
          fixed_term: "Belirli süreli",
        },
        statuses: {
          active: "Çalışıyor",
          terminated: "Ayrıldı",
        },
        leftOn: "{date} tarihinde ayrıldı",
        terminate: "İşten ayrılışı kaydet",
        terminateTitle: "{name} için işten ayrılışı kaydet",
        terminateDescription:
          "Personel kaydı, vardiyaları, izinleri ve bordroları saklanır. İşten ayrılış, sisteme erişimi kaldırmaz; bunu Ekip ekranından değiştirin.",
        terminateDate: "Son çalışma günü",
        terminateConfirm: "Ayrılışı kaydet",
        terminating: "Kaydediliyor...",
      },
      rota: {
        title: "Haftalık vardiya çizelgesi",
        hint: "Vardiyayı değiştirmek için tıklayın. Resepsiyonda her sabah ve akşam en az bir personel bulunmalıdır.",
        staffMember: "Personel",
        today: "bugün",
        shifts: {
          morning: "Sabah",
          evening: "Akşam",
          day: "Gündüz",
          off: "İzinli",
        },
        shiftTimes: {
          morning: "07:00–15:00",
          evening: "15:00–23:00",
          day: "09:00–18:00",
          off: "İzin günü",
        },
      },
      leave: {
        title: "İzin talepleri",
        requestLeave: "İzin talebi oluştur",
        requestLeaveTitle: "Yeni izin talebi",
        staffMember: "Personel",
        type: "Tür",
        dates: "Tarihler",
        days: "gün",
        status: "Durum",
        actions: "İşlemler",
        approve: "Onayla",
        decline: "Reddet",
        clashWarning:
          "Aynı departmandan başka bir personelin izniyle çakışıyor",
        noLeaves: "Bekleyen veya geçmiş izin talebi bulunmuyor.",
        startsOn: "Başlangıç tarihi",
        endsOn: "Bitiş tarihi",
        notes: "Açıklama",
        notesPlaceholder: "İsteğe bağlı açıklama",
        submit: "Talebi ilet",
        submitting: "İletiliyor...",
        cancel: "Vazgeç",
        employeeLeft: "İşten ayrıldı",
        types: {
          annual: "Yıllık izin",
          sick: "Hastalık izni",
          unpaid: "Ücretsiz izin",
          emergency: "Mazeret izni",
          maternity: "Doğum izni",
        },
        statuses: {
          pending: "Bekliyor",
          approved: "Onaylandı",
          rejected: "Reddedildi",
        },
      },
      payroll: {
        period: "Dönem",
        summaryGrossNet: "Brüt {amount}, net {total}",
        gross: "Brüt",
        net: "Net maaş",
        socialSecurity: "SGK kesintisi",
        incomeTax: "Gelir vergisi",
        stampDuty: "Damga vergisi",
        approve: "Bordroyu onayla",
        approving: "Onaylanıyor...",
        approved: "Onaylandı",
        draft: "Taslak",
        previousPeriod: "Önceki dönem",
        nextPeriod: "Sonraki dönem",
        confirmTitle: "{period} bordrosu onaylansın mı?",
        confirmBody:
          "{count, plural, one {# personel} other {# personel}} için {currency} cinsinden ödeme yapılacak: brüt {amount}, net {total}.",
        confirmLocked:
          "Onay bordroyu kilitler. Sonradan değiştirilemez; şimdilik geri alma ya da düzeltme yolu da yoktur.",
        confirm: "Onayla ve kilitle",
        cancel: "Vazgeç",
        approvedOn:
          "{date} tarihinde onaylandı. Onaylanan bordro değiştirilemez.",
        organizationWide:
          "Onay, organizasyondaki tüm tesislerin tüm aktif personelini kapsar.",
        payslip: "Bordro eki",
        payslipTitle: "Maaş bordrosu",
        paidTo: "Ödeme hesabı",
        noBankAccount: "Kayıtlı banka hesabı yok",
        downloadPdf: "PDF indir",
        actions: "İşlemler",
        placeholderTitle: "Geçici kesintiler",
        placeholderBody:
          "SGK, gelir vergisi ve damga vergisi tutarları, işletme sahibi ve bir mali müşavirin onayı beklenen geçici değerlerdir. Onaylanmamıştır ve kimseye ödeme yapmak için kullanılmamalıdır.",
        needsReach: {
          title: "Bordro tüm organizasyon için yapılır",
          description:
            "Tüm tesisleri kapsadığı için hepsine erişim gerekir. Tüm organizasyona erişimi olan birinden isteyin.",
        },
        blocked: {
          period_not_ended:
            "Bu dönem henüz bitmedi, bu yüzden onaylanamaz. Bordro, ayın son gününden sonra onaylanır.",
          no_employees: "Bu dönem için ödeme yapılacak aktif personel yok.",
          mixed_currency:
            "Personele birden fazla para biriminde ödeme yapılıyor; bir bordro tek para birimindedir. Bu dönem, sorun çözülene kadar onaylanamaz.",
        },
      },
      outcomes: {
        invalid: {
          name: "Ad ve soyad girin.",
          department: "Bir departman girin.",
          position: "Bir görev girin.",
          email: "Bu e-posta adresi geçerli görünmüyor.",
          grossPay:
            "Brüt maaşı sayı olarak girin; para biriminin izin verdiğinden fazla ondalık yazmayın.",
          currency: "Bu para birimi tanınmıyor.",
          iban: "Bu IBAN geçerli görünmüyor.",
          period: "Bu bordro dönemi geçerli değil.",
          dates: "Tarihleri kontrol edin: bitiş, başlangıçtan önce olamaz.",
          terminatedOn:
            "Son çalışma gününü kontrol edin: işe başladığı günden önce olamaz.",
          shiftTime: "Bu vardiya saati geçerli değil.",
          request: "İstek okunamadı. Sayfayı yenileyip tekrar deneyin.",
        },
        refused: {
          not_permitted:
            "Bunu burada yapamazsınız ya da sayfa yüklendikten sonra durum değişti.",
          employee_terminated:
            "Bu personel işten ayrıldı; onun için yeni bir kayıt girilemez.",
          already_terminated: "Bu personel zaten işten ayrıldı.",
          already_registered:
            "Bu kişinin bu Organizasyonda zaten bir personel kaydı var.",
          other_property: "Bu personel başka bir tesise atanmış.",
          leave_overlap:
            "Bu personelin bu günlerin bir kısmında zaten onaylı izni var.",
          leave_decided: "Bu talep için zaten karar verildi.",
          payroll_needs_organization_reach:
            "Bordro tüm tesisleri kapsar; yalnızca hepsine erişimi olan biri onaylayabilir.",
          payroll_no_employees:
            "Bu dönem için ödeme yapılacak aktif personel yok.",
          payroll_mixed_currency:
            "Personele birden fazla para biriminde ödeme yapılıyor; bir bordro tek para birimindedir.",
          payroll_period_not_ended:
            "Bu dönem henüz bitmedi; henüz onaylanamaz.",
          payroll_draft_exists:
            "Bu dönem için bir taslak zaten var; bir yöneticinin temizlemesi gerekiyor.",
        },
        error:
          "Bir şeyler ters gitti ve bildirildi. Biraz sonra tekrar deneyin.",
      },
    },
    housekeeping: {
      subtitle: "{property} — temizlik bekleyen odalar",
      unavailableTitle: "Kat hizmetleri bu tesiste açık değil",
      unavailableDescription:
        "Kat hizmetleri, organizasyonunuzun aboneliğinde yer aldığında ve tesiste etkinleştirildiğinde burada görünür.",
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
      impactChangeBooking: "Rezervasyonu değiştir",
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
      equipmentTab: "Ekipman",
      planTab: "Bakım planı",
      addEquipment: "Ekipman ekle",
      editEquipment: "Ekipmanı değiştir",
      equipmentName: "Ad",
      equipmentNamePlaceholder: "Çamaşır makineleri",
      category: "Kategori",
      categoryPlaceholder: "Çamaşırhane",
      whereIs: "Nerede",
      atRoom: "Bir odada",
      atPlace: "Başka bir yerde",
      place: "Yer",
      placePlaceholder: "Çamaşır odası",
      interval: "Bakım sıklığı (ay)",
      intervalHint: "Düzenli bakımı yoksa boş bırakın.",
      lastServiced: "Son bakım",
      nextService: "Sonraki bakım",
      notScheduled: "Planlanmadı",
      neverServiced: "Henüz bakım yapılmadı",
      retire: "Kullanımdan kaldır",
      restore: "Geri al",
      retired: "Kullanımda değil",
      showRetired: "Kullanımda olmayanları göster",
      noEquipmentTitle: "{property} için ekipman yok",
      noEquipmentDescription:
        "Bakımı yapılan ve bozulabilen şeyleri — kazanlar, asansörler, makineler — kaydedin ve bakımlarını planlayın.",
      equipmentReadOnly:
        "Kaydı değiştirmek için ekipman yönetme yetkisi gerekir.",
      noPlanTitle: "Planlanmış bir şey yok",
      noPlanDescription:
        "Ekipman altında bir kaleme bakım sıklığı verin; sonraki bakım tarihine göre burada görünür.",
      daysOverdue: "{count, plural, other {# gün gecikti}}",
      dueToday: "Bugün",
      inDays: "{count, plural, other {# gün içinde}}",
      everyMonths: "{count, plural, one {her ay} other {her # ayda bir}}",
      createWorkOrder: "İş emri oluştur",
      workOrderOpen: "MT-{number} iş emri açık",
      workOrderTitle: "Bakım: {name}",
      service: "Periyodik bakım",
      equipment: "Ekipman",
      noEquipmentChosen: "Ekipman yok",
      noRoomChosen: "Oda yok",
      chooseRoomOrEquipment: "Bir oda, ekipman ya da ikisini seçin.",
      costTitle: "Maliyet",
      cost: "Tutar",
      vendor: "Yapan",
      vendorPlaceholder: "Boğaz Teknik",
      noCost: "Maliyet girilmedi",
      chargeTitle: "Konuğa ücret yansıt",
      chargeHint:
        "Konuğun folyosuna bir satır. Hata olursa folyoda iptal edilir.",
      guest: "Konuk",
      chooseGuest: "Konuk seçin",
      amount: "Tutar",
      charge: "Yansıt",
      noChargeable: "Bu odada kalan kimsenin açık folyosu yok.",
      reversedCharge: "iptal edildi",
      inHouseNow: "konaklıyor",
      leftOn: "{date} tarihinde ayrıldı",
      loading: "Yükleniyor…",
      chargeUnavailable: "Konuklar şu anda yüklenemedi. Tekrar deneyin.",
      actions: "İşlemler",
      change: "Değiştir",
      conditions: {
        working: "Çalışıyor",
        due: "Bakım zamanı",
        overdue: "Bakım gecikti",
        fault: "Arızalı",
      },
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

    analytics: {
      heading: "Analitik ve Raporlama",
      subheading:
        "Tesis doluluk, operasyonel hareketler ve finansal performans göstergeleri.",
      rangeToday: "Bugün",
      range7d: "Son 7 gün",
      range30d: "Son 30 gün",
      rangeMonth: "Ay",
      rangeSelectorLabel: "Zaman aralığı",
      occupancyRate: "Doluluk Oranı",
      occupancyRateDesc: "Satılabilir oda/yataklara göre gerçekleşen doluluk",
      sellableUnits: "Satılabilir Birim",
      occupiedNights: "Dolu Geceleme",
      availableNights: "Mevcut Geceleme",
      roomRevenue: "Oda Geliri",
      roomRevenueDesc: "Gerçekleşen net konaklama ücretleri",
      totalRevenue: "Toplam Gelir",
      adr: "ADR (Ort. Günlük Fiyat)",
      adrDesc: "Dolu oda/yatak başına ortalama konaklama geliri",
      revPar: "RevPAR (Mevcut Oda Geliri)",
      revParDesc: "Satılabilir tüm birimler başına ortalama konaklama geliri",
      netPayments: "Tahsil Edilen Ödemeler",
      netPaymentsDesc: "Dönem içinde tahsil edilen net ödeme tutarı",
      financialsMaskedNotice:
        "Finansal göstergeleri görüntüleme yetkiniz (finance.manage_folio) bulunmamaktadır.",
      dailyBreakdownTitle: "Günlük Performans Dağılımı",
      dailyBreakdownDesc:
        "Seçilen tarih aralığında gün bazlı doluluk ve konaklama geliri dökümü.",
      dateCol: "Tarih",
      occupiedUnitsCol: "Dolu Birim",
      availableUnitsCol: "Mevcut Birim",
      occupancyCol: "Doluluk",
      roomRevenueCol: "Oda Geliri",
      paymentsBreakdownTitle: "Ödeme Yöntemleri Dağılımı",
      cash: "Nakit",
      card: "Kredi Kartı",
      bankTransfer: "Havale / EFT",
      other: "Diğer",
      month: {
        navigation: "Rapor ayı",
        previousMonth: "Önceki ay",
        nextMonth: "Sonraki ay",
        monthToDate: "Ay başından bugüne · {total} günün {closed} günü kapandı",
        openNote:
          "Tüm oran ve gelir rakamları yalnızca kapanmış günleri kapsar. Bugün hâlâ açık: geceleri gün kapanana kadar ücretlendirilmez, bu yüzden hiçbir orana dahil edilmez.",
        asOf: "{date} itibarıyla. Bir düzeltme, düzelttiği gecenin gününe yazılır; bu yüzden geçmiş bir ay da değişebilir.",
        noActivityTitle: "{month} ayında hiçbir şey olmadı",
        noActivityDescription:
          "Tesiste o tarihe kadar hiçbir konaklama ve hiçbir ücret kaydı yoktu; bu yüzden gösterilecek bir oran yok. Hiçbir şey olmaması sıfır anlamına gelmez.",
        notFoundTitle: "Bu Tesis için analitik gösterilemiyor",
        notFoundDescription:
          "Analitik bu Tesiste açık olmayabilir ya da bu Tesise erişiminiz olmayabilir.",
        headline: "Öne çıkan göstergeler",
        occupancy: "Doluluk",
        occupancyArithmetic: "{occupied} dolu ÷ {available} mevcut geceleme",
        occupancyNone: "Mevcut geceleme yok, bölünecek bir şey yok.",
        adr: "Ortalama günlük fiyat (ADR)",
        adrArithmetic:
          "{revenue} oda geliri ÷ {nights} ücretlendirilen Misafir gecelemesi",
        adrNone:
          "Henüz ücretlendirilen Misafir gecelemesi yok, bölünecek bir şey yok.",
        revPar: "Mevcut geceleme başına gelir (RevPAR)",
        revParArithmetic: "{revenue} oda geliri ÷ {nights} mevcut geceleme",
        revParNone: "Mevcut geceleme yok, bölünecek bir şey yok.",
        againstPrior: "{month} ayında: {value}",
        pointsChange: "{value} puan",
        sameElapsedDays:
          "{month} ayının aynı geçen günleriyle karşılaştırılır.",
        noPrior: "Karşılaştırılacak önceki bir ay yok.",
        revenue: "Gelir",
        roomNightsCharged: "Ücretlendirilen oda geceleri",
        corrections: "Düzeltmeler (iptal edilen geceler)",
        netRoomRevenue: "Net oda geliri",
        otherRevenue: "Diğer gelir (net)",
        totalRevenue: "Toplam gelir",
        collected: "Tahakkuk ve tahsilat",
        revenueBooked: "Tahakkuk eden gelir",
        moneyCollected: "Tahsil edilen tutar",
        owedChange: "Misafirlerin borcundaki değişim",
        owedChangeNote:
          "Tahakkuk eden gelirden tahsilat çıkarılır: artı değer, Misafirlerin ay başına göre daha fazla borçlu olduğunu gösterir. Bu bir alacak raporu değildir.",
        collectedByMethod: "Yönteme göre tahsilat",
        nights: "Geceleme",
        availableNights: "Mevcut geceleme",
        occupiedNights: "Dolu geceleme",
        guestNights: "Misafir geceleri",
        residentNights: "Sakin geceleri",
        residentNote:
          "Sakinler aylık faturalandırılır; bu yüzden çok sayıda Sakin gecelemesi olan bir Tesiste oda geliri burada düşük görünür.",
        days: "Gün gün",
        dayCol: "Gün",
        occupiedCol: "Dolu geceleme",
        occupancyCol: "Doluluk",
        revenueCol: "Oda geliri",
        openDay: "Açık gün",
        notYetCharged: "Henüz ücretlendirilmedi",
        monthTotal: "Kapanan günlerin toplamı",
        unitTypes: "Birim türüne göre",
        unitTypeCol: "Birim türü",
        unitTypeNote:
          "Her gece, kalındığı birimin türüne yazılır. Satırların toplamı yukarıdaki rakamlara eşittir.",
        adrCol: "ADR",
        uncharged: "Ücretlendirilmeyen geceler",
        unchargedNote:
          "Kapanan günlerde dolu olup hiçbir oda gecesi ücretiyle karşılanmayan geceler ve nedenleri. Yalnızca sayılar: tutar gösterilmez.",
        unchargedNone: "Kapanan günlerin her dolu gecesi ücretlendirildi.",
        unchargedNights: "{n, plural, one {# gece} other {# gece}}",
        unchargedReason: {
          resident: "Sakin konaklaması, aylık faturalanır",
          unpriced: "Rezervasyonda fiyat yok",
          billing_unavailable: "Burada faturalama kullanılamıyor",
          no_folio: "Folyo yok",
          folio_closed: "Folyo kapalı",
          currency: "Başka bir para biriminde fiyatlanmış",
          not_yet_charged: "Henüz ücretlendirilmedi",
        },
        showDay: "{date} gününü göster",
        dayDescription: "O gece bir birimi tutan konaklamalar.",
        dayOpenNote:
          "Bu gün henüz kapanmadı. Geceleri gün kapanınca ücretlendirilir.",
        dayStays: "Konaklamalar",
        dayNoStays: "O gece kimse konaklamadı.",
        dayCharged: "Ücretlendirilen Misafir geceleri",
        nightCharged: "Ücretlendirildi",
        noGuestName: "Ad gösterilmiyor",
        dayCorrections: "Bu günün gecelerine yapılan düzeltmeler",
        correctionPosted: "{date} tarihinde işlendi",
        dayNavigation: "Gün",
        previousDay: "Önceki gün",
        nextDay: "Sonraki gün",
      },
    },

    portfolio: {
      subtitle: "{organization}: tüm Tesisler yan yana.",
      asOf: "Rakamlar {time} itibarıyla",
      listLabel: "Yan yana Tesisler",
      occupancyTitle: "Tesisler genelinde doluluk",
      coverage: "{total} Tesisin {reporting} tanesinde sayıldı",
      notReporting: "Hiçbir Tesiste mevcut değil",
      moneyOwedTitle: "Tahsil edilecek tutar",
      moneyOwedNote: "Açık folyo bakiyeleri, para birimi başına bir satır",
      maintenanceTitle: "Açık bakım",
      maintenanceNote: "Henüz tamamlanmamış talepler",
      cardOccupancy: "Dolu birimler",
      businessDate: "İş günü {date}",
      noSellableUnits: "Satılabilir birim yok",
      arrivals: "Bugün kalan girişler",
      departures: "Bugün kalan çıkışlar",
      maintenance: "Açık bakım talepleri",
      moneyOwed: "Tahsil edilecek tutar",
      hidden: "Gizli",
      unavailable: "Mevcut değil",
      withheld:
        "Bu Tesiste Analitik açık olmadığı için rakamlar gösterilmiyor.",
      moneyHiddenNotice:
        "Tahsil edilecek tutar gizli. Yalnızca folyo yönetebilenlere, faturalamanın açık olduğu Tesislerde gösterilir.",
      open: "{property} Tesisini aç",
      oneTitle: "Karşılaştıracak bir şey yok",
      oneDescription:
        "Tek bir Tesise erişiyorsunuz: {property}. Birden fazla Tesise eriştiğinizde burada yan yana görünürler.",
      noneTitle: "Gösterilecek Tesis yok",
      noneDescription: "Bu Organizasyonda erişebildiğiniz bir Tesis yok.",
      goToToday: "Bugün'e git",
      tooLargeTitle: "Karşılaştırmak için çok fazla Tesis var",
      tooLargeDescription:
        "{count} Tesise erişiliyor ve bu sayfa en fazla {max} Tesisi karşılaştırır. Sessizce kesilen bir karşılaştırma yanıltıcı olacağından hiçbiri gösterilmiyor.",
      failedTitle: "Portföy gösterilemedi",
      failedDescription:
        "Tesisleriniz okunurken bir şeyler ters gitti. Tekrar deneyin; sürerse yöneticinize bildirin.",
      retry: "Tekrar dene",
    },

    guestExperience: {
      heading: "Misafir Deneyimi ve Talepler",
      subheading:
        "Misafir ve konaklayan hizmet talepleri, önceliklendirme ve operasyonel takip.",
      newRequest: "Yeni Talep",
      allRequests: "Tüm Talepler",
      openRequests: "Açık Talepler",
      resolvedRequests: "Çözümlenenler",
      title: "Başlık",
      details: "Açıklama",
      category: "Kategori",
      priority: "Öncelik",
      status: "Durum",
      room: "Oda",
      guest: "Misafir",
      assignee: "Atanan Kişi",
      unassigned: "Atanmadı",
      reportedAt: "Oluşturulma",
      resolvedAt: "Çözümlenme",
      actions: "İşlemler",
      categories: {
        housekeeping: "Kat Hizmetleri",
        maintenance: "Teknik Bakım",
        amenities: "Oda İhtiyaçları",
        front_desk: "Resepsiyon",
        other: "Diğer",
      },
      priorities: {
        low: "Düşük",
        normal: "Normal",
        high: "Yüksek",
        urgent: "Acil",
      },
      statuses: {
        new: "Yeni",
        in_progress: "İşlemde",
        resolved: "Çözümlendi",
        cancelled: "İptal Edildi",
      },
      markInProgress: "İşleme Al",
      resolve: "Çözümle",
      cancel: "İptal Et",
      reopen: "Yeniden Aç",
      cancelReason: "İptal Gerekçesi",
      cancelReasonPlaceholder: "Neden iptal edildiğini belirtin...",
      resolutionNotes: "Çözüm Notları",
      resolutionNotesPlaceholder: "Yapılan işlemi belirtin...",
      createDialogTitle: "Yeni Hizmet Talebi Oluştur",
      createDialogDesc:
        "Misafir veya oda için yeni bir operasyonel hizmet talebi kaydedin.",
      titlePlaceholder: "Örn. Ekstra havlu veya yastık talebi",
      detailsPlaceholder: "Talep detaylarını yazınız...",
      selectCategory: "Kategori seçin",
      selectPriority: "Öncelik seçin",
      selectRoom: "Oda seçin (opsiyonel)",
      noRoom: "Oda seçilmedi",
      submit: "Talebi Kaydet",
      cancelling: "İptal ediliyor...",
      saving: "Kaydediliyor...",
      emptyTitle: "Henüz talep yok",
      emptyDesc: "Bu tesis için kayıtlı herhangi bir hizmet talebi bulunmuyor.",
    },

    auditLog: "Denetim kaydı",
    auditLogFor: "Son işlemler:",
    noAuditTitle: "Henüz kayıt yok",
    auditNotPermittedTitle: "Denetim kaydını okuyamıyorsunuz",
    auditNotPermittedDescription:
      "Denetim kaydını okumak ayrı bir izindir ve atandığınız tesislerde geçerlidir. Ekibi yöneten biri, Ekip ekranından size bu izni içeren bir rol verebilir, rolünüz organizasyonunuzun oluşturduğu bir rolse ona “Denetim kaydını okuma” iznini ekleyebilir ya da hiçbir tesise atanmadıysanız sizi bir tesise atayabilir.",
    auditNotHereTitle: "Bu tesiste denetim kaydını okuyamıyorsunuz",
    auditNotHereDescription: "Rolünüz buradan okuyabiliyor:",
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
    auditWhere: "Nerede",
    auditOrganizationWide: "Tüm organizasyon",
    auditFilters: "Denetim kaydını filtrele",
    auditActionFilter: "İşlem",
    auditAnyAction: "Tüm işlemler",
    auditProperty: "Tesis",
    auditEveryProperty: "Erişebildiğiniz tüm tesisler",
    auditFrom: "Başlangıç",
    auditTo: "Bitiş",
    auditPeriod: "Dönem",
    auditFromEmpty: "En eski",
    auditToEmpty: "En yeni",
    auditPickFrom: "İlk günü seçin",
    auditPickTo: "Son günü seçin",
    auditSpanDays: "{count, plural, other {# gün}}",
    auditPresetLast7: "Son 7 gün",
    auditPresetLast30: "Son 30 gün",
    auditPresetThisMonth: "Bu ay",
    auditSearch: "Ara",
    auditSearchHint: "Misafir, oda, ekip arkadaşı veya gerekçeden bir kelime",
    auditSearchTooShort: "Aramak için en az iki karakter yazın.",
    auditApply: "Uygula",
    auditClearFilters: "Filtreleri temizle",
    auditOlder: "Daha eski kayıtlar",
    auditNewest: "En yenilere dön",
    auditMatching: "{n, plural, other {# kayıt}}",
    auditNoMatchesTitle: "Bu filtrelere uyan kayıt yok",
    auditNoMatchesDescription:
      "Tarih aralığını genişletin, başka bir işlem seçin veya filtreleri temizleyin.",
    auditRecordMissingTitle: "Bu kayıt açılamıyor",
    auditRecordMissingDescription:
      "Kayıt yok ya da okuma yetkiniz olan bir kayıt değil.",
    auditLocalTime:
      "Her saat, işlemin yapıldığı tesisin saatine göredir; tüm organizasyonla ilgili kayıtlar bu tesisin saatini kullanır.",
    auditYes: "Evet",
    auditNo: "Hayır",
    auditNone: "Yok",
    auditChangedTo: "yeni değer",
    auditInspectionFollowsOrganization: "Organizasyonun ayarı",
    auditContext: {
      amountMinor: "Tutar",
      balanceMinor: "Kapanıştaki bakiye",
      totalGrossMinor: "Toplam brüt",
      totalNetMinor: "Toplam net",
      employeeId: "Personel",
      leaveFrom: "İznin başlangıcı",
      leaveTo: "İznin bitişi",
      contractType: "Sözleşme türü",
      hasSystemAccess: "Sistem erişimi var",
      terminatedOn: "Son çalışma günü",
      period: "Bordro dönemi",
      employeeCount: "Ödenen personel sayısı",
      description: "Açıklama",
      lineId: "Satır",
      reversedLineId: "Ters kaydedilen satır",
      reversalLineId: "Ters kayıt satırı",
      stayId: "Konaklama",
      folioId: "Folyo",
      accommodationUnitId: "Birim",
      guestId: "Misafir",
      guestCreated: "Yeni misafir kaydı",
      startsOn: "Giriş",
      endsOn: "Çıkış",
      from: "Önceki",
      to: "Yeni",
      role: "Rol",
      added: "Eklenen izinler",
      removed: "Kaldırılan izinler",
      permissions: "İzinler",
      propertyIds: "Tesisler",
      properties: "Tesisler",
      propertyId: "Tesis",
      userId: "Ekip üyesi",
      name: "Ad",
      names: "Adlar",
      key: "Rol anahtarı",
      holders: "Bu role sahip kişiler",
      unitIds: "Birimler",
      unitType: "Birim türü",
      capacity: "Kapasite",
      building: "Bina",
      floor: "Kat",
      letByTheBed: "Yatak bazında kiralanır",
      hadBeenBlockedFor: "Kapatılma gerekçesi",
      status: "Durum",
      previousStatus: "Önceki durum",
    },
    auditAction: {
      reservation: {
        created: "Rezervasyon alındı",
        checked_in: "Giriş yapıldı",
        check_in_reversed: "Giriş geri alındı",
        cancelled: "Rezervasyon iptal edildi",
        no_show: "Gelmedi olarak işaretlendi",
        amended: "Rezervasyon değiştirildi",
        arrival_time_changed: "Beklenen varış saati değiştirildi",
      },
      stay: {
        checked_out: "Çıkış yapıldı",
        departure_changed: "Çıkış tarihi değiştirildi",
        moved: "Misafir taşındı",
      },
      folio: {
        charge_posted: "Ücret işlendi",
        payment_posted: "Ödeme kaydedildi",
        line_reversed: "Satır ters kaydedildi",
        closed: "Folyo kapatıldı",
      },
      staff: {
        invited: "Ekip üyesi davet edildi",
        invitation_renewed: "Davet bağlantısı yenilendi",
        invitation_accepted: "Davet kabul edildi",
        readded: "Üye geri eklendi",
        role_changed: "Rol değiştirildi",
        role_permissions_changed: "Rol izinleri değiştirildi",
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
      business_day: { closed: "İş günü kapatıldı" },
      property: { configured: "Tesis ayarları değiştirildi" },
      organization: { configured: "Organizasyon yeniden adlandırıldı" },
      price_list: { changed: "Gecelik fiyatlar değiştirildi" },
      data_export: {
        requested: "Veri dışa aktarma istendi",
        downloaded: "Veri dışa aktarma indirildi",
      },
      maintenance_request: {
        reported: "Sorun bildirildi",
        moved: "Talep taşındı",
        cancelled: "Talep iptal edildi",
        assigned: "Talep atandı",
        prioritised: "Öncelik değişti",
        hold_released: "Oda bırakıldı, başka bir talep tutuyor",
        costed: "Maliyet girildi",
        guest_charged: "Hasar konuğa yansıtıldı",
      },
      maintenance_setting: {
        changed: "Bakım ayarı değişti",
      },
      maintenance_equipment: {
        added: "Ekipman eklendi",
        changed: "Ekipman değiştirildi",
        retired: "Ekipman kullanımdan kaldırıldı",
        restored: "Ekipman geri alındı",
        serviced: "Ekipmana bakım yapıldı",
      },
      employee: {
        registered: "Personel kaydedildi",
        terminated: "İşten ayrılış kaydedildi",
      },
      leave: {
        approved: "İzin onaylandı",
        declined: "İzin reddedildi",
      },
      payroll_run: {
        approved: "Bordro onaylandı",
      },
      branding: {
        changed: "Marka değiştirildi",
        reset: "Marka varsayılana döndürüldü",
      },
      webhook_endpoint: {
        registered: "Webhook uç noktası eklendi",
        removed: "Webhook uç noktası kaldırıldı",
        test_sent: "Deneme olayı gönderildi",
      },
      failed_operation: {
        retried: "Başarısız gönderim yeniden denendi",
        cancelled: "Başarısız gönderimin denenmesi bırakıldı",
        resolved: "Başarısız gönderim çözüldü olarak işaretlendi",
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
      maintenance_equipment: "Ekipman",
      business_day_close: "İş günü",
      data_export: "Veri dışa aktarma",
      employee: "Personel",
      leave_request: "İzin talebi",
      payroll_run: "Bordro",
      organization_brand: "Organizasyon markası",
      webhook_endpoint: "Webhook uç noktası",
      failed_operation: "Başarısız gönderim",
    },
    closeDay: {
      at: "Günün kapatıldığı tesis:",
      dueTitle: "{date} kapatılmayı bekliyor",
      dueDescription:
        "Gün {time} saatinde bitti. Hâlâ açık olanları çözün ya da bir gerekçeyle kapatın.",
      waiting:
        "{n, plural, one {Kapatılmayı bekleyen # gün var.} other {Kapatılmayı bekleyen # gün var; önce en eskisi kapatılır.}}",
      waitingBadge: "{n, plural, other {# gün bekliyor}}",
      preparingTitle: "{date} hâlâ açık",
      preparingDescription:
        "{time} saatinden sonra kapatılabilir. Aşağıda açık kalan her şey kapatmayı bekletir.",
      automatic:
        "Açık hiçbir şey kalmayan bir gün, bitişinden kısa süre sonra kendiliğinden kapanır.",
      notArrivedTitle: "Giriş yapmamış rezervasyonlar",
      notArrivedHelp:
        "Gelmedi olarak işaretleyin, rezervasyonu iptal edin ya da hâlâ geliyorlarsa girişlerini yapın.",
      notDepartedTitle: "Çıkış günü geçmiş konaklayanlar",
      notDepartedHelp: "Çıkışlarını Çıkışlar ekranından yapın.",
      roomNightsTitle: "Oda geceleri",
      roomNightsHelp:
        "Günü kapatmak, o gece konaklayan her misafire rezervasyonunun alındığı fiyatla bir gece ücreti işler. Ücretlendirilemeyen geceler burada listelenir ve kapatmayı bekletmez.",
      foliosTitle: "Açık bırakılan folyolar",
      foliosHelp:
        "Hesabı açıkken ayrılan misafirler. Kapanışla birlikte kaydedilir; kapatmayı bekletmez.",
      nothingOpen: "Açık bir şey kalmadı.",
      stepDone: "Tamam",
      stepOpen: "{n, plural, other {# açık}}",
      notBlocking: "Kapatmayı bekletmez",
      roomNightsTodayHelp:
        "Bu gecenin ücretleri bugün kapandığında işlenir. Çıkış yapan misafirin henüz işlenmemiş geceleri çıkışta işlenir.",
      roomNightsToCharge:
        "{n, plural, =0 {Ücretlendirilecek gece yok} one {# gece ücretlendirilecek} other {# gece ücretlendirilecek}}",
      roomNightsAllCharged: "Her misafir gecesi ücretlendirilecek.",
      notChargedReason: {
        unpriced: "Rezervasyonda fiyat yok",
        no_folio: "Folyo yok",
        folio_closed: "Folyo kapalı",
        currency: "Başka bir para biriminde fiyatlanmış",
        billing_unavailable: "Burada faturalama kullanılamıyor",
      },
      roomNightsColumn: "Oda geceleri",
      roomNightsNotCharged:
        "{n, plural, one {# gece ücretlendirilmedi} other {# gece ücretlendirilmedi}}",
      nightsHint:
        "Geceler, Sakinler dahil konaklayan herkesi sayar. Oda geceleri yalnızca misafirlerindir; Sakinler aylık faturalandırılır.",
      dueOn: "Beklenen giriş {date}",
      dueOutOn: "Beklenen çıkış {date}",
      leftOn: "Ayrıldı {date}",
      openArrivals: "Girişleri aç",
      openDepartures: "Çıkışları aç",
      openFolio: "Folyoyu aç",
      close: "{date} gününü kapat",
      closing: "Kapatılıyor…",
      dialogTitle: "{date} kapatılsın mı?",
      dialogQuiet:
        "Açık bir şey kalmadı. Kapanış, günün girişlerini, çıkışlarını ve dolu gecelerini kaydeder, rezervasyonu fiyatlı her misafirin gecesini ücretlendirir.",
      dialogOpen:
        "{n, plural, one {# kayıt hâlâ açık. Gerekçenizle birlikte kapanışa kaydedilir.} other {# kayıt hâlâ açık. Gerekçenizle birlikte kapanışa kaydedilir.}}",
      final:
        "Kapatılmış bir günü yeniden açmak henüz mümkün değil; kapatmadan önce tarihi kontrol edin.",
      keepOpen: "Şimdi değil",
      dismissed: "Tamam",
      reasonHint:
        "Günün neden açık kayıtlarla kapandığını yazın. Kapanışla birlikte saklanır.",
      noPermission:
        "Bu günü görebilirsiniz; kapatmak için Günü kapatma yetkisi gerekir.",
      alreadyClosed:
        "Bu gün zaten kapatıldı; başka bir masa ya da otomatik kapanış tarafından.",
      reasonRequired:
        "Hâlâ açık kayıtlar var, bu yüzden bir gerekçe gerekiyor.",
      refused:
        "Bu gün şu anda kapatılamıyor. Bu pencereyi kapattığınızda sayfa kapatılabilecek günü gösterecek.",
      recentTitle: "Son kapatılan günler",
      recentEmpty: "Bu tesiste henüz kapatılmış bir gün yok.",
      day: "Gün",
      closedBy: "Kapatan",
      automatically: "Otomatik",
      arrived: "Girişler",
      departed: "Çıkışlar",
      nights: "Geceler",
      leftOpen: "Açık kalan",
      foliosOpen: "Açık folyolar",
    },
    picker: {
      search: "Ara…",
      noMatches: "Eşleşen seçenek yok.",
      clear: "Seçimi temizle",
      selectedCount: "{n, plural, other {# seçili}}",
      required: "Devam etmek için birini seçin.",
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
      "room-calendar": "Oda takvimi",
      rooms: "Odalar ve yataklar",
      arrivals: "Girişler",
      departures: "Çıkışlar",
      "close-day": "Günü kapat",
      "guest-experience": "Konuk deneyimi",
      housekeeping: "Kat hizmetleri",
      maintenance: "Bakım",
      "food-and-beverage": "Yiyecek içecek",
      inventory: "Stok",
      finance: "Finans",
      people: "Ekip",
      hr: "İnsan kaynakları",
      analytics: "Analitik",
      portfolio: "Tüm Tesisler",
      configuration: "Ayarlar",
      integrations: "Entegrasyonlar",
      branding: "Marka",
      "data-export": "Veri dışa aktarma",
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
      hr: "Personel sözleşmeleri, haftalık vardiya çizelgesi, izinler ve bordro.",
      analytics: "Doluluk, gelir ve operasyon raporları.",
      "data-export":
        "İsteğe bağlı ve zamanlanmış veri dışa aktarma kayıtları ve indirmeler.",
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
    today: "Today",
    propertySwitcher: "Properties",
    chooseProperty: "Choose a Property",
    billingNotice: {
      title: "Payment for {organization} is overdue",
      description:
        "Everything in the Workspace keeps working for now. Please settle the payment.",
    },
    mainNavigation: "Main navigation",
    sections: "Sections",
    breadcrumb: "Breadcrumb",
    back: "Back",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    workspaceBadge: "Workspace",
    account: "Account",
    organization: "Organization",
    property: "Property",
    noPropertyTitle: "You are not assigned to a Property yet",
    noPropertyDescription:
      "A manager in your Organization assigns you to a Property, and it appears here.",
    signInSummary: "Sign in to run your Properties.",
    authSlogan: "Hospitality, refined.",
    authSubSlogan:
      "Dedicated workspace for properties, residents, reservations, and folios.",
    welcomeBack: "Welcome back",
    email: "Email",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    signIn: "Sign in",
    signingIn: "Signing in",
    signInFailed: "That email and password did not match.",
    signInThrottled: "Too many attempts. Try again shortly.",
    signInUnavailable: "Signing in isn't working right now. Try again shortly.",

    challengeTitle: "Second step",
    challengeSummary:
      "Enter the code from your authenticator app, or one of your backup codes.",
    code: "Code",
    verify: "Verify",
    challengeFailed: "That code is not valid.",
    challengeExpired:
      "Too many codes were tried, or too much time passed. Sign in again to enter a new code.",

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
    noFinanceTitle: "Finance is not open at this Property",
    noFinanceDescription:
      "It appears here once your Organization's Subscription includes it and the Property has it enabled.",
    noArrivalsTitle: "No arrivals today",
    noArrivalsDescription: "Nobody is booked to arrive at this Property today.",
    openEnded: "Open-ended",
    checkIn: "Check in",
    checkingIn: "Checking in",
    checkedIn: "Checked in",
    unitUnavailable: "That Unit is occupied for those nights.",
    unitOccupied:
      "Somebody is still staying in that Unit. Check them out first, or put this Guest in another Unit.",
    unitNotInService:
      "That Unit is blocked or out of order. Unblock it or return it to service, or put this Guest in another Unit.",
    blockReasonPlaceholder: "Maintenance or repair",
    roomNotReady:
      "This room isn't ready yet — it hasn't been cleaned, or it's waiting for inspection.",
    checkInAnyway: "Check in anyway",
    notNow: "Not now",
    ready: "Ready",
    notReady: "Not ready",
    checkInRefused: "That Reservation cannot be checked in.",
    checkInTooEarly:
      "This booking hasn't started yet — its first night is a later business day. Check the Guest in on that day, or change the booking to start today.",
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
    checkInDayClosed:
      "The business day this check-in was made on has been closed, so it can't be withdrawn. If the Guest is not staying, check them out on the departures screen.",
    checkInMoved:
      "The Guest has been moved to another room since they checked in, so it can't be withdrawn. If they are not staying, check them out on the departures screen.",
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
      checked_out: "Checked out",
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
    awaitingConfirmation: "Awaiting confirmation",
    occupiedDueOut: "Occupied — due out today",
    occupied: "Occupied",
    occupiedOverstay: "Occupied — overstaying",
    cancelBooking: "Cancel booking",
    cancelBookingTitle: "Cancel this booking",
    cancelBookingSummary:
      "The nights are freed and can be sold again. A cancellation cannot be taken back.",
    noShowTitle: "Mark as a no-show",
    noShowSummary:
      "The Guest did not come. The nights are freed, and this cannot be taken back.",
    markNoShow: "Mark as no-show",
    keepBooking: "Keep the booking",
    endBookingRefused: "That booking can no longer be ended.",
    saving: "Saving…",
    checkInBlocked: {
      not_confirmed: "The booking has to be confirmed first.",
      unit_blocked: "The Unit is blocked. Unblock it or choose another.",
      unit_out_of_service: "The Unit is out of service. Choose another.",
      unit_occupied: "Somebody is still in the room. Check them out first.",
    },
    checkOutFor: "Check {guest} out",
    checkOutTitle: "Check out",
    checkOutSummary:
      "The Guest leaves and the room can be let again. A check-out cannot be taken back, so review the bill first.",
    confirmCheckOut: "Confirm check-out",
    keepInHouse: "Keep in house",
    plannedDeparture: "Planned departure",
    plannedFor: "Planned {date}",
    noFolio: "No Folio",
    reviewFolio: "Open the Folio",
    checkOutEarlyAcknowledge:
      "The Guest is leaving before their planned departure on {date}.",
    checkOutEarlyRequired: "Confirm that the Guest is leaving early.",
    checkOutBalanceReason: "Why the balance stays open",
    checkOutNightsToCharge: "Charged at check-out",
    checkOutPendingNights:
      "{count, plural, one {# night} other {# nights}} · {amount}",
    checkOutUnpriced:
      "This booking was taken without a price, so its nights are not charged.",
    balanceAfterCheckOut: "Balance after check-out",
    checkOutBalanceHint:
      "The Folio stays open with {balance} on it, and your reason is recorded. A payment is recorded on the Folio.",
    checkOutBalanceReasonRequired:
      "The Folio has a balance. Say why it stays open.",
    checkOutFolioChanged:
      "Something was posted to the bill while you were looking. Review it again and try once more.",
    departuresViews: "Departure views",
    inHouseAt: "In house at",
    departuresDue: "Due and overdue",
    departuresInHouse: "Everybody in house",
    nobodyInHouseTitle: "Nobody is in house",
    nobodyInHouseDescription:
      "No Guest is checked in at this Property right now.",
    noGuestRecorded: "No Guest recorded",
    walkIn: "No Reservation",
    showOnRoomMap: "Show on the room map",
    noDeparturesTitle: "No departures today",
    noDeparturesDescription: "Nobody is due to leave this Property today.",
    leftToday: "Left today",
    leftAt: "Left at",
    nobodyLeftYet: "Nobody has left yet today.",
    readiness: "Readiness",
    reservation: "Reservation",
    roomAndBed: "Room and bed",
    notAssigned: "Not assigned",
    outOfOrder: "Out of order",
    daysLate: "{n, plural, one {# day late} other {# days late}}",
    credit: "credit",
    moreActionsFor: "More actions for {guest}",
    openFolio: "Open folio",
    leaves: "Leaves",
    overdueSince: "Overdue since {date}",
    untilDate: "until {date}",

    reservations: "Reservations",
    reservationsAt: "Bookings at",
    copyReference: "Copy reference",
    referenceCopied: "Copied",
    dueToday: "Due today",
    viewDetails: "View details",
    reservationDetails: "Reservation details",
    stayTimeline: "Stay timeline",
    contactDetails: "Contact details",
    financialDetails: "Billing & rate details",

    acceptInvitation: {
      summary: "{organization} has invited you to join as {role}.",
      title: {
        set_password: "Choose your password",
        sign_in: "Sign in to accept",
        accept: "Accept your invitation",
      },
      name: "Your name",
      passwordHint: "At least 8 characters. You will use it to sign in.",
      signInHint: "You already have an account for this address.",
      working: "One moment...",
      goToSignIn: "Go to sign in",
      submit: {
        set_password: "Set password and join",
        sign_in: "Sign in and accept",
        accept: "Accept invitation",
      },
      errors: {
        weak_password:
          "That password is too short or too long. Use 8 to 128 characters.",
        throttled: "Too many attempts. Try again in a moment.",
        account_exists:
          "An account already exists for this address. Sign in with its password instead.",
        unavailable:
          "This did not work. Try again, and tell whoever invited you if it keeps failing.",
        secondStep:
          "This account asks for a second step that cannot be done here.",
      },
      refused: {
        unknown: {
          title: "This link does not work",
          body: "It was copied incompletely or it is not an invitation.",
          next: "Ask whoever invited you to send the whole link again.",
        },
        expired: {
          title: "This invitation has expired",
          body: "An invitation link stands for seven days.",
          next: "Ask whoever invited you for a new link. Nothing else is needed from you.",
        },
        accepted: {
          title: "This invitation was already used",
          body: "A link works once, and this one has been used.",
          next: "If that was you, sign in. If it was not, tell whoever invited you.",
        },
        withdrawn: {
          title: "This invitation was withdrawn",
          body: "The person who sent it cancelled it, or sent a newer link.",
          next: "Ask whoever invited you for a current link.",
        },
        membership_revoked: {
          title: "This access was removed",
          body: "Your place in this Organization was removed before you used the link.",
          next: "Ask an administrator of the Organization to restore it and send a new link.",
        },
        other_account: {
          title: "This invitation is for someone else",
          body: "You are signed in as a different person than the one invited.",
          next: "Sign out, then open the link again.",
        },
      },
    },
    staff: {
      search: "Search the team",
      showRevoked:
        "{count, plural, one {Show # person whose access was removed} other {Show # people whose access was removed}}",
      noMatch: "Nobody on the list matches “{query}”.",
      showAll: "Show everyone",
      undoUntil: "Can be undone until {until}",
      undoOver: "The {hours}-hour undo window is over",
      linkNoLonger: "No working link",
      renewLink: "New invitation link",
      addBack: "Add back",
      done: "Done",
      chooseRole: "Choose a role",
      everyProperty:
        "Every Property in this Organization, including ones added later",
      reachesNothingWarning:
        "This person will reach no Property. They can sign in, but they will see nothing until you assign one.",
      roleDescriptions: {
        owner:
          "Everything, including the Organization’s brand. Give it sparingly: an Owner can change anyone’s role.",
        manager:
          "Runs a Property day to day: bookings, rooms, rates, staff, HR and payroll, and the ledger. Cannot change the Organization’s brand.",
        front_desk:
          "Bookings, check-in and check-out, taking payments and closing the day. No payroll, ledger or staff changes.",
        housekeeping:
          "Updates room status and reports maintenance. Nothing else.",
        finance:
          "Charges, payments and their reversals, the ledger and data exports. No bookings.",
      },
      copyLink: "Copy link",
      linkCopied: "Copied",
      copyFailed: "Could not copy. Select the link and copy it by hand.",
      linkNotSent:
        "No email was sent. Copy the link and send it to the person yourself.",
      showSection: "Show section",
      allSections: "All sections",
      sections: {
        frontDesk: "Front desk",
        money: "Money",
        rooms: "Rooms and housekeeping",
        guests: "Guest services",
        people: "People and HR",
        setup: "Setup and records",
      },
      revenueGateNote:
        "Also shows revenue and balances on Analytics, Today and Portfolio.",
      allowed: "Allowed",
      notAllowed: "Not allowed",
      unsavedRoles:
        "{count, plural, one {# role has unsaved changes} other {# roles have unsaved changes}}. {people, plural, =0 {Nobody holds them.} one {Saving signs out 1 person.} other {Saving signs out # people.}}",
      discardChanges: "Discard changes",
      saveChanges: "Save changes",
      confirmSaveTitle: "Save these role changes?",
      confirmSaveRoles: "You changed what {roles} may do.",
      confirmSaveNobody: "Nobody holds them yet, so nobody is signed out.",
      confirmSavePeople:
        "{people, plural, one {1 person holds} other {# people hold}} them. Saving signs them out, and they get the new permissions when they sign in again.",
      confirmRetireTitle: "Stop offering {role}?",
      retireBody:
        "{role} will no longer be offered when inviting someone or changing a role. Nobody holds it, so nobody is affected. You can offer it again at any time.",
      retireHeld:
        "{count, plural, one {1 person holds} other {# people hold}} {role}. Give them another role first, then stop offering it.",
      startFrom: "Start from",
      startFromPlaceholder: "A blank role",
      confirmRoleGains: "They gain: {permissions}.",
      confirmRoleLosses: "They lose: {permissions}.",
      hrPointer:
        "This list is who can sign in and what they may do. Pay, rota and leave are kept in",
      hrPointerLink: "HR & payroll",
      membership: {
        revoke: {
          title: "Remove access for {member}?",
          body: "{member} loses access to this Organization now. Every session they hold ends at once, on every device.",
          keeps:
            "Nothing is deleted. They stay on this list as removed, anything they recorded stays in the history under their name, and an unused invitation link stops working.",
          undo: "You can undo this for {hours} hours. After that they can only be added back with a new link, and they reach no Property until you assign one.",
          self: "This is your own access. You will be signed out as soon as you confirm, and you cannot undo it yourself.",
          confirm: "Remove access",
        },
        restore: {
          title: "Restore access for {member}?",
          body: "{member} gets back the role and the Properties they had. They must sign in again, because their sessions ended when access was removed.",
          until: "You can restore until {until}.",
          confirm: "Restore access",
        },
        renew: {
          title: "Make a new link for {member}?",
          body: "The old link stops working at once. Nothing is emailed: you copy the new link and pass it on yourself.",
          done: "The new link is ready. The old one no longer works.",
          confirm: "Make new link",
        },
        readd: {
          title: "Add {member} back?",
          body: "{member} joins the team again with their old role ({role}). They reach no Property until you assign one. A new link is made; nothing is emailed.",
          done: "They are back on the team. Pass the link on; they reach no Property yet.",
          confirm: "Add back",
        },
      },
      rosterOf: "The team at",
      screenSummary:
        "Who works here, which Properties they reach, and what each role may do.",
      readOnly: "You can see the team. An Owner or Manager can change it.",
      peopleTab: "People",
      rolesTab: "What each role can do",
      person: "Person",
      permission: "Permission",
      heldByCount:
        "{count, plural, =0 {nobody holds it} one {# person} other {# people}}",
      shippedGroup: "Ranza ships these",
      authoredGroup: "You defined these",
      invitationSent: "Link not yet used",
      inviteNotice:
        "Nothing is emailed. You copy the link and pass it on yourself. It works once and lapses after seven days.",
      matrixNote:
        "The roles Ranza ships arrive in a release and cannot be edited. Changes to your own roles are saved together, and the database enforces them.",
      cannotGrant:
        "Not saved for {roles}: you cannot grant a permission your own role does not hold. The other roles were saved.",
      invite: "Invite",
      inviteTitle: "Invite somebody to the team",
      inviteDescription:
        "The membership opens immediately. The link is only the way to a password.",
      sendInvitation: "Create invitation link",
      cancel: "Cancel",
      linkToPassOn: "Invitation link",
      linkExpires:
        "Works once, until {date}. Closing this window does not delete it: use “New invitation link” on the list to make another.",
      email: "Email",
      role: "Role",
      properties: "Properties",
      status: "Status",
      actions: "Actions",
      aboveYou: "Their role or reach is above yours.",
      active: "Active",
      awaitingPassword: "Awaiting a password",
      revoked: "Access removed",
      revoke: "Remove access",
      undoRevoke: "Restore access",
      reachesNothing: "No Property yet",
      reachesEverywhere: "Every Property",
      alreadyAMember:
        "That person already has a membership in this Organization.",
      refused: "That was refused.",
      lastAdministrator:
        "An Organization must keep somebody who can add staff. Give another person the Owner role first.",
      roleIsHeld: "Somebody holds this role. Move them first.",
      confirmRoleTitle: "Change this role?",
      confirmRoleChange: "{member} will go from {from} to {to}.",
      confirmRoleSessions:
        "Every session they hold will end, and they will need to sign in again.",
      confirmRoleSelf: "This is your own role, so you will be signed out.",
      confirmRoleSelfLosesAccess:
        "{to} cannot manage staff, so you will no longer be able to change anyone’s role or invite staff.",
      confirmRoleConfirm: "Change role",
      confirmRoleClose: "Close",
      roleChangedMeanwhile:
        "Somebody changed this role while you were deciding. {member} now holds {role}. Nothing was changed.",
      roleRetired: "That role is no longer offered. Nothing was changed.",
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
      retired: "No longer offered",
      retire: "Stop offering",
      reinstate: "Offer again",
      noCommands: "Nothing yet",
      permissions: {
        book: "Take a booking",
        checkIn: "Check somebody in",
        checkOut: "Check somebody out",
        cancel: "Cancel a booking or record a no-show",
        amend: "Change bookings and stays, and move Guests",
        closeDay: "Close the day",
        manageFolio: "Open and close a Folio",
        postCharge: "Post a charge",
        reverseCharge: "Reverse a charge",
        postPayment: "Record a payment",
        reversePayment: "Reverse a payment",
        viewLedger: "Read the general ledger",
        administerStaff: "Administer staff",
        defineRoles: "Define roles",
        configureAccommodation: "Configure rooms & beds",
        updateHousekeeping: "Update room status",
        reportMaintenance: "Report a maintenance problem",
        manageMaintenance: "Work maintenance requests",
        takeOutOfOrder: "Take rooms out of order and back",
        manageEquipment: "Keep the equipment register",
        readAudit: "Reading the audit log",
        manageConfiguration: "Manage configuration",
        manageRates: "Set nightly rates",
        readDataExports: "See data exports",
        createDataExports: "Request a data export",
        createServiceRequests: "Raise a guest request",
        manageServiceRequests: "Manage guest requests",
        viewHr: "See staff records and payroll",
        manageHr: "Manage staff records and payroll",
        viewIntegrations: "See integrations",
        manageIntegrations: "Manage integrations",
        manageBranding: "Manage the Organization's brand (colour and logo)",
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
    reservationsViews: "Show bookings",
    reservationsTab: {
      all: "All",
      arriving: "Arriving today",
      inHouse: "In house",
      departing: "Departing today",
      upcoming: "Upcoming",
    },
    reservationsTabEmpty: {
      arriving: "Nobody is due to arrive",
      inHouse: "Nobody is in house",
      departing: "Nobody is due to depart",
      upcoming: "Nothing booked for later",
    },
    reservationsTabEmptyHint: "Switch to All to see every booking.",
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
    departureRequiredHint:
      "A Guest booking needs a departure date. Only a Resident's may be left open-ended.",
    noBookableUnit:
      "No Unit can be booked here — every Unit is blocked, out of service, or let by the bed.",
    openRooms: "Go to Rooms & beds",
    quotePerNight: "{price} a night",
    quoteStay:
      "{count, plural, one {# night} other {# nights}}: {total} in total",
    quoteUnpriced:
      "No price is set for {type} here, so this booking is taken without one and its nights are not charged.",
    quoteResident:
      "A Resident is billed by the month, not priced by the night.",
    bookedPerNight: "{price} / night",
    bookedUnpriced: "No price",
    priceColumn: "Price",
    stayDates: "Stay dates",
    bookingAddDate: "Add date",
    bookingOpenEnded: "Open-ended",
    bookingPickArrival: "Choose the arrival day",
    bookingPickDeparture: "Choose the departure, or leave it open",
    bookingPickDepartureRequired: "Choose the departure day",
    stayNights: "{count, plural, one {# night} other {# nights}}",
    dateRangeClear: "Clear",
    dateRangeDone: "Done",
    chooseUnit: "Choose a Unit",
    takeBooking: "Create reservation",
    takingBooking: "Creating",
    discardBooking: "Cancel",
    bookingUnavailable: "That Unit is already booked for those nights.",
    unitBookedThoseNights: "Booked for these nights",
    unitOccupiedThoseNights: "Someone is staying then",
    chosenUnitTakenThoseNights:
      "This Unit is taken for the nights you chose. Pick another Unit or other dates.",
    bookingAvailabilityUnknown:
      "Could not check which Units are free for these nights. You can still choose one; saving will refuse a clash.",
    bookingOverOccupant:
      "Somebody is staying in that Unit for some of those nights.",
    bookingPeriodInvalid:
      "Those dates are not a period a Reservation can have. It covers at least one night and cannot start before today.",
    guestRequired: "Enter the Guest's name.",
    guestEmailInvalid:
      "Enter a valid email address, such as name@example.com, or leave it empty.",
    bookingGuestInvalid:
      "Check the Guest's name, email address and telephone number.",
    bookingArrivalInvalid: "Enter the expected arrival as a time of day.",
    expectedArrival: "Expected arrival",
    expectedAt: "Expected {time}",
    expectedArrivalHint:
      "Optional. When the Guest expects to arrive, on the Property's clock.",
    expectedArrivalNone: "No expected time",
    expectedArrivalPassed: "Past the expected time",
    bookingPriceChanged:
      "The price for this Unit changed while you were booking. Check the new price and take the booking again.",
    bookingRefused: "That booking cannot be taken.",
    changeBooking: "Change booking",
    changeBookingSummary:
      "Move it to other nights or another Unit. Its price is kept unless the Unit is of another kind.",
    changeBookingChecking: "Checking those nights…",
    changeBookingLoadFailed:
      "Those nights could not be checked. Choose the dates again.",
    changeBookingUnitFree: "Free",
    changeBookingUnitBooked: "Booked · {reference}",
    changeBookingUnitOccupied: "Somebody is staying",
    changeBookingUnitNotTaking: "Not taking bookings now",
    changeBookingCurrentNotTaking:
      "This Unit is out of service or let by the bed. The booking's dates can still change here, or it can move to another Unit.",
    changeBookingBlockedBooked:
      "Booking {reference} holds some of those nights. To swap two bookings, move one of them to a free Unit first.",
    changeBookingBlockedOccupied:
      "Somebody is staying in that Unit for some of those nights.",
    changeBookingBeforeToday: "The arrival must be today or later.",
    changeBookingPriceKept: "{price} a night, as booked",
    changeBookingPriceChanges: "{from} → {to} a night",
    changeBookingPriceNone:
      "{type} has no price: the booking will be unpriced.",
    changeBookingNote: "Note (optional)",
    changeBookingNoteHint: "Kept on the booking's history and the audit log.",
    saveChange: "Save change",
    keepAsItWas: "Keep as it was",
    changeBookingChanged:
      "Somebody changed this booking a moment ago. It is shown as it now stands.",
    changeBookingNotInService: "That Unit cannot take this booking now.",
    changeBookingNoteInvalid: "A note is between 3 and 500 characters.",
    changeBookingNothing:
      "The dates and the Unit are the same: there is nothing to change.",
    changeBookingRefused: "This booking cannot be changed.",
    changeDeparture: "Change departure",
    changeDepartureSummary:
      "Extend or shorten the stay. A Guest's extra nights are charged at the booking's own price; leaving today is a check-out.",
    changeDepartureLonger:
      "{count, plural, one {# more night} other {# more nights}} at {price} each",
    changeDepartureLongerUnpriced:
      "{count, plural, one {# more night} other {# more nights}}, not charged: the booking was taken without a price",
    changeDepartureLongerResident:
      "{count, plural, one {# more night} other {# more nights}}; a Resident is billed by the month",
    changeDepartureShorter:
      "{count, plural, one {# night fewer} other {# nights fewer}}",
    changeDepartureOpen: "No departure: the stay stays open-ended.",
    changeDepartureNeedsEnd:
      "A Guest's stay needs a departure; only a Resident's may be open-ended.",
    changeDepartureBlocked:
      "Booking {reference} holds some of those nights. Move the Guest or that booking first.",
    changeDepartureNothing: "That is already the departure.",
    changeDepartureRefused: "This stay cannot be changed.",
    saveDeparture: "Save departure",
    extendStay: "Extend",
    moveGuest: "Move Guest",
    moveGuestSummary:
      "Move them to another Unit from tonight. The stay, its folio and its price go with them; the room left is marked for cleaning.",
    moveGuestReason: "Reason",
    moveReason: {
      fault: "The room has a fault",
      upgrade: "An upgrade",
      guest_request: "The Guest asked",
      other: "Another reason",
    },
    moveGuestUnitNotReady: "Not ready",
    moveGuestPriceKept:
      "{price} a night, as booked: a move does not change the price",
    moveGuestUnpriced: "The booking has no price; a move does not change that.",
    moveGuestNoteRequired: "For another reason, say why in the note.",
    moveGuestNotReady:
      "That Unit is not ready yet. Choose another, or have it cleaned first.",
    moveGuestRefused: "This Guest cannot be moved.",
    folios: "Folios",
    foliosAt: "Folios at",
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
    addPayment: "Record payment",
    paymentMethod: "Payment method",
    paymentMethods: {
      cash: "Cash",
      card: "Credit card",
      bank_transfer: "Bank transfer",
      other: "Other",
    },
    paymentRefused: "That payment could not be posted.",
    amountInvalid:
      "An amount must be a positive number with no more decimal places than the currency allows.",
    reverse: "Reverse",
    reversing: "Reversing…",
    reversed: "reversed",
    roomNightLine: "Room night · {date}",
    reverseReason: "Reason",
    reverseRefused: "That line could not be reversed.",
    closeFolio: "Close folio",
    closing: "Closing…",
    closeRefused: "That folio could not be closed.",
    folioInHouseNote:
      "The Guest is still in house, so the Folio stays open: their remaining nights are charged to it. It can be closed after check-out.",
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
    buildingColumn: "Building",
    floorColumn: "Floor",
    floorNumber: "Floor {floor}",
    noFloor: "No floor set",
    bedCount: "{count, plural, one {# bed} other {# beds}}",
    sleeps: "Sleeps {count}",
    tonightColumn: "Tonight",
    unitActions: "Actions",
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
    statReserved: "Reserved tonight",
    nextArrivalOn: "Next arrival {date}",
    outOfOrderBeds: "{count, number} out of order",
    blockedStatus: "Blocked",
    roomCalendar: {
      subtitle: "Rooms and beds against the Property's business days.",
      previous: "Previous 7 days",
      next: "Next 7 days",
      today: "Today",
      goTo: "Go to a date",
      chosenDay: "The date you chose",
      length: "Days shown",
      lengthOption: "{days, plural, one {# day} other {# days}}",
      floorFilter: "Floor",
      allFloors: "All floors",
      floorOption: "Floor {floor}",
      noFloor: "No floor",
      noBuilding: "No building",
      search: "Search a room or Guest",
      filters: "Filters",
      filtersCount: "Filters ({count})",
      showRequested: "Show requested",
      showDeparted: "Show departed",
      collapseAll: "Fold all beds",
      expandAll: "Show all beds",
      overlapCount: "{count, plural, one {# overlap} other {# overlaps}}",
      bookedWhileBlockedCount:
        "{count, plural, one {# booked while blocked} other {# booked while blocked}}",
      legend: "What the marks mean",
      requested: "Requested",
      confirmed: "Confirmed",
      inHouse: "In house",
      overdue: "Overdue",
      departed: "Departed",
      overlap: "Overlap",
      clashes: "Clashes with a booking",
      bookedWhileBlocked: "Booked while blocked",
      blocked: "Blocked",
      outOfService: "Out of service",
      gridLabel: "Rooms and beds by night",
      roomColumn: "Room",
      freeRow: "Free",
      freeOn:
        "{date}: {n, plural, one {# of {of, number} free} other {# of {of, number} free}}",
      expand: "Show the beds of {room}",
      collapse: "Fold the beds of {room}",
      bedsTakenLabel: "{n, number} of {of, number} beds taken",
      barLabel: "{guest}, {status}, {from} to {to}",
      barLabelOverdue:
        "{guest}, in house and overdue, arrived {from}, was due to leave {to}, still in the room tonight",
      barOverdueCard: "Overdue · in the room through tonight (was due {to})",
      noGuestRecorded: "No Guest recorded",
      noEndDate: "No end date",
      refreshFailed:
        "Couldn't refresh. Showing the calendar as it was at {time}.",
      noRoomsTitle: "No rooms yet",
      noRoomsDescription:
        "Add rooms and beds, and they appear here against the days.",
      goToRooms: "Go to Rooms & beds",
      noMatchTitle: "No rooms match",
      noMatchDescription:
        "Nothing on this calendar matches the floor, search or filters chosen.",
      clearFilters: "Clear filters",
      filteredNote:
        "Filtered. The free and overlap counts still cover every room.",
      nothingBooked: "Nothing is booked from {from} to {to}.",
      failedTitle: "The room calendar could not be shown",
      failedDescription: "Nothing was changed. Try again in a moment.",
      retry: "Try again",
      loading: "Loading the room calendar",
      goneTitle: "No longer on the calendar",
      goneNote:
        "This booking was cancelled, checked out or moved out of this window since you opened it.",
      changedNote: "This booking has changed since you opened it.",
      overlapNote:
        "Another booking holds some of these nights in this room. Resolve it before the Guest arrives.",
      clashNote:
        "This request clashes with a confirmed booking; confirming it as it stands would be refused.",
      clashStayNote:
        "This request clashes with a Guest in house on these nights; confirming it as it stands would be refused.",
      clashesStay: "Clashes with a Guest in house",
      windowFailed:
        "That window couldn't be opened. Still showing the one before, as it was at {time}.",
      blockedNote:
        "This room is out of use ({reason}), so its check-in will be refused until it is released.",
      overdueNote:
        "Still in the room: {days, plural, one {# day} other {# days}} past their date of {date}. Check them out, or change their departure.",
      arrives: "Arrives",
      arrived: "Arrived",
      inRoomSince: "In this room since",
      leaves: "Leaves",
      wasDue: "Was due to leave",
      daysLate: "{days, plural, one {# day} other {# days}}",
      left: "Left",
      booked: "Booked",
      nightsLabel: "Nights",
      nightsSoFar: "Nights through tonight",
      nights: "{count, plural, one {# night} other {# nights}}",
      stayType: "Booked as",
      reservationCode: "Reservation",
      roomStatus: "Room status",
      roomReadiness: {
        ready: "Ready",
        awaiting_inspection: "Clean, awaiting inspection",
        dirty: "Dirty",
        occupied: "A Guest is in it",
      },
      guest: "Guest",
      resident: "Resident",
      balance: "Balance",
      balanceAsOfCharge: "Balance as of the last charge",
      laterNightsPost:
        "Later nights post at the close of the day, or at check-out.",
      folioClosed: "Folio closed",
      open: {
        arrivals: "Open in Arrivals",
        departures: "Open in Departures",
        reservations: "Open in Reservations",
      },
      barWord: {
        overlap: "Overlap",
        bookedWhileBlocked: "Blocked",
        clashes: "Clash",
      },
      typeFilter: "Unit type",
      allTypes: "All types",
      stateFilter: "Unit state",
      allStates: "All states",
      unitState: {
        available: "Available",
        occupied: "Occupied",
        blocked: "Blocked",
        out_of_service: "Out of service",
      },
      moveHint:
        "Drag a booking to another room or day to move it; nothing is saved until you confirm.",
      dragHint: "Drag to move it, or use Move… in its details.",
      resizeHint: "Drag to change the departure",
      dropBlocked: "It cannot go here",
      moveAction: "Move…",
      moveBooking: "Move booking",
      moveBookingSummary:
        "Check where it would go before anything is saved. Its price is kept unless the Unit is of another kind.",
      confirmMove: "Move booking",
      moveFrom: "From",
      moveTo: "To",
      cannotMoveTitle: "This cannot be moved",
      moveConflict: {
        past: "The arrival must be today or later.",
        notSellable: "{unit} is let by the bed: choose one of its beds.",
        blocked: "{unit} is blocked for some of those nights.",
        outOfService: "{unit} is out of service for some of those nights.",
        booked: "{guest} has booked some of those nights.",
        occupied: "{guest} is staying in that Unit for some of those nights.",
        leavesToday: "Leaving today is a check-out. Choose tomorrow or later.",
        ended: "A stay that has ended cannot be moved.",
        noBooking: "A stay with no booking cannot be moved from here.",
      },
    },

    dashboard: {
      greetingMorning: "Good morning,",
      greetingAfternoon: "Good afternoon,",
      greetingEvening: "Good evening,",
      updated: "Updated {time}",
      stale: "Couldn't refresh · showing {time}",
      workingDayStill:
        "It is {date} on the clock; the Property moves to the new day at {time}.",
      newBooking: "New booking",
      attentionTitle: "Needs attention",
      nothingNeedsAttention: "Nothing needs attention.",
      attentionIncomplete:
        "Some sections could not be read; this list may be incomplete.",
      attentionMore: "{count, plural, one {# more} other {# more}}",
      notReady: "Room not ready",
      notReadyDetail: "Arriving today; the room is not ready yet.",
      notReadyDirty: "Arriving today; the room has not been cleaned yet.",
      notReadyAwaitingInspection:
        "Arriving today; the room is clean and waiting for inspection.",
      notReadyOccupied: "Arriving today; someone is still in the room.",
      notReadyOutOfService:
        "Arriving today; the room is blocked or out of service.",
      blocked: "Can't check in",
      blockerNotConfirmed: "The booking is not confirmed yet.",
      blockerUnitBlocked: "The unit is blocked.",
      blockerUnitOutOfService: "The unit is out of service.",
      blockerUnitOccupied: "Someone is still in the unit.",
      overdue: "Overdue departure",
      overdueDetail:
        "{days, plural, one {# day} other {# days}} overdue · was due to leave on {date}.",
      overdueLabel: "Overdue · {days, plural, one {# day} other {# days}}",
      leavesOwing: "Leaving with a balance",
      leavesOwingDetail: "Leaves today · balance {balance}",
      outOfService: "Out of service",
      outOfServiceDetail: "Not for sale.",
      openArrivals: "Open arrivals",
      openDepartures: "Open departures",
      openFolio: "Open Folio",
      openBoard: "Open the board",
      openRooms: "Open rooms",
      urgentRepair: "Urgent repair",
      dueBack: "Overdue return",
      dueBackDetail: "Was due back on {date}.",
      requestReference: "MT-{number}",
      openMaintenance: "Open maintenance",
      maintenanceTitle: "Maintenance",
      openRequests: "Open requests",
      statusNew: "New",
      statusInProgress: "In progress",
      statusWaitingForParts: "Waiting for parts",
      roomsOutOfOrder: "Out of order",
      arrivals: "Arrivals",
      checkedIn: "Checked in",
      departures: "Departures",
      checkedOut: "Checked out",
      leaveOverdue:
        "{count, plural, one {# to leave, overdue {days, plural, one {# day} other {# days}}} other {# to leave, longest overdue {days, plural, one {# day} other {# days}}}}",
      occupancy: "Occupancy",
      inHouseOf: "In house · {count} / {of}",
      expectedTonight:
        "Expected tonight {count} / {of} available rooms ({value})",
      ofSeparator: "/",
      noUnits: "No units to let",
      roomsReadyForArrivals: "Rooms ready for waiting arrivals",
      roomsNotReadyYet:
        "{count, plural, one {# room not ready yet} other {# rooms not ready yet}}",
      toClean: "To clean",
      awaitingInspection: "Awaiting inspection",
      readyRooms: "Ready rooms",
      arrivalsWaiting: "Arrivals waiting on a room",
      arrivalRooms: "Arrival rooms",
      owedOnDepartures: "Balance on today's departures",
      guests: "{count, plural, one {# Guest} other {# Guests}}",
      openFolios: "Open Folios",
      openBalance: "Balance across open Folios",
      overdueOwing: "Overdue with a balance",
      movements: "Today's movements",
      tabArrivals: "Arrivals · {count}",
      tabDepartures: "Departures · {count}",
      stateReady: "Ready",
      stateNotReady: "Not ready",
      stateBlocked: "Can't check in",
      nights: "{count, plural, one {# night} other {# nights}}",
      openEnded: "Open-ended",
      leavesToday: "Today",
      allArrivals:
        "{count, plural, one {Open arrivals} other {All # arrivals}}",
      allDepartures:
        "{count, plural, one {Open departures} other {All # departures}}",
      noArrivalsTitle: "Nobody arrives today",
      noArrivalsDescription:
        "Upcoming and new bookings are on the Reservations screen.",
      noDeparturesTitle: "Nobody leaves today",
      noDeparturesDescription: "Everyone in house is on the Departures screen.",
      openReservations: "Open Reservations",
      cleanFirst: "Clean these first",
      roomCount: "{count, plural, one {# room} other {# rooms}}",
      priorityArrival: "Arrival today",
      priorityInspect: "Arrival · inspect",
      priorityLeaving: "Leaving today",
      priorityQueue: "Queued",
      floor: "Floor {floor}",
      noFloor: "No floor",
      nothingToClean: "No room needs cleaning.",
      rooms: "Rooms",
      ready: "Ready",
      awaiting: "Clean, awaiting inspection",
      dirty: "Dirty",
      roomsByFloor: "Ready rooms by floor",
      floorReady: "{count} / {of}",
      owing: "Leaving with a balance",
      largestBalances: "Largest open balances",
      allFolios: "All Folios",
      noBalances: "No open balances.",
      noOwingTitle: "Nobody leaves with a balance",
      noOwingDescription:
        "Everyone due to leave today or before has a closed balance.",
      sectionUnavailable: "This section could not be read",
      sectionUnavailableDescription:
        "The rest is current. Try again, or open the screen.",
      retry: "Try again",
      nothingForRole:
        "There is nothing here for your role at this Property yet.",
      filterArrivalsToCome:
        "{count, plural, one {# arrival still to come} other {# arrivals still to come}}",
      filterOwing:
        "{count, plural, one {# Guest leaving with a balance} other {# Guests leaving with a balance}}",
      filterOverdueOwing:
        "{count, plural, one {# overdue departure with a balance} other {# overdue departures with a balance}}",
      filterInService:
        "{count, plural, one {# room in service} other {# rooms in service}}",
      filterReady: "{count, plural, one {# ready room} other {# ready rooms}}",
      filterAwaitingInspection:
        "{count, plural, one {# clean room awaiting inspection} other {# clean rooms awaiting inspection}}",
      filterDirty: "{count, plural, one {# dirty room} other {# dirty rooms}}",
      filterOutOfService:
        "{count, plural, one {# room out of service} other {# rooms out of service}}",
      filterForArrival:
        "{count, plural, one {# room an arrival is waiting on} other {# rooms arrivals are waiting on}}",
      filterCleanFirst:
        "{count, plural, one {# room to clean first} other {# rooms to clean first}}",
      filterFloor:
        "{count, plural, one {# room on floor {floor}} other {# rooms on floor {floor}}}",
      filterNoFloor:
        "{count, plural, one {# room with no floor} other {# rooms with no floor}}",
      filterOpenFolios:
        "{count, plural, one {# open Folio} other {# open Folios}}",
      filterShowAll: "Show all",
      filterReadyCount: "{count, plural, one {# ready} other {# ready}}",
      roomOccupiedNoMark:
        "A Guest is still in it; it is cleaned once they leave.",
      activityTitle: "Recent activity",
      activityEmpty: "Nothing recorded since yesterday.",
      openAuditLog: "Open the audit log",
      chargesTitle: "Charges today",
      chargesNote: "Charges less reversals posted today",
      openFinance: "Open Finance",
      bookedTitle: "Booked ahead",
      bookedNote: "Bookings and Stays, not a forecast",
      bookedColNight: "Night",
      bookedColUnits: "Units held",
      bookedColShare: "Booked",
      bookedOf: "{count} of {of}",
      openCalendar: "Open the room calendar",
      stripTitle: "Your Properties",
      stripAttention:
        "{count, plural, =0 {Nothing needs attention} one {# thing needs attention} other {# things need attention}}",
      stripUnread: "Could not be read",
      stripPartial: "some sections unread",
      allRoomsToClean:
        "{count, plural, one {Open the room to clean} other {All # rooms to clean}}",
      allOpenFolios:
        "{count, plural, one {Open the open Folio} other {All # open Folios}}",
      allOwing:
        "{count, plural, one {Open the Guest leaving with a balance} other {All # Guests leaving with a balance}}",
    },
    rates: {
      title: "Nightly rates",
      hint: "What a night costs, by the kind of Unit it is spent in. A booking keeps the price it was taken at.",
      perNight: "per night",
      units:
        "{count, plural, =0 {None at this Property yet} one {# Unit} other {# Units}}",
      noPrice: "No price",
      unpricedHint:
        "Bookings of this kind are taken without a price, and their nights are not charged.",
      stale:
        "Set in {currency}. This Property now trades in {property}, so this price applies to no booking until it is saved again.",
      invalid: "That is not a price in {currency}.",
      readOnly:
        "Prices are changed by whoever may set rates. You can see them here.",
      priceFor: "Price per night for {type}",
    },
    configuration: {
      subtitle: "Settings for {property} and its Organization",
      sections: "On this page",
      organizationTitle: "Organization",
      organizationHint:
        "The name your team sees. It applies to every Property in your Organization.",
      organizationName: "Organization name",
      organizationNeedsReach:
        "Only someone who reaches every Property can rename the Organization.",
      propertyTitle: "Property",
      propertyHint:
        "What this Property is called and the currency it trades in.",
      propertyName: "Property name",
      currency: "Currency",
      currencyFixed:
        "Fixed since a folio was opened or a priced booking was taken here. Every folio and booking keeps the currency it was made in.",
      searchCurrency: "Search currencies",
      noCurrency: "No currency matches.",
      timeTitle: "Time and the business day",
      timeHint:
        "Which clock this Property runs on, and when its working day ends. A night shift before the cutoff is still working the day before.",
      timezone: "Time zone",
      searchTimezone: "Search time zones",
      noTimezone: "No time zone matches.",
      cutoff: "Business day ends at",
      businessDateNow: "Business date now",
      businessDateAfter: "After saving",
      businessDateForward: "Today moves forward to {date}.",
      businessDateBack:
        "Today moves back to {date}. Check arrivals and departures after saving.",
      housekeepingTitle: "Housekeeping",
      modulesTitle: "Switched on here",
      modulesHint: "What your team can use at this Property.",
      elsewhereTitle: "Managed on their own screens",
      elsewhereHint: "Each of these settings has one home.",
      roomsHint: "Add rooms and beds, and block a unit with a reason.",
      peopleHint:
        "Invite staff, and choose their roles and the Properties they reach.",
      save: "Save changes",
      discard: "Discard",
      saving: "Saving…",
      saved: "Saved",
      unchanged: "Nothing to save — these are already the settings.",
      refused:
        "These settings could not be changed. What you see now is what is in effect.",
      stale:
        "Someone saved these settings a moment ago. You are now seeing what they saved; make your change again if it is still needed.",
      currencyFixedRefused:
        "A folio was opened or a priced booking was taken here while you were editing, so the currency is now fixed.",
      closedDay:
        "This would make today a business day that has already been closed. Choose a different end time or time zone.",
      invalid: "Check the values and try again.",
      invalidName: "A name is 2 to 120 characters.",
      invalidTimezone: "Choose a time zone from the list.",
      invalidCurrency: "Choose a currency from the list.",
      invalidCutoff: "Choose a time between 03:00 and 11:45.",
      readOnly:
        "You can see these settings. An Owner or Manager can change them.",
      fields: {
        name: "Name",
        timezone: "Time zone",
        currency: "Currency",
        businessDateCutoff: "Business day ends at",
      },
    },
    integrations: {
      subtitle:
        "Where {organization} sends its events, and what has failed to arrive.",
      endpointsCount: "Endpoints",
      deliveringCount: "Endpoints delivering",
      failingCount: "Endpoints failing",
      openFailuresCount: "Deliveries not arrived",
      endpointsTitle: "Webhook endpoints",
      endpointsDescription:
        "Ranza posts the events you choose to these addresses, signed, as they happen.",
      noEndpointsTitle: "No webhook endpoint yet",
      noEndpointsDescription:
        "Add an HTTPS address and choose the events to send to it. Every delivery is signed, and what happened to each one is shown here.",
      noEndpointsReadOnly:
        "No webhook endpoint is registered for this Organization.",
      readOnly:
        "You can see these endpoints. Adding, testing and removing them needs integrations.manage with access to the whole Organization.",
      addEndpoint: "Add endpoint",
      addTitle: "Add a webhook endpoint",
      addDescription:
        "Ranza will send each event you choose to this address as signed JSON.",
      nameLabel: "Name",
      namePlaceholder: "Channel manager",
      urlLabel: "HTTPS address",
      urlPlaceholder: "https://example.com/ranza/webhooks",
      urlHint:
        "Must start with https://. Addresses on private networks and this machine are refused.",
      eventsLabel: "Events to send",
      events: {
        reservation_created: "A booking is taken",
        reservation_cancelled: "A booking is cancelled",
        reservation_no_show: "A guest does not arrive",
        stay_checked_in: "A guest checks in",
        stay_checked_out: "A guest checks out",
        folio_line_posted: "A charge or payment is posted to a folio",
      },
      register: "Add endpoint",
      registering: "Adding...",
      secretTitle: "Signing secret",
      secretWarning:
        "Copy this secret now. It is shown only once and cannot be read again. If you lose it, remove this endpoint and add it again.",
      secretUse:
        "Each delivery carries X-Ranza-Timestamp and X-Ranza-Signature. The signature is sha256= followed by the HMAC-SHA256, keyed with this secret, of the timestamp, a full stop and the raw request body.",
      secretCopy: "Copy secret",
      secretCopied: "Copied",
      secretDone: "I have saved it",
      invalid: {
        name: {
          empty: "Give the endpoint a name.",
          too_long: "Keep the name under 80 characters.",
        },
        url: {
          invalid: "That is not an address.",
          too_long: "Keep the address under 2,048 characters.",
          not_https: "The address must start with https://.",
          has_credentials:
            "The address must not carry a user name or password.",
          blocked_host:
            "That address is on a private network or this machine, which Ranza will not send to.",
        },
        events: {
          none: "Choose at least one event.",
          unknown: "One of those events cannot be sent.",
        },
      },
      refused: {
        not_permitted:
          "You cannot do that here. It needs integrations.manage with access to the whole Organization.",
        duplicate_url: "An endpoint with that address already exists.",
        too_many_endpoints: "An Organization can have ten endpoints.",
        test_in_flight: "A test event is already on its way to this endpoint.",
        unavailable: "That is already closed, or its endpoint was removed.",
        reason_required: "Say why, in at least 3 characters.",
      },
      failed: "That did not work and has been reported. Try again.",
      health: {
        delivering: "Delivering",
        failing: "Failing",
        unused: "No delivery yet",
      },
      lastDelivered: "Last delivered",
      neverDelivered: "Nothing delivered yet",
      queued: "Queued",
      openFailures: "Open failures",
      sends: "Sends",
      sendTest: "Send test event",
      testEvent: "Test event",
      sendingTest: "Queuing...",
      testQueued:
        "Test event queued. It is sent within a few seconds; the result appears here.",
      remove: "Remove",
      removing: "Removing...",
      removeTitle: "Remove this endpoint?",
      removeDescription:
        "{name} stops receiving events and deliveries still on their way are cancelled. Its history stays.",
      removeConfirm: "Remove endpoint",
      dismiss: "Not now",
      failedOperationsTitle: "Deliveries that did not arrive",
      failedOperationsDescription:
        "A failed delivery is retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, and then stops. Retry sends it again now.",
      noFailedOperations: "Nothing has failed at this Property.",
      columns: {
        endpoint: "Endpoint",
        whatHappened: "What happened",
        attempts: "Attempts",
        nextAttempt: "Next attempt",
        actions: "Actions",
        closed: "Closed",
        reason: "Reason",
      },
      lastAttemptAt: "Last {when}",
      operationStatuses: {
        failed: "Stopped",
        retrying: "Retrying",
        resolved: "Resolved",
        cancelled: "Cancelled",
      },
      dueNow: "Due now",
      noMoreAttempts: "No more attempts",
      failures: {
        http_error: "The receiver answered with an error",
        timeout: "The receiver did not answer in 10 seconds",
        connection_failed: "Could not connect to the receiver",
        tls_failed: "The receiver's certificate was not accepted",
        blocked_address:
          "The address leads to a private network or this machine",
        invalid_target: "The address cannot be sent to",
        redirect_refused:
          "The receiver redirected, and redirects are not followed",
        source_mismatch:
          "The event did not match the record it named, so it was not sent",
      },
      httpStatus: "HTTP {code}",
      receiverSaid: "It said: {excerpt}",
      retry: "Retry",
      retrying: "Retrying...",
      cancelOperation: "Stop retrying",
      resolveOperation: "Mark resolved",
      reasonLabel: "Reason",
      reasonPlaceholder: "What happened, in a few words",
      reasonHint: "At least 3 characters. It is recorded with your name.",
      reasonInvalid: {
        reason_too_short: "Say why, in at least 3 characters.",
        reason_too_long: "Keep the reason under 500 characters.",
      },
      cancelTitle: "Stop retrying this delivery?",
      cancelDescription:
        "No further attempts are made. The event is not sent to this endpoint.",
      cancelConfirm: "Stop retrying",
      resolveTitle: "Mark this failure resolved?",
      resolveDescription:
        "The delivery stays failed. You are recording that it was dealt with another way.",
      resolveConfirm: "Mark resolved",
      failureAdvice: {
        http_error:
          "Look in the receiver's logs for why it refused, then Retry.",
        timeout:
          "The receiver is slow or down. It is retried automatically; Retry tries now.",
        connection_failed:
          "Check that the receiver is reachable from the internet.",
        tls_failed: "Fix or renew the receiver's HTTPS certificate.",
        blocked_address:
          "Remove this endpoint and add one with a public address.",
        invalid_target:
          "Remove this endpoint and add one with a valid https:// address.",
        redirect_refused: "Register the address it redirects to.",
        source_mismatch:
          "Nothing to retry. Mark it resolved once you have looked into it.",
      },
      othersNotAvailable:
        "A webhook is the only integration available today. Channel managers, KBS reporting, e-invoicing and payment providers are not available yet.",
      noPermissionTitle: "You do not have access to Integrations",
      noPermissionDescription:
        "Integrations needs the integrations permission. Ask someone who manages staff access in your Organization to give you it.",
      addressPartHidden: "Part of this address is hidden from you.",
      overdue:
        "{count, plural, one {# delivery has waited more than 5 minutes to be sent. If this stays, sending may have stopped.} other {# deliveries have waited more than 5 minutes to be sent. If this stays, sending may have stopped.}}",
      technicalDetails: "Technical details",
      closedFailuresTitle: "Closed failures",
      closedFailuresDescription:
        "Failures that arrived after all, were stopped by a person, or were marked resolved. Newest first.",
      noClosedFailures: "No failure has been closed at this Property yet.",
      tabOpen: "Open ({count})",
      tabClosed: "Closed",
      failuresViewLabel: "Which failures",
      pagesLabel: "Pages",
      showing: "{from}–{to} of {total}",
      newer: "Newer",
      older: "Older",
      closedByRanza: "Automatic",
      closedByYou: "You",
      closedByColleague: "A colleague",
      closedReasonDelivered: "It was delivered.",
      closedReasonEndpointRemoved: "The endpoint was removed.",
      retryAll: "Retry all stopped",
      retryAllTitle: "Send every stopped delivery again?",
      retryAllDescription:
        "Every delivery at this Property that has stopped is tried again now. Those that fail again follow the usual schedule. Events that were not sent because they did not match their record are left as they are. Each retry is recorded with your name.",
      retryAllConfirm: "Retry all",
      retriedAll:
        "{count, plural, one {# stopped delivery was sent again.} other {# stopped deliveries were sent again.}}",
    },
    branding: {
      subtitle: "How {organization} looks to its guests",
      colorTitle: "Brand colour",
      colorHint:
        "Primary buttons, links, the active menu item and the header accent in the Guest Portal are drawn in this colour. Success, warning and error colours do not change.",
      colorLabel: "Colour (#rrggbb)",
      colorPicker: "Pick the colour",
      colorEmpty: "No colour set: Ranza's own theme is used.",
      defaultTheme: "Default theme",
      colorInvalid: "Write the colour like #0f5132, with the # and six digits.",
      colorReadable: "Text on filled surfaces is {foreground}, at {ratio} : 1.",
      colorTextSame:
        "Links and text use the colour itself, which reads on white at {ratio} : 1.",
      colorTextDarker:
        "Links and text use a darker shade of the same hue so they stay readable on white: {shade} ({ratio} : 1).",
      swatchFill: "Buttons and fills",
      swatchText: "Links and text",
      foreground: { white: "white", black: "black" },
      logoTitle: "Logo",
      logoHint:
        "PNG, JPEG or WebP, up to 512 KB and at least 128 px tall. SVG is not accepted because it can carry code.",
      logoLabel: "Logo file",
      logoCurrent: "Current logo",
      logoNone: "No logo: Ranza's mark is shown.",
      logoRemove: "Remove the logo",
      logoKeep: "Keep the logo",
      logoWillBeRemoved: "The logo will be removed when you save.",
      logoErrors: {
        empty: "The file is empty.",
        too_large: "The file is larger than 512 KB.",
        svg: "SVG is not accepted because it can carry code. Use PNG, JPEG or WebP.",
        unsupported_type:
          "That is not a PNG, JPEG or WebP image. The contents are checked, not the file name.",
        corrupt: "The image could not be read. The file may be damaged.",
        too_small: "The image must be at least 128 px tall.",
        dimensions_too_large:
          "The image cannot be wider or taller than 4096 px.",
      },
      previewTitle: "Preview",
      previewHint: "How the Guest Portal's header and controls look.",
      previewHeader: "Portal header",
      previewButton: "Primary button",
      previewLink: "A link",
      previewActive: "Active item",
      save: "Save",
      discard: "Discard",
      saving: "Saving…",
      saved: "Saved. Guests see it the next time they open a page.",
      reset: "Reset to default",
      resetDone: "Back to the default theme.",
      refused:
        "That change could not be made. Your access may have changed; refresh the page.",
      error: "Something went wrong. Try again.",
      needsReachTitle:
        "Only someone who reaches every Property changes the brand",
      needsReach:
        "The brand is the whole Organization's. Changing it takes the permission and access to every Property.",
      failedTitle: "The Branding screen could not open",
      failedDescription:
        "The brand could not be read. Try again; if it keeps happening, tell support.",
      retry: "Try again",
    },
    dataExport: {
      heading: "Data Export",
      subtitle:
        "On-demand and scheduled data exports, records and file downloads.",
      tabs: {
        exports: "Export History",
        schedules: "Schedules",
        newExport: "New Export",
      },
      newExportTitle: "Request New Data Export",
      newExportDescription:
        "Select datasets and format to export from your organization.",
      datasetsTitle: "Datasets",
      datasetsDescription:
        "Select the operational and entity records to export.",
      datasets: {
        residents_guests: "Guests & Residents",
        reservations_stays: "Reservations & Stays",
        rooms_beds: "Rooms & Beds",
        folios_payments: "Folios & Payments",
        audit_log: "Audit Log",
      },
      datasetDescriptions: {
        residents_guests: "Names, email addresses and phone numbers",
        reservations_stays: "Booking dates, statuses, and unit associations",
        rooms_beds: "Unit numbers, floors, unit types, and capacities",
        folios_payments: "Financial charges, payments, and balances",
        audit_log: "Operational log entries, timestamps, and actors",
      },
      formatTitle: "Export Format",
      formatDescription: "Tabular spreadsheet (CSV) or structured JSON.",
      requestButton: "Request Export",
      requesting: "Requesting...",
      requestSuccess: "Data export request created successfully.",
      requestFailed: "Failed to create data export request.",
      scheduleTitle: "Create Export Schedule",
      scheduleDescription: "Set up automatic recurring exports on a schedule.",
      scheduleName: "Schedule Name",
      scheduleNamePlaceholder: "e.g. Weekly Financial Export",
      frequencyTitle: "Frequency",
      frequencies: {
        daily: "Daily",
        weekly: "Weekly",
        monthly: "Monthly",
      },
      createScheduleButton: "Create Schedule",
      creatingSchedule: "Creating...",
      scheduleSuccess: "Export schedule created successfully.",
      scheduleFailed: "Failed to create export schedule.",
      recentExportsTitle: "Recent Export Records",
      recentExportsDescription:
        "All requested exports with their state, metrics, and download links.",
      schedulesTitle: "Active Export Schedules",
      schedulesDescription:
        "Recurring exports evaluated and generated automatically by background workers.",
      noExports: "No export records found for this organization.",
      noSchedules: "No automated export schedules configured.",
      tableHeaders: {
        requester: "Requester",
        datasets: "Datasets",
        format: "Format",
        status: "Status",
        size: "Size",
        records: "Records",
        requestedAt: "Requested At",
        actions: "Actions",
      },
      scheduleHeaders: {
        name: "Name",
        datasets: "Datasets",
        format: "Format",
        frequency: "Frequency",
        status: "Status",
        nextRun: "Next Run",
        actions: "Actions",
      },
      statuses: {
        pending: "Pending",
        processing: "Processing",
        ready: "Ready",
        failed: "Failed",
        expired: "Expired",
      },
      scheduleStatuses: {
        active: "Active",
        paused: "Paused",
      },
      download: "Download",
      pause: "Pause",
      resume: "Resume",
      pausing: "Pausing...",
      resuming: "Resuming...",
      failures: {
        requester_not_permitted:
          "The requester can no longer export these datasets.",
        too_large: "Too large to export.",
        worker_stopped: "Stopped before it finished.",
        internal_error: "Could not be completed.",
      },
      formats: {
        csv: { title: "CSV (spreadsheet)", hint: "Excel, Numbers, Sheets" },
        json: { title: "JSON (structured)", hint: "Developer APIs, backup" },
      },
      expiresOn: "Available until {date}",
      requestRefused: "You may not request an export of these datasets.",
      scheduleRefused: "You may not set up this schedule.",
      failedTitle: "The data export could not be opened",
      failedDescription: "The exports could not be read. Try again.",
      retry: "Try again",
    },
    hr: {
      heading: "HR & Payroll",
      subtitle: "Staff contracts, the weekly rota, leave and monthly pay.",
      tabs: {
        employees: "Employees",
        rota: "This week",
        leave: "Leave",
        payroll: "Payroll",
      },
      employees: {
        title: "Employee Directory",
        register: "Add employee",
        registerTitle: "Register employee",
        registerDescription:
          "Enter the employee's contract, position and salary details.",
        firstName: "First name",
        lastName: "Last name",
        email: "Email",
        phone: "Phone",
        department: "Department",
        position: "Position",
        contract: "Contract",
        since: "Since",
        grossPay: "Gross pay",
        grossPayIn: "Gross pay ({currency})",
        iban: "IBAN",
        ibanHint: "Shown masked once saved.",
        status: "Status",
        noEmployeesTitle: "No employees registered",
        noEmployeesDescription:
          "Employment records are kept apart from sign-in access, so people added under People do not appear here until you register them.",
        unregisteredTitle: "Staff without an employment record",
        unregisteredDescription:
          "These people can sign in, but they are not on the rota or in payroll until you register them as employees.",
        registerAsEmployee: "Register as employee",
        registerForLogin: "Linked to the sign-in {email}.",
        submit: "Save employee",
        submitting: "Saving...",
        cancel: "Cancel",
        contracts: {
          full_time: "Full time",
          part_time: "Part time",
          seasonal: "Seasonal",
          fixed_term: "Fixed term",
        },
        statuses: {
          active: "Active",
          terminated: "Left",
        },
        leftOn: "Left {date}",
        terminate: "End employment",
        terminateTitle: "End employment for {name}",
        terminateDescription:
          "Their record, shifts, leave and payslips stay. Ending employment does not remove their access to the system: change that on the People screen.",
        terminateDate: "Last day of employment",
        terminateConfirm: "End employment",
        terminating: "Ending...",
      },
      rota: {
        title: "Weekly shift rota",
        hint: "Click a shift to change it. Front desk needs at least one person on every morning and evening.",
        staffMember: "Staff member",
        today: "today",
        shifts: {
          morning: "Morning",
          evening: "Evening",
          day: "Day",
          off: "Off",
        },
        shiftTimes: {
          morning: "07:00–15:00",
          evening: "15:00–23:00",
          day: "09:00–18:00",
          off: "Day off",
        },
      },
      leave: {
        title: "Leave requests",
        requestLeave: "Request leave",
        requestLeaveTitle: "Submit leave request",
        staffMember: "Staff member",
        type: "Type",
        dates: "Dates",
        days: "days",
        status: "Status",
        actions: "Actions",
        approve: "Approve",
        decline: "Decline",
        clashWarning: "Clashes with another colleague in the same department",
        noLeaves: "No pending or historical leave requests.",
        startsOn: "Starts on",
        endsOn: "Ends on",
        notes: "Notes",
        notesPlaceholder: "Optional notes",
        submit: "Submit request",
        submitting: "Submitting...",
        cancel: "Cancel",
        employeeLeft: "Has left",
        types: {
          annual: "Annual leave",
          sick: "Sick leave",
          unpaid: "Unpaid leave",
          emergency: "Emergency leave",
          maternity: "Maternity leave",
        },
        statuses: {
          pending: "Pending",
          approved: "Approved",
          rejected: "Rejected",
        },
      },
      payroll: {
        period: "Period",
        summaryGrossNet: "Gross {amount}, net {total}",
        gross: "Gross",
        net: "Net pay",
        socialSecurity: "Social security",
        incomeTax: "Income tax",
        stampDuty: "Stamp duty",
        approve: "Approve payroll",
        approving: "Approving...",
        approved: "Approved",
        draft: "Draft",
        previousPeriod: "Previous period",
        nextPeriod: "Next period",
        confirmTitle: "Approve payroll for {period}?",
        confirmBody:
          "{count, plural, one {# employee} other {# employees}} will be paid in {currency}: {amount} gross and {total} net.",
        confirmLocked:
          "Approving locks the run. It cannot be changed afterwards, and there is no way yet to reverse or revise it.",
        confirm: "Approve and lock",
        cancel: "Cancel",
        approvedOn: "Approved {date}. An approved run cannot be changed.",
        organizationWide:
          "Approving covers every active employee of the Organization, at every Property.",
        payslip: "Payslip",
        payslipTitle: "Payslip",
        paidTo: "Paid to",
        noBankAccount: "No bank account on file",
        downloadPdf: "Download PDF",
        actions: "Actions",
        placeholderTitle: "Placeholder deductions",
        placeholderBody:
          "The social security, income tax and stamp duty figures are placeholders pending the owner and an accountant. They have not been approved and must not be used to pay anyone.",
        needsReach: {
          title: "Payroll is run for the whole Organization",
          description:
            "It covers every Property, so it needs access to all of them. Ask someone with Organization-wide access.",
        },
        blocked: {
          period_not_ended:
            "This period has not ended yet, so it cannot be approved. Payroll is approved after the last day of the month.",
          no_employees: "There are no active employees to pay in this period.",
          mixed_currency:
            "Employees are paid in more than one currency, and a payroll run is in one. This period cannot be approved until that is resolved.",
        },
      },
      outcomes: {
        invalid: {
          name: "Enter a first and last name.",
          department: "Enter a department.",
          position: "Enter a position.",
          email: "That email address does not look right.",
          grossPay:
            "Enter the gross pay as a number, with no more decimals than the currency has.",
          currency: "That currency is not recognised.",
          iban: "That IBAN does not look right.",
          period: "That payroll period is not valid.",
          dates: "Check the dates: the end cannot be before the start.",
          terminatedOn:
            "Check the last day: it cannot be before the day they started.",
          shiftTime: "That shift time is not valid.",
          request:
            "That request could not be read. Reload the page and try again.",
        },
        refused: {
          not_permitted:
            "You cannot do that here, or it has changed since this page loaded.",
          employee_terminated:
            "That employee has left, so nothing new can be recorded for them.",
          already_terminated: "That employee has already left.",
          already_registered:
            "That person already has an employment record in this Organization.",
          other_property: "That employee is assigned to a different Property.",
          leave_overlap:
            "That employee already has approved leave over some of these days.",
          leave_decided: "That request has already been decided.",
          payroll_needs_organization_reach:
            "Payroll covers every Property, so it can only be approved with access to all of them.",
          payroll_no_employees:
            "There are no active employees to pay in this period.",
          payroll_mixed_currency:
            "Employees are paid in more than one currency, and a payroll run is in one.",
          payroll_period_not_ended:
            "That period has not ended, so it cannot be approved yet.",
          payroll_draft_exists:
            "A draft for this period already exists and needs an administrator to clear it.",
        },
        error:
          "Something went wrong, and it has been reported. Try again in a moment.",
      },
    },
    housekeeping: {
      subtitle: "Which rooms need cleaning at {property}",
      unavailableTitle: "Housekeeping is not on at this Property",
      unavailableDescription:
        "It appears here once your Organization's Subscription includes it and the Property has it enabled.",
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
      impactChangeBooking: "Change booking",
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
      equipmentTab: "Equipment",
      planTab: "Service plan",
      addEquipment: "Add equipment",
      editEquipment: "Change equipment",
      equipmentName: "Name",
      equipmentNamePlaceholder: "Washing machines",
      category: "Category",
      categoryPlaceholder: "Laundry",
      whereIs: "Where it is",
      atRoom: "In a room",
      atPlace: "Somewhere else",
      place: "Place",
      placePlaceholder: "Laundry room",
      interval: "Serviced every (months)",
      intervalHint: "Leave it empty if it is not serviced on a schedule.",
      lastServiced: "Last serviced",
      nextService: "Next service",
      notScheduled: "Not scheduled",
      neverServiced: "Not serviced yet",
      retire: "Retire",
      restore: "Restore",
      retired: "Retired",
      showRetired: "Show retired",
      noEquipmentTitle: "No equipment at {property}",
      noEquipmentDescription:
        "Register what is serviced and can break — boilers, lifts, machines — and plan its servicing.",
      equipmentReadOnly:
        "Changing the register needs the permission to keep equipment.",
      noPlanTitle: "Nothing is scheduled",
      noPlanDescription:
        "Give an item a service interval under Equipment and it appears here by its next service date.",
      daysOverdue:
        "{count, plural, one {# day overdue} other {# days overdue}}",
      dueToday: "Due today",
      inDays: "{count, plural, one {in # day} other {in # days}}",
      everyMonths: "{count, plural, one {every month} other {every # months}}",
      createWorkOrder: "Create work order",
      workOrderOpen: "Work order MT-{number} open",
      workOrderTitle: "Service: {name}",
      service: "Service",
      equipment: "Equipment",
      noEquipmentChosen: "No equipment",
      noRoomChosen: "No room",
      chooseRoomOrEquipment: "Choose a room, equipment or both.",
      costTitle: "What it cost",
      cost: "Cost",
      vendor: "Done by",
      vendorPlaceholder: "Boğaz Teknik",
      noCost: "No cost recorded",
      chargeTitle: "Charge a Guest",
      chargeHint:
        "A line on the Guest's Folio. A mistake is reversed on the Folio.",
      guest: "Guest",
      chooseGuest: "Choose a Guest",
      amount: "Amount",
      charge: "Charge",
      noChargeable: "Nobody who stayed in this room has an open Folio.",
      reversedCharge: "reversed",
      inHouseNow: "in house",
      leftOn: "left {date}",
      loading: "Loading…",
      chargeUnavailable: "The Guests could not be loaded just now. Try again.",
      actions: "Actions",
      change: "Change",
      conditions: {
        working: "Working",
        due: "Service due",
        overdue: "Service overdue",
        fault: "Fault",
      },
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

    analytics: {
      heading: "Analytics & Reporting",
      subheading:
        "Property occupancy, operational volume, and commercial performance KPIs.",
      rangeToday: "Today",
      range7d: "Last 7 days",
      range30d: "Last 30 days",
      rangeMonth: "Month",
      rangeSelectorLabel: "Reporting period",
      occupancyRate: "Occupancy Rate",
      occupancyRateDesc: "Occupied share of sellable accommodation inventory",
      sellableUnits: "Sellable Units",
      occupiedNights: "Occupied Nights",
      availableNights: "Available Nights",
      roomRevenue: "Room Revenue",
      roomRevenueDesc: "Net room night charges accrued in period",
      totalRevenue: "Total Revenue",
      adr: "ADR (Average Daily Rate)",
      adrDesc: "Average room revenue per occupied room night",
      revPar: "RevPAR (Revenue Per Available Room)",
      revParDesc: "Average room revenue per available room night",
      netPayments: "Payments Collected",
      netPaymentsDesc: "Net payments collected during this period",
      financialsMaskedNotice:
        "You do not hold permission to view financial metrics (finance.manage_folio).",
      dailyBreakdownTitle: "Daily Performance Breakdown",
      dailyBreakdownDesc:
        "Day-by-day occupancy and room revenue across the selected period.",
      dateCol: "Date",
      occupiedUnitsCol: "Occupied Units",
      availableUnitsCol: "Available Units",
      occupancyCol: "Occupancy",
      roomRevenueCol: "Room Revenue",
      paymentsBreakdownTitle: "Payment Methods Breakdown",
      cash: "Cash",
      card: "Card",
      bankTransfer: "Bank Transfer",
      other: "Other",
      month: {
        navigation: "Reporting month",
        previousMonth: "Previous month",
        nextMonth: "Next month",
        monthToDate: "Month to date · {closed} of {total} days closed",
        openNote:
          "Every rate and revenue figure covers the closed days only. Today is still open: its nights are not charged until the day closes, so it counts toward no rate.",
        asOf: "As of {date}. A correction counts on the night it corrects, so an earlier month can still change.",
        noActivityTitle: "Nothing happened in {month}",
        noActivityDescription:
          "The Property had no Stay and no charge by then, so there are no rates to show. Nothing happening is not the same as zero.",
        notFoundTitle: "Analytics are not available for this Property",
        notFoundDescription:
          "Analytics may not be switched on at this Property, or you may not have access to it.",
        headline: "Headline figures",
        occupancy: "Occupancy",
        occupancyArithmetic:
          "{occupied} occupied ÷ {available} available nights",
        occupancyNone: "No available nights, so there is nothing to divide.",
        adr: "Average daily rate (ADR)",
        adrArithmetic: "{revenue} room revenue ÷ {nights} charged Guest nights",
        adrNone: "No charged Guest nights yet, so there is nothing to divide.",
        revPar: "Revenue per available night (RevPAR)",
        revParArithmetic: "{revenue} room revenue ÷ {nights} available nights",
        revParNone: "No available nights, so there is nothing to divide.",
        againstPrior: "vs {month}: {value}",
        pointsChange: "{value} points",
        sameElapsedDays: "Compared with the same elapsed days of {month}.",
        noPrior: "There is no earlier month to compare with.",
        revenue: "Revenue",
        roomNightsCharged: "Room nights charged",
        corrections: "Corrections (reversed nights)",
        netRoomRevenue: "Net room revenue",
        otherRevenue: "Other revenue (net)",
        totalRevenue: "Total revenue",
        collected: "Booked and collected",
        revenueBooked: "Revenue booked",
        moneyCollected: "Money collected",
        owedChange: "The change in what Guests owe",
        owedChangeNote:
          "Revenue booked less money collected: positive means Guests owe more than at the start of the month. This is not a receivables report.",
        collectedByMethod: "Collected by method",
        nights: "Nights",
        availableNights: "Available nights",
        occupiedNights: "Occupied nights",
        guestNights: "Guest nights",
        residentNights: "Resident nights",
        residentNote:
          "Residents are billed monthly, so a Property with many Resident nights shows low room revenue here.",
        days: "Day by day",
        dayCol: "Day",
        occupiedCol: "Occupied nights",
        occupancyCol: "Occupancy",
        revenueCol: "Room revenue",
        openDay: "Open day",
        notYetCharged: "Not yet charged",
        monthTotal: "Total of closed days",
        unitTypes: "By unit type",
        unitTypeCol: "Unit type",
        unitTypeNote:
          "Each night belongs to the type of the unit it was slept in. The rows add up to the figures above.",
        adrCol: "ADR",
        uncharged: "Nights with no charge",
        unchargedNote:
          "Occupied nights of the closed days that no room night charge covers, and why. Counts only: no amounts.",
        unchargedNone: "Every occupied night of the closed days has a charge.",
        unchargedNights: "{n, plural, one {# night} other {# nights}}",
        unchargedReason: {
          resident: "Resident Stay, billed monthly",
          unpriced: "No price on the booking",
          billing_unavailable: "Billing is not available here",
          no_folio: "No Folio",
          folio_closed: "Folio closed",
          currency: "Priced in another currency",
          not_yet_charged: "Not charged yet",
        },
        showDay: "Show {date}",
        dayDescription: "The Stays that held a unit this night.",
        dayOpenNote:
          "This day has not closed. Its nights are charged when it does.",
        dayStays: "Stays",
        dayNoStays: "Nobody was in house this night.",
        dayCharged: "Charged Guest nights",
        nightCharged: "Charged",
        noGuestName: "No name shown",
        dayCorrections: "Corrections to this day's nights",
        correctionPosted: "Posted {date}",
        dayNavigation: "Day",
        previousDay: "Previous day",
        nextDay: "Next day",
      },
    },

    portfolio: {
      subtitle: "{organization}: every Property side by side.",
      asOf: "Figures as of {time}",
      listLabel: "Properties side by side",
      occupancyTitle: "Occupancy across Properties",
      coverage: "Counted at {reporting} of {total} Properties",
      notReporting: "Not available at any Property",
      moneyOwedTitle: "Money owed",
      moneyOwedNote: "Open Folio balances, one line per currency",
      maintenanceTitle: "Open maintenance",
      maintenanceNote: "Requests not yet done",
      cardOccupancy: "Units in use",
      businessDate: "Business date {date}",
      noSellableUnits: "No sellable units",
      arrivals: "Arrivals still to come",
      departures: "Departures still to come",
      maintenance: "Open maintenance",
      moneyOwed: "Money owed",
      hidden: "Hidden",
      unavailable: "Not available",
      withheld:
        "Figures are not shown for this Property because Analytics is not switched on there.",
      moneyHiddenNotice:
        "Money owed is hidden. It is shown only to people who can manage Folios, at Properties with billing switched on.",
      open: "Open {property}",
      oneTitle: "Nothing to compare yet",
      oneDescription:
        "You reach one Property, {property}. Properties line up side by side here once you reach more than one.",
      noneTitle: "No Property to show",
      noneDescription: "You do not reach any Property in this Organization.",
      goToToday: "Go to Today",
      tooLargeTitle: "Too many Properties to compare",
      tooLargeDescription:
        "{count} Properties are reached and this page compares at most {max}. Nothing is cut off silently, so no comparison is shown.",
      failedTitle: "The portfolio could not be shown",
      failedDescription:
        "Something went wrong reading your Properties. Try again, and if it keeps happening tell your administrator.",
      retry: "Try again",
    },

    guestExperience: {
      heading: "Guest Experience & Requests",
      subheading:
        "Guest and resident service requests, priority tracking, and resolution queue.",
      newRequest: "New Request",
      allRequests: "All Requests",
      openRequests: "Open Requests",
      resolvedRequests: "Resolved",
      title: "Title",
      details: "Details",
      category: "Category",
      priority: "Priority",
      status: "Status",
      room: "Room",
      guest: "Guest",
      assignee: "Assigned To",
      unassigned: "Unassigned",
      reportedAt: "Reported At",
      resolvedAt: "Resolved At",
      actions: "Actions",
      categories: {
        housekeeping: "Housekeeping",
        maintenance: "Maintenance",
        amenities: "Amenities",
        front_desk: "Front Desk",
        other: "Other",
      },
      priorities: {
        low: "Low",
        normal: "Normal",
        high: "High",
        urgent: "Urgent",
      },
      statuses: {
        new: "New",
        in_progress: "In Progress",
        resolved: "Resolved",
        cancelled: "Cancelled",
      },
      markInProgress: "Start Working",
      resolve: "Resolve",
      cancel: "Cancel",
      reopen: "Reopen",
      cancelReason: "Cancellation Reason",
      cancelReasonPlaceholder: "Provide a reason for cancellation...",
      resolutionNotes: "Resolution Notes",
      resolutionNotesPlaceholder: "Action taken to resolve request...",
      createDialogTitle: "Create Service Request",
      createDialogDesc:
        "Log a new service request on behalf of a guest or accommodation unit.",
      titlePlaceholder: "e.g. Extra towels requested",
      detailsPlaceholder: "Add any specific instructions or details...",
      selectCategory: "Select category",
      selectPriority: "Select priority",
      selectRoom: "Select unit (optional)",
      noRoom: "No unit",
      submit: "Log Request",
      cancelling: "Cancelling...",
      saving: "Saving...",
      emptyTitle: "No requests found",
      emptyDesc:
        "No guest service requests have been logged for this property.",
    },

    auditLog: "Audit log",
    auditLogFor: "Recent actions at",
    noAuditTitle: "Nothing recorded yet",
    auditNotPermittedTitle: "You can't read the audit log",
    auditNotPermittedDescription:
      "Reading the audit log is a permission of its own, used at the Properties you're assigned to. Under People, someone who administers staff can give you a role that has it, add “Reading the audit log” to your role if it is one your Organization created, or assign you a Property if you have none.",
    auditNotHereTitle: "The audit log isn't open to you at this Property",
    auditNotHereDescription: "Your role can read it here:",
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
    auditWhere: "Where",
    auditOrganizationWide: "Whole Organization",
    auditFilters: "Filter the audit log",
    auditActionFilter: "Action",
    auditAnyAction: "Any action",
    auditProperty: "Property",
    auditEveryProperty: "Every Property you reach",
    auditFrom: "From",
    auditTo: "To",
    auditPeriod: "Period",
    auditFromEmpty: "Earliest",
    auditToEmpty: "Latest",
    auditPickFrom: "Choose the first day",
    auditPickTo: "Choose the last day",
    auditSpanDays: "{count, plural, one {# day} other {# days}}",
    auditPresetLast7: "Last 7 days",
    auditPresetLast30: "Last 30 days",
    auditPresetThisMonth: "This month",
    auditSearch: "Search",
    auditSearchHint: "Guest, room, colleague or words from a reason",
    auditSearchTooShort: "Type at least two characters to search.",
    auditApply: "Apply",
    auditClearFilters: "Clear filters",
    auditOlder: "Older records",
    auditNewest: "Back to the newest",
    auditMatching: "{n, plural, one {# record} other {# records}}",
    auditNoMatchesTitle: "Nothing matches these filters",
    auditNoMatchesDescription:
      "Widen the dates, choose another action, or clear the filters.",
    auditRecordMissingTitle: "That record cannot be opened",
    auditRecordMissingDescription:
      "It does not exist, or it is not one you may read.",
    auditLocalTime:
      "Each time is on the clock of the Property where it happened; records about the whole Organization use this Property's.",
    auditYes: "Yes",
    auditNo: "No",
    auditNone: "None",
    auditChangedTo: "changed to",
    auditInspectionFollowsOrganization: "The Organization's setting",
    auditContext: {
      amountMinor: "Amount",
      balanceMinor: "Balance at closing",
      totalGrossMinor: "Total gross",
      totalNetMinor: "Total net",
      employeeId: "Employee",
      leaveFrom: "Leave from",
      leaveTo: "Leave until",
      contractType: "Contract",
      hasSystemAccess: "Has system access",
      terminatedOn: "Last day of employment",
      period: "Payroll period",
      employeeCount: "Employees paid",
      description: "Description",
      lineId: "Line",
      reversedLineId: "Reversed line",
      reversalLineId: "Reversal line",
      stayId: "Stay",
      folioId: "Folio",
      accommodationUnitId: "Unit",
      guestId: "Guest",
      guestCreated: "New guest record",
      startsOn: "Arrival",
      endsOn: "Departure",
      from: "From",
      to: "To",
      role: "Role",
      added: "Permissions added",
      removed: "Permissions removed",
      permissions: "Permissions",
      propertyIds: "Properties",
      properties: "Properties",
      propertyId: "Property",
      userId: "Staff Member",
      name: "Name",
      names: "Names",
      key: "Role key",
      holders: "People holding it",
      unitIds: "Units",
      unitType: "Unit type",
      capacity: "Capacity",
      building: "Building",
      floor: "Floor",
      letByTheBed: "Let by the bed",
      hadBeenBlockedFor: "Had been blocked for",
      status: "Status",
      previousStatus: "Previous status",
    },
    auditAction: {
      reservation: {
        created: "Reservation taken",
        checked_in: "Checked in",
        check_in_reversed: "Check-in withdrawn",
        cancelled: "Booking cancelled",
        no_show: "Marked as a no-show",
        amended: "Booking changed",
        arrival_time_changed: "Expected arrival time changed",
      },
      stay: {
        checked_out: "Checked out",
        departure_changed: "Departure changed",
        moved: "Guest moved",
      },
      folio: {
        charge_posted: "Charge posted",
        payment_posted: "Payment posted",
        line_reversed: "Line reversed",
        closed: "Folio closed",
      },
      staff: {
        invited: "Staff Member invited",
        invitation_renewed: "Invitation link renewed",
        invitation_accepted: "Invitation accepted",
        readded: "Staff Member added back",
        role_changed: "Role changed",
        role_permissions_changed: "Role permissions changed",
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
      business_day: { closed: "Business day closed" },
      property: { configured: "Property settings changed" },
      organization: { configured: "Organization renamed" },
      price_list: { changed: "Nightly rates changed" },
      data_export: {
        requested: "Data export requested",
        downloaded: "Data export downloaded",
      },
      maintenance_request: {
        reported: "Problem reported",
        moved: "Request moved",
        cancelled: "Request cancelled",
        assigned: "Request assigned",
        prioritised: "Priority changed",
        hold_released: "Room let go, still held by another request",
        costed: "Cost recorded",
        guest_charged: "Guest charged for damage",
      },
      maintenance_setting: {
        changed: "Maintenance setting changed",
      },
      maintenance_equipment: {
        added: "Equipment added",
        changed: "Equipment changed",
        retired: "Equipment retired",
        restored: "Equipment restored",
        serviced: "Equipment serviced",
      },
      employee: {
        registered: "Employee registered",
        terminated: "Employment ended",
      },
      leave: {
        approved: "Leave approved",
        declined: "Leave declined",
      },
      payroll_run: {
        approved: "Payroll approved",
      },
      branding: {
        changed: "Brand changed",
        reset: "Brand reset to the default",
      },
      webhook_endpoint: {
        registered: "Webhook endpoint added",
        removed: "Webhook endpoint removed",
        test_sent: "Test event sent",
      },
      failed_operation: {
        retried: "Failed delivery retried",
        cancelled: "Failed delivery cancelled",
        resolved: "Failed delivery marked resolved",
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
      maintenance_equipment: "Equipment",
      data_export: "Data export",
      business_day_close: "Business day",
      employee: "Employee",
      leave_request: "Leave request",
      payroll_run: "Payroll run",
      organization_brand: "Organization brand",
      webhook_endpoint: "Webhook endpoint",
      failed_operation: "Failed delivery",
    },
    closeDay: {
      at: "Closing the day at",
      dueTitle: "{date} is ready to close",
      dueDescription:
        "The day ended at {time}. Clear what is still open, or close it with a reason.",
      waiting:
        "{n, plural, one {# day is waiting to be closed.} other {# days are waiting to be closed; the oldest comes first.}}",
      waitingBadge: "{n, plural, one {# day waiting} other {# days waiting}}",
      preparingTitle: "{date} is still open",
      preparingDescription:
        "It can be closed after {time}. Anything still open below will hold the close up.",
      automatic:
        "A day with nothing left open closes by itself shortly after it ends.",
      notArrivedTitle: "Arrivals not checked in",
      notArrivedHelp:
        "Mark a no-show, cancel the booking, or check them in if they are still coming.",
      notDepartedTitle: "Departures still in house",
      notDepartedHelp: "Check them out on the departures screen.",
      roomNightsTitle: "Room nights",
      roomNightsHelp:
        "Closing the day charges every Guest in house that night at the price their booking was taken at. A night that cannot be charged is listed here and never holds the close up.",
      foliosTitle: "Folios left open",
      foliosHelp:
        "Guests who left with their bill still open. They are recorded with the close and do not hold it up.",
      nothingOpen: "Nothing left open.",
      stepDone: "Done",
      stepOpen: "{n, plural, other {# open}}",
      notBlocking: "Does not hold up the close",
      roomNightsTodayHelp:
        "Tonight is charged when today closes. A departing Guest's nights that no close has reached are charged at check-out.",
      roomNightsToCharge:
        "{n, plural, =0 {No nights to charge} one {# night to charge} other {# nights to charge}}",
      roomNightsAllCharged: "Every Guest night will be charged.",
      notChargedReason: {
        unpriced: "No price on the booking",
        no_folio: "No Folio",
        folio_closed: "Folio closed",
        currency: "Priced in another currency",
        billing_unavailable: "Billing is not available here",
      },
      roomNightsColumn: "Room nights",
      roomNightsNotCharged:
        "{n, plural, one {# not charged} other {# not charged}}",
      nightsHint:
        "Nights counts every Stay in house, Residents included. Room nights are Guests' only: Residents are billed by the month.",
      dueOn: "Due {date}",
      dueOutOn: "Due out {date}",
      leftOn: "Left {date}",
      openArrivals: "Open arrivals",
      openDepartures: "Open departures",
      openFolio: "Open Folio",
      close: "Close {date}",
      closing: "Closing…",
      dialogTitle: "Close {date}?",
      dialogQuiet:
        "Nothing is left open. The close records the day's arrivals, departures and nights occupied, and charges the night of every Guest whose booking has a price.",
      dialogOpen:
        "{n, plural, one {# item is still open. It is recorded with the close, with your reason.} other {# items are still open. They are recorded with the close, with your reason.}}",
      final:
        "Reopening a closed day is not available yet, so check the date before you close it.",
      keepOpen: "Not now",
      dismissed: "Done",
      reasonHint:
        "Say why the day closes with items open. It is kept with the close.",
      noPermission:
        "You can see this day, but closing it needs the Close the day permission.",
      alreadyClosed:
        "This day has already been closed, by another desk or automatically.",
      reasonRequired: "Items are still open, so a reason is needed.",
      refused:
        "This day cannot be closed right now. Dismiss this and the page will show the day that can be closed.",
      recentTitle: "Recently closed",
      recentEmpty: "No day has been closed here yet.",
      day: "Day",
      closedBy: "Closed by",
      automatically: "Automatically",
      arrived: "Arrivals",
      departed: "Departures",
      nights: "Nights",
      leftOpen: "Left open",
      foliosOpen: "Folios open",
    },
    picker: {
      search: "Search…",
      noMatches: "No options match.",
      clear: "Clear selection",
      selectedCount: "{n, plural, other {# selected}}",
      required: "Choose one to continue.",
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
      "room-calendar": "Room calendar",
      rooms: "Rooms & beds",
      arrivals: "Arrivals",
      departures: "Departures",
      "close-day": "Close the day",
      "guest-experience": "Guest Experience",
      housekeeping: "Housekeeping",
      maintenance: "Maintenance",
      "food-and-beverage": "Food & Beverage",
      inventory: "Inventory",
      finance: "Finance",
      people: "People",
      hr: "HR & Payroll",
      analytics: "Analytics",
      portfolio: "All Properties",
      configuration: "Configuration",
      integrations: "Integrations",
      branding: "Branding",
      "data-export": "Data export",
      "audit-log": "Audit log",
    },
    screenSummary: {
      "guest-experience":
        "Guest and Resident requests, announcements and service tracking.",
      housekeeping: "Unit readiness, cleaning schedule and task assignment.",
      "food-and-beverage": "Meal plans, outlets and consumption records.",
      inventory: "Stock movements, counts and procurement.",
      people: "Staff records, shifts and permissions.",
      hr: "Staff contracts, weekly shift rota, leave and monthly payroll.",
      analytics: "Occupancy, revenue and operational reporting.",
      "data-export":
        "On-demand and scheduled data exports, records and downloads.",
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
    today: "اليوم",
    propertySwitcher: "المنشآت",
    chooseProperty: "اختر منشأة",
    billingNotice: {
      title: "تأخّر سداد اشتراك {organization}",
      description:
        "تستمر مساحة العمل في العمل بالكامل في الوقت الحالي. يُرجى تسوية الدفعة.",
    },
    mainNavigation: "التنقل الرئيسي",
    sections: "الأقسام",
    breadcrumb: "مسار التنقل",
    back: "رجوع",
    collapse: "طي القائمة",
    expand: "توسيع القائمة",
    workspaceBadge: "مساحة العمل",
    account: "الحساب",
    organization: "المؤسسة",
    property: "المنشأة",
    noPropertyTitle: "لم يتم تعيينك إلى منشأة بعد",
    noPropertyDescription:
      "يقوم أحد المديرين في مؤسستك بتعيينك إلى منشأة، فتظهر هنا.",
    signInSummary: "سجّل الدخول لإدارة عقاراتك.",
    authSlogan: "إدارة الإقامة والضيافة المتكاملة.",
    authSubSlogan:
      "مساحة العمل الموحدة للعقارات والمقيمين والحجوزات والسجلات المالية.",
    welcomeBack: "مرحبًا بك من جديد",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ الدخول",
    signInFailed: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    signInThrottled: "محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل.",
    signInUnavailable: "تسجيل الدخول لا يعمل الآن. حاول مرة أخرى بعد قليل.",

    challengeTitle: "الخطوة الثانية",
    challengeSummary:
      "أدخل الرمز من تطبيق المصادقة، أو أحد رموز النسخ الاحتياطي.",
    code: "الرمز",
    verify: "تحقّق",
    challengeFailed: "هذا الرمز غير صالح.",
    challengeExpired:
      "جُرّبت رموز كثيرة جدًا أو انتهت المهلة. سجّل الدخول مرة أخرى لإدخال رمز جديد.",

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
    noFinanceTitle: "المالية غير مفعّلة في هذه المنشأة",
    noFinanceDescription:
      "تظهر هنا عندما يشملها اشتراك مؤسستك ويتم تفعيلها في المنشأة.",
    noArrivalsTitle: "لا يوجد وصول اليوم",
    noArrivalsDescription: "لا توجد حجوزات وصول لهذه المنشأة اليوم.",
    openEnded: "مفتوح المدة",
    checkIn: "تسجيل الوصول",
    checkingIn: "جارٍ التسجيل",
    checkedIn: "تم تسجيل الوصول",
    unitUnavailable: "هذه الوحدة محجوزة في تلك الليالي.",
    unitOccupied:
      "لا يزال هناك نزيل في هذه الوحدة. سجّل مغادرته أولًا أو ضع هذا الضيف في وحدة أخرى.",
    unitNotInService:
      "هذه الوحدة محظورة أو خارج الخدمة. ارفع الحظر أو أعدها إلى الخدمة، أو ضع هذا الضيف في وحدة أخرى.",
    blockReasonPlaceholder: "صيانة أو إصلاح",
    roomNotReady:
      "هذه الغرفة ليست جاهزة بعد — لم تُنظَّف أو أنها بانتظار الفحص.",
    checkInAnyway: "تسجيل الدخول على أي حال",
    notNow: "ليس الآن",
    ready: "جاهزة",
    notReady: "غير جاهزة",
    checkInRefused: "لا يمكن تسجيل الوصول لهذا الحجز.",
    checkInTooEarly:
      "لم يبدأ هذا الحجز بعد — ليلته الأولى في يوم عمل لاحق. سجّل وصول الضيف في ذلك اليوم، أو غيّر الحجز ليبدأ اليوم.",
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
    checkInDayClosed:
      "أُغلق يوم العمل الذي سُجِّل فيه هذا الوصول، لذلك لا يمكن التراجع عنه. إن لم يكن الضيف مقيمًا، فسجّل مغادرته من شاشة المغادرة.",
    checkInMoved:
      "نُقل الضيف إلى غرفة أخرى بعد تسجيل وصوله، لذلك لا يمكن التراجع عنه. إن لم يكن مقيمًا، فسجّل مغادرته من شاشة المغادرة.",
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
      checked_out: "تمت المغادرة",
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
    awaitingConfirmation: "بانتظار التأكيد",
    occupiedDueOut: "مشغولة — مغادرة اليوم",
    occupied: "مشغولة",
    occupiedOverstay: "مشغولة — تجاوز موعد المغادرة",
    cancelBooking: "إلغاء الحجز",
    cancelBookingTitle: "إلغاء هذا الحجز",
    cancelBookingSummary:
      "تتحرر الليالي ويمكن بيعها من جديد. لا يمكن التراجع عن الإلغاء.",
    noShowTitle: "تسجيل عدم الحضور",
    noShowSummary: "لم يحضر الضيف. تتحرر الليالي ولا يمكن التراجع عن ذلك.",
    markNoShow: "تسجيل عدم الحضور",
    keepBooking: "إبقاء الحجز",
    endBookingRefused: "لم يعد بالإمكان إنهاء هذا الحجز.",
    saving: "جارٍ الحفظ…",
    checkInBlocked: {
      not_confirmed: "يجب تأكيد الحجز أولًا.",
      unit_blocked: "الوحدة محظورة. ارفع الحظر أو اختر وحدة أخرى.",
      unit_out_of_service: "الوحدة خارج الخدمة. اختر وحدة أخرى.",
      unit_occupied: "لا يزال هناك نزيل في الغرفة. سجّل مغادرته أولًا.",
    },
    checkOutFor: "تسجيل مغادرة {guest}",
    checkOutTitle: "تسجيل المغادرة",
    checkOutSummary:
      "يغادر الضيف ويمكن تأجير الغرفة من جديد. لا يمكن التراجع عن المغادرة، لذا راجع الحساب أولًا.",
    confirmCheckOut: "تأكيد المغادرة",
    keepInHouse: "إبقاء الإقامة",
    plannedDeparture: "المغادرة المخططة",
    plannedFor: "مخطط لها في {date}",
    noFolio: "لا يوجد حساب",
    reviewFolio: "فتح الحساب",
    checkOutEarlyAcknowledge: "يغادر الضيف قبل موعد مغادرته المخطط في {date}.",
    checkOutEarlyRequired: "أكّد أن الضيف يغادر مبكرًا.",
    checkOutBalanceReason: "سبب إبقاء الرصيد مفتوحًا",
    checkOutNightsToCharge: "يُحتسب عند المغادرة",
    checkOutPendingNights:
      "{count, plural, zero {# ليلة} one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلة} other {# ليلة}} · {amount}",
    checkOutUnpriced: "أُخذ هذا الحجز بلا سعر، لذا لا تُحتسب لياليه.",
    balanceAfterCheckOut: "الرصيد بعد المغادرة",
    checkOutBalanceHint:
      "يبقى الحساب مفتوحًا برصيد {balance}، ويُسجَّل السبب الذي تكتبه. تُسجَّل الدفعة على الحساب.",
    checkOutBalanceReasonRequired: "على الحساب رصيد. اكتب سبب إبقائه مفتوحًا.",
    checkOutFolioChanged:
      "أُضيف قيد إلى الحساب أثناء مراجعتك. راجعه مرة أخرى ثم أعد المحاولة.",
    departuresViews: "عروض قائمة المغادرة",
    inHouseAt: "المقيمون حاليًا في",
    departuresDue: "المستحقة والمتأخرة",
    departuresInHouse: "جميع النزلاء المقيمين",
    nobodyInHouseTitle: "لا يوجد نزلاء مقيمون",
    nobodyInHouseDescription: "لا يوجد ضيف مسجَّل الوصول في هذا العقار حاليًا.",
    noGuestRecorded: "لا يوجد ضيف مسجَّل",
    walkIn: "بلا حجز",
    showOnRoomMap: "عرض على خريطة الغرف",
    noDeparturesTitle: "لا توجد مغادرات اليوم",
    noDeparturesDescription: "لا أحد من المقرر أن يغادر هذه المنشأة اليوم.",
    leftToday: "غادروا اليوم",
    leftAt: "وقت المغادرة",
    nobodyLeftYet: "لم يغادر أحد بعد اليوم.",
    readiness: "الجاهزية",
    reservation: "الحجز",
    roomAndBed: "الغرفة والسرير",
    notAssigned: "غير محدد",
    outOfOrder: "خارج الخدمة",
    daysLate:
      "{n, plural, one {متأخر يوم واحد} two {متأخر يومان} few {متأخر # أيام} many {متأخر # يوماً} other {متأخر # يوم}}",
    credit: "رصيد دائن",
    moreActionsFor: "مزيد من الإجراءات لـ {guest}",
    openFolio: "فتح الحساب",
    leaves: "المغادرة",
    overdueSince: "متأخر منذ {date}",
    untilDate: "حتى {date}",

    reservations: "الحجوزات",
    reservationsAt: "الحجوزات في",
    copyReference: "نسخ رقم الحجز",
    referenceCopied: "تم النسخ",
    dueToday: "مغادرة اليوم",
    viewDetails: "عرض التفاصيل",
    reservationDetails: "تفاصيل الحجز",
    stayTimeline: "الجدول الزمني للإقامة",
    contactDetails: "بيانات الاتصال",
    financialDetails: "تفاصيل الفاتورة والأسعار",

    acceptInvitation: {
      summary: "دعتك {organization} للانضمام بدور {role}.",
      title: {
        set_password: "اختر كلمة المرور",
        sign_in: "سجّل الدخول لقبول الدعوة",
        accept: "اقبل دعوتك",
      },
      name: "اسمك",
      passwordHint: "8 أحرف على الأقل. ستستخدمها لتسجيل الدخول.",
      signInHint: "لديك حساب بالفعل لهذا العنوان.",
      working: "لحظة...",
      goToSignIn: "الذهاب إلى تسجيل الدخول",
      submit: {
        set_password: "تعيين كلمة المرور والانضمام",
        sign_in: "تسجيل الدخول وقبول الدعوة",
        accept: "قبول الدعوة",
      },
      errors: {
        weak_password:
          "كلمة المرور قصيرة جدًا أو طويلة جدًا. استخدم من 8 إلى 128 حرفًا.",
        throttled: "محاولات كثيرة. أعد المحاولة بعد قليل.",
        account_exists:
          "يوجد حساب لهذا العنوان بالفعل. سجّل الدخول بكلمة مروره.",
        unavailable: "لم ينجح ذلك. أعد المحاولة، وأخبر من دعاك إن استمر الفشل.",
        secondStep: "يطلب هذا الحساب خطوة ثانية لا يمكن إجراؤها هنا.",
      },
      refused: {
        unknown: {
          title: "هذا الرابط لا يعمل",
          body: "ربما نُسخ ناقصًا أو أنه ليس دعوة.",
          next: "اطلب ممن دعاك إعادة إرسال الرابط كاملًا.",
        },
        expired: {
          title: "انتهت صلاحية هذه الدعوة",
          body: "يبقى رابط الدعوة صالحًا سبعة أيام.",
          next: "اطلب ممن دعاك رابطًا جديدًا. لا يلزمك شيء آخر.",
        },
        accepted: {
          title: "استُخدمت هذه الدعوة من قبل",
          body: "يعمل الرابط مرة واحدة، وقد استُخدم هذا الرابط.",
          next: "إن كنت أنت من استخدمه فسجّل الدخول. وإن لم تكن أنت فأخبر من دعاك.",
        },
        withdrawn: {
          title: "سُحبت هذه الدعوة",
          body: "ألغى مرسلها الدعوة أو أرسل رابطًا أحدث.",
          next: "اطلب ممن دعاك رابطًا حاليًا.",
        },
        membership_revoked: {
          title: "أُزيلت هذه الصلاحية",
          body: "أُزيل مكانك في هذه المؤسسة قبل أن تستخدم الرابط.",
          next: "اطلب من أحد مديري المؤسسة استعادته وإرسال رابط جديد.",
        },
        other_account: {
          title: "هذه الدعوة لشخص آخر",
          body: "سجّلت الدخول بصفة شخص غير المدعو.",
          next: "سجّل الخروج ثم افتح الرابط مرة أخرى.",
        },
      },
    },
    staff: {
      search: "ابحث في الفريق",
      showRevoked: "إظهار {count} ممن أُزيل وصولهم",
      noMatch: "لا أحد في القائمة يطابق «{query}».",
      showAll: "إظهار الجميع",
      undoUntil: "يمكن التراجع حتى {until}",
      undoOver: "انتهت مهلة التراجع البالغة {hours} ساعة",
      linkNoLonger: "لا رابط صالح",
      renewLink: "رابط دعوة جديد",
      addBack: "إعادة الإضافة",
      done: "تم",
      chooseRole: "اختر دورًا",
      everyProperty: "كل منشأة في هذه المؤسسة، بما فيها ما يُضاف لاحقًا",
      reachesNothingWarning:
        "لن يصل هذا الشخص إلى أي منشأة. يمكنه تسجيل الدخول لكنه لن يرى شيئًا حتى تعيّن له منشأة.",
      roleDescriptions: {
        owner:
          "كل شيء، بما فيه هوية المؤسسة. امنحه بحذر: يستطيع المالك تغيير دور أي شخص.",
        manager:
          "يدير المنشأة يوميًا: الحجوزات والغرف والأسعار والفريق والموارد البشرية والرواتب ودفتر الحسابات. لا يغيّر هوية المؤسسة.",
        front_desk:
          "الحجوزات وتسجيل الوصول والمغادرة وقبض المدفوعات وإغلاق اليوم. بلا رواتب ولا دفتر حسابات ولا تغيير للفريق.",
        housekeeping: "يحدّث حالة الغرف ويبلّغ عن الصيانة. لا شيء غير ذلك.",
        finance:
          "الرسوم والمدفوعات وعكسها ودفتر الحسابات وتصدير البيانات. بلا حجوزات.",
      },
      copyLink: "نسخ الرابط",
      linkCopied: "تم النسخ",
      copyFailed: "تعذّر النسخ. حدّد الرابط وانسخه يدويًا.",
      linkNotSent:
        "لم يُرسل أي بريد إلكتروني. انسخ الرابط وأرسله إلى الشخص بنفسك.",
      showSection: "إظهار قسم",
      allSections: "كل الأقسام",
      sections: {
        frontDesk: "الاستقبال",
        money: "المال",
        rooms: "الغرف والتدبير",
        guests: "خدمات النزلاء",
        people: "الأشخاص والموارد البشرية",
        setup: "الإعداد والسجلات",
      },
      revenueGateNote:
        "يُظهر أيضًا الإيرادات والأرصدة في التحليلات واليوم والمحفظة.",
      allowed: "مسموح",
      notAllowed: "غير مسموح",
      unsavedRoles:
        "{count, plural, one {دور واحد فيه تغييرات غير محفوظة} two {دوران فيهما تغييرات غير محفوظة} few {# أدوار فيها تغييرات غير محفوظة} many {# دورًا فيها تغييرات غير محفوظة} other {# دور فيها تغييرات غير محفوظة}}. {people, plural, =0 {لا أحد يحمل هذه الأدوار.} one {الحفظ يُنهي جلسة شخص واحد.} two {الحفظ يُنهي جلستي شخصين.} few {الحفظ يُنهي جلسات # أشخاص.} many {الحفظ يُنهي جلسات # شخصًا.} other {الحفظ يُنهي جلسات # شخص.}}",
      discardChanges: "تجاهل التغييرات",
      saveChanges: "حفظ التغييرات",
      confirmSaveTitle: "حفظ تغييرات الأدوار هذه؟",
      confirmSaveRoles: "غيّرت ما يمكن لـ {roles} فعله.",
      confirmSaveNobody: "لا أحد يحمل هذه الأدوار بعد، فلا تنتهي جلسة أحد.",
      confirmSavePeople:
        "يحمل هذه الأدوار {people, plural, one {شخص واحد} two {شخصان} few {# أشخاص} many {# شخصًا} other {# شخص}}. الحفظ يُنهي جلساتهم ويحصلون على الصلاحيات الجديدة عند تسجيل الدخول مجددًا.",
      confirmRetireTitle: "إيقاف عرض {role}؟",
      retireBody:
        "لن يُعرض {role} بعد الآن عند دعوة شخص أو تغيير دور. لا أحد يحمله فلا يتأثر أحد. يمكنك إعادة عرضه في أي وقت.",
      retireHeld:
        "يحمل {role} {count, plural, one {شخص واحد} two {شخصان} few {# أشخاص} many {# شخصًا} other {# شخص}}. أعطهم دورًا آخر أولًا ثم أوقف عرضه.",
      startFrom: "ابدأ من",
      startFromPlaceholder: "دور فارغ",
      confirmRoleGains: "يكتسب: {permissions}.",
      confirmRoleLosses: "يفقد: {permissions}.",
      hrPointer:
        "هذه القائمة هي من يستطيع تسجيل الدخول وما يحق له فعله. الرواتب والمناوبات والإجازات في",
      hrPointerLink: "الموارد البشرية والرواتب",
      membership: {
        revoke: {
          title: "إزالة الوصول عن {member}؟",
          body: "يفقد {member} وصوله إلى هذه المؤسسة الآن. تنتهي كل جلسة يحملها فورًا على كل جهاز.",
          keeps:
            "لا يُحذف شيء. يبقى في هذه القائمة بصفة أُزيل وصوله، وكل ما سجّله يبقى في السجل باسمه، ويتوقف رابط الدعوة غير المستخدم عن العمل.",
          undo: "يمكنك التراجع خلال {hours} ساعة. بعد ذلك لا يمكن إعادته إلا برابط جديد، ولا يصل إلى أي منشأة حتى تعيّن له واحدة.",
          self: "هذا وصولك أنت. سيُنهى تسجيل دخولك فور التأكيد، ولا يمكنك التراجع عن ذلك بنفسك.",
          confirm: "إزالة الوصول",
        },
        restore: {
          title: "استعادة الوصول لـ {member}؟",
          body: "يستعيد {member} دوره والمنشآت التي كان يصل إليها. عليه تسجيل الدخول من جديد لأن جلساته انتهت عند إزالة وصوله.",
          until: "يمكنك الاستعادة حتى {until}.",
          confirm: "استعادة الوصول",
        },
        renew: {
          title: "إنشاء رابط جديد لـ {member}؟",
          body: "يتوقف الرابط القديم عن العمل فورًا. لا يُرسل بريد إلكتروني: تنسخ الرابط الجديد وتمرره بنفسك.",
          done: "الرابط الجديد جاهز. لم يعد القديم يعمل.",
          confirm: "إنشاء رابط جديد",
        },
        readd: {
          title: "إعادة إضافة {member}؟",
          body: "يعود {member} إلى الفريق بدوره السابق ({role}). لا يصل إلى أي منشأة حتى تعيّن له واحدة. يُنشأ رابط جديد؛ لا يُرسل بريد إلكتروني.",
          done: "عاد الشخص إلى الفريق. مرّر الرابط؛ لا يصل بعد إلى أي منشأة.",
          confirm: "إعادة الإضافة",
        },
      },
      rosterOf: "فريق",
      screenSummary: "من يعمل هنا، وأي المنشآت يصلها، وما الذي يستطيعه كل دور.",
      readOnly: "يمكنك رؤية الفريق. يستطيع المالك أو المدير تغييره.",
      peopleTab: "الأشخاص",
      rolesTab: "ما يستطيعه كل دور",
      person: "الشخص",
      permission: "الصلاحية",
      heldByCount:
        "{count, plural, =0 {لا أحد} one {شخص واحد} two {شخصان} few {# أشخاص} many {# شخصًا} other {# شخص}}",
      shippedGroup: "ترسلها رانزا",
      authoredGroup: "عرَّفتها أنت",
      invitationSent: "لم يُستخدم الرابط بعد",
      inviteNotice:
        "لا يُرسل بريد إلكتروني. تنسخ الرابط وتمرره بنفسك. يعمل مرة واحدة وتنتهي صلاحيته بعد سبعة أيام.",
      matrixNote:
        "الأدوار التي ترسلها رانزا تأتي مع الإصدار ولا تُعدَّل. تُحفظ تغييرات أدوارك معًا، وتفرضها قاعدة البيانات.",
      cannotGrant:
        "لم يُحفظ لـ {roles}: لا يمكنك منح صلاحية لا يحملها دورك. حُفظت الأدوار الأخرى.",
      invite: "دعوة",
      inviteTitle: "دعوة شخص إلى الفريق",
      inviteDescription:
        "تُفتح العضوية فورًا. الرابط ليس إلا وسيلة لتعيين كلمة المرور.",
      sendInvitation: "إنشاء رابط الدعوة",
      cancel: "إلغاء",
      linkToPassOn: "رابط الدعوة",
      linkExpires:
        "يعمل مرة واحدة وحتى {date}. إغلاق هذه النافذة لا يحذفه: استخدم «رابط دعوة جديد» في القائمة لإنشاء آخر.",
      email: "البريد الإلكتروني",
      role: "الدور",
      properties: "المنشآت",
      status: "الحالة",
      actions: "الإجراءات",
      aboveYou: "دور هذا الشخص أو نطاق وصوله أوسع من صلاحياتك.",
      active: "نشط",
      awaitingPassword: "بانتظار كلمة المرور",
      revoked: "أُزيل الوصول",
      revoke: "إزالة الوصول",
      undoRevoke: "استعادة الوصول",
      reachesNothing: "لا منشأة بعد",
      reachesEverywhere: "كل المنشآت",
      alreadyAMember: "لهذا الشخص عضوية في هذه المؤسسة بالفعل.",
      refused: "رُفض هذا الإجراء.",
      lastAdministrator:
        "يجب أن يبقى في المؤسسة من يستطيع إضافة الفريق. أعطِ شخصًا آخر دور المالك أولًا.",
      roleIsHeld: "هذا الدور يحمله أحدهم. انقلهم أولًا.",
      confirmRoleTitle: "تغيير هذا الدور؟",
      confirmRoleChange: "سينتقل {member} من {from} إلى {to}.",
      confirmRoleSessions:
        "ستنتهي جميع جلساته وسيحتاج إلى تسجيل الدخول من جديد.",
      confirmRoleSelf: "هذا دورك أنت، لذا سيتم تسجيل خروجك.",
      confirmRoleSelfLosesAccess:
        "لا يستطيع دور {to} إدارة الفريق، لذلك لن تتمكن بعد الآن من تغيير دور أي شخص أو دعوة أعضاء جدد.",
      confirmRoleConfirm: "تغيير الدور",
      confirmRoleClose: "إغلاق",
      roleChangedMeanwhile:
        "غُيّر هذا الدور أثناء اتخاذك القرار. يحمل {member} الآن دور {role}. لم يتغير شيء.",
      roleRetired: "لم يعد هذا الدور متاحًا. لم يتغير شيء.",
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
      retired: "لم يعد معروضًا",
      retire: "إيقاف العرض",
      reinstate: "إعادة العرض",
      noCommands: "لا شيء بعد",
      permissions: {
        book: "أخذ حجز",
        checkIn: "تسجيل الدخول",
        checkOut: "تسجيل المغادرة",
        cancel: "إلغاء حجز أو تسجيل عدم الحضور",
        amend: "تعديل الحجوزات والإقامات ونقل النزلاء",
        closeDay: "إغلاق اليوم",
        manageFolio: "فتح وإغلاق الحساب",
        postCharge: "تسجيل رسم على الحساب",
        reverseCharge: "عكس رسم مسجَّل على الحساب",
        postPayment: "تسجيل دفعة على الحساب",
        reversePayment: "عكس دفعة مسجَّلة على الحساب",
        viewLedger: "قراءة دفتر الأستاذ العام",
        administerStaff: "إدارة الفريق",
        defineRoles: "تعريف الأدوار",
        configureAccommodation: "تهيئة الغرف والأسرّة",
        updateHousekeeping: "تحديث حالة الغرف",
        reportMaintenance: "الإبلاغ عن مشكلة صيانة",
        manageMaintenance: "إدارة طلبات الصيانة",
        takeOutOfOrder: "إخراج الغرف من الخدمة وإعادتها",
        manageEquipment: "إدارة سجل المعدات",
        readAudit: "قراءة سجل التدقيق",
        manageConfiguration: "إدارة الإعدادات",
        manageRates: "تحديد أسعار الليلة",
        readDataExports: "عرض عمليات التصدير",
        createDataExports: "طلب تصدير البيانات",
        createServiceRequests: "إنشاء طلب نزيل",
        manageServiceRequests: "إدارة طلبات النزلاء",
        viewHr: "عرض سجلات الموظفين وكشوف الرواتب",
        manageHr: "إدارة سجلات الموظفين وكشوف الرواتب",
        viewIntegrations: "عرض عمليات التكامل",
        manageIntegrations: "إدارة عمليات التكامل",
        manageBranding: "إدارة هوية المؤسسة البصرية (اللون والشعار)",
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
    reservationsViews: "عرض الحجوزات",
    reservationsTab: {
      all: "الكل",
      arriving: "وصول اليوم",
      inHouse: "المقيمون",
      departing: "مغادرة اليوم",
      upcoming: "القادمة",
    },
    reservationsTabEmpty: {
      arriving: "لا أحد متوقع وصوله اليوم",
      inHouse: "لا أحد مقيم حالياً",
      departing: "لا أحد متوقع مغادرته اليوم",
      upcoming: "لا حجوزات لاحقة",
    },
    reservationsTabEmptyHint: "انتقل إلى «الكل» لعرض كل الحجوزات.",
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
    departureRequiredHint:
      "يحتاج حجز الضيف إلى تاريخ مغادرة. يمكن ترك حجز المقيم وحده مفتوح المدة.",
    noBookableUnit:
      "لا توجد وحدة يمكن حجزها هنا — كل الوحدات محجوبة أو خارج الخدمة أو تُؤجَّر بالسرير.",
    openRooms: "انتقل إلى الغرف والأسرّة",
    quotePerNight: "{price} لليلة",
    quoteStay:
      "{count, plural, zero {# ليلة} one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلة} other {# ليلة}}: الإجمالي {total}",
    quoteUnpriced:
      "لم يُحدَّد سعر لـ{type} هنا، لذا يُؤخذ هذا الحجز بلا سعر ولا تُحتسب لياليه.",
    quoteResident: "يُحاسَب المقيم شهريًا، لا بسعر الليلة.",
    bookedPerNight: "{price} / ليلة",
    bookedUnpriced: "بلا سعر",
    priceColumn: "السعر",
    stayDates: "تواريخ الإقامة",
    bookingAddDate: "أضف تاريخًا",
    bookingOpenEnded: "مفتوحة المدة",
    bookingPickArrival: "اختر يوم الوصول",
    bookingPickDeparture: "اختر يوم المغادرة أو اتركه مفتوحًا",
    bookingPickDepartureRequired: "اختر يوم المغادرة",
    stayNights:
      "{count, plural, one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلة} other {# ليلة}}",
    dateRangeClear: "مسح",
    dateRangeDone: "تم",
    chooseUnit: "اختر وحدة",
    takeBooking: "إنشاء الحجز",
    takingBooking: "جارٍ الإنشاء",
    discardBooking: "إلغاء",
    bookingUnavailable: "هذه الوحدة محجوزة بالفعل لتلك الليالي.",
    unitBookedThoseNights: "محجوزة لهذه الليالي",
    unitOccupiedThoseNights: "يوجد نزيل مقيم في هذه الليالي",
    chosenUnitTakenThoseNights:
      "هذه الوحدة غير متاحة لليالي التي اخترتها. اختر وحدة أخرى أو تواريخ أخرى.",
    bookingAvailabilityUnknown:
      "تعذر التحقق من الوحدات المتاحة لهذه الليالي. يمكنك الاختيار، وسيُرفض الحفظ عند وجود تعارض.",
    bookingOverOccupant: "هناك نزيل يقيم في هذه الوحدة خلال بعض تلك الليالي.",
    bookingPeriodInvalid:
      "هذه التواريخ ليست مدة صالحة. يغطي الحجز ليلة واحدة على الأقل ولا يبدأ قبل اليوم.",
    guestRequired: "أدخل اسم النزيل.",
    guestEmailInvalid:
      "أدخل بريدًا إلكترونيًا صالحًا مثل name@example.com، أو اتركه فارغًا.",
    bookingGuestInvalid: "تحقق من اسم الضيف وبريده الإلكتروني وهاتفه.",
    bookingArrivalInvalid: "أدخل الوصول المتوقع كوقت من اليوم.",
    expectedArrival: "الوصول المتوقع",
    expectedAt: "المتوقع {time}",
    expectedArrivalHint:
      "اختياري. الوقت الذي يتوقع النزيل الوصول فيه، بتوقيت المنشأة.",
    expectedArrivalNone: "لا يوجد وقت متوقع",
    expectedArrivalPassed: "تجاوز وقت الوصول المتوقع",
    bookingPriceChanged:
      "تغيّر سعر هذه الوحدة أثناء الحجز. راجع السعر الجديد ثم أعد أخذ الحجز.",
    bookingRefused: "لا يمكن إنشاء هذا الحجز.",
    changeBooking: "تعديل الحجز",
    changeBookingSummary:
      "انقله إلى ليالٍ أخرى أو إلى وحدة أخرى. يبقى سعره كما هو ما لم تكن الوحدة من نوع آخر.",
    changeBookingChecking: "جارٍ التحقق من تلك الليالي…",
    changeBookingLoadFailed:
      "تعذّر التحقق من تلك الليالي. اختر التواريخ مرة أخرى.",
    changeBookingUnitFree: "متاحة",
    changeBookingUnitBooked: "محجوزة · {reference}",
    changeBookingUnitOccupied: "يقيم فيها نزيل",
    changeBookingUnitNotTaking: "لا تستقبل حجوزات حاليًا",
    changeBookingCurrentNotTaking:
      "هذه الوحدة خارج الخدمة أو تُؤجَّر بالسرير. يمكن تغيير تواريخ الحجز هنا، أو نقله إلى وحدة أخرى.",
    changeBookingBlockedBooked:
      "الحجز {reference} يشغل بعض تلك الليالي. لتبديل حجزين، انقل أحدهما إلى وحدة متاحة أولًا.",
    changeBookingBlockedOccupied:
      "هناك نزيل يقيم في هذه الوحدة خلال بعض تلك الليالي.",
    changeBookingBeforeToday: "يجب أن يكون الوصول اليوم أو بعده.",
    changeBookingPriceKept: "{price} لليلة، كما في الحجز",
    changeBookingPriceChanges: "{from} ← {to} لليلة",
    changeBookingPriceNone: "لا يوجد سعر لـ{type}: سيبقى الحجز بلا سعر.",
    changeBookingNote: "ملاحظة (اختيارية)",
    changeBookingNoteHint: "تُحفظ في سجل تعديلات الحجز وسجل التدقيق.",
    saveChange: "حفظ التعديل",
    keepAsItWas: "إبقاؤه كما كان",
    changeBookingChanged: "عدّل أحدهم هذا الحجز قبل لحظات. يظهر الآن كما هو.",
    changeBookingNotInService: "لا يمكن لهذه الوحدة استقبال هذا الحجز الآن.",
    changeBookingNoteInvalid: "يجب أن تتراوح الملاحظة بين 3 و500 حرف.",
    changeBookingNothing: "التواريخ والوحدة كما هي: لا يوجد ما يُعدَّل.",
    changeBookingRefused: "لا يمكن تعديل هذا الحجز.",
    changeDeparture: "تغيير موعد المغادرة",
    changeDepartureSummary:
      "مدّد الإقامة أو قصّرها. تُحتسب ليالي الضيف الإضافية بسعر الحجز نفسه؛ والمغادرة اليوم تسجيل مغادرة.",
    changeDepartureLonger:
      "{count, plural, one {ليلة إضافية واحدة} two {ليلتان إضافيتان} few {# ليالٍ إضافية} many {# ليلة إضافية} other {# ليلة إضافية}} بسعر {price} لكل ليلة",
    changeDepartureLongerUnpriced:
      "{count, plural, one {ليلة إضافية واحدة} two {ليلتان إضافيتان} few {# ليالٍ إضافية} many {# ليلة إضافية} other {# ليلة إضافية}} دون رسوم: أُخذ الحجز بلا سعر",
    changeDepartureLongerResident:
      "{count, plural, one {ليلة إضافية واحدة} two {ليلتان إضافيتان} few {# ليالٍ إضافية} many {# ليلة إضافية} other {# ليلة إضافية}}؛ يُفوتَر المقيم شهريًا",
    changeDepartureShorter:
      "{count, plural, one {ليلة واحدة أقل} two {ليلتان أقل} few {# ليالٍ أقل} many {# ليلة أقل} other {# ليلة أقل}}",
    changeDepartureOpen: "لا موعد مغادرة: تبقى الإقامة مفتوحة.",
    changeDepartureNeedsEnd:
      "تحتاج إقامة الضيف إلى موعد مغادرة؛ الإقامة المفتوحة للمقيم وحده.",
    changeDepartureBlocked:
      "الحجز {reference} يشغل بعض تلك الليالي. انقل النزيل أو ذلك الحجز أولًا.",
    changeDepartureNothing: "هذا هو موعد المغادرة بالفعل.",
    changeDepartureRefused: "لا يمكن تعديل هذه الإقامة.",
    saveDeparture: "حفظ موعد المغادرة",
    extendStay: "تمديد",
    moveGuest: "نقل النزيل",
    moveGuestSummary:
      "انقله إلى وحدة أخرى بدءًا من الليلة. تنتقل معه الإقامة وحسابها وسعرها؛ وتُعلَّم الغرفة التي غادرها للتنظيف.",
    moveGuestReason: "السبب",
    moveReason: {
      fault: "في الغرفة عطل",
      upgrade: "ترقية",
      guest_request: "طلب النزيل",
      other: "سبب آخر",
    },
    moveGuestUnitNotReady: "غير جاهزة",
    moveGuestPriceKept: "{price} لليلة، كما في الحجز: النقل لا يغيّر السعر",
    moveGuestUnpriced: "الحجز بلا سعر؛ والنقل لا يغيّر ذلك.",
    moveGuestNoteRequired: "لسبب آخر، اذكره في الملاحظة.",
    moveGuestNotReady: "هذه الوحدة ليست جاهزة بعد. اختر غيرها أو نظّفها أولًا.",
    moveGuestRefused: "لا يمكن نقل هذا النزيل.",
    folios: "الحسابات",
    foliosAt: "الحسابات في",
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
    addPayment: "تسجيل دفعة",
    paymentMethod: "طريقة الدفع",
    paymentMethods: {
      cash: "نقداً",
      card: "بطاقة ائتمان",
      bank_transfer: "تحويل بنكي",
      other: "أخرى",
    },
    paymentRefused: "تعذّر تسجيل هذه الدفعة.",
    amountInvalid:
      "يجب أن يكون المبلغ رقمًا موجبًا بعدد خانات عشرية لا يتجاوز ما تسمح به العملة.",
    reverse: "عكس القيد",
    reversing: "جارٍ العكس…",
    reversed: "معكوس",
    roomNightLine: "ليلة إقامة · {date}",
    reverseReason: "السبب",
    reverseRefused: "تعذّر عكس هذا البند.",
    closeFolio: "إغلاق الحساب",
    closing: "جارٍ الإغلاق…",
    closeRefused: "تعذّر إغلاق هذا الحساب.",
    folioInHouseNote:
      "الضيف ما زال في المنشأة، لذا يبقى الحساب مفتوحًا: تُحتسب عليه لياليه المتبقية. يمكن إغلاقه بعد المغادرة.",
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
    buildingColumn: "المبنى",
    floorColumn: "الطابق",
    floorNumber: "الطابق {floor}",
    noFloor: "بلا طابق محدد",
    bedCount:
      "{count, plural, one {سرير واحد} two {سريران} few {# أسرّة} many {# سريرًا} other {# سرير}}",
    sleeps: "يتّسع لـ {count}",
    tonightColumn: "الليلة",
    unitActions: "الإجراءات",
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
    statReserved: "محجوز الليلة",
    nextArrivalOn: "الوصول التالي {date}",
    outOfOrderBeds: "{count, number} خارج الخدمة",
    blockedStatus: "مغلق",
    roomCalendar: {
      subtitle: "الغرف والأسرّة مقابل أيام عمل المنشأة.",
      previous: "الأيام السبعة السابقة",
      next: "الأيام السبعة التالية",
      today: "اليوم",
      goTo: "الانتقال إلى تاريخ",
      chosenDay: "التاريخ الذي اخترته",
      length: "الأيام المعروضة",
      lengthOption:
        "{days, plural, zero {# يوم} one {يوم واحد} two {يومان} few {# أيام} many {# يومًا} other {# يوم}}",
      floorFilter: "الطابق",
      allFloors: "كل الطوابق",
      floorOption: "الطابق {floor}",
      noFloor: "بلا طابق",
      noBuilding: "بلا مبنى",
      search: "ابحث عن غرفة أو ضيف",
      filters: "التصفية",
      filtersCount: "التصفية ({count})",
      showRequested: "إظهار: مطلوب",
      showDeparted: "إظهار: غادر",
      collapseAll: "طيّ كل الأسرّة",
      expandAll: "إظهار كل الأسرّة",
      overlapCount:
        "{count, plural, zero {لا تداخلات} one {تداخل واحد} two {تداخلان} few {# تداخلات} many {# تداخلًا} other {# تداخل}}",
      bookedWhileBlockedCount:
        "{count, plural, zero {لا حجوزات على غرف مغلقة} one {حجز واحد على غرفة مغلقة} two {حجزان على غرف مغلقة} few {# حجوزات على غرف مغلقة} many {# حجزًا على غرف مغلقة} other {# حجز على غرف مغلقة}}",
      legend: "معنى العلامات",
      requested: "مطلوب",
      confirmed: "مؤكد",
      inHouse: "مقيم",
      overdue: "متأخر",
      departed: "غادر",
      overlap: "تداخل",
      clashes: "يتعارض مع حجز",
      bookedWhileBlocked: "محجوز وهو مغلق",
      blocked: "مغلق",
      outOfService: "خارج الخدمة",
      gridLabel: "الغرف والأسرّة حسب الليلة",
      roomColumn: "الغرفة",
      freeRow: "متاح",
      freeOn:
        "{date}: {n, plural, zero {لا شيء متاح من {of, number}} one {واحد متاح من {of, number}} two {اثنان متاحان من {of, number}} few {# متاحة من {of, number}} many {# متاحًا من {of, number}} other {# متاح من {of, number}}}",
      expand: "إظهار أسرّة {room}",
      collapse: "طيّ أسرّة {room}",
      bedsTakenLabel: "{n, number} من {of, number} أسرّة مشغولة",
      barLabel: "{guest}، {status}، من {from} إلى {to}",
      barLabelOverdue:
        "{guest}، متأخر، وصل {from}، كان موعد مغادرته {to}، ما زال في الغرفة الليلة",
      barOverdueCard: "متأخر · في الغرفة حتى الليلة (كان موعد مغادرته {to})",
      noGuestRecorded: "لا ضيف مسجّل",
      noEndDate: "بلا تاريخ انتهاء",
      refreshFailed: "تعذّر التحديث. يُعرض التقويم كما كان في {time}.",
      noRoomsTitle: "لا غرف بعد",
      noRoomsDescription: "أضف الغرف والأسرّة لتظهر هنا مقابل الأيام.",
      goToRooms: "الانتقال إلى الغرف والأسرّة",
      noMatchTitle: "لا غرف مطابقة",
      noMatchDescription:
        "لا شيء في هذا التقويم يطابق الطابق أو البحث أو المرشحات المختارة.",
      clearFilters: "مسح المرشحات",
      filteredNote: "مُرشَّح. أعداد المتاح والتداخل ما زالت تشمل كل الغرف.",
      nothingBooked: "لا حجوزات من {from} إلى {to}.",
      failedTitle: "تعذّر عرض تقويم الغرف",
      failedDescription: "لم يتغير شيء. حاول مرة أخرى بعد قليل.",
      retry: "حاول مرة أخرى",
      loading: "جارٍ تحميل تقويم الغرف",
      goneTitle: "لم يعد في التقويم",
      goneNote:
        "أُلغي هذا الحجز أو سُجّلت مغادرته أو خرج من هذه الفترة منذ فتحته.",
      changedNote: "تغيّر هذا الحجز منذ فتحته.",
      overlapNote:
        "حجز آخر يشغل بعض هذه الليالي في هذه الغرفة. عالج ذلك قبل وصول الضيف.",
      clashNote: "هذا الطلب يتعارض مع حجز مؤكد؛ وتأكيده على حاله سيُرفض.",
      clashStayNote:
        "هذا الطلب يتعارض مع ضيف مقيم في هذه الليالي؛ وتأكيده على حاله سيُرفض.",
      clashesStay: "يتعارض مع ضيف مقيم",
      windowFailed:
        "تعذّر فتح هذه الفترة. تُعرض الفترة السابقة كما كانت في {time}.",
      blockedNote:
        "هذه الغرفة خارج الاستخدام ({reason})، لذا سيُرفض تسجيل الوصول حتى تُحرَّر.",
      overdueNote:
        "ما زال في الغرفة: مرّ {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}} على موعد {date}. سجّل مغادرته أو غيّر موعد المغادرة.",
      arrives: "الوصول",
      arrived: "وصل",
      inRoomSince: "في هذه الغرفة منذ",
      leaves: "المغادرة",
      wasDue: "كان موعد مغادرته",
      daysLate:
        "{days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}",
      left: "غادر",
      booked: "الحجز",
      nightsLabel: "الليالي",
      nightsSoFar: "الليالي حتى الليلة",
      nights:
        "{count, plural, zero {لا ليالٍ} one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلةً} other {# ليلة}}",
      stayType: "نوع الحجز",
      reservationCode: "الحجز",
      roomStatus: "حالة الغرفة",
      roomReadiness: {
        ready: "جاهزة",
        awaiting_inspection: "نظيفة، تنتظر الفحص",
        dirty: "متسخة",
        occupied: "فيها نزيل",
      },
      guest: "ضيف",
      resident: "مقيم",
      balance: "الرصيد",
      balanceAsOfCharge: "الرصيد حتى آخر رسم",
      laterNightsPost:
        "تُرحَّل الليالي اللاحقة عند إغلاق اليوم أو عند المغادرة.",
      folioClosed: "الفوليو مغلق",
      open: {
        arrivals: "فتح في الوصول",
        departures: "فتح في المغادرة",
        reservations: "فتح في الحجوزات",
      },
      barWord: {
        overlap: "تداخل",
        bookedWhileBlocked: "مغلق",
        clashes: "تعارض",
      },
      typeFilter: "نوع الوحدة",
      allTypes: "كل الأنواع",
      stateFilter: "حالة الوحدة",
      allStates: "كل الحالات",
      unitState: {
        available: "متاحة",
        occupied: "مشغولة",
        blocked: "مغلقة",
        out_of_service: "خارج الخدمة",
      },
      moveHint: "اسحب حجزًا إلى غرفة أو يوم آخر لنقله؛ لا يُحفظ شيء حتى تؤكّد.",
      dragHint: "اسحبه لنقله، أو استخدم «نقل…» في تفاصيله.",
      resizeHint: "اسحب لتغيير موعد المغادرة",
      dropBlocked: "لا يمكن نقله إلى هنا",
      moveAction: "نقل…",
      moveBooking: "نقل الحجز",
      moveBookingSummary:
        "تحقّق من وجهته قبل حفظ أي شيء. يبقى سعره كما هو ما لم تكن الوحدة من نوع آخر.",
      confirmMove: "نقل الحجز",
      moveFrom: "من",
      moveTo: "إلى",
      cannotMoveTitle: "لا يمكن نقل هذا",
      moveConflict: {
        past: "يجب أن يكون الوصول اليوم أو بعده.",
        notSellable: "{unit} تُؤجَّر بالسرير: اختر أحد أسرّتها.",
        blocked: "{unit} مغلقة في بعض هذه الليالي.",
        outOfService: "{unit} خارج الخدمة في بعض هذه الليالي.",
        booked: "{guest} لديه حجز في بعض هذه الليالي.",
        occupied: "{guest} يقيم في تلك الوحدة في بعض هذه الليالي.",
        leavesToday: "المغادرة اليوم هي تسجيل مغادرة. اختر الغد أو ما بعده.",
        ended: "لا يمكن نقل إقامة انتهت.",
        noBooking: "لا يمكن نقل إقامة بلا حجز من هنا.",
      },
    },

    dashboard: {
      greetingMorning: "صباح الخير،",
      greetingAfternoon: "طاب يومك،",
      greetingEvening: "مساء الخير،",
      updated: "حُدِّث {time}",
      stale: "تعذّر التحديث · بيانات {time}",
      workingDayStill:
        "التاريخ على الساعة {date}؛ ينتقل المرفق إلى اليوم الجديد في {time}.",
      newBooking: "حجز جديد",
      attentionTitle: "يحتاج إلى انتباه",
      nothingNeedsAttention: "لا شيء يحتاج إلى انتباه.",
      attentionIncomplete:
        "تعذّرت قراءة بعض الأقسام؛ قد تكون هذه القائمة ناقصة.",
      attentionMore:
        "{count, plural, zero {# أخرى} one {واحدة أخرى} two {اثنتان أخريان} few {# أخرى} many {# أخرى} other {# أخرى}}",
      notReady: "الغرفة غير جاهزة",
      notReadyDetail: "وصول اليوم؛ الغرفة ليست جاهزة بعد.",
      notReadyDirty: "وصول اليوم؛ لم تُنظَّف الغرفة بعد.",
      notReadyAwaitingInspection: "وصول اليوم؛ الغرفة نظيفة وتنتظر الفحص.",
      notReadyOccupied: "وصول اليوم؛ ما زال أحدهم في الغرفة.",
      notReadyOutOfService: "وصول اليوم؛ الغرفة محجوبة أو خارج الخدمة.",
      blocked: "لا يمكن تسجيل الدخول",
      blockerNotConfirmed: "الحجز غير مؤكد بعد.",
      blockerUnitBlocked: "الوحدة محجوبة.",
      blockerUnitOutOfService: "الوحدة خارج الخدمة.",
      blockerUnitOccupied: "ما زال أحدهم في الوحدة.",
      overdue: "مغادرة متأخرة",
      overdueDetail:
        "متأخر {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}} · كان موعد مغادرته {date}.",
      overdueLabel:
        "متأخر · {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}",
      leavesOwing: "يغادر برصيد",
      leavesOwingDetail: "يغادر اليوم · الرصيد {balance}",
      outOfService: "خارج الخدمة",
      outOfServiceDetail: "غير معروضة للبيع.",
      openArrivals: "افتح الوصول",
      openDepartures: "افتح المغادرة",
      openFolio: "افتح الفاتورة",
      openBoard: "افتح اللوحة",
      openRooms: "افتح الغرف",
      urgentRepair: "إصلاح عاجل",
      dueBack: "تأخّرت العودة",
      dueBackDetail: "كان موعد العودة {date}.",
      requestReference: "MT-{number}",
      openMaintenance: "افتح الصيانة",
      maintenanceTitle: "الصيانة",
      openRequests: "الطلبات المفتوحة",
      statusNew: "جديد",
      statusInProgress: "قيد التنفيذ",
      statusWaitingForParts: "بانتظار قطع الغيار",
      roomsOutOfOrder: "قيد الصيانة",
      arrivals: "الوصول",
      checkedIn: "تم تسجيل الدخول",
      departures: "المغادرة",
      checkedOut: "تم تسجيل الخروج",
      leaveOverdue:
        "{count, plural, one {مغادرة واحدة متأخرة منذ {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}} two {مغادرتان متأخرتان، الأطول منذ {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}} few {# مغادرات متأخرة، الأطول منذ {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}} many {# مغادرة متأخرة، الأطول منذ {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}} other {# مغادرة متأخرة، الأطول منذ {days, plural, zero {# يوم} one {يوم واحد} two {يومين} few {# أيام} many {# يومًا} other {# يوم}}}}",
      occupancy: "الإشغال",
      inHouseOf: "المقيمون · {count} من {of}",
      expectedTonight: "المتوقع الليلة {count} من {of} غرفة متاحة ({value})",
      ofSeparator: "من",
      noUnits: "لا وحدات للتأجير",
      roomsReadyForArrivals: "غرف جاهزة للقادمين",
      roomsNotReadyYet:
        "{count, plural, zero {كل الغرف جاهزة} one {غرفة واحدة غير جاهزة} two {غرفتان غير جاهزتين} few {# غرف غير جاهزة} many {# غرفة غير جاهزة} other {# غرفة غير جاهزة}}",
      toClean: "للتنظيف",
      awaitingInspection: "بانتظار الفحص",
      readyRooms: "غرف جاهزة",
      arrivalsWaiting: "قادمون بانتظار غرفة",
      arrivalRooms: "غرف الوصول",
      owedOnDepartures: "رصيد مغادري اليوم",
      guests:
        "{count, plural, zero {لا ضيوف} one {ضيف واحد} two {ضيفان} few {# ضيوف} many {# ضيفًا} other {# ضيف}}",
      openFolios: "فواتير مفتوحة",
      openBalance: "الرصيد في الفواتير المفتوحة",
      overdueOwing: "متأخرون برصيد",
      movements: "حركة اليوم",
      tabArrivals: "الوصول · {count}",
      tabDepartures: "المغادرة · {count}",
      stateReady: "جاهزة",
      stateNotReady: "غير جاهزة",
      stateBlocked: "لا يمكن تسجيل الدخول",
      nights:
        "{count, plural, zero {لا ليالٍ} one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلة} other {# ليلة}}",
      openEnded: "مفتوحة المدة",
      leavesToday: "اليوم",
      allArrivals:
        "{count, plural, one {افتح الوصول} other {كل حالات الوصول (#)}}",
      allDepartures:
        "{count, plural, one {افتح المغادرة} other {كل حالات المغادرة (#)}}",
      noArrivalsTitle: "لا أحد يصل اليوم",
      noArrivalsDescription: "الحجوزات القادمة والجديدة في شاشة الحجوزات.",
      noDeparturesTitle: "لا أحد يغادر اليوم",
      noDeparturesDescription: "جميع المقيمين في شاشة المغادرة.",
      openReservations: "افتح الحجوزات",
      cleanFirst: "نظّف هذه أولًا",
      roomCount:
        "{count, plural, zero {لا غرف} one {غرفة واحدة} two {غرفتان} few {# غرف} many {# غرفة} other {# غرفة}}",
      priorityArrival: "وصول اليوم",
      priorityInspect: "وصول · فحص",
      priorityLeaving: "تُخلى اليوم",
      priorityQueue: "في الدور",
      floor: "الطابق {floor}",
      noFloor: "بلا طابق",
      nothingToClean: "لا غرفة تحتاج إلى تنظيف.",
      rooms: "الغرف",
      ready: "جاهزة",
      awaiting: "نظيفة، بانتظار الفحص",
      dirty: "متسخة",
      roomsByFloor: "الغرف الجاهزة حسب الطابق",
      floorReady: "{count} من {of}",
      owing: "يغادرون برصيد",
      largestBalances: "أعلى الأرصدة المفتوحة",
      allFolios: "كل الفواتير",
      noBalances: "لا توجد أرصدة مفتوحة.",
      noOwingTitle: "لا أحد يغادر برصيد",
      noOwingDescription: "كل من يغادر اليوم أو قبله رصيده مغلق.",
      sectionUnavailable: "تعذّرت قراءة هذا القسم",
      sectionUnavailableDescription:
        "باقي الأقسام محدّثة. أعد المحاولة أو افتح الشاشة.",
      retry: "أعد المحاولة",
      nothingForRole: "لا يوجد هنا شيء لدورك في هذا المرفق بعد.",
      filterArrivalsToCome:
        "{count, plural, zero {لا قادمين بعد} one {قادم واحد بعد} two {قادمان بعد} few {# قادمين بعد} many {# قادمًا بعد} other {# قادم بعد}}",
      filterOwing:
        "{count, plural, zero {لا ضيوف يغادرون برصيد} one {ضيف واحد يغادر برصيد} two {ضيفان يغادران برصيد} few {# ضيوف يغادرون برصيد} many {# ضيفًا يغادرون برصيد} other {# ضيف يغادرون برصيد}}",
      filterOverdueOwing:
        "{count, plural, zero {لا مغادرات متأخرة برصيد} one {مغادرة متأخرة واحدة برصيد} two {مغادرتان متأخرتان برصيد} few {# مغادرات متأخرة برصيد} many {# مغادرة متأخرة برصيد} other {# مغادرة متأخرة برصيد}}",
      filterInService:
        "{count, plural, zero {لا غرف في الخدمة} one {غرفة واحدة في الخدمة} two {غرفتان في الخدمة} few {# غرف في الخدمة} many {# غرفة في الخدمة} other {# غرفة في الخدمة}}",
      filterReady:
        "{count, plural, zero {لا غرف جاهزة} one {غرفة واحدة جاهزة} two {غرفتان جاهزتان} few {# غرف جاهزة} many {# غرفة جاهزة} other {# غرفة جاهزة}}",
      filterAwaitingInspection:
        "{count, plural, zero {لا غرف نظيفة بانتظار الفحص} one {غرفة واحدة نظيفة بانتظار الفحص} two {غرفتان نظيفتان بانتظار الفحص} few {# غرف نظيفة بانتظار الفحص} many {# غرفة نظيفة بانتظار الفحص} other {# غرفة نظيفة بانتظار الفحص}}",
      filterDirty:
        "{count, plural, zero {لا غرف متسخة} one {غرفة واحدة متسخة} two {غرفتان متسختان} few {# غرف متسخة} many {# غرفة متسخة} other {# غرفة متسخة}}",
      filterOutOfService:
        "{count, plural, zero {لا غرف خارج الخدمة} one {غرفة واحدة خارج الخدمة} two {غرفتان خارج الخدمة} few {# غرف خارج الخدمة} many {# غرفة خارج الخدمة} other {# غرفة خارج الخدمة}}",
      filterForArrival:
        "{count, plural, zero {لا غرف ينتظرها قادمون} one {غرفة واحدة ينتظرها قادم} two {غرفتان ينتظرهما قادمون} few {# غرف ينتظرها قادمون} many {# غرفة ينتظرها قادمون} other {# غرفة ينتظرها قادمون}}",
      filterCleanFirst:
        "{count, plural, zero {لا غرف للتنظيف أولًا} one {غرفة واحدة للتنظيف أولًا} two {غرفتان للتنظيف أولًا} few {# غرف للتنظيف أولًا} many {# غرفة للتنظيف أولًا} other {# غرفة للتنظيف أولًا}}",
      filterFloor:
        "{count, plural, zero {لا غرف في الطابق {floor}} one {غرفة واحدة في الطابق {floor}} two {غرفتان في الطابق {floor}} few {# غرف في الطابق {floor}} many {# غرفة في الطابق {floor}} other {# غرفة في الطابق {floor}}}",
      filterNoFloor:
        "{count, plural, zero {لا غرف بلا طابق} one {غرفة واحدة بلا طابق} two {غرفتان بلا طابق} few {# غرف بلا طابق} many {# غرفة بلا طابق} other {# غرفة بلا طابق}}",
      filterOpenFolios:
        "{count, plural, zero {لا فواتير مفتوحة} one {فاتورة مفتوحة واحدة} two {فاتورتان مفتوحتان} few {# فواتير مفتوحة} many {# فاتورة مفتوحة} other {# فاتورة مفتوحة}}",
      filterShowAll: "اعرض الكل",
      filterReadyCount:
        "{count, plural, zero {لا جاهزة} one {واحدة جاهزة} two {اثنتان جاهزتان} few {# جاهزة} many {# جاهزة} other {# جاهزة}}",
      roomOccupiedNoMark: "ما زال فيها ضيف؛ تُنظَّف بعد مغادرته.",
      activityTitle: "آخر النشاط",
      activityEmpty: "لا شيء مسجَّل منذ أمس.",
      openAuditLog: "افتح سجل التدقيق",
      chargesTitle: "رسوم اليوم",
      chargesNote: "الرسوم المسجّلة اليوم بعد خصم عكوسها",
      openFinance: "افتح المالية",
      bookedTitle: "المحجوز قادمًا",
      bookedNote: "حجوزات وإقامات، لا توقّعات",
      bookedColNight: "الليلة",
      bookedColUnits: "وحدات محجوزة",
      bookedColShare: "الإشغال",
      bookedOf: "{count} من {of}",
      openCalendar: "افتح تقويم الغرف",
      stripTitle: "منشآتك",
      stripAttention:
        "{count, plural, zero {لا شيء يحتاج إلى انتباه} one {شيء واحد يحتاج إلى انتباه} two {شيئان يحتاجان إلى انتباه} few {# أشياء تحتاج إلى انتباه} many {# شيئًا يحتاج إلى انتباه} other {# شيء يحتاج إلى انتباه}}",
      stripUnread: "تعذّرت قراءتها",
      stripPartial: "تعذّرت قراءة بعض الأقسام",
      allRoomsToClean:
        "{count, plural, one {افتح الغرفة المطلوب تنظيفها} other {كل الغرف المطلوب تنظيفها (#)}}",
      allOpenFolios:
        "{count, plural, one {افتح الفاتورة المفتوحة} other {كل الفواتير المفتوحة (#)}}",
      allOwing:
        "{count, plural, one {افتح الضيف المغادر برصيد} other {كل المغادرين برصيد (#)}}",
    },
    rates: {
      title: "أسعار الليلة",
      hint: "سعر الليلة حسب نوع الوحدة التي تُقضى فيها. يحتفظ الحجز بالسعر الذي أُخذ به.",
      perNight: "لليلة",
      units:
        "{count, plural, =0 {لا يوجد بعد في هذه المنشأة} one {وحدة واحدة} two {وحدتان} few {# وحدات} many {# وحدة} other {# وحدة}}",
      noPrice: "بلا سعر",
      unpricedHint: "تُؤخذ حجوزات هذا النوع بلا سعر، ولا تُحتسب لياليها.",
      stale:
        "حُدِّد بعملة {currency}. تتعامل هذه المنشأة الآن بعملة {property}، لذا لا يُطبَّق هذا السعر على أي حجز حتى يُحفظ من جديد.",
      invalid: "هذا ليس سعرًا صالحًا بعملة {currency}.",
      readOnly:
        "يغيّر الأسعارَ من يملك صلاحية تحديدها. يمكنك الاطلاع عليها هنا.",
      priceFor: "سعر الليلة لـ{type}",
    },
    configuration: {
      subtitle: "إعدادات {property} ومؤسستها",
      sections: "في هذه الصفحة",
      organizationTitle: "المؤسسة",
      organizationHint: "الاسم الذي يراه فريقك. ينطبق على جميع منشآت مؤسستك.",
      organizationName: "اسم المؤسسة",
      organizationNeedsReach:
        "لا يستطيع إعادة تسمية المؤسسة إلا من يصل إلى جميع المنشآت.",
      propertyTitle: "المنشأة",
      propertyHint: "اسم هذه المنشأة والعملة التي تتعامل بها.",
      propertyName: "اسم المنشأة",
      currency: "العملة",
      currencyFixed:
        "ثابتة منذ فتح فوليو أو أخذ حجز مسعَّر هنا. يحتفظ كل فوليو وكل حجز بالعملة التي أُنشئ بها.",
      searchCurrency: "ابحث عن عملة",
      noCurrency: "لا توجد عملة مطابقة.",
      timeTitle: "الوقت ويوم العمل",
      timeHint:
        "الساعة التي تعمل بها هذه المنشأة، ومتى ينتهي يوم عملها. المناوبة الليلية قبل وقت الانتهاء لا تزال تعمل في اليوم السابق.",
      timezone: "المنطقة الزمنية",
      searchTimezone: "ابحث عن منطقة زمنية",
      noTimezone: "لا توجد منطقة زمنية مطابقة.",
      cutoff: "ينتهي يوم العمل عند",
      businessDateNow: "تاريخ العمل الآن",
      businessDateAfter: "بعد الحفظ",
      businessDateForward: "يتقدم اليوم إلى {date}.",
      businessDateBack:
        "يعود اليوم إلى {date}. راجع الوصول والمغادرة بعد الحفظ.",
      housekeepingTitle: "التدبير الفندقي",
      modulesTitle: "المفعّل هنا",
      modulesHint: "ما يستطيع فريقك استخدامه في هذه المنشأة.",
      elsewhereTitle: "تُدار في شاشاتها الخاصة",
      elsewhereHint: "لكل من هذه الإعدادات مكان واحد.",
      roomsHint: "أضف الغرف والأسرّة، وأوقف وحدة مع ذكر السبب.",
      peopleHint: "ادعُ الموظفين، واختر أدوارهم والمنشآت التي يصلون إليها.",
      save: "حفظ التغييرات",
      discard: "تجاهل",
      saving: "جارٍ الحفظ…",
      saved: "تم الحفظ",
      unchanged: "لا شيء للحفظ — هذه هي الإعدادات الحالية.",
      refused: "تعذّر تغيير هذه الإعدادات. ما تراه الآن هو المعمول به.",
      stale:
        "حفظ أحدهم هذه الإعدادات للتو. أنت ترى الآن ما حفظه؛ أعد تغييرك إن كان لا يزال مطلوبًا.",
      currencyFixedRefused:
        "فُتح فوليو أو أُخذ حجز مسعَّر هنا أثناء تعديلك، لذا أصبحت العملة ثابتة الآن.",
      closedDay:
        "سيجعل هذا التغيير اليوم يوم عمل أُغلق بالفعل. اختر وقت انتهاء آخر أو منطقة زمنية أخرى.",
      invalid: "تحقّق من القيم وحاول مرة أخرى.",
      invalidName: "يتكوّن الاسم من 2 إلى 120 حرفًا.",
      invalidTimezone: "اختر منطقة زمنية من القائمة.",
      invalidCurrency: "اختر عملة من القائمة.",
      invalidCutoff: "اختر وقتًا بين 03:00 و11:45.",
      readOnly: "يمكنك رؤية هذه الإعدادات. يستطيع المالك أو المدير تغييرها.",
      fields: {
        name: "الاسم",
        timezone: "المنطقة الزمنية",
        currency: "العملة",
        businessDateCutoff: "نهاية يوم العمل",
      },
    },
    integrations: {
      subtitle: "إلى أين ترسل {organization} أحداثها، وما الذي لم يصل.",
      endpointsCount: "نقاط الاستقبال",
      deliveringCount: "نقاط تُسلِّم",
      failingCount: "نقاط تفشل",
      openFailuresCount: "عمليات إرسال لم تصل",
      endpointsTitle: "نقاط استقبال الويب هوك",
      endpointsDescription:
        "ترسل Ranza الأحداث التي تختارها إلى هذه العناوين موقَّعةً فور وقوعها.",
      noEndpointsTitle: "لا توجد نقطة استقبال بعد",
      noEndpointsDescription:
        "أضف عنوان HTTPS واختر الأحداث التي تُرسل إليه. كل عملية إرسال موقَّعة، وما حدث لكل منها يظهر هنا.",
      noEndpointsReadOnly: "لا توجد نقطة استقبال مسجَّلة لهذه المؤسسة.",
      readOnly:
        "يمكنك رؤية هذه النقاط. إضافتها واختبارها وإزالتها تتطلب صلاحية integrations.manage مع الوصول إلى المؤسسة كلها.",
      addEndpoint: "إضافة نقطة استقبال",
      addTitle: "إضافة نقطة استقبال ويب هوك",
      addDescription:
        "سترسل Ranza كل حدث تختاره إلى هذا العنوان بصيغة JSON موقَّعة.",
      nameLabel: "الاسم",
      namePlaceholder: "مدير القنوات",
      urlLabel: "عنوان HTTPS",
      urlPlaceholder: "https://example.com/ranza/webhooks",
      urlHint:
        "يجب أن يبدأ بـ https://‎. تُرفض العناوين الواقعة على شبكات خاصة أو على هذا الجهاز.",
      eventsLabel: "الأحداث المراد إرسالها",
      events: {
        reservation_created: "يُؤخذ حجز",
        reservation_cancelled: "يُلغى حجز",
        reservation_no_show: "لا يصل الضيف",
        stay_checked_in: "يسجّل الضيف دخوله",
        stay_checked_out: "يسجّل الضيف مغادرته",
        folio_line_posted: "يُسجَّل رسم أو دفعة على الفاتورة",
      },
      register: "إضافة نقطة استقبال",
      registering: "جارٍ الإضافة...",
      secretTitle: "مفتاح التوقيع",
      secretWarning:
        "انسخ هذا المفتاح الآن. يظهر مرة واحدة فقط ولا يمكن قراءته مجددًا. إن فقدته فأزل نقطة الاستقبال وأضفها من جديد.",
      secretUse:
        "تحمل كل عملية إرسال الترويستين X-Ranza-Timestamp وX-Ranza-Signature. التوقيع هو sha256= يليه HMAC-SHA256 للطابع الزمني ثم نقطة ثم نص الطلب الخام، بهذا المفتاح.",
      secretCopy: "نسخ المفتاح",
      secretCopied: "تم النسخ",
      secretDone: "حفظته",
      invalid: {
        name: {
          empty: "أعطِ نقطة الاستقبال اسمًا.",
          too_long: "يجب ألا يتجاوز الاسم 80 حرفًا.",
        },
        url: {
          invalid: "هذا ليس عنوانًا.",
          too_long: "يجب ألا يتجاوز العنوان 2048 حرفًا.",
          not_https: "يجب أن يبدأ العنوان بـ https://‎.",
          has_credentials: "يجب ألا يحمل العنوان اسم مستخدم أو كلمة مرور.",
          blocked_host:
            "هذا العنوان على شبكة خاصة أو على هذا الجهاز، ولن ترسل Ranza إليه.",
        },
        events: {
          none: "اختر حدثًا واحدًا على الأقل.",
          unknown: "أحد هذه الأحداث لا يمكن إرساله.",
        },
      },
      refused: {
        not_permitted:
          "لا يمكنك فعل ذلك هنا. يتطلب صلاحية integrations.manage مع الوصول إلى المؤسسة كلها.",
        duplicate_url: "توجد نقطة استقبال بهذا العنوان بالفعل.",
        too_many_endpoints: "يمكن للمؤسسة أن تملك عشر نقاط استقبال.",
        test_in_flight: "هناك حدث اختبار في طريقه بالفعل إلى هذه النقطة.",
        unavailable: "هذا مغلق بالفعل، أو أُزيلت نقطة استقباله.",
        reason_required: "اذكر السبب بثلاثة أحرف على الأقل.",
      },
      failed: "لم تنجح العملية وتم الإبلاغ عنها. حاول مرة أخرى.",
      health: {
        delivering: "تُسلِّم",
        failing: "تفشل",
        unused: "لا تسليم بعد",
      },
      lastDelivered: "آخر تسليم",
      neverDelivered: "لم يصل شيء بعد",
      queued: "في الانتظار",
      openFailures: "إخفاقات مفتوحة",
      sends: "ترسل",
      sendTest: "إرسال حدث اختبار",
      testEvent: "حدث اختبار",
      sendingTest: "جارٍ الوضع في الانتظار...",
      testQueued:
        "وُضع حدث الاختبار في الانتظار. يُرسل خلال ثوانٍ وتظهر النتيجة هنا.",
      remove: "إزالة",
      removing: "جارٍ الإزالة...",
      removeTitle: "إزالة نقطة الاستقبال هذه؟",
      removeDescription:
        "تتوقف {name} عن استقبال الأحداث وتُلغى عمليات الإرسال التي ما زالت في الطريق. يبقى سجلها.",
      removeConfirm: "إزالة نقطة الاستقبال",
      dismiss: "ليس الآن",
      failedOperationsTitle: "عمليات إرسال لم تصل",
      failedOperationsDescription:
        "تُعاد محاولة الإرسال الفاشل بعد دقيقة، ثم 5 دقائق، ثم 30 دقيقة، ثم ساعتين، ثم 12 ساعة، ثم تتوقف. تعيد «إعادة المحاولة» إرساله الآن.",
      noFailedOperations: "لم يفشل شيء في هذه المنشأة.",
      columns: {
        endpoint: "نقطة الاستقبال",
        whatHappened: "ما الذي حدث",
        attempts: "المحاولات",
        nextAttempt: "المحاولة التالية",
        actions: "الإجراءات",
        closed: "أُغلق",
        reason: "السبب",
      },
      lastAttemptAt: "الأخيرة: {when}",
      operationStatuses: {
        failed: "توقفت",
        retrying: "تُعاد المحاولة",
        resolved: "تم الحل",
        cancelled: "أُلغيت",
      },
      dueNow: "الآن",
      noMoreAttempts: "لا محاولات أخرى",
      failures: {
        http_error: "ردّ المستقبِل بخطأ",
        timeout: "لم يردّ المستقبِل خلال 10 ثوانٍ",
        connection_failed: "تعذّر الاتصال بالمستقبِل",
        tls_failed: "لم تُقبل شهادة المستقبِل",
        blocked_address: "العنوان يؤدي إلى شبكة خاصة أو إلى هذا الجهاز",
        invalid_target: "لا يمكن الإرسال إلى هذا العنوان",
        redirect_refused: "أعاد المستقبِل التوجيه، ولا تُتَّبع إعادة التوجيه",
        source_mismatch: "لم يطابق الحدث السجل الذي ذكره، فلم يُرسل",
      },
      httpStatus: "HTTP {code}",
      receiverSaid: "ردّه: {excerpt}",
      retry: "إعادة المحاولة",
      retrying: "جارٍ إعادة المحاولة...",
      cancelOperation: "إيقاف المحاولات",
      resolveOperation: "تعليم كمحلول",
      reasonLabel: "السبب",
      reasonPlaceholder: "ما الذي حدث، في كلمات قليلة",
      reasonHint: "3 أحرف على الأقل. يُسجَّل باسمك.",
      reasonInvalid: {
        reason_too_short: "اذكر السبب في 3 أحرف على الأقل.",
        reason_too_long: "يجب ألا يتجاوز السبب 500 حرف.",
      },
      cancelTitle: "إيقاف إعادة محاولة هذا الإرسال؟",
      cancelDescription:
        "لن تُجرى محاولات أخرى. لن يُرسل الحدث إلى نقطة الاستقبال هذه.",
      cancelConfirm: "إيقاف المحاولات",
      resolveTitle: "تعليم هذا الإخفاق كمحلول؟",
      resolveDescription:
        "يبقى الإرسال فاشلًا. أنت تسجّل أنه عولج بطريقة أخرى.",
      resolveConfirm: "تعليم كمحلول",
      failureAdvice: {
        http_error: "راجع سجلات المستقبِل لمعرفة سبب الرفض، ثم أعد المحاولة.",
        timeout:
          "المستقبِل بطيء أو متوقف. تُعاد المحاولة تلقائيًا، و«إعادة المحاولة» تجرّب الآن.",
        connection_failed: "تأكد أن المستقبِل متاح من الإنترنت.",
        tls_failed: "أصلح شهادة HTTPS للمستقبِل أو جدّدها.",
        blocked_address: "أزل نقطة الاستقبال هذه وأضف أخرى بعنوان عام.",
        invalid_target:
          "أزل نقطة الاستقبال هذه وأضف أخرى بعنوان https:// صالح.",
        redirect_refused: "سجّل العنوان الذي يعيد التوجيه إليه.",
        source_mismatch: "لا شيء لإعادته. علّمه محلولًا بعد أن تراجعه.",
      },
      othersNotAvailable:
        "الويب هوك هو التكامل الوحيد المتاح اليوم. مديرو القنوات والإبلاغ عبر KBS والفوترة الإلكترونية ومزوّدو الدفع غير متاحين بعد.",
      noPermissionTitle: "ليست لديك صلاحية الوصول إلى التكاملات",
      noPermissionDescription:
        "تتطلب التكاملات صلاحية التكاملات. اطلبها ممن يدير صلاحيات الموظفين في مؤسستك.",
      addressPartHidden: "جزء من هذا العنوان مخفي عنك.",
      overdue:
        "{count, plural, one {عملية إرسال واحدة تنتظر أكثر من 5 دقائق. إن استمر ذلك فقد يكون الإرسال توقف.} two {عمليتا إرسال تنتظران أكثر من 5 دقائق. إن استمر ذلك فقد يكون الإرسال توقف.} few {# عمليات إرسال تنتظر أكثر من 5 دقائق. إن استمر ذلك فقد يكون الإرسال توقف.} many {# عملية إرسال تنتظر أكثر من 5 دقائق. إن استمر ذلك فقد يكون الإرسال توقف.} other {# عملية إرسال تنتظر أكثر من 5 دقائق. إن استمر ذلك فقد يكون الإرسال توقف.}}",
      technicalDetails: "تفاصيل تقنية",
      closedFailuresTitle: "إخفاقات مغلقة",
      closedFailuresDescription:
        "إخفاقات وصلت في النهاية أو أوقفها شخص أو عُلِّمت كمحلولة. الأحدث أولًا.",
      noClosedFailures: "لم يُغلق أي إخفاق في هذه المنشأة بعد.",
      tabOpen: "مفتوحة ({count})",
      tabClosed: "مغلقة",
      failuresViewLabel: "أي الإخفاقات",
      pagesLabel: "الصفحات",
      showing: "{from}–{to} من {total}",
      newer: "الأحدث",
      older: "الأقدم",
      closedByRanza: "تلقائيًا",
      closedByYou: "أنت",
      closedByColleague: "زميل",
      closedReasonDelivered: "وصل الإرسال.",
      closedReasonEndpointRemoved: "أُزيلت نقطة الاستقبال.",
      retryAll: "إعادة محاولة كل ما توقف",
      retryAllTitle: "إعادة إرسال كل ما توقف؟",
      retryAllDescription:
        "تُعاد الآن محاولة كل عملية إرسال متوقفة في هذه المنشأة. ما يفشل مجددًا يتبع الجدول المعتاد. والأحداث التي لم تُرسل لأنها لم تطابق سجلها تُترك كما هي. تُسجَّل كل إعادة باسمك.",
      retryAllConfirm: "إعادة محاولة الكل",
      retriedAll:
        "{count, plural, zero {لم تُرسل أي عملية متوقفة.} one {أُعيد إرسال عملية متوقفة واحدة.} two {أُعيد إرسال عمليتين متوقفتين.} few {أُعيد إرسال # عمليات متوقفة.} many {أُعيد إرسال # عملية متوقفة.} other {أُعيد إرسال # عملية متوقفة.}}",
    },
    branding: {
      subtitle: "كيف تظهر {organization} لضيوفها",
      colorTitle: "لون العلامة",
      colorHint:
        "تُرسم بهذا اللون الأزرار الرئيسية والروابط والعنصر النشط في القائمة ولمسة الشريط العلوي في بوابة الضيوف. ألوان النجاح والتحذير والخطأ لا تتغيّر.",
      colorLabel: "اللون (⁦#rrggbb⁩)",
      colorPicker: "اختر اللون",
      colorEmpty: "لم يُحدَّد لون: يُستخدم سمة Ranza الخاصة.",
      defaultTheme: "السمة الافتراضية",
      colorInvalid: "اكتب اللون بالشكل #0f5132، مع # وستة أرقام.",
      colorReadable:
        "النص على الأسطح الملوّنة {foreground}، بتباين \u2066{ratio} : 1\u2069.",
      colorTextSame:
        "تُرسم الروابط والنصوص باللون نفسه، ويُقرأ على الأبيض بتباين \u2066{ratio} : 1\u2069.",
      colorTextDarker:
        "تُرسم الروابط والنصوص بظلّ أغمق من اللون نفسه ليبقى مقروءًا على الأبيض: \u2066{shade}\u2069 (\u2066{ratio} : 1\u2069).",
      swatchFill: "الأزرار والتعبئة",
      swatchText: "الروابط والنص",
      foreground: { white: "أبيض", black: "أسود" },
      logoTitle: "الشعار",
      logoHint:
        "PNG أو JPEG أو WebP، بحجم أقصاه 512 كيلوبايت وارتفاع لا يقل عن 128 بكسل. لا يُقبل SVG لأنه قد يحمل شيفرة.",
      logoLabel: "ملف الشعار",
      logoCurrent: "الشعار الحالي",
      logoNone: "لا شعار: تظهر علامة Ranza.",
      logoRemove: "إزالة الشعار",
      logoKeep: "الإبقاء على الشعار",
      logoWillBeRemoved: "سيُزال الشعار عند الحفظ.",
      logoErrors: {
        empty: "الملف فارغ.",
        too_large: "الملف أكبر من 512 كيلوبايت.",
        svg: "لا يُقبل SVG لأنه قد يحمل شيفرة. استخدم PNG أو JPEG أو WebP.",
        unsupported_type:
          "هذه ليست صورة PNG أو JPEG أو WebP. يُفحص المحتوى لا اسم الملف.",
        corrupt: "تعذّرت قراءة الصورة. قد يكون الملف تالفًا.",
        too_small: "يجب ألا يقل ارتفاع الصورة عن 128 بكسل.",
        dimensions_too_large:
          "لا يجوز أن يتجاوز عرض الصورة أو ارتفاعها 4096 بكسل.",
      },
      previewTitle: "معاينة",
      previewHint: "هكذا يظهر الشريط العلوي وعناصر التحكم في بوابة الضيوف.",
      previewHeader: "الشريط العلوي للبوابة",
      previewButton: "زر رئيسي",
      previewLink: "رابط",
      previewActive: "عنصر نشط",
      save: "حفظ",
      discard: "تجاهل",
      saving: "جارٍ الحفظ…",
      saved: "تم الحفظ. يراه الضيوف عند فتحهم الصفحة في المرة القادمة.",
      reset: "إعادة إلى الافتراضي",
      resetDone: "عادت السمة الافتراضية.",
      refused: "تعذّر إجراء هذا التغيير. ربما تغيّرت صلاحياتك؛ حدّث الصفحة.",
      error: "حدث خطأ ما. حاول مرة أخرى.",
      needsReachTitle: "لا يغيّر الهوية البصرية إلا من يصل إلى جميع المنشآت",
      needsReach:
        "الهوية البصرية للمؤسسة كلها. تغييرها يتطلب الصلاحية مع الوصول إلى جميع المنشآت.",
      failedTitle: "تعذّر فتح شاشة الهوية البصرية",
      failedDescription:
        "تعذّرت قراءة الهوية البصرية. حاول مرة أخرى؛ وإن استمر ذلك فأبلغ الدعم.",
      retry: "حاول مرة أخرى",
    },
    dataExport: {
      heading: "تصدير البيانات",
      subtitle:
        "تصدير البيانات عند الطلب ووفق جداول زمنية، وسجلات وتنزيل الملفات.",
      tabs: {
        exports: "سجل التصدير",
        schedules: "الجداول الزمنية",
        newExport: "تصدير جديد",
      },
      newExportTitle: "طلب تصدير بيانات جديد",
      newExportDescription: "حدد مجموعات البيانات والصيغة للتصدير من منشأتك.",
      datasetsTitle: "مجموعات البيانات",
      datasetsDescription: "اختر سجلات الكيانات والعمليات المراد تصديرها.",
      datasets: {
        residents_guests: "الضيوف والمقيمون",
        reservations_stays: "الحجوزات والإقامات",
        rooms_beds: "الغرف والأسرة",
        folios_payments: "الحسابات والمدفوعات",
        audit_log: "سجل التدقيق",
      },
      datasetDescriptions: {
        residents_guests: "الأسماء وعناوين البريد الإلكتروني وأرقام الهاتف",
        reservations_stays: "تواريخ الحجز والحالات وتخصيص الوحدات",
        rooms_beds: "أرقام الوحدات والطوابق والأنواع والسعة",
        folios_payments: "الرسوم المالية والدفعات وتفاصيل الأرصدة",
        audit_log: "إجراءات العمليات والطوابع الزمنية والمستخدمون",
      },
      formatTitle: "صيغة التصدير",
      formatDescription: "جدول بيانات (CSV) أو بيانات منظمة (JSON).",
      requestButton: "بدء التصدير",
      requesting: "جارٍ الطلب...",
      requestSuccess: "تم إنشاء طلب تصدير البيانات بنجاح.",
      requestFailed: "فشل إنشاء طلب تصدير البيانات.",
      scheduleTitle: "إنشاء جدول زمني آلي",
      scheduleDescription: "إعداد تصدير دوري آلي وفق جدول زمني محدد.",
      scheduleName: "اسم الجدول",
      scheduleNamePlaceholder: "مثال: تصدير مالي أسبوعي",
      frequencyTitle: "التكرار",
      frequencies: {
        daily: "يومي",
        weekly: "أسبوعي",
        monthly: "شهري",
      },
      createScheduleButton: "حفظ الجدول",
      creatingSchedule: "جارٍ الحفظ...",
      scheduleSuccess: "تم إنشاء جدول التصدير بنجاح.",
      scheduleFailed: "فشل إنشاء جدول التصدير.",
      recentExportsTitle: "أحدث سجلات التصدير",
      recentExportsDescription:
        "كافة طلبات التصدير وحالاتها وقياساتها وروابط التنزيل.",
      schedulesTitle: "جداول التصدير النشطة",
      schedulesDescription:
        "عمليات التصدير المتكررة التي يعالجها النظام آلياً في الخلفية.",
      noExports: "لا توجد سجلات تصدير لهذه المنشأة.",
      noSchedules: "لا توجد جداول تصدير آلية مجهزة.",
      tableHeaders: {
        requester: "مقدم الطلب",
        datasets: "مجموعات البيانات",
        format: "الصيغة",
        status: "الحالة",
        size: "الحجم",
        records: "عدد السجلات",
        requestedAt: "وقت الطلب",
        actions: "الإجراءات",
      },
      scheduleHeaders: {
        name: "اسم الجدول",
        datasets: "مجموعات البيانات",
        format: "الصيغة",
        frequency: "التكرار",
        status: "الحالة",
        nextRun: "التشغيل القادم",
        actions: "الإجراءات",
      },
      statuses: {
        pending: "قيد الانتظار",
        processing: "جارٍ المعالجة",
        ready: "جاهز",
        failed: "فشل",
        expired: "منتهي الصلاحية",
      },
      scheduleStatuses: {
        active: "نشط",
        paused: "متوقف مؤقتاً",
      },
      download: "تنزيل",
      pause: "إيقاف مؤقت",
      resume: "استئناف",
      pausing: "جارٍ الإيقاف...",
      resuming: "جارٍ الاستئناف...",
      failures: {
        requester_not_permitted:
          "لم يعد لدى مقدّم الطلب صلاحية تصدير هذه البيانات.",
        too_large: "حجم البيانات أكبر من أن يُصدَّر.",
        worker_stopped: "توقّف التصدير قبل أن يكتمل.",
        internal_error: "تعذّر إكمال التصدير.",
      },
      formats: {
        csv: { title: "CSV (جدول بيانات)", hint: "Excel وNumbers وSheets" },
        json: {
          title: "JSON (بيانات منظمة)",
          hint: "واجهات المطورين والنسخ الاحتياطي",
        },
      },
      expiresOn: "متاح حتى {date}",
      requestRefused: "لا يحق لك طلب تصدير هذه البيانات.",
      scheduleRefused: "لا يحق لك إنشاء هذا الجدول.",
      failedTitle: "تعذّر فتح تصدير البيانات",
      failedDescription: "تعذّرت قراءة سجلات التصدير. حاول مرة أخرى.",
      retry: "إعادة المحاولة",
    },
    hr: {
      heading: "الموارد البشرية والرواتب",
      subtitle:
        "عقود الموظفين وجدول الورديات الأسبوعي والإجازات والرواتب الشهرية.",
      tabs: {
        employees: "الموظفون",
        rota: "هذا الأسبوع",
        leave: "الإجازات",
        payroll: "الرواتب",
      },
      employees: {
        title: "دليل الموظفين",
        register: "إضافة موظف",
        registerTitle: "تسجيل موظف جديد",
        registerDescription: "أدخل تفاصيل العقد والمنصب والراتب للموظف.",
        firstName: "الاسم الأول",
        lastName: "اسم العائلة",
        email: "البريد الإلكتروني",
        phone: "الهاتف",
        department: "القسم",
        position: "المنصب",
        contract: "نوع العقد",
        since: "تاريخ البدء",
        grossPay: "الراتب الإجمالي",
        grossPayIn: "الراتب الإجمالي ({currency})",
        iban: "رقم الآيبان (IBAN)",
        ibanHint: "يُعرض مخفيًا جزئيًا بعد الحفظ.",
        status: "الحالة",
        noEmployeesTitle: "لا يوجد موظفون مسجلون",
        noEmployeesDescription:
          "تُحفظ سجلات التوظيف بمعزل عن صلاحية الدخول، لذلك لا يظهر هنا من أُضيفوا من شاشة الفريق حتى تسجّلهم.",
        unregisteredTitle: "أعضاء الفريق بلا سجل توظيف",
        unregisteredDescription:
          "يستطيع هؤلاء تسجيل الدخول، لكنهم لا يظهرون في جدول المناوبات ولا في الرواتب حتى تسجّلهم موظفين.",
        registerAsEmployee: "تسجيل كموظف",
        registerForLogin: "سيُربط بحساب الدخول {email}.",
        submit: "حفظ الموظف",
        submitting: "جارٍ الحفظ...",
        cancel: "إلغاء",
        contracts: {
          full_time: "دوام كامل",
          part_time: "دوام جزئي",
          seasonal: "موسمي",
          fixed_term: "محدد المدة",
        },
        statuses: {
          active: "على رأس العمل",
          terminated: "غادر",
        },
        leftOn: "غادر في {date}",
        terminate: "إنهاء الخدمة",
        terminateTitle: "إنهاء خدمة {name}",
        terminateDescription:
          "يبقى سجله ووردياته وإجازاته وقسائم رواتبه. إنهاء الخدمة لا يسحب صلاحية دخوله إلى النظام: غيّر ذلك من شاشة الفريق.",
        terminateDate: "آخر يوم عمل",
        terminateConfirm: "إنهاء الخدمة",
        terminating: "جارٍ الإنهاء...",
      },
      rota: {
        title: "جدول الورديات الأسبوعي",
        hint: "انقر على الوردية لتغييرها. يحتاج مكتب الاستقبال إلى شخص واحد على الأقل كل صباح ومساء.",
        staffMember: "الموظف",
        today: "اليوم",
        shifts: {
          morning: "صباحية",
          evening: "مسائية",
          day: "نهارية",
          off: "إجازة",
        },
        shiftTimes: {
          morning: "07:00–15:00",
          evening: "15:00–23:00",
          day: "09:00–18:00",
          off: "يوم إجازة",
        },
      },
      leave: {
        title: "طلبات الإجازة",
        requestLeave: "طلب إجازة",
        requestLeaveTitle: "تقديم طلب إجازة",
        staffMember: "الموظف",
        type: "النوع",
        dates: "التواريخ",
        days: "أيام",
        status: "الحالة",
        actions: "الإجراءات",
        approve: "الموافقة",
        decline: "الرفض",
        clashWarning: "يتعارض مع زميل آخر في نفس القسم",
        noLeaves: "لا توجد طلبات إجازة معلقة أو سابقة.",
        startsOn: "تاريخ البدء",
        endsOn: "تاريخ الانتهاء",
        notes: "ملاحظات",
        notesPlaceholder: "ملاحظات اختيارية",
        submit: "إرسال الطلب",
        submitting: "جارٍ الإرسال...",
        cancel: "إلغاء",
        employeeLeft: "غادر العمل",
        types: {
          annual: "إجازة سنوية",
          sick: "إجازة مرضية",
          unpaid: "إجازة غير مدفوعة",
          emergency: "إجازة طارئة",
          maternity: "إجازة أمومة",
        },
        statuses: {
          pending: "معلق",
          approved: "تمت الموافقة",
          rejected: "مرفوض",
        },
      },
      payroll: {
        period: "الفترة",
        summaryGrossNet: "الإجمالي {amount}، الصافي {total}",
        gross: "الإجمالي",
        net: "صافي الراتب",
        socialSecurity: "التأمينات الاجتماعية",
        incomeTax: "ضريبة الدخل",
        stampDuty: "ضريبة الدمغة",
        approve: "اعتماد الرواتب",
        approving: "جارٍ الاعتماد...",
        approved: "معتمد",
        draft: "مسودة",
        previousPeriod: "الفترة السابقة",
        nextPeriod: "الفترة التالية",
        confirmTitle: "اعتماد رواتب {period}؟",
        confirmBody:
          "{count, plural, one {موظف واحد} two {موظفان} few {# موظفين} many {# موظفًا} other {# موظف}} سيُصرف لهم بعملة {currency}: الإجمالي {amount} والصافي {total}.",
        confirmLocked:
          "يقفل الاعتماد الكشف: لا يمكن تعديله بعدها، ولا توجد حتى الآن طريقة لعكسه أو مراجعته.",
        confirm: "اعتماد وقفل",
        cancel: "إلغاء",
        approvedOn: "اعتُمد في {date}. لا يمكن تعديل كشف الرواتب بعد اعتماده.",
        organizationWide:
          "يشمل الاعتماد كل موظف على رأس العمل في المؤسسة، في كل المنشآت.",
        payslip: "قسيمة الراتب",
        payslipTitle: "قسيمة الراتب",
        paidTo: "مدفوع إلى",
        noBankAccount: "لا يوجد حساب مصرفي مسجل",
        downloadPdf: "تحميل PDF",
        actions: "الإجراءات",
        placeholderTitle: "خصومات تجريبية",
        placeholderBody:
          "أرقام التأمينات الاجتماعية وضريبة الدخل وضريبة الدمغة أرقام مؤقتة بانتظار قرار المالك ومحاسب. لم تُعتمد ولا يجوز الدفع للموظفين بناءً عليها.",
        needsReach: {
          title: "الرواتب تُدار للمؤسسة كاملة",
          description:
            "تشمل الرواتب كل المنشآت، لذا تحتاج إلى صلاحية الوصول إليها جميعًا. اطلب ذلك ممن لديه وصول على مستوى المؤسسة.",
        },
        blocked: {
          period_not_ended:
            "لم تنتهِ هذه الفترة بعد، لذا لا يمكن اعتمادها. تُعتمد الرواتب بعد آخر يوم في الشهر.",
          no_employees:
            "لا يوجد موظفون على رأس العمل ليُصرف لهم في هذه الفترة.",
          mixed_currency:
            "يُصرف للموظفين بأكثر من عملة، وكشف الرواتب بعملة واحدة، لذا لا يمكن اعتماد هذه الفترة قبل معالجة ذلك.",
        },
      },
      outcomes: {
        invalid: {
          name: "أدخل الاسم الأول واسم العائلة.",
          department: "أدخل القسم.",
          position: "أدخل المنصب.",
          email: "عنوان البريد الإلكتروني هذا يبدو غير صحيح.",
          grossPay:
            "أدخل الراتب الإجمالي رقمًا، بعدد خانات عشرية لا يزيد على ما تسمح به العملة.",
          currency: "هذه العملة غير معروفة.",
          iban: "رقم الآيبان هذا يبدو غير صحيح.",
          period: "فترة الرواتب هذه غير صالحة.",
          dates: "راجع التواريخ: لا يمكن أن ينتهي قبل أن يبدأ.",
          terminatedOn: "راجع آخر يوم عمل: لا يمكن أن يسبق يوم التحاقه.",
          shiftTime: "وقت الوردية هذا غير صالح.",
          request: "تعذّرت قراءة الطلب. أعد تحميل الصفحة وحاول مرة أخرى.",
        },
        refused: {
          not_permitted:
            "لا يمكنك فعل ذلك هنا، أو تغيّر الوضع منذ تحميل الصفحة.",
          employee_terminated:
            "هذا الموظف غادر، فلا يمكن تسجيل أي شيء جديد له.",
          already_terminated: "هذا الموظف غادر بالفعل.",
          already_registered: "لدى هذا الشخص سجل توظيف في هذه المؤسسة بالفعل.",
          other_property: "هذا الموظف معيَّن في منشأة أخرى.",
          leave_overlap:
            "لدى هذا الموظف إجازة معتمدة بالفعل تغطي بعض هذه الأيام.",
          leave_decided: "تم البت في هذا الطلب بالفعل.",
          payroll_needs_organization_reach:
            "تشمل الرواتب كل المنشآت، فلا يعتمدها إلا من لديه وصول إليها جميعًا.",
          payroll_no_employees:
            "لا يوجد موظفون على رأس العمل ليُصرف لهم في هذه الفترة.",
          payroll_mixed_currency:
            "يُصرف للموظفين بأكثر من عملة، وكشف الرواتب بعملة واحدة.",
          payroll_period_not_ended:
            "لم تنتهِ هذه الفترة بعد، فلا يمكن اعتمادها الآن.",
          payroll_draft_exists:
            "توجد مسودة لهذه الفترة بالفعل وتحتاج إلى مسؤول لإزالتها.",
        },
        error: "حدث خطأ ما وتم الإبلاغ عنه. حاول مرة أخرى بعد قليل.",
      },
    },
    housekeeping: {
      subtitle: "الغرف التي تحتاج إلى تنظيف في {property}",
      unavailableTitle: "التدبير الفندقي غير مفعّل في هذه المنشأة",
      unavailableDescription:
        "يظهر هنا عندما يشمله اشتراك مؤسستك ويتم تفعيله في المنشأة.",
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
      impactChangeBooking: "تعديل الحجز",
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
      equipmentTab: "المعدات",
      planTab: "خطة الصيانة الدورية",
      addEquipment: "إضافة معدات",
      editEquipment: "تعديل المعدات",
      equipmentName: "الاسم",
      equipmentNamePlaceholder: "غسالات",
      category: "الفئة",
      categoryPlaceholder: "الغسيل",
      whereIs: "مكانها",
      atRoom: "في غرفة",
      atPlace: "في مكان آخر",
      place: "المكان",
      placePlaceholder: "غرفة الغسيل",
      interval: "الصيانة كل (أشهر)",
      intervalHint: "اتركه فارغًا إن لم تكن لها صيانة دورية.",
      lastServiced: "آخر صيانة",
      nextService: "الصيانة التالية",
      notScheduled: "غير مجدولة",
      neverServiced: "لم تُصَن بعد",
      retire: "إخراج من الاستخدام",
      restore: "إعادة إلى الاستخدام",
      retired: "خارج الاستخدام",
      showRetired: "إظهار ما هو خارج الاستخدام",
      noEquipmentTitle: "لا معدات في {property}",
      noEquipmentDescription:
        "سجّل ما يحتاج إلى صيانة ويمكن أن يتعطل — الغلايات والمصاعد والآلات — وخطط لصيانته.",
      equipmentReadOnly: "تعديل السجل يتطلب صلاحية إدارة المعدات.",
      noPlanTitle: "لا شيء مجدول",
      noPlanDescription:
        "حدّد فترة صيانة لعنصر في قسم المعدات فيظهر هنا حسب موعد صيانته التالية.",
      daysOverdue:
        "{count, plural, one {متأخرة يومًا واحدًا} two {متأخرة يومين} few {متأخرة # أيام} many {متأخرة # يومًا} other {متأخرة # يوم}}",
      dueToday: "مستحقة اليوم",
      inDays:
        "{count, plural, one {خلال يوم واحد} two {خلال يومين} few {خلال # أيام} many {خلال # يومًا} other {خلال # يوم}}",
      everyMonths:
        "{count, plural, one {كل شهر} two {كل شهرين} few {كل # أشهر} many {كل # شهرًا} other {كل # شهر}}",
      createWorkOrder: "إنشاء أمر عمل",
      workOrderOpen: "أمر العمل MT-{number} مفتوح",
      workOrderTitle: "صيانة: {name}",
      service: "صيانة دورية",
      equipment: "المعدات",
      noEquipmentChosen: "بدون معدات",
      noRoomChosen: "بدون غرفة",
      chooseRoomOrEquipment: "اختر غرفة أو معدات أو كليهما.",
      costTitle: "التكلفة",
      cost: "المبلغ",
      vendor: "المنفِّذ",
      vendorPlaceholder: "بوغاز تكنيك",
      noCost: "لم تُسجَّل تكلفة",
      chargeTitle: "تحميل الضيف التكلفة",
      chargeHint: "سطر في حساب الضيف. يُلغى الخطأ من الحساب نفسه.",
      guest: "الضيف",
      chooseGuest: "اختر ضيفًا",
      amount: "المبلغ",
      charge: "تحميل",
      noChargeable: "لا أحد ممن أقاموا في هذه الغرفة لديه حساب مفتوح.",
      reversedCharge: "أُلغي",
      inHouseNow: "مقيم",
      leftOn: "غادر {date}",
      loading: "جارٍ التحميل…",
      chargeUnavailable: "تعذّر تحميل الضيوف الآن. حاول مرة أخرى.",
      actions: "الإجراءات",
      change: "تعديل",
      conditions: {
        working: "تعمل",
        due: "حان موعد الصيانة",
        overdue: "الصيانة متأخرة",
        fault: "معطلة",
      },
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

    analytics: {
      heading: "التحليلات والتقارير",
      subheading:
        "مؤشرات نسبة الإشغال، والنشاط التشغيلي، والأداء المالي للمنشأة.",
      rangeToday: "اليوم",
      range7d: "آخر 7 أيام",
      range30d: "آخر 30 يومًا",
      rangeMonth: "الشهر",
      rangeSelectorLabel: "الفترة الزمنية",
      occupancyRate: "نسبة الإشغال",
      occupancyRateDesc:
        "نسبة الوحدات المشغولة من إجمالي الوحدات القابلة للبيع",
      sellableUnits: "الوحدات القابلة للبيع",
      occupiedNights: "الليالي المشغولة",
      availableNights: "الليالي المتاحة",
      roomRevenue: "إيرادات الغرف",
      roomRevenueDesc: "صافي إيرادات ليالي الإقامة المحققة خلال الفترة",
      totalRevenue: "إجمالي الإيرادات",
      adr: "متوسط السعر اليومي (ADR)",
      adrDesc: "متوسط إيراد الغرفة لكل ليلة مشغولة",
      revPar: "الإيراد لكل غرفة متاحة (RevPAR)",
      revParDesc: "متوسط إيراد الغرف لكل ليلة متاحة",
      netPayments: "المدفوعات المحصلة",
      netPaymentsDesc: "صافي المدفوعات المستلمة خلال هذه الفترة",
      financialsMaskedNotice:
        "ليس لديك صلاحية للاطلاع على المؤشرات المالية (finance.manage_folio).",
      dailyBreakdownTitle: "تفصيل الأداء اليومي",
      dailyBreakdownDesc:
        "بيان يومي للإشغال وإيرادات الإقامة عبر الفترة المحددة.",
      dateCol: "التاريخ",
      occupiedUnitsCol: "الوحدات المشغولة",
      availableUnitsCol: "الوحدات المتاحة",
      occupancyCol: "نسبة الإشغال",
      roomRevenueCol: "إيرادات الغرف",
      paymentsBreakdownTitle: "تفصيل طرق الدفع",
      cash: "نقدًا",
      card: "بطاقة ائتمان",
      bankTransfer: "تحويل بنكي",
      other: "أخرى",
      month: {
        navigation: "شهر التقرير",
        previousMonth: "الشهر السابق",
        nextMonth: "الشهر التالي",
        monthToDate:
          "من بداية الشهر حتى اليوم · أُغلق {closed} من {total} يومًا",
        openNote:
          "كل أرقام النِّسَب والإيرادات تشمل الأيام المغلقة فقط. اليوم لا يزال مفتوحًا: لا تُحتسب رسوم لياليه حتى يُغلق اليوم، لذا لا يدخل في أي نسبة.",
        asOf: "حتى {date}. يُحتسب التصحيح في الليلة التي يصحّحها، لذا قد يتغيّر شهر سابق.",
        noActivityTitle: "لم يحدث شيء في {month}",
        noActivityDescription:
          "لم تكن للمنشأة أي إقامة أو رسوم حتى ذلك الحين، لذا لا توجد نِسَب تُعرض. عدم حدوث شيء لا يعني صفرًا.",
        notFoundTitle: "التحليلات غير متاحة لهذه المنشأة",
        notFoundDescription:
          "قد لا تكون التحليلات مفعّلة في هذه المنشأة، أو قد لا تملك صلاحية الوصول إليها.",
        headline: "المؤشرات الرئيسية",
        occupancy: "الإشغال",
        occupancyArithmetic: "{occupied} مشغولة ÷ {available} ليلة متاحة",
        occupancyNone: "لا توجد ليالٍ متاحة، فلا شيء يُقسَم.",
        adr: "متوسط السعر اليومي (ADR)",
        adrArithmetic: "{revenue} إيرادات الغرف ÷ {nights} ليلة ضيوف محتسبة",
        adrNone: "لا توجد ليالي ضيوف محتسبة بعد، فلا شيء يُقسَم.",
        revPar: "الإيراد لكل ليلة متاحة (RevPAR)",
        revParArithmetic: "{revenue} إيرادات الغرف ÷ {nights} ليلة متاحة",
        revParNone: "لا توجد ليالٍ متاحة، فلا شيء يُقسَم.",
        againstPrior: "مقابل {month}: {value}",
        pointsChange: "{value} نقطة",
        sameElapsedDays: "مقارنةً بالأيام المنقضية نفسها من {month}.",
        noPrior: "لا يوجد شهر سابق للمقارنة معه.",
        revenue: "الإيرادات",
        roomNightsCharged: "ليالي الغرف المحتسبة",
        corrections: "التصحيحات (ليالٍ مُلغاة)",
        netRoomRevenue: "صافي إيرادات الغرف",
        otherRevenue: "إيرادات أخرى (صافي)",
        totalRevenue: "إجمالي الإيرادات",
        collected: "المُحتسَب والمحصَّل",
        revenueBooked: "الإيرادات المُحتسبة",
        moneyCollected: "المبالغ المحصَّلة",
        owedChange: "التغيّر في ما يدين به الضيوف",
        owedChangeNote:
          "الإيرادات المحتسبة مطروحًا منها المبالغ المحصَّلة: الرقم الموجب يعني أن الضيوف مدينون بأكثر مما كانوا عليه في بداية الشهر. هذا ليس تقرير ذمم مدينة.",
        collectedByMethod: "المحصَّل بحسب الطريقة",
        nights: "الليالي",
        availableNights: "الليالي المتاحة",
        occupiedNights: "الليالي المشغولة",
        guestNights: "ليالي الضيوف",
        residentNights: "ليالي المقيمين",
        residentNote:
          "يُحاسَب المقيمون شهريًا، لذا تُظهر المنشأة ذات ليالي المقيمين الكثيرة إيرادات غرف منخفضة هنا.",
        days: "يومًا بيوم",
        dayCol: "اليوم",
        occupiedCol: "الليالي المشغولة",
        occupancyCol: "الإشغال",
        revenueCol: "إيرادات الغرف",
        openDay: "يوم مفتوح",
        notYetCharged: "لم تُحتسب بعد",
        monthTotal: "مجموع الأيام المغلقة",
        unitTypes: "حسب نوع الوحدة",
        unitTypeCol: "نوع الوحدة",
        unitTypeNote:
          "تُنسب كل ليلة إلى نوع الوحدة التي أُقيمت فيها. مجموع الصفوف يساوي الأرقام أعلاه.",
        adrCol: "ADR",
        uncharged: "ليالٍ بلا رسوم",
        unchargedNote:
          "الليالي المشغولة في الأيام المغلقة التي لا يغطيها أي رسم ليلة غرفة، وأسبابها. أعداد فقط، بلا مبالغ.",
        unchargedNone: "كل ليلة مشغولة في الأيام المغلقة محتسبة.",
        unchargedNights:
          "{n, plural, one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلة} other {# ليلة}}",
        unchargedReason: {
          resident: "إقامة مقيم، تُفوتر شهريًا",
          unpriced: "لا سعر على الحجز",
          billing_unavailable: "الفوترة غير متاحة هنا",
          no_folio: "لا يوجد حساب",
          folio_closed: "الحساب مغلق",
          currency: "مسعَّر بعملة أخرى",
          not_yet_charged: "لم تُحتسب بعد",
        },
        showDay: "عرض {date}",
        dayDescription: "الإقامات التي شغلت وحدة في هذه الليلة.",
        dayOpenNote: "لم يُغلق هذا اليوم بعد. تُحتسب لياليه عند إغلاقه.",
        dayStays: "الإقامات",
        dayNoStays: "لم يكن أحد مقيمًا في هذه الليلة.",
        dayCharged: "ليالي الضيوف المحتسبة",
        nightCharged: "محتسبة",
        noGuestName: "الاسم غير معروض",
        dayCorrections: "تصحيحات ليالي هذا اليوم",
        correctionPosted: "سُجّل في {date}",
        dayNavigation: "اليوم",
        previousDay: "اليوم السابق",
        nextDay: "اليوم التالي",
      },
    },

    portfolio: {
      subtitle: "{organization}: كل المنشآت جنبًا إلى جنب.",
      asOf: "الأرقام حتى {time}",
      listLabel: "المنشآت جنبًا إلى جنب",
      occupancyTitle: "الإشغال عبر المنشآت",
      coverage: "حُسبت في {reporting} من {total} منشآت",
      notReporting: "غير متاحة في أي منشأة",
      moneyOwedTitle: "المبالغ المستحقة",
      moneyOwedNote: "أرصدة الحسابات المفتوحة، سطر لكل عملة",
      maintenanceTitle: "الصيانة المفتوحة",
      maintenanceNote: "طلبات لم تُنجز بعد",
      cardOccupancy: "الوحدات المشغولة",
      businessDate: "يوم العمل {date}",
      noSellableUnits: "لا وحدات قابلة للبيع",
      arrivals: "وصول متبقٍ اليوم",
      departures: "مغادرة متبقية اليوم",
      maintenance: "طلبات الصيانة المفتوحة",
      moneyOwed: "المبالغ المستحقة",
      hidden: "مخفي",
      unavailable: "غير متاح",
      withheld: "لا تُعرض أرقام هذه المنشأة لأن التحليلات غير مفعّلة فيها.",
      moneyHiddenNotice:
        "المبالغ المستحقة مخفية. تظهر فقط لمن يستطيع إدارة الحسابات، في المنشآت التي فُعّل فيها الإصدار.",
      open: "افتح {property}",
      oneTitle: "لا شيء للمقارنة بعد",
      oneDescription:
        "تصل إلى منشأة واحدة: {property}. تظهر المنشآت جنبًا إلى جنب هنا عندما تصل إلى أكثر من واحدة.",
      noneTitle: "لا منشأة للعرض",
      noneDescription: "لا تصل إلى أي منشأة في هذه المؤسسة.",
      goToToday: "اذهب إلى اليوم",
      tooLargeTitle: "منشآت أكثر من أن تُقارَن",
      tooLargeDescription:
        "تصل إلى {count} منشأة وهذه الصفحة تقارن {max} على الأكثر. لا يُقتطع شيء بصمت، لذلك لا تُعرض أي مقارنة.",
      failedTitle: "تعذّر عرض المحفظة",
      failedDescription:
        "حدث خطأ أثناء قراءة منشآتك. أعد المحاولة، وإن تكرر فأبلغ المسؤول.",
      retry: "أعد المحاولة",
    },

    guestExperience: {
      heading: "تجربة وطلبات الضيوف",
      subheading:
        "طلبات خدمة الضيوف والمقيمين، ومتابعة الأولويات وسير إنجاز المهام.",
      newRequest: "طلب جديد",
      allRequests: "كل الطلبات",
      openRequests: "الطلبات المفتوحة",
      resolvedRequests: "المنجزة",
      title: "العنوان",
      details: "التفاصيل",
      category: "الفئة",
      priority: "الأولوية",
      status: "الحالة",
      room: "الغرفة",
      guest: "الضيف",
      assignee: "المكلف",
      unassigned: "غير مسند",
      reportedAt: "وقت الطلب",
      resolvedAt: "وقت الإنجاز",
      actions: "الإجراءات",
      categories: {
        housekeeping: "خدمة الغرف",
        maintenance: "الصيانة",
        amenities: "مستلزمات الغرفة",
        front_desk: "الاستقبال",
        other: "أخرى",
      },
      priorities: {
        low: "منخفضة",
        normal: "عادية",
        high: "عالية",
        urgent: "عاجلة",
      },
      statuses: {
        new: "جديد",
        in_progress: "قيد التنفيذ",
        resolved: "تم الحل",
        cancelled: "ملغي",
      },
      markInProgress: "بدء المعالجة",
      resolve: "إنجاز الطلب",
      cancel: "إلغاء الطلب",
      reopen: "إعادة فتح",
      cancelReason: "سبب الإلغاء",
      cancelReasonPlaceholder: "وضح سبب إلغاء الطلب...",
      resolutionNotes: "ملاحظات الحل",
      resolutionNotesPlaceholder: "الإجراء الذي تم اتخاذه لإنجاز الطلب...",
      createDialogTitle: "تسجيل طلب خدمة جديد",
      createDialogDesc: "تسجيل طلب خدمة جديد لغرفة أو ضيف في المنشأة.",
      titlePlaceholder: "مثال: طلب مناشف إضافية",
      detailsPlaceholder: "تفاصيل أو تعليمات إضافية...",
      selectCategory: "اختر الفئة",
      selectPriority: "اختر الأولوية",
      selectRoom: "اختر الغرفة (اختياري)",
      noRoom: "بدون غرفة",
      submit: "حفظ الطلب",
      cancelling: "جارٍ الإلغاء...",
      saving: "جارٍ الحفظ...",
      emptyTitle: "لا توجد طلبات",
      emptyDesc: "لم يتم تسجيل أي طلبات خدمة لهذه المنشأة حتى الآن.",
    },

    auditLog: "سجل التدقيق",
    auditLogFor: "آخر الإجراءات في",
    noAuditTitle: "لا توجد سجلات بعد",
    auditNotPermittedTitle: "لا يمكنك قراءة سجل التدقيق",
    auditNotPermittedDescription:
      "قراءة سجل التدقيق صلاحية مستقلة تُستخدم في المنشآت التي عُيّنت فيها. يمكن لمن يدير الفريق أن يمنحك من شاشة الفريق دورًا يتضمنها، أو أن يضيف صلاحية «قراءة سجل التدقيق» إلى دورك إن كان دورًا أنشأته مؤسستك، أو أن يعيّنك في منشأة إن لم تكن معيّنًا في أي منشأة.",
    auditNotHereTitle: "لا يمكنك قراءة سجل التدقيق في هذه المنشأة",
    auditNotHereDescription: "يتيح لك دورك قراءته من هنا:",
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
    auditWhere: "أين",
    auditOrganizationWide: "المؤسسة كلها",
    auditFilters: "تصفية سجل التدقيق",
    auditActionFilter: "الإجراء",
    auditAnyAction: "كل الإجراءات",
    auditProperty: "المنشأة",
    auditEveryProperty: "كل المنشآت التي تصل إليها",
    auditFrom: "من",
    auditTo: "إلى",
    auditPeriod: "الفترة",
    auditFromEmpty: "الأقدم",
    auditToEmpty: "الأحدث",
    auditPickFrom: "اختر اليوم الأول",
    auditPickTo: "اختر اليوم الأخير",
    auditSpanDays:
      "{count, plural, one {يوم واحد} two {يومان} few {# أيام} many {# يومًا} other {# يوم}}",
    auditPresetLast7: "آخر 7 أيام",
    auditPresetLast30: "آخر 30 يومًا",
    auditPresetThisMonth: "هذا الشهر",
    auditSearch: "بحث",
    auditSearchHint: "ضيف أو غرفة أو زميل أو كلمات من سبب",
    auditSearchTooShort: "اكتب حرفين على الأقل للبحث.",
    auditApply: "تطبيق",
    auditClearFilters: "مسح الفلاتر",
    auditOlder: "سجلات أقدم",
    auditNewest: "العودة إلى الأحدث",
    auditMatching:
      "{n, plural, zero {لا سجلات} one {سجل واحد} two {سجلان} few {# سجلات} many {# سجلًا} other {# سجل}}",
    auditNoMatchesTitle: "لا شيء يطابق هذه الفلاتر",
    auditNoMatchesDescription:
      "وسّع نطاق التواريخ أو اختر إجراءً آخر أو امسح الفلاتر.",
    auditRecordMissingTitle: "لا يمكن فتح هذا السجل",
    auditRecordMissingDescription:
      "إما أنه غير موجود أو أنه ليس سجلًا يحق لك قراءته.",
    auditLocalTime:
      "كل وقت معروض بتوقيت المنشأة التي حدث فيها؛ والسجلات الخاصة بالمؤسسة كلها تستخدم توقيت هذه المنشأة.",
    auditYes: "نعم",
    auditNo: "لا",
    auditNone: "لا يوجد",
    auditChangedTo: "تغيّر إلى",
    auditInspectionFollowsOrganization: "إعداد المؤسسة",
    auditContext: {
      amountMinor: "المبلغ",
      balanceMinor: "الرصيد عند الإغلاق",
      totalGrossMinor: "إجمالي الراتب الإجمالي",
      totalNetMinor: "إجمالي صافي الراتب",
      employeeId: "الموظف",
      leaveFrom: "بداية الإجازة",
      leaveTo: "نهاية الإجازة",
      contractType: "نوع العقد",
      hasSystemAccess: "لديه صلاحية دخول النظام",
      terminatedOn: "آخر يوم عمل",
      period: "فترة الرواتب",
      employeeCount: "عدد الموظفين المدفوع لهم",
      description: "الوصف",
      lineId: "البند",
      reversedLineId: "البند المعكوس",
      reversalLineId: "بند العكس",
      stayId: "الإقامة",
      folioId: "الفوليو",
      accommodationUnitId: "الوحدة",
      guestId: "الضيف",
      guestCreated: "سجل ضيف جديد",
      startsOn: "الوصول",
      endsOn: "المغادرة",
      from: "من",
      to: "إلى",
      role: "الدور",
      added: "الصلاحيات المضافة",
      removed: "الصلاحيات المحذوفة",
      permissions: "الصلاحيات",
      propertyIds: "المنشآت",
      properties: "المنشآت",
      propertyId: "المنشأة",
      userId: "عضو الفريق",
      name: "الاسم",
      names: "الأسماء",
      key: "مفتاح الدور",
      holders: "من يحملون الدور",
      unitIds: "الوحدات",
      unitType: "نوع الوحدة",
      capacity: "السعة",
      building: "المبنى",
      floor: "الطابق",
      letByTheBed: "يُؤجَّر بالسرير",
      hadBeenBlockedFor: "سبب الإغلاق السابق",
      status: "الحالة",
      previousStatus: "الحالة السابقة",
    },
    auditAction: {
      reservation: {
        created: "تم أخذ حجز",
        checked_in: "تم تسجيل الوصول",
        check_in_reversed: "تم سحب تسجيل الوصول",
        cancelled: "أُلغي الحجز",
        no_show: "سُجِّل عدم الحضور",
        amended: "عُدِّل الحجز",
        arrival_time_changed: "عُدِّل وقت الوصول المتوقع",
      },
      stay: {
        checked_out: "تم تسجيل المغادرة",
        departure_changed: "تغيّر موعد المغادرة",
        moved: "نُقل النزيل",
      },
      folio: {
        charge_posted: "تم إدراج رسم",
        payment_posted: "تم تسجيل دفعة",
        line_reversed: "تم عكس بند",
        closed: "تم إغلاق الفوليو",
      },
      staff: {
        invited: "تمت دعوة عضو فريق",
        invitation_renewed: "تم تجديد رابط الدعوة",
        invitation_accepted: "تم قبول الدعوة",
        readded: "أُعيد عضو الفريق",
        role_changed: "تم تغيير الدور",
        role_permissions_changed: "تم تغيير صلاحيات الدور",
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
      business_day: { closed: "أُغلق يوم العمل" },
      property: { configured: "تم تغيير إعدادات المنشأة" },
      organization: { configured: "تمت إعادة تسمية المؤسسة" },
      price_list: { changed: "تم تغيير أسعار الليلة" },
      data_export: {
        requested: "طُلب تصدير بيانات",
        downloaded: "نُزّل تصدير بيانات",
      },
      maintenance_request: {
        reported: "أُبلغ عن مشكلة",
        moved: "نُقل الطلب",
        cancelled: "أُلغي الطلب",
        assigned: "أُسند الطلب",
        prioritised: "تغيرت الأولوية",
        hold_released: "أُفرج عن الغرفة وما زال طلب آخر يحجزها",
        costed: "سُجّلت التكلفة",
        guest_charged: "حُمّل الضيف تكلفة الضرر",
      },
      maintenance_setting: {
        changed: "تغير إعداد الصيانة",
      },
      maintenance_equipment: {
        added: "أُضيفت معدات",
        changed: "عُدّلت المعدات",
        retired: "أُخرجت المعدات من الاستخدام",
        restored: "أُعيدت المعدات إلى الاستخدام",
        serviced: "صينت المعدات",
      },
      employee: {
        registered: "تم تسجيل موظف",
        terminated: "انتهت خدمة الموظف",
      },
      leave: {
        approved: "تمت الموافقة على إجازة",
        declined: "رُفضت إجازة",
      },
      payroll_run: {
        approved: "اعتُمدت الرواتب",
      },
      branding: {
        changed: "تغيّرت الهوية البصرية",
        reset: "أُعيدت الهوية البصرية إلى الافتراضي",
      },
      webhook_endpoint: {
        registered: "أُضيفت نقطة استقبال ويب هوك",
        removed: "أُزيلت نقطة استقبال ويب هوك",
        test_sent: "أُرسل حدث اختبار",
      },
      failed_operation: {
        retried: "أُعيدت محاولة إرسال فاشل",
        cancelled: "أُوقفت محاولات إرسال فاشل",
        resolved: "عُلِّم إرسال فاشل كمحلول",
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
      maintenance_equipment: "المعدات",
      data_export: "تصدير البيانات",
      business_day_close: "يوم العمل",
      employee: "موظف",
      leave_request: "طلب إجازة",
      payroll_run: "كشف رواتب",
      organization_brand: "الهوية البصرية للمؤسسة",
      webhook_endpoint: "نقطة استقبال ويب هوك",
      failed_operation: "إرسال فاشل",
    },
    closeDay: {
      at: "إغلاق اليوم في",
      dueTitle: "{date} جاهز للإغلاق",
      dueDescription:
        "انتهى اليوم عند {time}. عالج ما زال مفتوحًا، أو أغلقه مع ذكر السبب.",
      waiting:
        "{n, plural, zero {لا أيام تنتظر الإغلاق.} one {يوم واحد ينتظر الإغلاق.} two {يومان ينتظران الإغلاق، ويُغلق الأقدم أولًا.} few {# أيام تنتظر الإغلاق، ويُغلق الأقدم أولًا.} many {# يومًا تنتظر الإغلاق، ويُغلق الأقدم أولًا.} other {# يوم تنتظر الإغلاق، ويُغلق الأقدم أولًا.}}",
      waitingBadge:
        "{n, plural, zero {لا أيام تنتظر} one {يوم واحد ينتظر} two {يومان ينتظران} few {# أيام تنتظر} many {# يومًا تنتظر} other {# يوم تنتظر}}",
      preparingTitle: "{date} ما زال مفتوحًا",
      preparingDescription:
        "يمكن إغلاقه بعد {time}. أي شيء ما زال مفتوحًا أدناه سيؤخر الإغلاق.",
      automatic:
        "اليوم الذي لم يبقَ فيه شيء مفتوح يُغلق تلقائيًا بعد انتهائه بقليل.",
      notArrivedTitle: "حجوزات لم يُسجَّل وصولها",
      notArrivedHelp:
        "سجّل عدم الحضور، أو ألغِ الحجز، أو سجّل وصولهم إن كانوا ما زالوا قادمين.",
      notDepartedTitle: "مغادرات ما زالت في المنشأة",
      notDepartedHelp: "سجّل مغادرتهم من شاشة المغادرة.",
      roomNightsTitle: "ليالي الغرف",
      roomNightsHelp:
        "يُحتسب عند إغلاق اليوم لكل ضيف أقام تلك الليلة ليلةٌ بالسعر الذي أُخذ به حجزه. الليالي التي لا يمكن احتسابها تُدرج هنا ولا تؤخر الإغلاق.",
      foliosTitle: "حسابات بقيت مفتوحة",
      foliosHelp:
        "ضيوف غادروا وحسابهم ما زال مفتوحًا. يُسجَّلون مع الإغلاق ولا يؤخرونه.",
      nothingOpen: "لم يبقَ شيء مفتوح.",
      stepDone: "تم",
      stepOpen:
        "{n, plural, zero {لا شيء مفتوح} one {عنصر مفتوح} two {عنصران مفتوحان} few {# عناصر مفتوحة} many {# عنصرًا مفتوحًا} other {# عنصر مفتوح}}",
      notBlocking: "لا يؤخر الإغلاق",
      roomNightsTodayHelp:
        "تُحتسب ليلة اليوم عند إغلاقه. أما ليالي الضيف المغادر التي لم يصلها إغلاق بعد فتُحتسب عند مغادرته.",
      roomNightsToCharge:
        "{n, plural, =0 {لا ليالي للاحتساب} one {ليلة واحدة للاحتساب} two {ليلتان للاحتساب} few {# ليالٍ للاحتساب} many {# ليلة للاحتساب} other {# ليلة للاحتساب}}",
      roomNightsAllCharged: "ستُحتسب كل ليالي الضيوف.",
      notChargedReason: {
        unpriced: "لا سعر على الحجز",
        no_folio: "لا يوجد حساب",
        folio_closed: "الحساب مغلق",
        currency: "مسعَّر بعملة أخرى",
        billing_unavailable: "الفوترة غير متاحة هنا",
      },
      roomNightsColumn: "ليالي الغرف",
      roomNightsNotCharged:
        "{n, plural, zero {لا شيء} one {ليلة واحدة لم تُحتسب} two {ليلتان لم تُحتسبا} few {# ليالٍ لم تُحتسب} many {# ليلة لم تُحتسب} other {# ليلة لم تُحتسب}}",
      nightsHint:
        "تحسب الليالي كل إقامة في المنشأة، بما فيها المقيمون. أما ليالي الغرف فللضيوف وحدهم: يُحاسَب المقيمون شهريًا.",
      dueOn: "الوصول المتوقع {date}",
      dueOutOn: "المغادرة المتوقعة {date}",
      leftOn: "غادر {date}",
      openArrivals: "فتح الوصول",
      openDepartures: "فتح المغادرة",
      openFolio: "فتح الحساب",
      close: "إغلاق {date}",
      closing: "جارٍ الإغلاق…",
      dialogTitle: "إغلاق {date}؟",
      dialogQuiet:
        "لم يبقَ شيء مفتوح. يسجّل الإغلاق حالات الوصول والمغادرة والليالي المشغولة في هذا اليوم، ويحتسب ليلة كل ضيف لحجزه سعر.",
      dialogOpen:
        "{n, plural, zero {لا شيء مفتوح.} one {ما زال عنصر واحد مفتوحًا. سيُسجَّل مع الإغلاق مع سببك.} two {ما زال عنصران مفتوحين. سيُسجَّلان مع الإغلاق مع سببك.} few {ما زالت # عناصر مفتوحة. ستُسجَّل مع الإغلاق مع سببك.} many {ما زال # عنصرًا مفتوحًا. ستُسجَّل مع الإغلاق مع سببك.} other {ما زال # عنصر مفتوحًا. ستُسجَّل مع الإغلاق مع سببك.}}",
      final:
        "إعادة فتح يوم مغلق غير متاحة بعد، لذا تحقّق من التاريخ قبل الإغلاق.",
      keepOpen: "ليس الآن",
      dismissed: "تم",
      reasonHint:
        "اذكر سبب إغلاق اليوم مع وجود عناصر مفتوحة. يُحفظ مع الإغلاق.",
      noPermission:
        "يمكنك رؤية هذا اليوم، لكن إغلاقه يتطلب صلاحية إغلاق اليوم.",
      alreadyClosed: "أُغلق هذا اليوم بالفعل، من مكتب آخر أو تلقائيًا.",
      reasonRequired: "ما زالت هناك عناصر مفتوحة، لذلك يلزم ذكر سبب.",
      refused:
        "لا يمكن إغلاق هذا اليوم الآن. أغلق هذه النافذة وستعرض الصفحة اليوم الذي يمكن إغلاقه.",
      recentTitle: "أيام أُغلقت مؤخرًا",
      recentEmpty: "لم يُغلق أي يوم هنا بعد.",
      day: "اليوم",
      closedBy: "أغلقه",
      automatically: "تلقائيًا",
      arrived: "الوصول",
      departed: "المغادرة",
      nights: "الليالي",
      leftOpen: "بقي مفتوحًا",
      foliosOpen: "حسابات مفتوحة",
    },
    picker: {
      search: "بحث…",
      noMatches: "لا توجد خيارات مطابقة.",
      clear: "مسح الاختيار",
      selectedCount:
        "{n, plural, zero {لا شيء محدد} one {واحدة محددة} two {اثنتان محددتان} few {# محددة} many {# محددة} other {# محددة}}",
      required: "اختر خيارًا للمتابعة.",
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
      "room-calendar": "تقويم الغرف",
      rooms: "الغرف والأسرّة",
      arrivals: "الوصول",
      departures: "المغادرة",
      "close-day": "إغلاق اليوم",
      "guest-experience": "تجربة الضيف",
      housekeeping: "خدمة الغرف",
      maintenance: "الصيانة",
      "food-and-beverage": "الأطعمة والمشروبات",
      inventory: "المخزون",
      finance: "المالية",
      people: "الفريق",
      hr: "الموارد البشرية والرواتب",
      analytics: "التحليلات",
      portfolio: "كل المنشآت",
      configuration: "الإعدادات",
      integrations: "التكاملات",
      branding: "الهوية البصرية",
      "data-export": "تصدير البيانات",
      "audit-log": "سجل التدقيق",
    },
    screenSummary: {
      "guest-experience": "طلبات الضيوف والمقيمين والإعلانات ومتابعة الخدمة.",
      housekeeping: "جاهزية الوحدات وجدول التنظيف وتوزيع المهام.",
      "food-and-beverage": "خطط الوجبات والمنافذ وسجلات الاستهلاك.",
      inventory: "حركات المخزون والجرد والمشتريات.",
      people: "سجلات الموظفين والورديات والصلاحيات.",
      hr: "عقود الموظفين وجدول الورديات الأسبوعي والإجازات والرواتب الشهرية.",
      analytics: "تقارير الإشغال والإيرادات والتشغيل.",
      "data-export":
        "تصدير البيانات عند الطلب وفق جداول زمنية، والسجلات والتنزيلات.",
    },
    planned: "مخطط له",
    handoverLabel: "ملاحظة التسليم لهذه الشاشة",
    notEntitledTitle: "هذه الوحدة غير مشمولة في اشتراكك",
    notEntitledDescription:
      "تظهر هنا عندما تشترك مؤسستك فيها ويتم تفعيلها في المنشأة.",
  },
};
