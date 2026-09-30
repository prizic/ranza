import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../packages/db/src";
import {
  createGuestServicesModule,
  GUEST_SERVICES_CAPABILITY,
  GUEST_SERVICES_PERMISSIONS,
  SERVICE_REQUEST_CATEGORIES,
  SERVICE_REQUEST_PRIORITIES,
  SERVICE_REQUEST_STATUSES,
} from "../../packages/ranza/guest-services/src";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

describe("Guest Services Unit Tests (GX-S1-01 to GX-S1-18)", () => {
  describe("Domain Contracts & Capabilities", () => {
    it("exports capability reference matching blueprint 5.5", () => {
      expect(GUEST_SERVICES_CAPABILITY).toEqual({
        moduleKey: "guest_services",
        capabilityKey: "guest_experience",
      });
    });

    it("exports expected permissions", () => {
      expect(GUEST_SERVICES_PERMISSIONS).toEqual({
        createRequest: "guest_services.create_request",
        manageRequests: "guest_services.manage_requests",
      });
    });

    it("includes all defined categories, priorities, and statuses", () => {
      expect(SERVICE_REQUEST_CATEGORIES).toEqual([
        "housekeeping",
        "maintenance",
        "amenities",
        "front_desk",
        "other",
      ]);
      expect(SERVICE_REQUEST_PRIORITIES).toEqual([
        "low",
        "normal",
        "high",
        "urgent",
      ]);
      expect(SERVICE_REQUEST_STATUSES).toEqual([
        "new",
        "in_progress",
        "resolved",
        "cancelled",
      ]);
    });
  });

  describe("Module Operations & Input Validation", () => {
    it("creates a request through Prisma client", async () => {
      const now = new Date();
      const mockDb: any = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (run: (c: any) => Promise<any>) =>
          run(mockDb),
        ),
        $queryRaw: vi.fn().mockResolvedValue([{ id: "req-1" }]),
        serviceRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "req-1",
            number: 1,
            organizationId: "org-1",
            propertyId: "prop-1",
            title: "Extra towels for room 101",
            details: "Guest requested 2 bath towels",
            category: "housekeeping",
            priority: "high",
            status: "new",
            cancelReason: null,
            resolutionNotes: null,
            accommodationUnitId: "unit-1",
            stayId: null,
            guestId: null,
            assignedToUserId: null,
            reportedByUserId: "user-1",
            reportedAt: now,
            resolvedAt: null,
            createdAt: now,
            updatedAt: now,
            accommodationUnit: { name: "Room 101" },
            guest: null,
            assignedTo: null,
          }),
        },
      };

      const guestServices = createGuestServicesModule({
        db: mockDb as unknown as PrismaClient,
      });

      const request = await guestServices.createRequest(TEST_USER_ID, {
        organizationId: "org-1",
        propertyId: "prop-1",
        title: "Extra towels for room 101",
        category: "housekeeping",
        priority: "high",
        details: "Guest requested 2 bath towels",
        accommodationUnitId: "unit-1",
      });

      expect(request.id).toBe("req-1");
      expect(request.number).toBe(1);
      expect(request.title).toBe("Extra towels for room 101");
      expect(request.category).toBe("housekeeping");
      expect(request.priority).toBe("high");
      expect(request.status).toBe("new");
      expect(request.unitName).toBe("Room 101");
      expect(mockDb.$queryRaw).toHaveBeenCalledOnce();
      expect(mockDb.serviceRequest.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req-1" },
        }),
      );
    });

    it("lists requests at a property", async () => {
      const now = new Date();
      const mockDb: any = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (run: (c: any) => Promise<any>) =>
          run(mockDb),
        ),
        serviceRequest: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "req-1",
              number: 1,
              organizationId: "org-1",
              propertyId: "prop-1",
              title: "Broken AC",
              details: null,
              category: "maintenance",
              priority: "urgent",
              status: "in_progress",
              cancelReason: null,
              resolutionNotes: null,
              accommodationUnitId: null,
              stayId: null,
              guestId: null,
              assignedToUserId: null,
              reportedByUserId: null,
              reportedAt: now,
              resolvedAt: null,
              createdAt: now,
              updatedAt: now,
              accommodationUnit: null,
              guest: null,
              assignedTo: null,
            },
          ]),
        },
      };

      const guestServices = createGuestServicesModule({
        db: mockDb as unknown as PrismaClient,
      });
      const requests = await guestServices.requests(TEST_USER_ID, "prop-1");

      expect(requests).toHaveLength(1);
      expect(requests[0]?.id).toBe("req-1");
      expect(requests[0]?.priority).toBe("urgent");
      expect(mockDb.serviceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { propertyId: "prop-1" },
        }),
      );
    });

    it("updates request status and resolution notes", async () => {
      const now = new Date();
      const mockDb: any = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(1),
        $transaction: vi.fn(async (run: (c: any) => Promise<any>) =>
          run(mockDb),
        ),
        $queryRaw: vi.fn().mockResolvedValue([]),
        serviceRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "req-1",
            number: 1,
            organizationId: "org-1",
            propertyId: "prop-1",
            title: "Broken AC",
            details: null,
            category: "maintenance",
            priority: "urgent",
            status: "resolved",
            cancelReason: null,
            resolutionNotes: "Fixed capacitor",
            accommodationUnitId: null,
            stayId: null,
            guestId: null,
            assignedToUserId: null,
            reportedByUserId: null,
            reportedAt: now,
            resolvedAt: now,
            createdAt: now,
            updatedAt: now,
            accommodationUnit: null,
            guest: null,
            assignedTo: null,
          }),
        },
      };

      const guestServices = createGuestServicesModule({
        db: mockDb as unknown as PrismaClient,
      });
      const updated = await guestServices.updateRequest(TEST_USER_ID, "req-1", {
        status: "resolved",
        resolutionNotes: "Fixed capacitor",
      });

      expect(updated.status).toBe("resolved");
      expect(updated.resolutionNotes).toBe("Fixed capacitor");
      expect(mockDb.$queryRaw).toHaveBeenCalledOnce();
      expect(mockDb.serviceRequest.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "req-1" },
        }),
      );
    });
  });
});
