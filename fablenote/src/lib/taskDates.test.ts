import { describe, expect, it } from "vitest";
import { dueOf, dueStatus, resolveDueShortcut, setDue, withoutDue } from "./taskDates";

// Mardi 10 novembre 2026, 15 h
const now = new Date(2026, 10, 10, 15, 0);

describe("échéances des tâches", () => {
  it("lit l'échéance écrite avec 📅 ou @", () => {
    expect(dueOf("Appeler Léa 📅 2026-11-12")).toBe("2026-11-12");
    expect(dueOf("Rendre le rapport @2026-12-01")).toBe("2026-12-01");
    expect(dueOf("Sans date")).toBeNull();
    expect(withoutDue("Appeler Léa 📅 2026-11-12 vite")).toBe("Appeler Léa vite");
  });
  it("transforme les raccourcis en date fixe", () => {
    expect(resolveDueShortcut("Pain @demain", now)).toBe("Pain 📅 2026-11-11");
    expect(resolveDueShortcut("Call @tomorrow", now)).toBe("Call 📅 2026-11-11");
    expect(resolveDueShortcut("Réunion @vendredi", now)).toBe("Réunion 📅 2026-11-13");
    expect(resolveDueShortcut("Point @mardi", now)).toBe("Point 📅 2026-11-17");
    expect(resolveDueShortcut("Garage @aujourd'hui", now)).toBe("Garage 📅 2026-11-10");
    expect(resolveDueShortcut("Impôts @15/11", now)).toBe("Impôts 📅 2026-11-15");
    expect(resolveDueShortcut("Vœux @05/01", now)).toBe("Vœux 📅 2027-01-05");
    expect(resolveDueShortcut("Écrire à @Paul", now)).toBe("Écrire à @Paul");
    expect(resolveDueShortcut("Date fausse @31/02", now)).toBe("Date fausse @31/02");
  });
  it("remplace une échéance existante", () => {
    expect(setDue("Pain 📅 2026-11-11", "2026-11-20")).toBe("Pain 📅 2026-11-20");
    expect(setDue("Pain 📅 2026-11-11", null)).toBe("Pain");
  });
  it("classe par urgence", () => {
    expect(dueStatus("2026-11-09", now)).toBe("overdue");
    expect(dueStatus("2026-11-10", now)).toBe("today");
    expect(dueStatus("2026-11-17", now)).toBe("week");
    expect(dueStatus("2026-11-18", now)).toBe("later");
    expect(dueStatus(null, now)).toBe("none");
  });
});
