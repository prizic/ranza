import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountMenu, DropdownMenuItem } from "../../packages/ui/src";

/**
 * The account control is a menu only when it has something to offer. The
 * Portal's account has nothing yet, and a button announced as a menu that opens
 * onto no items is a dead end for a screen-reader user.
 */
describe("AccountMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("is a menu button when the account offers something", () => {
    render(
      <AccountMenu
        email="deniz@example.test"
        label="Account"
        locale="en"
        name="deniz@example.test"
      >
        <DropdownMenuItem>Security</DropdownMenuItem>
      </AccountMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Account" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("says who is signed in, and offers no menu, when there is nothing in it", () => {
    render(
      <AccountMenu
        email="deniz@example.test"
        label="Account"
        locale="en"
        name="deniz@example.test"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Account: deniz@example.test")).toBeDefined();
  });

  it("capitalises the initials by the page's language", () => {
    const { rerender } = render(
      <AccountMenu
        email="ines@example.test"
        label="Account"
        locale="en"
        name="ines@example.test"
      />,
    );
    expect(screen.getByText("IN")).toBeDefined();

    rerender(
      <AccountMenu
        email="ines@example.test"
        label="Account"
        locale="tr"
        name="ines@example.test"
      />,
    );
    expect(screen.getByText("İN")).toBeDefined();
  });
});
