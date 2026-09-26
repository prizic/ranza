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
      | "cancel"
      | "closeDay"
      | "manageFolio"
      | "postCharge"
      | "administerStaff"
      | "defineRoles"
      | "configureAccommodation"
      | "updateHousekeeping"
      | "reportMaintenance"
      | "manageMaintenance"
      | "takeOutOfOrder"
      | "manageEquipment"
      | "readAudit"
      | "manageConfiguration",
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
  /** One field for arrival and departure; the halves keep those names. */
  stayDates: string;
  bookingAddDate: string;
  bookingOpenEnded: string;
  bookingPickArrival: string;
  bookingPickDeparture: string;
  /** ICU plural on `count`. */
  stayNights: string;
  dateRangeClear: string;
  dateRangeDone: string;
  chooseUnit: string;
  takeBooking: string;
  takingBooking: string;
  discardBooking: string;
  bookingUnavailable: string;
  bookingOverOccupant: string;
  bookingPeriodInvalid: string;
  bookingGuestInvalid: string;
  bookingRefused: string;

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
  reservedCount: string;
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

  /**
   * The room calendar (RANZ-25). Grouped, so the screen's copy reads as one
   * block in each language and `useTranslations("roomCalendar")` scopes it.
   */
  roomCalendar: {
    title: string;
    subtitle: string;
    previous: string;
    next: string;
    today: string;
    goTo: string;
    length: string;
    lengthOption: string;
    floorFilter: string;
    allFloors: string;
    floorOption: string;
    noFloor: string;
    noBuilding: string;
    search: string;
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
    leaves: string;
    left: string;
    booked: string;
    nightsLabel: string;
    nights: string;
    stayType: string;
    guest: string;
    resident: string;
    balance: string;
    folioClosed: string;
    open: Record<"arrivals" | "departures" | "reservations", string>;
    /** The short word a bar carries beside a warning's icon, when it fits. */
    barWord: Record<"overlap" | "bookedWhileBlocked" | "clashes", string>;
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
      "created" | "checked_in" | "check_in_reversed" | "cancelled" | "no_show",
      string
    >;
    stay: Record<"checked_out", string>;
    folio: Record<"charge_posted" | "line_reversed" | "closed", string>;
    staff: Record<
      | "invited"
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
    | "business_day_close",
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
    notAvailable: string;
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
    checkOutBalanceHint:
      "Henüz ödeme alınamıyor. Hesap {balance} bakiyesiyle açık kalır ve gerekçeniz kaydedilir.",
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
        cancel: "Rezervasyon iptali ve gelmedi kaydı",
        closeDay: "Günü kapatma",
        manageFolio: "Folyo açma ve kapatma",
        postCharge: "Folyoya ücret işleme",
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
    stayDates: "Konaklama tarihleri",
    bookingAddDate: "Tarih seçin",
    bookingOpenEnded: "Açık uçlu",
    bookingPickArrival: "Giriş gününü seçin",
    bookingPickDeparture: "Çıkış gününü seçin ya da açık bırakın",
    stayNights: "{count, plural, other {# gece}}",
    dateRangeClear: "Temizle",
    dateRangeDone: "Tamam",
    chooseUnit: "Birim seçin",
    takeBooking: "Rezervasyon oluştur",
    takingBooking: "Oluşturuluyor",
    discardBooking: "Vazgeç",
    bookingUnavailable: "Bu birim o geceler için zaten dolu.",
    bookingOverOccupant:
      "Bu birimde o gecelerin bazısında konaklayan biri var.",
    bookingPeriodInvalid:
      "Bu tarihler geçerli bir dönem değil. Rezervasyon en az bir gece sürer ve bugünden önce başlayamaz.",
    bookingGuestInvalid:
      "Misafirin adını, e-postasını ve telefonunu kontrol edin.",
    bookingRefused: "Bu rezervasyon oluşturulamıyor.",
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
    reservedCount: "{count, number} rezervasyonlu",
    blockedStatus: "Kapalı",
    roomCalendar: {
      title: "{property} oda takvimi",
      subtitle:
        "Odalar ve yataklar, tesisin iş günlerine göre. Yalnızca görüntüleme: rezervasyon, yapıldığı yerde değiştirilir.",
      previous: "Önceki hafta",
      next: "Sonraki hafta",
      today: "Bugün",
      goTo: "Tarihe git",
      length: "Gösterilen gün",
      lengthOption: "{days, plural, other {# gün}}",
      floorFilter: "Kat",
      allFloors: "Tüm katlar",
      floorOption: "Kat {floor}",
      noFloor: "Katsız",
      noBuilding: "Binasız",
      search: "Oda veya misafir ara",
      showRequested: "Talep",
      showDeparted: "Ayrılan",
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
      overdueNote: "Gecikmiş: {date} tarihinde ayrılmaları gerekiyordu.",
      arrives: "Geliş",
      arrived: "Geldi",
      leaves: "Ayrılış",
      left: "Ayrıldı",
      booked: "Rezervasyon",
      nightsLabel: "Gece",
      nights: "{count, plural, other {# gece}}",
      stayType: "Tür",
      guest: "Misafir",
      resident: "Sakin",
      balance: "Bakiye",
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
        "Bu tesiste ilk folyo açıldığından beri sabit. Her folyo açıldığı para birimini korur.",
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
        "Siz düzenlerken bu tesiste bir folyo açıldı; para birimi artık sabit.",
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
        "Odalara fiyat tanımlandığında oda geceleri burada işlenecek. Günü kapatmak hiçbir ücret işlemez.",
      foliosTitle: "Açık bırakılan folyolar",
      foliosHelp:
        "Hesabı açıkken ayrılan misafirler. Kapanışla birlikte kaydedilir; kapatmayı bekletmez.",
      nothingOpen: "Açık bir şey kalmadı.",
      stepDone: "Tamam",
      stepOpen: "{n, plural, other {# açık}}",
      notBlocking: "Kapatmayı bekletmez",
      notAvailable: "Henüz yok",
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
        "Açık bir şey kalmadı. Kapanış, günün girişlerini, çıkışlarını ve dolu geceleri kaydeder.",
      dialogOpen:
        "{n, plural, one {# kayıt hâlâ açık. Gerekçenizle birlikte kapanışa kaydedilir.} other {# kayıt hâlâ açık. Gerekçenizle birlikte kapanışa kaydedilir.}}",
      final:
        "Kapatılmış bir günü yeniden açmak henüz mümkün değil; kapatmadan önce tarihi kontrol edin.",
      keepOpen: "Şimdi değil",
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
    checkOutBalanceHint:
      "Payments cannot be taken yet. The Folio stays open with {balance} on it, and your reason is recorded.",
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
        cancel: "Cancel a booking or record a no-show",
        closeDay: "Close the day",
        manageFolio: "Open and close a Folio",
        postCharge: "Post a charge",
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
    stayDates: "Stay dates",
    bookingAddDate: "Add date",
    bookingOpenEnded: "Open-ended",
    bookingPickArrival: "Choose the arrival day",
    bookingPickDeparture: "Choose the departure, or leave it open",
    stayNights: "{count, plural, one {# night} other {# nights}}",
    dateRangeClear: "Clear",
    dateRangeDone: "Done",
    chooseUnit: "Choose a Unit",
    takeBooking: "Create reservation",
    takingBooking: "Creating",
    discardBooking: "Cancel",
    bookingUnavailable: "That Unit is already booked for those nights.",
    bookingOverOccupant:
      "Somebody is staying in that Unit for some of those nights.",
    bookingPeriodInvalid:
      "Those dates are not a period a Reservation can have. It covers at least one night and cannot start before today.",
    bookingGuestInvalid:
      "Check the Guest's name, email address and telephone number.",
    bookingRefused: "That booking cannot be taken.",
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
    reservedCount: "{count, number} reserved",
    blockedStatus: "Blocked",
    roomCalendar: {
      title: "Room calendar at {property}",
      subtitle:
        "Rooms and beds against the Property's business days. Read-only: a booking is changed where it was made.",
      previous: "Previous week",
      next: "Next week",
      today: "Today",
      goTo: "Go to a date",
      length: "Days shown",
      lengthOption: "{days, plural, one {# day} other {# days}}",
      floorFilter: "Floor",
      allFloors: "All floors",
      floorOption: "Floor {floor}",
      noFloor: "No floor",
      noBuilding: "No building",
      search: "Search a room or Guest",
      showRequested: "Requested",
      showDeparted: "Departed",
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
      overdueNote: "Overdue: they were due to leave on {date}.",
      arrives: "Arrives",
      arrived: "Arrived",
      leaves: "Leaves",
      left: "Left",
      booked: "Booked",
      nightsLabel: "Nights",
      nights: "{count, plural, one {# night} other {# nights}}",
      stayType: "Type",
      guest: "Guest",
      resident: "Resident",
      balance: "Balance",
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
        "Fixed since the first folio was opened here. Every folio keeps the currency it opened in.",
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
        "A folio was opened here while you were editing, so the currency is now fixed.",
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
      business_day_close: "Business day",
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
        "Room nights will be posted here once rooms have rates. Closing a day charges nothing.",
      foliosTitle: "Folios left open",
      foliosHelp:
        "Guests who left with their bill still open. They are recorded with the close and do not hold it up.",
      nothingOpen: "Nothing left open.",
      stepDone: "Done",
      stepOpen: "{n, plural, other {# open}}",
      notBlocking: "Does not hold up the close",
      notAvailable: "Not available yet",
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
        "Nothing is left open. The close records the day's arrivals, departures and nights occupied.",
      dialogOpen:
        "{n, plural, one {# item is still open. It is recorded with the close, with your reason.} other {# items are still open. They are recorded with the close, with your reason.}}",
      final:
        "Reopening a closed day is not available yet, so check the date before you close it.",
      keepOpen: "Not now",
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
    checkOutBalanceHint:
      "لا يمكن تحصيل الدفعات بعد. يبقى الحساب مفتوحًا برصيد {balance}، ويُسجَّل السبب الذي تكتبه.",
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
        cancel: "إلغاء حجز أو تسجيل عدم الحضور",
        closeDay: "إغلاق اليوم",
        manageFolio: "فتح وإغلاق الحساب",
        postCharge: "تسجيل رسم على الحساب",
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
    stayDates: "تواريخ الإقامة",
    bookingAddDate: "أضف تاريخًا",
    bookingOpenEnded: "مفتوحة المدة",
    bookingPickArrival: "اختر يوم الوصول",
    bookingPickDeparture: "اختر يوم المغادرة أو اتركه مفتوحًا",
    stayNights:
      "{count, plural, one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلة} other {# ليلة}}",
    dateRangeClear: "مسح",
    dateRangeDone: "تم",
    chooseUnit: "اختر وحدة",
    takeBooking: "إنشاء الحجز",
    takingBooking: "جارٍ الإنشاء",
    discardBooking: "إلغاء",
    bookingUnavailable: "هذه الوحدة محجوزة بالفعل لتلك الليالي.",
    bookingOverOccupant: "هناك نزيل يقيم في هذه الوحدة خلال بعض تلك الليالي.",
    bookingPeriodInvalid:
      "هذه التواريخ ليست مدة صالحة. يغطي الحجز ليلة واحدة على الأقل ولا يبدأ قبل اليوم.",
    bookingGuestInvalid: "تحقق من اسم الضيف وبريده الإلكتروني وهاتفه.",
    bookingRefused: "لا يمكن إنشاء هذا الحجز.",
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
    reservedCount:
      "{count, plural, zero {لا شيء محجوز} one {سرير واحد محجوز} two {سريران محجوزان} few {# أسرّة محجوزة} many {# سريرًا محجوزًا} other {# سرير محجوز}}",
    blockedStatus: "مغلق",
    roomCalendar: {
      title: "تقويم الغرف في {property}",
      subtitle:
        "الغرف والأسرّة مقابل أيام عمل المنشأة. للعرض فقط: يُعدَّل الحجز حيث أُنشئ.",
      previous: "الأسبوع السابق",
      next: "الأسبوع التالي",
      today: "اليوم",
      goTo: "الانتقال إلى تاريخ",
      length: "الأيام المعروضة",
      lengthOption:
        "{days, plural, zero {# يوم} one {يوم واحد} two {يومان} few {# أيام} many {# يومًا} other {# يوم}}",
      floorFilter: "الطابق",
      allFloors: "كل الطوابق",
      floorOption: "الطابق {floor}",
      noFloor: "بلا طابق",
      noBuilding: "بلا مبنى",
      search: "ابحث عن غرفة أو ضيف",
      showRequested: "مطلوبة",
      showDeparted: "مغادِرة",
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
      overdueNote: "متأخر: كان موعد مغادرته {date}.",
      arrives: "الوصول",
      arrived: "وصل",
      leaves: "المغادرة",
      left: "غادر",
      booked: "الحجز",
      nightsLabel: "الليالي",
      nights:
        "{count, plural, zero {لا ليالٍ} one {ليلة واحدة} two {ليلتان} few {# ليالٍ} many {# ليلةً} other {# ليلة}}",
      stayType: "النوع",
      guest: "ضيف",
      resident: "مقيم",
      balance: "الرصيد",
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
        "ثابتة منذ فتح أول فوليو هنا. يحتفظ كل فوليو بالعملة التي فُتح بها.",
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
        "فُتح فوليو هنا أثناء تعديلك، لذا أصبحت العملة ثابتة الآن.",
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
      business_day_close: "يوم العمل",
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
        "ستُسجَّل ليالي الغرف هنا عندما تكون للغرف أسعار. إغلاق اليوم لا يفرض أي رسوم.",
      foliosTitle: "حسابات بقيت مفتوحة",
      foliosHelp:
        "ضيوف غادروا وحسابهم ما زال مفتوحًا. يُسجَّلون مع الإغلاق ولا يؤخرونه.",
      nothingOpen: "لم يبقَ شيء مفتوح.",
      stepDone: "تم",
      stepOpen:
        "{n, plural, zero {لا شيء مفتوح} one {عنصر مفتوح} two {عنصران مفتوحان} few {# عناصر مفتوحة} many {# عنصرًا مفتوحًا} other {# عنصر مفتوح}}",
      notBlocking: "لا يؤخر الإغلاق",
      notAvailable: "غير متاح بعد",
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
        "لم يبقَ شيء مفتوح. يسجّل الإغلاق حالات الوصول والمغادرة والليالي المشغولة في هذا اليوم.",
      dialogOpen:
        "{n, plural, zero {لا شيء مفتوح.} one {ما زال عنصر واحد مفتوحًا. سيُسجَّل مع الإغلاق مع سببك.} two {ما زال عنصران مفتوحين. سيُسجَّلان مع الإغلاق مع سببك.} few {ما زالت # عناصر مفتوحة. ستُسجَّل مع الإغلاق مع سببك.} many {ما زال # عنصرًا مفتوحًا. ستُسجَّل مع الإغلاق مع سببك.} other {ما زال # عنصر مفتوحًا. ستُسجَّل مع الإغلاق مع سببك.}}",
      final:
        "إعادة فتح يوم مغلق غير متاحة بعد، لذا تحقّق من التاريخ قبل الإغلاق.",
      keepOpen: "ليس الآن",
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
    },
    planned: "مخطط له",
    handoverLabel: "ملاحظة التسليم لهذه الشاشة",
    notEntitledTitle: "هذه الوحدة غير مشمولة في اشتراكك",
    notEntitledDescription:
      "تظهر هنا عندما تشترك مؤسستك فيها ويتم تفعيلها في المنشأة.",
  },
};
