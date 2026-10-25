/**
 * What a time zone is called to a reader of each language (CONFIGURATION-14).
 *
 * The country and the offset were already in the reader's language; the city is
 * now too where the table has it, and where it does not the zone keeps the
 * Latin city it always had rather than a guess.
 */
import { describe, expect, it } from "vitest";
import {
  localizedZoneCity,
  timezoneLabel,
} from "../../apps/operator-workspace/src/features/configuration/options";
import { TIME_ZONE_CITIES } from "../../apps/operator-workspace/src/features/configuration/time-zone-cities";

describe("a time zone's label", () => {
  it("names the city and the country in the reader's own language, with Arabic's own comma", () => {
    expect(timezoneLabel("Europe/Istanbul", "en")).toBe("Istanbul, Türkiye");
    expect(timezoneLabel("Europe/Istanbul", "tr")).toBe("İstanbul, Türkiye");
    expect(timezoneLabel("Europe/Istanbul", "ar")).toBe("إسطنبول، تركيا");
  });

  it("keeps the Latin city for a zone the table does not hold, rather than guessing", () => {
    const zone = "America/Port_of_Spain";
    expect(TIME_ZONE_CITIES[zone]).toBeUndefined();
    expect(localizedZoneCity(zone, "ar")).toBe("Port of Spain");
    expect(localizedZoneCity(zone, "tr")).toBe("Port of Spain");
  });

  it("never offers an empty name or a zone the runtime does not know", () => {
    for (const [zone, names] of Object.entries(TIME_ZONE_CITIES)) {
      expect(names.ar.trim(), zone).not.toBe("");
      expect(names.tr.trim(), zone).not.toBe("");
      expect(
        () => new Intl.DateTimeFormat("en", { timeZone: zone }),
        zone,
      ).not.toThrow();
    }
  });
});
