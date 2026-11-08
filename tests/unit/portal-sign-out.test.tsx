/**
 * A Resident can end their own session (audit 2026-11-07, C-01).
 *
 * The avatar in the Portal's bar looked like an account menu and opened
 * nothing, so on a dormitory's shared phone the next person was already signed
 * in as the last. The item is the Workspace's SIGN-01, for the Portal's auth
 * route.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "../../packages/ui/src";
import { supportedLocales } from "../../packages/i18n/src";
import { messages } from "../../apps/guest-portal/src/messages";
import { SignOutItem } from "../../apps/guest-portal/src/app/[locale]/(portal)/sign-out-item";

const fetchMock = vi.fn();
const assign = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  assign.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { ...window.location, assign });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open() {
  render(
    <AccountMenu
      email="deniz@example.test"
      label="Account"
      locale="en"
      name="Deniz Kaya"
    >
      <SignOutItem
        failedLabel="Could not sign out"
        label="Sign out"
        signInHref="/en/sign-in"
        workingLabel="Signing out"
      />
    </AccountMenu>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), {
    key: "Enter",
  });
}

describe("the Portal's account menu", () => {
  it("offers Sign out, which ends the session on the server and leaves for sign-in", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    open();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/en/sign-in"));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/auth/sign-out");
  });

  it("stays signed in and says so when the server did not end the session", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    open();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    expect(
      await screen.findByRole("menuitem", { name: "Could not sign out" }),
    ).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it("stays signed in when nobody answered", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    open();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    expect(
      await screen.findByRole("menuitem", { name: "Could not sign out" }),
    ).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it("has words for it in every language", () => {
    for (const locale of supportedLocales) {
      const say = messages[locale];
      expect(say.signOut.length).toBeGreaterThan(0);
      expect(say.signingOut.length).toBeGreaterThan(0);
      expect(say.signOutFailed.length).toBeGreaterThan(0);
    }
  });
});
