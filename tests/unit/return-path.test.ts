/**
 * Where signing in may send somebody (SIGN-02). A destination the sign-in page
 * will redirect to is one an attacker can put in a link, so everything but a
 * path inside this application, in the page's own language, is dropped.
 */
import { describe, expect, it } from "vitest";
import {
  safeReturnPath,
  signInHref,
} from "../../apps/operator-workspace/src/lib/return-path";

describe("safeReturnPath", () => {
  it("SIGN-02: keeps a path and its query under the page's language", () => {
    expect(safeReturnPath("/en/reservations?property=p-1", "en")).toBe(
      "/en/reservations?property=p-1",
    );
    expect(safeReturnPath("/ar/today", "ar")).toBe("/ar/today");
    expect(safeReturnPath("/en", "en")).toBe("/en");
  });

  it("SIGN-02: drops a path in another language", () => {
    expect(safeReturnPath("/tr/today", "en")).toBeNull();
  });

  it.each([
    ["another origin", "https://evil.example/en/today"],
    ["a protocol-relative address", "//evil.example/en/today"],
    ["a protocol-relative address that starts like a path", "/\\evil.example"],
    ["a backslash a browser reads as a slash", "/en\\..\\evil"],
    ["a path under no language", "/today"],
    ["a script", "javascript:alert(1)"],
    ["a path that climbs out of the language", "/en/../tr/today"],
    ["a path that climbs out to another host", "/en/..//evil.example"],
    ["a control character", "/en/today\r\nSet-Cookie: a=b"],
    ["a tab inside the path", "/en/\t/evil.example"],
    ["the sign-in page itself, which would loop", "/en/sign-in?next=/en/today"],
    ["the sign-in page below its own address", "/en/sign-in/"],
    ["something that is not a string", 42],
    ["nothing", undefined],
  ])("SIGN-02: drops %s", (_name, value) => {
    expect(safeReturnPath(value, "en")).toBeNull();
  });

  it("SIGN-02: drops an address longer than any page's", () => {
    expect(safeReturnPath(`/en/${"a".repeat(2100)}`, "en")).toBeNull();
  });

  it("SIGN-02: a path that only looks like it is under the language is not", () => {
    expect(safeReturnPath("/english/today", "en")).toBeNull();
  });
});

describe("signInHref", () => {
  it("SIGN-02: asks to come back to where the person was going", () => {
    expect(signInHref("en", "/en/reservations?property=p-1")).toBe(
      "/en/sign-in?next=%2Fen%2Freservations%3Fproperty%3Dp-1",
    );
  });

  it("SIGN-02: asks for nothing it may not have", () => {
    expect(signInHref("en", "https://evil.example")).toBe("/en/sign-in");
    expect(signInHref("en", undefined)).toBe("/en/sign-in");
  });
});
