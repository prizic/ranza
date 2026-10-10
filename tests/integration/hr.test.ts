/**
 * Human resources and payroll against a real database, as `ranza_app`
 * (RANZ-42, HR-S1-*).
 *
 * The pgTAP suite proves what each policy, grant and trigger admits one
 * statement at a time. This proves the paths they sit on: that a record
 * survives its owner's access being withdrawn, that a payroll run covers the
 * whole Organization whoever approves it and is refused to anyone who reaches
 * less, that approving twice (or at once) is one approval, and that the audit
 * trail and the outbox hold exactly what happened.
 *
 * Each run brings its own Organizations, because an approved run and its
 * payslips are history that is never deleted, and a fixed id would find
 * yesterday's.
 *
 * Breaks that were run, and what went red:
 *   the whole-Organization reach check removed from approvePayroll   HR-S1-24 (module)
 *   the whole-Organization reach clause removed from the run policies HR-S1-24 (database)
 *   `payableEmployees` narrowed to the employees one Property holds  HR-S1-24 (covers every Property)
 *   the advisory lock removed from approvePayroll                     HR-S1-27 (concurrent approvals)
 *   the status guard removed from the run's update policy             HR-S1-25
 *   `terminated_on` left unset by terminateEmployee                   HR-S1-29
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { latestRecord } from "./audit-record";
import {
  createPrismaClient,
  withOrganizationContext,
} from "../../packages/db/src";
import {
  calculatePlaceholderDeductions,
  createHrModule,
  HrInputError,
  HrRefusedError,
} from "../../packages/ranza/hr/src";
import { createStaffModule } from "../../packages/ranza/staff/src";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const hr = createHrModule({ db: prisma });
const staff = createStaffModule({ db: prisma });
const owner = createPrismaClient(process.env.DIRECT_URL!);

const SHIPPED = "00000000-0000-0000-0000-000000000000";
const TAG = randomUUID().slice(0, 8);

interface Fixture {
  organization: string;
  /** Two Properties, both with HR switched on. */
  north: string;
  south: string;
  /** The Organization's Owner: administers staff, so can withdraw access. */
  admin: string;
  /** A Manager reaching every Property. */
  manager: string;
  /** A Manager assigned to the north Property only. */
  scoped: string;
  /** Holds hr.view and nothing else of HR. */
  viewer: string;
  /** Holds no HR permission at all. */
  outsider: string;
  /** A person with a login, whose access is withdrawn in one test. */
  linked: string;
}

async function seed(label: string): Promise<Fixture> {
  const f: Fixture = {
    organization: randomUUID(),
    north: randomUUID(),
    south: randomUUID(),
    admin: randomUUID(),
    manager: randomUUID(),
    scoped: randomUUID(),
    viewer: randomUUID(),
    outsider: randomUUID(),
    linked: randomUUID(),
  };
  const people: [string, string, string, string][] = [
    [f.admin, "owner", SHIPPED, "organization_wide"],
    [f.manager, "manager", SHIPPED, "organization_wide"],
    [f.scoped, "manager", SHIPPED, "assigned_properties"],
    [f.viewer, "hr_viewer", f.organization, "organization_wide"],
    [f.outsider, "housekeeping", SHIPPED, "organization_wide"],
    [f.linked, "front_desk", SHIPPED, "assigned_properties"],
  ];
  for (const [id] of people) {
    await owner.$executeRawUnsafe(
      `insert into public.users (id, email) values ($1::uuid, $2)`,
      id,
      `hr-${TAG}-${label}-${id.slice(0, 8)}@example.test`,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.organizations (id, name, status)
     values ($1::uuid, $2, 'active')`,
    f.organization,
    `HR Integration ${label} ${TAG}`,
  );
  await owner.$executeRawUnsafe(
    `insert into public.properties (id, organization_id, name, timezone) values
       ($1::uuid, $3::uuid, 'HR North', 'Europe/Istanbul'),
       ($2::uuid, $3::uuid, 'HR South', 'Europe/Istanbul')`,
    f.north,
    f.south,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.subscriptions (organization_id, status)
     values ($1::uuid, 'active')`,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.entitlements (organization_id, module_key, status)
     values ($1::uuid, 'human_resources', 'active'),
            ($1::uuid, 'platform_core', 'active')`,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.property_capabilities
       (property_id, organization_id, capability_key, enabled) values
       ($1::uuid, $3::uuid, 'staff_administration', true),
       ($2::uuid, $3::uuid, 'staff_administration', true)`,
    f.north,
    f.south,
    f.organization,
  );
  await owner.$executeRawUnsafe(
    `insert into public.staff_roles (scope_id, key, organization_id, name, permissions)
     values ($1::uuid, 'hr_viewer', $1::uuid, 'HR viewer', array['hr.view'])`,
    f.organization,
  );
  for (const [id, role, scope, access] of people) {
    await owner.$executeRawUnsafe(
      `insert into public.organization_memberships
         (organization_id, user_id, role, role_scope_id, access_scope)
       values ($1::uuid, $2::uuid, $3, $4::uuid, $5)`,
      f.organization,
      id,
      role,
      scope,
      access,
    );
  }
  await owner.$executeRawUnsafe(
    `insert into public.property_assignments (property_id, organization_id, user_id)
     values ($1::uuid, $2::uuid, $3::uuid), ($1::uuid, $2::uuid, $4::uuid)`,
    f.north,
    f.organization,
    f.scoped,
    f.linked,
  );
  return f;
}

/** The IBAN the register stores whole and every reader sees masked. */
const IBAN = "TR33 0006 1005 1978 6457 8413 26";
const IBAN_MASKED = "TR•• •••• •••• 1326";

function anEmployee(
  f: Fixture,
  overrides: Partial<Parameters<typeof hr.registerEmployee>[1]> = {},
): Parameters<typeof hr.registerEmployee>[1] {
  return {
    organizationId: f.organization,
    propertyId: f.north,
    firstName: "Ada",
    lastName: `Worker-${randomUUID().slice(0, 6)}`,
    department: "Front desk",
    position: "Agent",
    // Long enough ago to be in every period the suite approves.
    hiredOn: new Date("2025-01-01"),
    grossPayMinor: 3_500_055,
    currency: "TRY",
    ...overrides,
  };
}

async function count(sql: string, ...values: unknown[]): Promise<number> {
  const [row] = await owner.$queryRawUnsafe<{ n: bigint }[]>(sql, ...values);
  return Number(row?.n ?? 0);
}

async function outboxEvents(organization: string, period: string) {
  return count(
    `select count(*) as n from outbox.events
      where organization_id = $1::uuid and event_type = 'payroll.approved'
        and payload ->> 'period' = $2`,
    organization,
    period,
  );
}

let main: Fixture;
let currencies: Fixture;
let empty: Fixture;
let lapsing: Fixture;
let clashing: Fixture;

beforeAll(async () => {
  main = await seed("main");
  currencies = await seed("currencies");
  empty = await seed("empty");
  lapsing = await seed("lapsing");
  clashing = await seed("clashing");
  await hr.registerEmployee(currencies.manager, anEmployee(currencies));
});

afterAll(async () => {
  await prisma.$disconnect();
  await owner.$disconnect();
});

describe("an employee record outlives the access it was linked to", () => {
  let linkedEmployee: string;

  it("employee_can_exist_without_system_login", async () => {
    const record = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { iban: IBAN, propertyId: null }),
    );

    expect(record.userId).toBeNull();
    expect(record.status).toBe("active");
    // HR-S1-30: stored whole, and returned masked.
    const [stored] = await owner.$queryRawUnsafe<{ iban: string }[]>(
      `select iban from public.hr_employees where id = $1::uuid`,
      record.id,
    );
    expect(stored?.iban).toBe(IBAN.replaceAll(" ", ""));
    expect(record.ibanMasked).toBe(IBAN_MASKED);
    expect(JSON.stringify(record)).not.toContain("6100519786");
  });

  it("employee_record_outlives_membership_revocation", async () => {
    const record = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { userId: main.linked, iban: IBAN }),
    );
    linkedEmployee = record.id;

    await staff.revoke(
      { userId: main.admin },
      { organizationId: main.organization, userId: main.linked },
    );
    const [membership] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.organization_memberships
        where organization_id = $1::uuid and user_id = $2::uuid`,
      main.organization,
      main.linked,
    );
    expect(membership?.status).toBe("revoked");

    // The access is gone and the employment is not: still listed, still
    // active, still linked to the person, still on the rota and still paid.
    const listed = (await hr.employees(main.manager, main.organization)).find(
      (employee) => employee.id === record.id,
    );
    expect(listed?.status).toBe("active");
    expect(listed?.userId).toBe(main.linked);
    const shift = await hr.assignShift(main.manager, {
      organizationId: main.organization,
      propertyId: main.north,
      employeeId: record.id,
      date: new Date("2026-11-02"),
      shiftType: "morning",
    });
    expect(shift.employeeId).toBe(record.id);
  });

  it("iban_is_masked_on_the_server", async () => {
    const record = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { iban: IBAN }),
    );

    // Every shape the module returns an employee or a payslip in carries the
    // masked number and never the whole one.
    const listed = await hr.employees(main.manager, main.organization);
    expect(JSON.stringify(listed)).not.toContain("6100519786");
    expect(listed.find((e) => e.id === record.id)?.ibanMasked).toBe(
      IBAN_MASKED,
    );
    const preview = await hr.payrollSummary(
      main.manager,
      main.organization,
      "2026-03",
    );
    expect(JSON.stringify(preview)).not.toContain("6100519786");
    expect(
      preview?.payslips.find((slip) => slip.employeeId === record.id)
        ?.ibanMasked,
    ).toBe(IBAN_MASKED);
  });

  it("terminating_an_employee_keeps_the_record_and_its_payslips", async () => {
    // A payslip first, so there is something that must outlive the ending.
    const payslipPeriod = "2026-05";
    const run = await hr.approvePayroll(main.manager, {
      organizationId: main.organization,
      period: payslipPeriod,
    });
    expect(
      run.payslips.some((payslip) => payslip.employeeId === linkedEmployee),
    ).toBe(true);

    await hr.terminateEmployee(main.manager, {
      organizationId: main.organization,
      employeeId: linkedEmployee,
      terminatedOn: new Date("2026-06-30"),
    });

    const record = (await hr.employees(main.manager, main.organization)).find(
      (employee) => employee.id === linkedEmployee,
    );
    expect(record?.status).toBe("terminated");
    expect(record?.terminatedOn?.toISOString().slice(0, 10)).toBe("2026-06-30");
    // Nothing was deleted: the shift, and the payslip of the approved run.
    expect(
      await count(
        `select count(*) as n from public.hr_shifts where employee_id = $1::uuid`,
        linkedEmployee,
      ),
    ).toBe(1);
    const afterwards = await hr.payrollSummary(
      main.manager,
      main.organization,
      payslipPeriod,
    );
    expect(
      afterwards?.payslips.some(
        (payslip) => payslip.employeeId === linkedEmployee,
      ),
    ).toBe(true);

    const written = await latestRecord(
      owner,
      "employee.terminated",
      linkedEmployee,
    );
    expect(written?.locationId).toBe(main.north);
    expect(written?.context).toEqual({ terminatedOn: "2026-06-30" });
  });

  it("a_terminated_employee_stays_terminated_and_takes_no_new_work", async () => {
    await expect(
      hr.terminateEmployee(main.manager, {
        organizationId: main.organization,
        employeeId: linkedEmployee,
        terminatedOn: new Date("2026-07-01"),
      }),
    ).rejects.toMatchObject({ reason: "already_terminated" });

    await expect(
      hr.assignShift(main.manager, {
        organizationId: main.organization,
        propertyId: main.north,
        employeeId: linkedEmployee,
        date: new Date("2026-11-03"),
        shiftType: "day",
      }),
    ).rejects.toMatchObject({ reason: "employee_terminated" });
    await expect(
      hr.submitLeaveRequest(main.manager, {
        organizationId: main.organization,
        employeeId: linkedEmployee,
        leaveType: "annual",
        startsOn: new Date("2026-12-01"),
        endsOn: new Date("2026-12-03"),
      }),
    ).rejects.toMatchObject({ reason: "employee_terminated" });
  });

  it("terminating_before_the_hire_date_is_refused", async () => {
    const record = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { hiredOn: new Date("2026-08-10") }),
    );
    await expect(
      hr.terminateEmployee(main.manager, {
        organizationId: main.organization,
        employeeId: record.id,
        terminatedOn: new Date("2026-08-09"),
      }),
    ).rejects.toBeInstanceOf(HrInputError);
  });

  it("registering_and_terminating_are_audited_at_the_employees_property", async () => {
    const record = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { propertyId: main.south }),
    );
    const registered = await latestRecord(
      owner,
      "employee.registered",
      record.id,
    );
    expect(registered?.locationId).toBe(main.south);
    // Ids and enums, never a name, a salary or an account number.
    expect(registered?.context).toEqual({
      contractType: "full_time",
      currency: "TRY",
      hasSystemAccess: false,
    });
  });
});

describe("who may do what", () => {
  it("list_employees_returns_organization_staff", async () => {
    const listed = await hr.employees(main.manager, main.organization);
    expect(listed.length).toBeGreaterThan(3);
    expect(
      listed.every((employee) => employee.organizationId === main.organization),
    ).toBe(true);
    // Another Organization's staff is not in it, whoever asks.
    const other = await hr.employees(
      currencies.manager,
      currencies.organization,
    );
    expect(other.length).toBeGreaterThan(0);
    expect(
      listed.some((employee) => other.map((o) => o.id).includes(employee.id)),
    ).toBe(false);
    // Active first, then those who have left.
    const statuses = listed.map((employee) => employee.status);
    expect(statuses).toEqual([...statuses].sort());
  });

  it("assigning_shift_updates_rota", async () => {
    const employee = await hr.registerEmployee(main.manager, anEmployee(main));
    const base = {
      organizationId: main.organization,
      propertyId: main.north,
      employeeId: employee.id,
      date: new Date("2027-09-06"),
    };

    const first = await hr.assignShift(main.manager, {
      ...base,
      shiftType: "morning",
    });
    expect([first.startTime, first.endTime]).toEqual(["07:00", "15:00"]);

    // One shift per employee per day: assigning again changes it.
    const second = await hr.assignShift(main.manager, {
      ...base,
      shiftType: "evening",
    });
    expect(second.id).toBe(first.id);
    expect([second.shiftType, second.startTime]).toEqual(["evening", "15:00"]);

    const week = await hr.shifts(
      main.manager,
      main.organization,
      main.north,
      new Date("2027-09-06"),
      new Date("2027-09-12"),
    );
    expect(
      week.filter((shift) => shift.employeeId === employee.id),
    ).toHaveLength(1);

    await expect(
      hr.assignShift(main.manager, {
        ...base,
        date: new Date("2027-09-07"),
        shiftType: "day",
        startTime: "9:00",
      }),
    ).rejects.toMatchObject({ field: "shiftTime" });
    // An employee at the north Property is not rostered at the south one.
    await expect(
      hr.assignShift(main.manager, {
        ...base,
        propertyId: main.south,
        date: new Date("2027-09-08"),
        shiftType: "day",
      }),
    ).rejects.toMatchObject({ reason: "other_property" });
  });

  it("a_property_scoped_manager_reads_and_writes_only_their_property", async () => {
    const southern = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { propertyId: main.south }),
    );
    const floater = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { propertyId: null }),
    );

    const seen = await hr.employees(main.scoped, main.organization);
    expect(seen.every((employee) => employee.propertyId === main.north)).toBe(
      true,
    );
    expect(seen.map((employee) => employee.id)).not.toContain(southern.id);
    expect(seen.map((employee) => employee.id)).not.toContain(floater.id);

    await expect(
      hr.registerEmployee(
        main.scoped,
        anEmployee(main, { propertyId: main.south }),
      ),
    ).rejects.toMatchObject({ reason: "not_permitted" });
    await expect(
      hr.registerEmployee(main.scoped, anEmployee(main, { propertyId: null })),
    ).rejects.toMatchObject({ reason: "not_permitted" });
    await expect(
      hr.terminateEmployee(main.scoped, {
        organizationId: main.organization,
        employeeId: southern.id,
        terminatedOn: new Date("2026-12-31"),
      }),
    ).rejects.toMatchObject({ reason: "not_permitted" });

    const own = await hr.registerEmployee(main.scoped, anEmployee(main));
    expect(own.propertyId).toBe(main.north);
  });

  it("someone_with_hr_view_alone_reads_and_changes_nothing", async () => {
    expect(
      (await hr.employees(main.viewer, main.organization)).length,
    ).toBeGreaterThan(0);
    await expect(
      hr.registerEmployee(main.viewer, anEmployee(main)),
    ).rejects.toMatchObject({ reason: "not_permitted" });
    await expect(
      hr.approvePayroll(main.viewer, {
        organizationId: main.organization,
        period: "2026-01",
      }),
    ).rejects.toMatchObject({ reason: "not_permitted" });
  });

  it("hr_queries_without_permission_are_denied", async () => {
    expect(await hr.employees(main.outsider, main.organization)).toEqual([]);
    expect(
      await hr.payrollSummary(main.outsider, main.organization, "2026-01"),
    ).toBeNull();
  });
});

describe("leave", () => {
  it("approving_leave_updates_status_and_is_audited", async () => {
    const employee = await hr.registerEmployee(main.manager, anEmployee(main));
    const request = await hr.submitLeaveRequest(main.manager, {
      organizationId: main.organization,
      employeeId: employee.id,
      leaveType: "annual",
      startsOn: new Date("2027-01-10"),
      endsOn: new Date("2027-01-14"),
    });
    expect(request.status).toBe("pending");

    await hr.decideLeave(main.manager, {
      organizationId: main.organization,
      leaveId: request.id,
      approved: true,
    });

    const listed = (
      await hr.leaveRequests(main.manager, main.organization)
    ).find((leave) => leave.id === request.id);
    expect(listed?.status).toBe("approved");
    const written = await latestRecord(owner, "leave.approved", request.id);
    expect(written?.locationId).toBe(main.north);
    expect(written?.context).toMatchObject({
      employeeId: employee.id,
      startsOn: "2027-01-10",
    });
  });

  it("a_leave_request_is_decided_once", async () => {
    const employee = await hr.registerEmployee(main.manager, anEmployee(main));
    const request = await hr.submitLeaveRequest(main.manager, {
      organizationId: main.organization,
      employeeId: employee.id,
      leaveType: "annual",
      startsOn: new Date("2027-05-10"),
      endsOn: new Date("2027-05-12"),
    });
    await hr.decideLeave(main.manager, {
      organizationId: main.organization,
      leaveId: request.id,
      approved: true,
    });

    // A second decision is refused, and records nothing more.
    await expect(
      hr.decideLeave(main.manager, {
        organizationId: main.organization,
        leaveId: request.id,
        approved: false,
      }),
    ).rejects.toMatchObject({ reason: "leave_decided" });
    expect(
      await count(
        `select count(*) as n from audit.records where subject_id = $1::uuid`,
        request.id,
      ),
    ).toBe(1);
    const [row] = await owner.$queryRawUnsafe<{ status: string }[]>(
      `select status from public.hr_leave_requests where id = $1::uuid`,
      request.id,
    );
    expect(row?.status).toBe("approved");
  });

  it("declining_leave_is_audited_and_overlapping_approval_is_refused", async () => {
    const employee = await hr.registerEmployee(main.manager, anEmployee(main));
    const first = await hr.submitLeaveRequest(main.manager, {
      organizationId: main.organization,
      employeeId: employee.id,
      leaveType: "sick",
      startsOn: new Date("2027-02-01"),
      endsOn: new Date("2027-02-05"),
    });
    await hr.decideLeave(main.manager, {
      organizationId: main.organization,
      leaveId: first.id,
      approved: true,
    });
    const overlapping = await hr.submitLeaveRequest(main.manager, {
      organizationId: main.organization,
      employeeId: employee.id,
      leaveType: "annual",
      startsOn: new Date("2027-02-04"),
      endsOn: new Date("2027-02-08"),
    });

    await expect(
      hr.decideLeave(main.manager, {
        organizationId: main.organization,
        leaveId: overlapping.id,
        approved: true,
      }),
    ).rejects.toMatchObject({ reason: "leave_overlap" });

    await hr.decideLeave(main.manager, {
      organizationId: main.organization,
      leaveId: overlapping.id,
      approved: false,
    });
    expect(
      (await latestRecord(owner, "leave.declined", overlapping.id))?.locationId,
    ).toBe(main.north);
  });

  it("a_leave_request_ending_before_it_starts_is_refused", async () => {
    const employee = await hr.registerEmployee(main.manager, anEmployee(main));
    await expect(
      hr.submitLeaveRequest(main.manager, {
        organizationId: main.organization,
        employeeId: employee.id,
        leaveType: "annual",
        startsOn: new Date("2027-03-10"),
        endsOn: new Date("2027-03-01"),
      }),
    ).rejects.toBeInstanceOf(HrInputError);
  });

  it("a_scoped_manager_decides_leave_only_where_they_reach", async () => {
    const southern = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { propertyId: main.south }),
    );
    const request = await hr.submitLeaveRequest(main.manager, {
      organizationId: main.organization,
      employeeId: southern.id,
      leaveType: "annual",
      startsOn: new Date("2027-04-01"),
      endsOn: new Date("2027-04-02"),
    });
    await expect(
      hr.decideLeave(main.scoped, {
        organizationId: main.organization,
        leaveId: request.id,
        approved: true,
      }),
    ).rejects.toMatchObject({ reason: "not_permitted" });
    expect(
      (await hr.leaveRequests(main.scoped, main.organization)).map(
        (leave) => leave.id,
      ),
    ).not.toContain(request.id);
  });

  it("overlapping_leave_flags_clash", async () => {
    // Their own Organization, so no other test's leave is in the department.
    const first = await hr.registerEmployee(
      clashing.manager,
      anEmployee(clashing, { department: "Kitchen" }),
    );
    const second = await hr.registerEmployee(
      clashing.manager,
      anEmployee(clashing, { department: "Kitchen" }),
    );
    const elsewhere = await hr.registerEmployee(
      clashing.manager,
      anEmployee(clashing, { department: "Sales" }),
    );
    const request = (employeeId: string, from: string, to: string) =>
      hr.submitLeaveRequest(clashing.manager, {
        organizationId: clashing.organization,
        employeeId,
        leaveType: "annual",
        startsOn: new Date(from),
        endsOn: new Date(to),
      });
    const early = await request(first.id, "2027-06-01", "2027-06-05");
    const overlapping = await request(second.id, "2027-06-04", "2027-06-08");
    const otherDepartment = await request(
      elsewhere.id,
      "2027-06-04",
      "2027-06-08",
    );
    const later = await request(second.id, "2027-07-01", "2027-07-02");

    const flags = new Map(
      (await hr.leaveRequests(clashing.manager, clashing.organization)).map(
        (leave) => [leave.id, leave.clash],
      ),
    );
    // Same department, shared days: both are flagged to the manager. A
    // different department, or days that are not shared, are not.
    expect(flags.get(early.id)).toBe(true);
    expect(flags.get(overlapping.id)).toBe(true);
    expect(flags.get(otherDepartment.id)).toBe(false);
    expect(flags.get(later.id)).toBe(false);
  });

  it("approved_leave_does_not_stop_pay", async () => {
    const employee = await hr.registerEmployee(
      clashing.manager,
      anEmployee(clashing, { department: "Housekeeping" }),
    );
    const leave = await hr.submitLeaveRequest(clashing.manager, {
      organizationId: clashing.organization,
      employeeId: employee.id,
      leaveType: "annual",
      startsOn: new Date("2027-08-01"),
      endsOn: new Date("2027-08-31"),
    });
    await hr.decideLeave(clashing.manager, {
      organizationId: clashing.organization,
      leaveId: leave.id,
      approved: true,
    });

    // Away for the whole month and still on the payroll: being on leave is a
    // leave request, not a status the run skips (HR-S1-31).
    const run = await hr.approvePayroll(clashing.manager, {
      organizationId: clashing.organization,
      period: "2027-08",
    });
    expect(run.payslips.map((slip) => slip.employeeId)).toContain(employee.id);
    expect(
      (await hr.employees(clashing.manager, clashing.organization)).find(
        (e) => e.id === employee.id,
      )?.status,
    ).toBe("active");
  });
});

describe("payroll", () => {
  it("approving_payroll_covers_every_property_as_an_organization_wide_manager", async () => {
    const period = "2026-09";
    const before = (await hr.employees(main.manager, main.organization)).filter(
      (employee) => employee.status === "active",
    );
    expect(new Set(before.map((employee) => employee.propertyId)).size).toBe(3);

    const run = await hr.approvePayroll(main.manager, {
      organizationId: main.organization,
      period,
    });

    expect(run.status).toBe("approved");
    expect(run.currency).toBe("TRY");
    // Every active employee of every Property and the floaters, not the
    // employees the approver happens to read through a Property.
    expect(run.payslips.map((payslip) => payslip.employeeId).sort()).toEqual(
      before.map((employee) => employee.id).sort(),
    );
    // The totals are the payslips' sums, exactly.
    expect(run.totalGrossMinor).toBe(
      run.payslips.reduce((sum, payslip) => sum + payslip.grossPayMinor, 0),
    );
    expect(run.totalNetMinor).toBe(
      run.payslips.reduce((sum, payslip) => sum + payslip.netPayMinor, 0),
    );

    const [row] = await owner.$queryRawUnsafe<
      { approved_by: string; status: string }[]
    >(
      `select approved_by, status from public.hr_payroll_runs
        where organization_id = $1::uuid and period = $2`,
      main.organization,
      period,
    );
    expect(row).toEqual({ approved_by: main.manager, status: "approved" });
    expect(await outboxEvents(main.organization, period)).toBe(1);

    const written = await latestRecord(
      owner,
      "payroll_run.approved",
      (
        await owner.$queryRawUnsafe<{ id: string }[]>(
          `select id from public.hr_payroll_runs where organization_id = $1::uuid and period = $2`,
          main.organization,
          period,
        )
      )[0]!.id,
    );
    // A run has no Property, so only whoever reaches the whole Organization
    // may read about it.
    expect(written?.locationId).toBeNull();
    expect(written?.context).toMatchObject({
      period,
      currency: "TRY",
      employeeCount: before.length,
      totalGrossMinor: run.totalGrossMinor,
    });
  });

  it("every_payslip_adds_up_to_the_minor_unit", async () => {
    const run = await hr.payrollSummary(
      main.manager,
      main.organization,
      "2026-09",
    );
    for (const payslip of run!.payslips) {
      expect(payslip.netPayMinor).toBe(
        payslip.grossPayMinor -
          payslip.socialSecurityDeductionMinor -
          payslip.taxDeductionMinor -
          payslip.stampDutyMinor,
      );
      expect(payslip).toMatchObject(
        (({
          socialSecurityMinor,
          incomeTaxMinor,
          stampDutyMinor,
          netMinor,
        }) => ({
          socialSecurityDeductionMinor: socialSecurityMinor,
          taxDeductionMinor: incomeTaxMinor,
          stampDutyMinor,
          netPayMinor: netMinor,
        }))(calculatePlaceholderDeductions(payslip.grossPayMinor)),
      );
    }
  });

  it("a_property_scoped_manager_cannot_approve_payroll", async () => {
    await expect(
      hr.approvePayroll(main.scoped, {
        organizationId: main.organization,
        period: "2026-10",
      }),
    ).rejects.toMatchObject({ reason: "payroll_needs_organization_reach" });

    expect(
      await count(
        `select count(*) as n from public.hr_payroll_runs
          where organization_id = $1::uuid and period = '2026-10'`,
        main.organization,
      ),
    ).toBe(0);
    // And there is nothing of the run for them to read either.
    expect(
      await hr.payrollSummary(main.scoped, main.organization, "2026-09"),
    ).toBeNull();
  });

  it("approving_payroll_twice_is_one_approval", async () => {
    const period = "2026-09";
    const again = await hr.approvePayroll(main.manager, {
      organizationId: main.organization,
      period,
    });
    expect(again.status).toBe("approved");
    expect(await outboxEvents(main.organization, period)).toBe(1);
    expect(
      await count(
        `select count(*) as n from audit.records
          where action = 'payroll_run.approved' and organization_id = $1::uuid
            and context ->> 'period' = $2`,
        main.organization,
        period,
      ),
    ).toBe(1);
  });

  it("two_approvals_at_once_make_one_run", async () => {
    const period = "2026-11";
    const [first, second] = await Promise.all([
      hr.approvePayroll(main.manager, {
        organizationId: main.organization,
        period,
      }),
      hr.approvePayroll(main.admin, {
        organizationId: main.organization,
        period,
      }),
    ]);

    expect(first.status).toBe("approved");
    expect(second.status).toBe("approved");
    expect(first.totalGrossMinor).toBe(second.totalGrossMinor);
    expect(
      await count(
        `select count(*) as n from public.hr_payroll_runs
          where organization_id = $1::uuid and period = $2`,
        main.organization,
        period,
      ),
    ).toBe(1);
    expect(await outboxEvents(main.organization, period)).toBe(1);
  });

  it("an_employee_hired_after_the_period_or_terminated_is_not_in_its_run", async () => {
    const late = await hr.registerEmployee(
      main.manager,
      anEmployee(main, { hiredOn: new Date("2030-01-15") }),
    );
    const run = await hr.approvePayroll(main.manager, {
      organizationId: main.organization,
      period: "2026-12",
    });
    expect(run.payslips.map((payslip) => payslip.employeeId)).not.toContain(
      late.id,
    );
    expect(run.payslips.map((payslip) => payslip.employeeId)).not.toContain(
      (await hr.employees(main.manager, main.organization)).find(
        (employee) => employee.status === "terminated",
      )?.id,
    );
  });

  it("a_run_in_two_currencies_is_refused_and_says_so", async () => {
    await hr.registerEmployee(currencies.manager, anEmployee(currencies));
    await hr.registerEmployee(
      currencies.manager,
      anEmployee(currencies, { currency: "EUR" }),
    );

    const preview = await hr.payrollSummary(
      currencies.manager,
      currencies.organization,
      "2026-09",
    );
    expect(preview).toMatchObject({
      status: "draft",
      currency: null,
      blocker: "mixed_currency",
    });
    await expect(
      hr.approvePayroll(currencies.manager, {
        organizationId: currencies.organization,
        period: "2026-09",
      }),
    ).rejects.toMatchObject({ reason: "payroll_mixed_currency" });
    expect(
      await count(
        `select count(*) as n from public.hr_payroll_runs where organization_id = $1::uuid`,
        currencies.organization,
      ),
    ).toBe(0);
  });

  it("a_currency_that_is_not_one_is_refused", async () => {
    await expect(
      hr.registerEmployee(
        currencies.manager,
        anEmployee(currencies, { currency: "XYZ" }),
      ),
    ).rejects.toMatchObject({ field: "currency" });
    await expect(
      hr.registerEmployee(
        currencies.manager,
        anEmployee(currencies, { currency: "try" }),
      ),
    ).rejects.toMatchObject({ field: "currency" });
  });

  it("an_amount_that_is_not_whole_minor_units_is_refused", async () => {
    await expect(
      hr.registerEmployee(
        currencies.manager,
        anEmployee(currencies, { grossPayMinor: 100.5 }),
      ),
    ).rejects.toMatchObject({ field: "grossPay" });
    await expect(
      hr.registerEmployee(
        currencies.manager,
        anEmployee(currencies, { grossPayMinor: -1 }),
      ),
    ).rejects.toMatchObject({ field: "grossPay" });
  });

  it("payroll_with_no_employees_is_refused", async () => {
    await expect(
      hr.approvePayroll(empty.manager, {
        organizationId: empty.organization,
        period: "2026-09",
      }),
    ).rejects.toMatchObject({ reason: "payroll_no_employees" });
    expect(
      await hr.payrollSummary(empty.manager, empty.organization, "2026-09"),
    ).toMatchObject({ status: "draft", blocker: "no_employees" });
  });

  it("an_approved_run_cannot_be_changed_by_the_application", async () => {
    const [run] = await owner.$queryRawUnsafe<{ id: string }[]>(
      `select id from public.hr_payroll_runs where organization_id = $1::uuid and period = '2026-09'`,
      main.organization,
    );
    // As ranza_app, the update policy matches nothing: no error, no change.
    const changed = await withOrganizationContext(
      prisma,
      { userId: main.manager },
      (tx) =>
        tx.$executeRawUnsafe(
          `update public.hr_payroll_runs set status = 'draft' where id = $1::uuid`,
          run!.id,
        ),
    );
    expect(changed).toBe(0);

    // As the table owner the policies say nothing, and the trigger does.
    await expect(
      owner.$executeRawUnsafe(
        `update public.hr_payroll_runs set total_gross_minor = 1 where id = $1::uuid`,
        run!.id,
      ),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      owner.$executeRawUnsafe(
        `update public.hr_payslips set net_pay_minor = net_pay_minor
          where payroll_run_id = $1::uuid`,
        run!.id,
      ),
    ).rejects.toThrow(/cannot be changed/);
  });
});

describe("a lapsed Organization", () => {
  it("a_lapsed_subscription_stops_payroll_and_registration", async () => {
    await hr.registerEmployee(lapsing.manager, anEmployee(lapsing));
    await owner.$executeRawUnsafe(
      `update public.subscriptions set status = 'suspended' where organization_id = $1::uuid`,
      lapsing.organization,
    );
    try {
      await expect(
        hr.registerEmployee(lapsing.manager, anEmployee(lapsing)),
      ).rejects.toBeInstanceOf(HrRefusedError);
      await expect(
        hr.approvePayroll(lapsing.manager, {
          organizationId: lapsing.organization,
          period: "2026-09",
        }),
      ).rejects.toMatchObject({ reason: "not_permitted" });
      expect(
        await count(
          `select count(*) as n from public.hr_payroll_runs where organization_id = $1::uuid`,
          lapsing.organization,
        ),
      ).toBe(0);
    } finally {
      await owner.$executeRawUnsafe(
        `update public.subscriptions set status = 'active' where organization_id = $1::uuid`,
        lapsing.organization,
      );
    }

    // Past due is a grace period (ADR 0040), not a lapse.
    await owner.$executeRawUnsafe(
      `update public.subscriptions set status = 'past_due' where organization_id = $1::uuid`,
      lapsing.organization,
    );
    const record = await hr.registerEmployee(
      lapsing.manager,
      anEmployee(lapsing),
    );
    expect(record.status).toBe("active");
  });
});
