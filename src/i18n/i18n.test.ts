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

  it("provides localized status labels in both locales", () => {
    const codes = ["skipNextScore", "nextScoreMinus1", "tempWeaknessImmunity", "tempLevelDownImmunity", "removalShield", "utilityLock"] as const;
    for (const code of codes) {
      const thLabel = t("th", `status.${code}.label` as never);
      const enLabel = t("en", `status.${code}.label` as never);
      expect(thLabel).toBeTruthy();
      expect(enLabel).toBeTruthy();
      expect(thLabel.length).toBeGreaterThan(0);
      expect(enLabel.length).toBeGreaterThan(0);
      const thDesc = t("th", `status.${code}.description` as never);
      const enDesc = t("en", `status.${code}.description` as never);
      expect(thDesc).toBeTruthy();
      expect(enDesc).toBeTruthy();
      const thDur = t("th", `status.${code}.duration` as never);
      const enDur = t("en", `status.${code}.duration` as never);
      expect(thDur).toBeTruthy();
      expect(enDur).toBeTruthy();
    }
  });

  it("keeps Thai and English status key counts identical after adding status translations", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("provides localized invalid-use reasons in both locales", () => {
    const reasonKeys = [
      "undoNotAvailable", "undoWrongActor", "undoWrongTurn", "undoMatchFinished",
      "undoWrongPhase", "recycleFirstTurn", "recycleEmptyDeck", "recycleNoCard",
      "slotOccupied", "matchFinished", "wrongPlayer", "behindOnly",
      "quickSwapRequires", "quickSwapNotAnimal", "fallback"
    ];
    for (const key of reasonKeys) {
      const thVal = t("th", `playability.reason.${key}` as never);
      const enVal = t("en", `playability.reason.${key}` as never);
      expect(thVal).toBeTruthy();
      expect(thVal.length).toBeGreaterThan(0);
      expect(enVal).toBeTruthy();
      expect(enVal.length).toBeGreaterThan(0);
    }
  });

  it("does not contain raw translation keys in Thai values", () => {
    for (const value of Object.values(th)) {
      expect(value).not.toMatch(/^playability\.reason\./);
    }
  });

  it("does not contain raw translation keys in English values", () => {
    for (const value of Object.values(en)) {
      expect(value).not.toMatch(/^playability\.reason\./);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Action Log localization                                             */
  /* ------------------------------------------------------------------ */

  const LOG_KEYS = [
    "log.uses", "log.header", "log.noAction", "log.oldResult", "log.noDetails",
    "log.undone", "log.playedNoTarget", "log.cardPlayedSuccess",
    "log.animalEntered", "log.cardAttached", "log.levelChanged",
    "log.statusApplied", "log.statusRemoved", "log.cardMoved", "log.cardDrawn",
    "log.scoreChanged", "log.evolutionPoint", "log.evolved", "log.removalPrevented"
  ] as const;

  const LOG_ACTION_KEYS = [
    "log.action.weakness", "log.action.support", "log.action.protect",
    "log.action.stealScore", "log.action.returnToHand", "log.action.statusChange",
    "log.action.removeFromBoard", "log.action.drawCard", "log.action.evolution",
    "log.action.default"
  ] as const;

  const LOG_RESULT_KEYS = [
    "log.result.partialOffTarget", "log.result.partial", "log.result.prevented",
    "log.result.noEffect", "log.result.fullMatching", "log.result.full"
  ] as const;

  const LOG_OWNER_KEYS = [
    "log.owner.you", "log.owner.self", "log.owner.other"
  ] as const;

  it("has all log keys in Thai dictionary", () => {
    for (const key of [...LOG_KEYS, ...LOG_ACTION_KEYS, ...LOG_RESULT_KEYS, ...LOG_OWNER_KEYS]) {
      expect(th).toHaveProperty(key);
      expect(th[key].length).toBeGreaterThan(0);
    }
  });

  it("has all log keys in English dictionary", () => {
    for (const key of [...LOG_KEYS, ...LOG_ACTION_KEYS, ...LOG_RESULT_KEYS, ...LOG_OWNER_KEYS]) {
      expect(en).toHaveProperty(key);
      if (key !== "log.action.default") {
        expect(en[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("provides localized action log header in both locales", () => {
    const thHeader = t("th", "log.header", { turn: 1, player: "ผู้เล่น 1" });
    expect(thHeader).toContain("1");
    expect(thHeader).toContain("ผู้เล่น 1");
    const enHeader = t("en", "log.header", { turn: 1, player: "Player 1" });
    expect(enHeader).toContain("1");
    expect(enHeader).toContain("Player 1");
  });

  it("provides localized score changed in both locales", () => {
    const thScore = t("th", "log.scoreChanged", { player: "ผู้เล่น 1", from: 5, to: 7, delta: "+2" });
    expect(thScore).toContain("ผู้เล่น 1");
    expect(thScore).toContain("5");
    expect(thScore).toContain("7");
    expect(thScore).toContain("+2");
    const enScore = t("en", "log.scoreChanged", { player: "Player 1", from: 5, to: 7, delta: "+2" });
    expect(enScore).toContain("Player 1");
    expect(enScore).toContain("5");
    expect(enScore).toContain("7");
    expect(enScore).toContain("+2");
  });

  it("provides localized evolution event in both locales", () => {
    const thEvo = t("th", "log.evolved", { level: 3 });
    expect(thEvo).toContain("3");
    const enEvo = t("en", "log.evolved", { level: 3 });
    expect(enEvo).toContain("3");
  });

  it("provides localized undo in both locales", () => {
    const thUndo = t("th", "log.undone", { summary: "played a card" });
    expect(thUndo).toContain("ย้อนกลับ");
    const enUndo = t("en", "log.undone", { summary: "played a card" });
    expect(enUndo).toContain("undid");
  });

  it("provides localized unknown-event fallback in both locales", () => {
    expect(t("th", "log.oldResult", { result: "UNKNOWN" })).toBe("ผลลัพธ์เก่า: UNKNOWN");
    expect(t("en", "log.oldResult", { result: "UNKNOWN" })).toBe("Old result: UNKNOWN");
  });

  it("provides localized owner suffixes in both locales", () => {
    expect(t("th", "log.owner.you")).toBeTruthy();
    expect(t("en", "log.owner.you")).toBeTruthy();
    expect(t("th", "log.owner.self")).toBeTruthy();
    expect(t("en", "log.owner.self")).toBeTruthy();
    const thOther = t("th", "log.owner.other", { player: "Bot" });
    expect(thOther).toContain("Bot");
    const enOther = t("en", "log.owner.other", { player: "Bot" });
    expect(enOther).toContain("Bot");
  });

  /* ------------------------------------------------------------------ */
  /*  Effect Preview localization                                        */
  /* ------------------------------------------------------------------ */

  const PREVIEW_KEYS = [
    "preview.category.animal", "preview.category.support", "preview.category.weakness",
    "preview.category.stealScore", "preview.category.returnToHand", "preview.category.protect",
    "preview.category.statusChange", "preview.type", "preview.notPlayable", "preview.needsTarget",
    "preview.partialEffect", "preview.animal.place", "preview.animal.usesAction",
    "preview.support.target", "preview.support.levelUp", "preview.support.additionalEffect",
    "preview.weakness.target", "preview.weakness.fullEffect", "preview.weakness.offTarget",
    "preview.weakness.mayBeBlocked", "preview.usesUtility",
    "preview.x001.target", "preview.x001.effect",
    "preview.x002.effect", "preview.x002.reactionOnly",
    "preview.x003.target", "preview.x003.effect", "preview.x003.evolutionLoss",
    "preview.x004.target", "preview.x004.effect", "preview.x004.mayBeBlocked",
    "preview.x005.effect"
  ];

  it("has all preview keys in Thai dictionary", () => {
    for (const key of PREVIEW_KEYS) {
      expect(th).toHaveProperty(key);
      expect((th as Record<string, string>)[key].length).toBeGreaterThan(0);
    }
  });

  it("has all preview keys in English dictionary", () => {
    for (const key of PREVIEW_KEYS) {
      expect(en).toHaveProperty(key);
      expect((en as Record<string, string>)[key].length).toBeGreaterThan(0);
    }
  });

  it("provides localized preview type label in both locales", () => {
    const thType = t("th", "preview.type", { category: "ลงสัตว์" });
    expect(thType).toContain("ลงสัตว์");
    const enType = t("en", "preview.type", { category: "Play Animal" });
    expect(enType).toContain("Play Animal");
  });

  it("provides localized preview animal placement in both locales", () => {
    expect(t("th", "preview.animal.place")).toBe("ลง Animal ที่ Level 1");
    expect(t("en", "preview.animal.place")).toContain("Level 1");
  });

  it("provides localized preview support level-up in both locales", () => {
    expect(t("th", "preview.support.levelUp")).toContain("เพิ่ม Level");
    expect(t("en", "preview.support.levelUp")).toContain("Level");
  });

  it("provides localized preview weakness full-effect in both locales", () => {
    expect(t("th", "preview.weakness.fullEffect")).toContain("ลด Level");
    expect(t("en", "preview.weakness.fullEffect")).toContain("reduces Level");
  });
});
