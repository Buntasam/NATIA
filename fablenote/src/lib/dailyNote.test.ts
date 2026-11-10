import { describe, expect, it } from "vitest";
import { dayTitle, longDay } from "./dailyNote";

describe("note du jour", () => {
  it("titre AAAA-MM-JJ en heure locale", () => {
    expect(dayTitle(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("date en toutes lettres, avec majuscule", () => {
    expect(longDay(new Date(2026, 10, 10), "fr-FR")).toBe("Mardi 10 novembre 2026");
    expect(longDay(new Date(2026, 10, 10), "en-US")).toBe("Tuesday, November 10, 2026");
  });
});
