import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../packages/db/src";
import {
  calculateDeductions,
  createHrModule,
  HR_CAPABILITY,
} from "../../packages/ranza/hr/src";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

describe("HR Module Unit Tests (HR-S1-*)", () => {
  describe("Domain Contracts & Calculations", () => {
    it("exports capability reference matching blueprint 5.11", () => {
      expect(HR_CAPABILITY).toEqual({
        moduleKey: "human_resources",
        capabilityKey: "staff_administration",
      });
    });

    it("calculates accurate Turkish payroll deductions according to blueprint and mockup", () => {
      // Test gross of 35,000 TRY
      const gross = 35000;
      const { sgk, tax, stamp, net } = calculateDeductions(gross);

      // SGK: 15% of 35000 = 5250
      expect(sgk).toBe(5250);

      // Taxable: 35000 - 5250 = 29750
      // Tax: 15% of 29750 = 4462.50
      expect(tax).toBe(4462.5);

      // Stamp duty: 0.759% of 35000 = 265.65
      expect(stamp).toBe(265.65);

      // Net: 35000 - 5250 - 4462.50 - 265.65 = 25021.85
      expect(net).toBe(25021.85);
    });

    it("handles zero gross pay safely", () => {
      const { sgk, tax, stamp, net } = calculateDeductions(0);
      expect(sgk).toBe(0);
      expect(tax).toBe(0);
      expect(stamp).toBe(0);
      expect(net).toBe(0);
    });
  });

  describe("Module Operations & Tenant Context", () => {
    it("registers an employee via Prisma within tenant context", async () => {
      const now = new Date();
      const mockDb: any = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (run: (c: any) => Promise<any>) =>
          run(mockDb),
        ),
        hrEmployee: {
          create: vi.fn().mockResolvedValue({
            id: "emp-1",
            organizationId: "org-1",
            propertyId: "prop-1",
            userId: null,
            firstName: "Ahmet",
            lastName: "Yılmaz",
            email: "ahmet@test.com",
            phone: "+905551234567",
            department: "Housekeeping",
            position: "Housekeeper",
            contractType: "full_time",
            hiredOn: now,
            grossPay: 30000,
            currency: "TRY",
            status: "active",
            bankName: "Ziraat",
            iban: "TR123456",
            createdAt: now,
            updatedAt: now,
          }),
        },
      };

      const hr = createHrModule({ db: mockDb as unknown as PrismaClient });

      const emp = await hr.registerEmployee(TEST_USER_ID, {
        organizationId: "org-1",
        propertyId: "prop-1",
        firstName: "Ahmet",
        lastName: "Yılmaz",
        email: "ahmet@test.com",
        department: "Housekeeping",
        position: "Housekeeper",
        grossPay: 30000,
      });

      expect(emp.fullName).toBe("Ahmet Yılmaz");
      expect(emp.status).toBe("active");
      expect(mockDb.hrEmployee.create).toHaveBeenCalled();
    });

    it("detects leave clash among colleagues in the same department", async () => {
      const mockDb: any = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (run: (c: any) => Promise<any>) =>
          run(mockDb),
        ),
        hrLeaveRequest: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "leave-1",
              organizationId: "org-1",
              employeeId: "emp-1",
              employee: {
                firstName: "Mert",
                lastName: "Polat",
                department: "Front desk",
                position: "Agent",
              },
              leaveType: "annual",
              startsOn: new Date("2026-10-15"),
              endsOn: new Date("2026-10-20"),
              status: "pending",
              notes: null,
            },
            {
              id: "leave-2",
              organizationId: "org-1",
              employeeId: "emp-2",
              employee: {
                firstName: "Sibel",
                lastName: "Koç",
                department: "Front desk",
                position: "Supervisor",
              },
              leaveType: "annual",
              startsOn: new Date("2026-10-14"),
              endsOn: new Date("2026-10-18"),
              status: "approved",
              notes: null,
            },
          ]),
        },
      };

      const hr = createHrModule({ db: mockDb as unknown as PrismaClient });
      const requests = await hr.leaveRequests(TEST_USER_ID, "org-1");

      expect(requests).toHaveLength(2);
      // leave-1 is in the same department ('Front desk') and overlaps with approved leave-2: clash must be true
      expect(requests[0]?.clash).toBe(true);
      expect(requests[1]?.clash).toBe(false);
    });

    it("approves payroll and calculates payslip breakdown accurately", async () => {
      const mockDb: any = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (run: (c: any) => Promise<any>) =>
          run(mockDb),
        ),
        hrEmployee: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "emp-1",
              firstName: "Ahmet",
              lastName: "Yılmaz",
              department: "Front desk",
              position: "Agent",
              grossPay: 35000,
              iban: "TR4417",
            },
          ]),
        },
        hrPayrollRun: {
          upsert: vi.fn().mockResolvedValue({
            id: "run-1",
            organizationId: "org-1",
            period: "2026-10",
            totalGross: 35000,
            totalNet: 25021.85,
            status: "approved",
            approvedAt: new Date(),
          }),
          findUnique: vi.fn().mockResolvedValue({
            id: "run-1",
            organizationId: "org-1",
            period: "2026-10",
            totalGross: 35000,
            totalNet: 25021.85,
            status: "approved",
            approvedAt: new Date(),
            payslips: [
              {
                id: "slip-1",
                employeeId: "emp-1",
                grossPay: 35000,
                socialSecurityDeduction: 5250,
                taxDeduction: 4462.5,
                stampDuty: 265.65,
                netPay: 25021.85,
                iban: "TR4417",
                employee: {
                  firstName: "Ahmet",
                  lastName: "Yılmaz",
                  department: "Front desk",
                  position: "Agent",
                },
              },
            ],
          }),
        },
        hrPayslip: {
          upsert: vi.fn().mockResolvedValue({ id: "slip-1" }),
        },
      };

      const hr = createHrModule({ db: mockDb as unknown as PrismaClient });
      const summary = await hr.approvePayroll(TEST_USER_ID, "org-1", "2026-10");

      expect(summary.status).toBe("approved");
      expect(summary.totalGross).toBe(35000);
      expect(summary.totalNet).toBe(25021.85);
      expect(summary.payslips).toHaveLength(1);
      expect(summary.payslips[0]?.netPay).toBe(25021.85);
    });
  });
});
