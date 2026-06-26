import { describe, expect, it } from "vitest";
import { en } from "./en";
import type { Locale } from "./types";
import { cardTexts, getCardText, getLocalizedCard, localeDictionary, normalizeLocale, t } from "./index";
import { th } from "./th";

describe("i18n foundation", () => {
  it("keeps Thai and English key coverage identical", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("falls back to Thai for malformed locale values", () => {
    expect(normalizeLocale("de")).toBe("th");
    expect(normalizeLocale(null)).toBe("th");
  });

  it("translates the shared root labels", () => {
    expect(t("th", "menu.localPvp")).toBe("Local PvP");
    expect(t("en", "menu.continue")).toBe("Continue");
    expect(localeDictionary.en["phase.ACTION"]).toBe("ACTION");
  });

  it("provides the localized hidden-card label in both locales", () => {
    expect(t("th", "label.hiddenCard")).toBe("การ์ดที่ซ่อนอยู่");
    expect(t("en", "label.hiddenCard")).toBe("Hidden card");
  });

  it("provides localized playability state labels in both locales", () => {
    expect(t("th", "playability.playableNow")).toBe("ใช้ได้ทันที");
    expect(t("en", "playability.playableNow")).toBe("Playable now");
    expect(t("th", "playability.needsTarget")).toBe("ต้องเลือกเป้าหมาย");
    expect(t("en", "playability.needsTarget")).toBe("Choose a target");
    expect(t("th", "playability.partialEffect")).toBe("ใช้ได้แบบผลอ่อน");
    expect(t("en", "playability.partialEffect")).toBe("Playable with reduced effect");
    expect(t("th", "playability.notPlayable")).toBe("ยังใช้ไม่ได้");
    expect(t("en", "playability.notPlayable")).toBe("Not playable yet");
  });
});

/* ------------------------------------------------------------------ */
/*  Card localization                                                  */
/* ------------------------------------------------------------------ */

const ALL_CARD_IDS = [
  "A001", "A002", "A003", "A004", "A005", "A006", "A007", "A008",
  "S001", "S002", "S003", "S004", "S005", "S006",
  "W001", "W002", "W003", "W004", "W005",
  "X001", "X002", "X003", "X004", "X005",
] as const;

const CORE_FIELDS = [
  "name", "type", "description", "ability",
  "validUse", "target", "effectSummary",
] as const;

const SUPPORT_IDS = ALL_CARD_IDS.filter((id) => id.startsWith("S"));
const WEAKNESS_IDS = ALL_CARD_IDS.filter((id) => id.startsWith("W"));
const SPECIAL_IDS = ALL_CARD_IDS.filter((id) => id.startsWith("X"));

describe("card localization data layer", () => {
  /* coverage — all 24 card IDs exist */
  it("has exactly 24 card entries", () => {
    const keys = Object.keys(cardTexts).sort();
    expect(keys).toEqual([...ALL_CARD_IDS].sort());
    expect(keys).toHaveLength(24);
  });

  it("covers every known card ID", () => {
    for (const id of ALL_CARD_IDS) {
      expect(cardTexts).toHaveProperty(id);
    }
  });

  /* no missing Thai / English entries */
  it("every card has Thai text", () => {
    for (const id of ALL_CARD_IDS) {
      expect(cardTexts[id]).toHaveProperty("th");
    }
  });

  it("every card has English text", () => {
    for (const id of ALL_CARD_IDS) {
      expect(cardTexts[id]).toHaveProperty("en");
    }
  });

  /* required fields exist for every card in both locales */
  for (const id of ALL_CARD_IDS) {
    for (const locale of ["th", "en"] as const) {
      it(`${id} has core fields in ${locale}`, () => {
        const entry = cardTexts[id][locale];
        for (const field of CORE_FIELDS) {
          expect(entry).toHaveProperty(field);
          expect(typeof entry[field]).toBe("string");
        }
      });
    }
  }

  /* Support-specific fields */
  it("all Support cards have supportCompatibility, levelUp, additionalEffect", () => {
    for (const id of SUPPORT_IDS) {
      const entry = cardTexts[id].th;
      expect(entry.supportCompatibility).toBeDefined();
      expect(typeof entry.supportCompatibility).toBe("string");
      expect(entry.levelUp).toBeDefined();
      expect(typeof entry.levelUp).toBe("string");
      expect(entry.additionalEffect).toBeDefined();
      expect(typeof entry.additionalEffect).toBe("string");
    }
  });

  /* Weakness full/reduced effect fields */
  it("all Weakness cards have weaknessTarget, fullEffect, offTargetEffect", () => {
    for (const id of WEAKNESS_IDS) {
      const entry = cardTexts[id].th;
      expect(entry.weaknessTarget).toBeDefined();
      expect(typeof entry.weaknessTarget).toBe("string");
      expect(entry.fullEffect).toBeDefined();
      expect(typeof entry.fullEffect).toBe("string");
      expect(entry.offTargetEffect).toBeDefined();
      expect(typeof entry.offTargetEffect).toBe("string");
    }
  });

  /* Special target/effect fields */
  it("all Special cards have immediateEffect and duration", () => {
    for (const id of SPECIAL_IDS) {
      const entry = cardTexts[id].th;
      expect(entry.immediateEffect).toBeDefined();
      expect(typeof entry.immediateEffect).toBe("string");
      expect(entry.duration).toBeDefined();
      expect(typeof entry.duration).toBe("string");
    }
  });

  /* lookup returns correct locale */
  it("getLocalizedCard returns Thai for th locale", () => {
    const result = getLocalizedCard("A001", "th");
    expect(result.name).toBe("สุนัขจอมซน");
    expect(result.type).toBe("Animal");
  });

  it("weaknessTarget is Thai in th locale and English in en", () => {
    expect(getLocalizedCard("W001", "th").weaknessTarget).toBe("สุนัข");
    expect(getLocalizedCard("W001", "en").weaknessTarget).toBe("Dog");
  });

  it("getLocalizedCard returns English for en locale", () => {
    const result = getLocalizedCard("A001", "en");
    expect(result.name).toBe("Playful Dog");
    expect(result.type).toBe("Animal");
  });

  it("getCardText (deprecated) still works", () => {
    const result = getCardText("S001", "th");
    expect(result.name).toBe("กระดูกแสนอร่อย");
  });

  /* malformed locale falls back safely */
  it("falls back to Thai for unknown locale", () => {
    const result = getLocalizedCard("A002", "fr" as Locale);
    expect(result.name).toBe("แมวขี้สงสัย");
  });

  /* unknown card ID fallback */
  it("returns fallback for unknown card ID", () => {
    const result = getLocalizedCard("Z999", "th");
    expect(result.name).toContain("Unknown");
    expect(result.type).toBe("Unknown");
  });

  it("returns fallback for unknown card ID with en locale", () => {
    const result = getLocalizedCard("Z999", "en");
    expect(result.name).toContain("Unknown");
  });

  /* gameplay definitions remain unchanged */
  it("does not alter authoritative card definitions", async () => {
    const { cardsSeed } = await import("../data/cardsSeed");
    for (const card of cardsSeed) {
      expect(card.card_id).toBeDefined();
      expect(card.category).toBeDefined();
      expect(card.logic_key).toBeDefined();
    }
  });
});
