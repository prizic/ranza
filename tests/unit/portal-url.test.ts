import { describe, expect, it } from "vitest";
import { portalUrl } from "../browser/portal-url";

/**
 * The browser tests start the Portal on the port its address names. An address
 * with none used to start it on none (RANZ-47).
 */
describe("where the browser tests find the Portal", () => {
  it("is the Portal's own port when nothing is configured", () => {
    expect(portalUrl(undefined)).toBe("http://localhost:3001");
  });

  it("keeps a port that is named", () => {
    expect(portalUrl("http://localhost:55584")).toBe("http://localhost:55584");
  });

  it("gives an address with no port the Portal's own, not the scheme's", () => {
    expect(portalUrl("http://localhost")).toBe("http://localhost:3001");
    expect(portalUrl("http://127.0.0.1/")).toBe("http://127.0.0.1:3001");
  });
});
