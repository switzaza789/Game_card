import { describe, it, expect } from "vitest";
import { getCardArtwork, getCardIds, getArtworkEntry, ARTWORK_PLACEHOLDER } from "./cardArtwork";

const ALL_CARD_IDS = [
  "A001", "A002", "A003", "A004", "A005", "A006", "A007", "A008",
  "S001", "S002", "S003", "S004", "S005", "S006",
  "W001", "W002", "W003", "W004", "W005",
  "X001", "X002", "X003", "X004", "X005",
];

const ALL_WITH_ARTWORK = ALL_CARD_IDS;

describe("cardArtwork", () => {
  it("has exactly 24 Card IDs in the lookup", () => {
    expect(getCardIds().sort()).toEqual([...ALL_CARD_IDS].sort());
  });

  it("every card ID has an artwork entry", () => {
    for (const id of ALL_CARD_IDS) {
      expect(getArtworkEntry(id)).toBeDefined();
    }
  });

  it("all 24 Card IDs resolve to Thai artwork", () => {
    for (const id of ALL_WITH_ARTWORK) {
      const path = getCardArtwork(id, "th");
      expect(path).not.toBeNull();
      expect(path).not.toBe(ARTWORK_PLACEHOLDER);
      expect(path).toMatch(/^\/Card\//);
      expect(path).toMatch(/-th\.\w+$/);
    }
  });

  it("all 24 Card IDs resolve to English artwork", () => {
    for (const id of ALL_WITH_ARTWORK) {
      const path = getCardArtwork(id, "en");
      expect(path).not.toBeNull();
      expect(path).not.toBe(ARTWORK_PLACEHOLDER);
      expect(path).toMatch(/^\/Card\//);
      expect(path).toMatch(/-en\.\w+$/);
    }
  });

  it("W001 now resolves to artwork (not fallback)", () => {
    expect(getCardArtwork("W001", "th")).not.toBe(ARTWORK_PLACEHOLDER);
    expect(getCardArtwork("W001", "en")).not.toBe(ARTWORK_PLACEHOLDER);
    expect(getCardArtwork("W001", "th")).toMatch(/-th\.\w+$/);
    expect(getCardArtwork("W001", "en")).toMatch(/-en\.\w+$/);
  });

  it("unknown Card ID resolves to fallback", () => {
    expect(getCardArtwork("UNKNOWN", "th")).toBe(ARTWORK_PLACEHOLDER);
    expect(getCardArtwork("UNKNOWN", "en")).toBe(ARTWORK_PLACEHOLDER);
    expect(getCardArtwork("Z999", "th")).toBe(ARTWORK_PLACEHOLDER);
  });

  it("no duplicate artwork paths across all entries", () => {
    const paths = new Set<string>();
    for (const id of ALL_CARD_IDS) {
      const entry = getArtworkEntry(id);
      if (!entry) continue;
      for (const locale of ["th", "en"] as const) {
        const p = entry[locale];
        if (p) {
          expect(paths.has(p)).toBe(false);
          paths.add(p);
        }
      }
    }
    expect(paths.size).toBe(48);
  });

  it("every non-null path starts with /Card/", () => {
    for (const id of ALL_CARD_IDS) {
      const entry = getArtworkEntry(id);
      if (!entry) continue;
      for (const locale of ["th", "en"] as const) {
        const p = entry[locale];
        if (p) {
          expect(p).toMatch(/^\/Card\//);
        }
      }
    }
  });

  it("locale switching does not mutate the artwork map", () => {
    const first = getCardArtwork("A001", "th");
    const second = getCardArtwork("A001", "en");
    const third = getCardArtwork("A001", "th");
    expect(first).toBe(third);
    expect(first).not.toBe(second);
  });
});
