import { describe, expect, it } from "vitest";

import {
  createBillingSnapshot,
  parseBedDraft,
  parseRoomDraft,
  summarizeBillableBeds,
} from "../../packages/domain/src/capacity";

describe("Billable Bed summary", () => {
  it("counts available non-archived beds in active Branches whether occupied or vacant", () => {
    expect(
      summarizeBillableBeds([
        {
          branchId: "women",
          branchName: "Women Residence",
          branchStatus: "active",
          beds: [
            { available: true, occupied: true, status: "active" },
            { available: true, occupied: false, status: "active" },
            { available: false, occupied: false, status: "active" },
            { available: true, occupied: false, status: "archived" },
          ],
        },
        {
          branchId: "men",
          branchName: "Men Residence",
          branchStatus: "archived",
          beds: [{ available: true, occupied: false, status: "active" }],
        },
      ]),
    ).toEqual({
      branches: [
        { branchId: "women", branchName: "Women Residence", billableBeds: 2 },
        { branchId: "men", branchName: "Men Residence", billableBeds: 0 },
      ],
      totalBillableBeds: 2,
    });
  });
});

describe("capacity input", () => {
  it("normalizes room and bed labels and rejects empty labels", () => {
    expect(parseRoomDraft({ label: "  A-101 " })).toEqual({ label: "A-101" });
    expect(parseBedDraft({ available: true, label: "  2 " })).toEqual({
      available: true,
      label: "2",
    });
    expect(() => parseRoomDraft({ label: " " })).toThrow("label");
    expect(() => parseBedDraft({ available: "yes", label: "1" })).toThrow(
      "available",
    );
  });
});

describe("billing snapshots", () => {
  it("copies the Branch breakdown so later capacity changes cannot mutate the period", () => {
    const live = {
      branches: [
        { branchId: "women", branchName: "Women Residence", billableBeds: 2 },
      ],
      totalBillableBeds: 2,
    };

    const snapshot = createBillingSnapshot(live);
    live.branches[0]!.billableBeds = 40;

    expect(snapshot).toEqual({
      branchBreakdown: [
        { branchId: "women", branchName: "Women Residence", billableBeds: 2 },
      ],
      billableBeds: 2,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.branchBreakdown)).toBe(true);
  });
});
