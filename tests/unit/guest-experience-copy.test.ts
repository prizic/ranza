/**
 * One word per concept across the request screens (HOUSEKEEPING-13).
 *
 * Guest Experience and Maintenance are siblings: a person who starts a guest
 * request and then a fault should not meet "Start Working" on one and
 * "In progress" on the other, nor "New Request" beside "New request". These
 * read the catalogue, because that is where a second spelling comes from.
 */
import { describe, expect, it } from "vitest";
import { messages } from "../../apps/operator-workspace/src/messages";

const LOCALES = ["en", "tr"] as const;

describe("the request screens use one word per concept", () => {
  it("names the same state and the same action the same way", () => {
    const guest = messages.en.guestExperience;
    const fault = messages.en.maintenance;

    expect(guest.statuses.in_progress).toBe(fault.states.in_progress);
    expect(guest.markInProgress).toBe("Start");
    expect(guest.newRequest).toBe(fault.newRequest);
    expect(guest.createDialogTitle).toBe(fault.newRequest);
  });

  it("agrees in Turkish too", () => {
    const guest = messages.tr.guestExperience;
    const fault = messages.tr.maintenance;

    expect(guest.statuses.in_progress).toBe(fault.states.in_progress);
    expect(guest.newRequest).toBe(fault.newRequest);
    expect(guest.createDialogTitle).toBe(fault.newRequest);
  });

  for (const locale of LOCALES) {
    it(`writes the labels in sentence case, not Title Case (${locale})`, () => {
      const guest = messages[locale].guestExperience;
      const labels = [
        guest.newRequest,
        guest.allRequests,
        guest.openRequests,
        guest.assignee,
        guest.reportedAt,
        guest.resolvedAt,
        guest.cancelReason,
        guest.resolutionNotes,
        guest.createDialogTitle,
        guest.submit,
        guest.markInProgress,
        guest.reopen,
        guest.categories.front_desk,
        guest.statuses.in_progress,
        guest.statuses.cancelled,
      ];
      for (const label of labels) {
        const later = label.split(" ").slice(1);
        expect(
          later.every((word) => word === word.toLocaleLowerCase(locale)),
          `"${label}" capitalises a word that is not the first`,
        ).toBe(true);
      }
    });
  }
});
