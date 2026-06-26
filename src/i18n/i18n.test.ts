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

  /* ------------------------------------------------------------------ */
  /*  Centered Action Feedback localization                              */
  /* ------------------------------------------------------------------ */

  const FEEDBACK_KEYS = [
    "feedback.recycle.success", "feedback.recycle.failure",
    "feedback.recycle.sentGraveyard", "feedback.recycle.drawnToHand",
    "feedback.recycle.deckCount", "feedback.recycle.used",
    "feedback.undo.success", "feedback.undo.failure",
    "feedback.play.failure", "feedback.unknown"
  ];

  it("has all feedback keys in Thai dictionary", () => {
    for (const key of FEEDBACK_KEYS) {
      expect(th).toHaveProperty(key);
      expect((th as Record<string, string>)[key].length).toBeGreaterThan(0);
    }
  });

  it("has all feedback keys in English dictionary", () => {
    for (const key of FEEDBACK_KEYS) {
      expect(en).toHaveProperty(key);
      expect((en as Record<string, string>)[key].length).toBeGreaterThan(0);
    }
  });

  it("provides localized recycle success feedback in both locales", () => {
    expect(t("th", "feedback.recycle.success")).toBe("รีไซเคิลสำเร็จ");
    expect(t("en", "feedback.recycle.success")).toBe("Recycle successful");
  });

  it("provides localized recycle failure feedback in both locales", () => {
    expect(t("th", "feedback.recycle.failure")).toBe("รีไซเคิลไม่สำเร็จ");
    expect(t("en", "feedback.recycle.failure")).toBe("Recycle failed");
  });

  it("provides localized recycle sentGraveyard feedback in both locales", () => {
    const thSent = t("th", "feedback.recycle.sentGraveyard", { card: "Playful Dog" });
    expect(thSent).toContain("Playful Dog");
    expect(thSent).toContain("สุสาน");
    const enSent = t("en", "feedback.recycle.sentGraveyard", { card: "Playful Dog" });
    expect(enSent).toContain("Playful Dog");
    expect(enSent).toContain("graveyard");
  });

  it("provides localized recycle drawnToHand feedback in both locales", () => {
    const thDrawn = t("th", "feedback.recycle.drawnToHand", { card: "Playful Dog" });
    expect(thDrawn).toContain("Playful Dog");
    expect(thDrawn).toContain("ขึ้นมือ");
    const enDrawn = t("en", "feedback.recycle.drawnToHand", { card: "Playful Dog" });
    expect(enDrawn).toContain("Playful Dog");
    expect(enDrawn).toContain("hand");
  });

  it("provides localized recycle deckCount in both locales", () => {
    expect(t("th", "feedback.recycle.deckCount", { count: 5 })).toContain("5");
    expect(t("en", "feedback.recycle.deckCount", { count: 5 })).toContain("5");
  });

  it("provides localized undo success feedback in both locales", () => {
    expect(t("th", "feedback.undo.success")).toBe("ย้อนกลับสำเร็จ");
    expect(t("en", "feedback.undo.success")).toBe("Undo successful");
  });

  it("provides localized undo failure feedback in both locales", () => {
    expect(t("th", "feedback.undo.failure")).toBe("ย้อนกลับไม่สำเร็จ");
    expect(t("en", "feedback.undo.failure")).toBe("Undo failed");
  });

  it("provides localized play failure feedback in both locales", () => {
    const thFail = t("th", "feedback.play.failure", { card: "Playful Dog" });
    expect(thFail).toContain("Playful Dog");
    expect(en).toHaveProperty("feedback.play.failure");
    const enFail = t("en", "feedback.play.failure", { card: "Playful Dog" });
    expect(enFail).toContain("Playful Dog");
  });

  it("provides localized unknown feedback fallback in both locales", () => {
    expect(t("th", "feedback.unknown")).toBe("ดำเนินการเสร็จสิ้น");
    expect(t("en", "feedback.unknown")).toBe("Action completed");
  });

  /* ------------------------------------------------------------------ */
  /*  Secondary Screen localization (Phase 2D-A)                         */
  /* ------------------------------------------------------------------ */

  const SECONDARY_SCREEN_KEYS = [
    "menu.savedGameAria", "menu.version", "menu.cardCount", "menu.players",
    "menu.targetScore", "menu.newGame", "menu.clearSave", "menu.deleteAria",
    "menu.viewHistory", "menu.importSave", "menu.howToPlay", "menu.cardLibrary",
    "menu.aiLabel",
    "howToPlay.title", "howToPlay.rule1", "howToPlay.rule2", "howToPlay.rule3",
    "handoff.eyebrow", "handoff.title", "handoff.privacyNotice", "handoff.readyButton",
    "history.title", "history.empty", "history.exportAll", "history.clearAll",
    "history.back", "history.exportMatch", "history.result", "history.winner",
    "history.draw", "history.player1Score", "history.player2Score", "history.turnCount",
    "history.duration", "history.recycleCount", "history.finishReason",
    "history.sentToGraveyard", "history.returnedToHand", "history.voluntarySwap",
    "history.highestScoringCard", "history.playedAt",
    "history.finishReason.targetScore", "history.finishReason.maxTurns",
    "import.title", "import.description", "import.aria", "import.button",
    "export.title", "export.description", "export.aria",
    "playtest.title", "playtest.description", "playtest.aria",
    "playtest.testerCode", "playtest.seatLabel", "playtest.export",
    "playtest.rulesClarity", "playtest.gameFun", "playtest.gameLength",
    "playtest.balance", "playtest.uiClarity",
    "playtest.confusingMoments", "playtest.strongestCard", "playtest.weakestCard",
    "playtest.bugDescription", "playtest.additionalComments", "playtest.ratingSuffix",
    "result.boardExits", "result.sentToGraveyard", "result.returnedToHand",
    "result.quickSwap", "result.highestScoringCard", "result.scoreAccumulated",
    "result.exportWithClipboard", "result.playtestFeedback",
    "result.finishReason.targetScore", "result.finishReason.maxTurns"
  ];

  it("has all secondary screen keys in both dictionaries", () => {
    for (const key of SECONDARY_SCREEN_KEYS) {
      expect(th).toHaveProperty(key);
      expect(th[key as keyof typeof th].length).toBeGreaterThan(0);
      expect(en).toHaveProperty(key);
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
    }
  });

  it("keeps Thai and English key coverage identical after adding secondary screen keys", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("provides localized handoff title with parameter interpolation", () => {
    const thTitle = t("th", "handoff.title", { player: "ผู้เล่น 2" });
    expect(thTitle).toContain("ผู้เล่น 2");
    const enTitle = t("en", "handoff.title", { player: "Player 2" });
    expect(enTitle).toContain("Player 2");
  });

  it("provides localized history winner with parameter interpolation", () => {
    const thWinner = t("th", "history.winner", { player: "ผู้เล่น 1" });
    expect(thWinner).toContain("ผู้เล่น 1");
    const enWinner = t("en", "history.winner", { player: "Player 1" });
    expect(enWinner).toContain("Player 1");
  });

  it("provides localized result scoreAccumulated with parameter interpolation", () => {
    const thScore = t("th", "result.scoreAccumulated", { score: 6, player: "ผู้เล่น 1" });
    expect(thScore).toContain("6");
    expect(thScore).toContain("ผู้เล่น 1");
    const enScore = t("en", "result.scoreAccumulated", { score: 6, player: "Player 1" });
    expect(enScore).toContain("6");
    expect(enScore).toContain("Player 1");
  });

  it("provides localized exportWithClipboard with parameter interpolation", () => {
    const thExport = t("th", "result.exportWithClipboard", { label: "ส่งออกไฟล์เซฟ" });
    expect(thExport).toContain("ส่งออกไฟล์เซฟ");
    expect(thExport).toContain("Clipboard");
    const enExport = t("en", "result.exportWithClipboard", { label: "Export log" });
    expect(enExport).toContain("Export log");
    expect(enExport).toContain("Clipboard");
  });

  /* ------------------------------------------------------------------ */
  /*  Transient messages, alerts, and confirmations (Phase 2D-B)         */
  /* ------------------------------------------------------------------ */

  const TRANSIENT_FEEDBACK_KEYS = [
    "feedback.selectCardForSlot", "feedback.turnEnded", "feedback.pveStarted",
    "feedback.gameStarted", "feedback.gameResumed", "feedback.loadFailed",
    "feedback.saveNotFound", "feedback.saveDeleted", "feedback.saveDeleteFailed",
    "feedback.gameReset", "feedback.resetButDeleteFailed",
    "feedback.returnedToMenuButDeleteFailed", "feedback.saveFailedSuffix",
    "feedback.matchFinished", "feedback.pveTurnEnded", "feedback.pveActionLimitReached",
    "feedback.yourTurn", "feedback.turnStartFailed", "feedback.preparingTurn",
    "feedback.turnResumed", "feedback.importSuccess", "feedback.importFailed",
    "feedback.clipboardUnavailable", "feedback.clipboardSuccess",
    "feedback.clipboardPlaytestSuccess", "feedback.playtestSaved",
    "feedback.playtestDuplicateError", "feedback.playtestSaveFailed",
    "feedback.exportFailed", "feedback.historyCleared", "feedback.historyClearFailed",
    "feedback.historyExportFailed", "feedback.matchExportFailed",
    "feedback.historyExported", "feedback.matchExported",
    "feedback.recoverySuccess", "feedback.recoveryFailed", "feedback.loadError",
  ] as const;

  const CONFIRM_KEYS = [
    "confirm.overwriteSave", "confirm.deleteSave", "confirm.importOverwrite",
    "confirm.clearHistory", "confirm.weaknessShield"
  ] as const;

  it("has all transient feedback keys in Thai", () => {
    for (const key of TRANSIENT_FEEDBACK_KEYS) {
      expect(th).toHaveProperty(key);
      expect(th[key as keyof typeof th].length).toBeGreaterThan(0);
    }
  });

  it("has all transient feedback keys in English", () => {
    for (const key of TRANSIENT_FEEDBACK_KEYS) {
      expect(en).toHaveProperty(key);
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
    }
  });

  it("has all confirm keys in Thai", () => {
    for (const key of CONFIRM_KEYS) {
      expect(th).toHaveProperty(key);
      expect(th[key as keyof typeof th].length).toBeGreaterThan(0);
    }
  });

  it("has all confirm keys in English", () => {
    for (const key of CONFIRM_KEYS) {
      expect(en).toHaveProperty(key);
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
    }
  });

  it("keeps Thai and English key coverage identical after adding transient keys", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("provides Thai success messages", () => {
    expect(th["feedback.saveDeleted"]).toBe("ลบเกมเซฟเรียบร้อย");
    expect(th["feedback.gameReset"]).toBe("รีเซ็ตเกมเรียบร้อย");
    expect(th["feedback.importSuccess"]).toContain("สำเร็จ");
    expect(th["feedback.clipboardSuccess"]).toContain("เรียบร้อย");
    expect(th["feedback.playtestSaved"]).toBe("บันทึกและส่งออกฟีดแบ็ก JSON แล้ว");
  });

  it("provides English success messages", () => {
    expect(en["feedback.saveDeleted"]).toBe("Save deleted");
    expect(en["feedback.gameReset"]).toBe("Game reset");
    expect(en["feedback.importSuccess"]).toContain("successful");
    expect(en["feedback.clipboardSuccess"]).toContain("Clipboard");
  });

  it("provides Thai error messages with parameter interpolation", () => {
    const err = t("th", "feedback.saveDeleteFailed", { reason: "permission denied" });
    expect(err).toContain("permission denied");
    expect(err).toContain("ลบเกมเซฟไม่สำเร็จ");
    const loadErr = t("th", "feedback.loadFailed", { reason: "corrupt data" });
    expect(loadErr).toContain("corrupt data");
    expect(loadErr).toContain("ไม่สามารถโหลดเซฟ");
  });

  it("provides English error messages with parameter interpolation", () => {
    const err = t("en", "feedback.saveDeleteFailed", { reason: "permission denied" });
    expect(err).toContain("permission denied");
    expect(err).toContain("Failed to delete");
    const loadErr = t("en", "feedback.loadFailed", { reason: "corrupt data" });
    expect(loadErr).toContain("corrupt data");
    expect(loadErr).toContain("Failed to load");
  });

  it("provides clipboard success/failure in both locales", () => {
    expect(th["feedback.clipboardSuccess"]).toContain("Clipboard");
    expect(en["feedback.clipboardSuccess"]).toContain("Clipboard");
    expect(th["feedback.clipboardUnavailable"]).toContain("ไม่สามารถ");
    expect(en["feedback.clipboardUnavailable"]).toContain("Auto-copy");
  });

  it("provides export failure in both locales", () => {
    const thFail = t("th", "feedback.exportFailed", { reason: "disk full" });
    expect(thFail).toContain("disk full");
    expect(thFail).toContain("ล้มเหลว");
    const enFail = t("en", "feedback.exportFailed", { reason: "disk full" });
    expect(enFail).toContain("disk full");
    expect(enFail).toContain("failed");
  });

  it("provides save/load notifications in both locales", () => {
    const thSaveDeleted = t("th", "feedback.saveDeleted");
    expect(thSaveDeleted).toBeTruthy();
    const enSaveDeleted = t("en", "feedback.saveDeleted");
    expect(enSaveDeleted).toBeTruthy();
    const thSaveNotFound = t("th", "feedback.saveNotFound");
    expect(thSaveNotFound).toBeTruthy();
    const enSaveNotFound = t("en", "feedback.saveNotFound");
    expect(enSaveNotFound).toBeTruthy();
  });

  it("provides Thai confirmation text", () => {
    expect(th["confirm.overwriteSave"]).toContain("ลบเซฟเดิม");
    expect(th["confirm.deleteSave"]).toContain("ลบเกมเซฟ");
    expect(th["confirm.importOverwrite"]).toContain("นำเข้าไฟล์เซฟ");
    expect(th["confirm.clearHistory"]).toContain("ลบประวัติการเล่น");
    expect(th["confirm.weaknessShield"]).toContain("Weakness Shield");
  });

  it("provides English confirmation text", () => {
    expect(en["confirm.overwriteSave"]).toContain("overwrite");
    expect(en["confirm.deleteSave"]).toContain("delete this save");
    expect(en["confirm.importOverwrite"]).toContain("overwrite");
    expect(en["confirm.clearHistory"]).toContain("clear all play history");
    expect(en["confirm.weaknessShield"]).toContain("Weakness Shield");
  });

  it("provides Thai parameter interpolation for gameResumed", () => {
    const msg = t("th", "feedback.gameResumed", { player: "ผู้เล่น 2" });
    expect(msg).toContain("ผู้เล่น 2");
    expect(msg).toContain("กู้คืนเกมสำเร็จ");
  });

  it("provides English parameter interpolation for gameResumed", () => {
    const msg = t("en", "feedback.gameResumed", { player: "Player 2" });
    expect(msg).toContain("Player 2");
    expect(msg).toContain("resumed");
  });

  it("provides Thai parameter interpolation for confirm.weaknessShield", () => {
    const msg = t("th", "confirm.weaknessShield", { player: "ผู้เล่น 1" });
    expect(msg).toContain("ผู้เล่น 1");
    expect(msg).toContain("Weakness Shield");
  });

  it("provides English parameter interpolation for confirm.weaknessShield", () => {
    const msg = t("en", "confirm.weaknessShield", { player: "Player 1" });
    expect(msg).toContain("Player 1");
    expect(msg).toContain("Weakness Shield");
  });

  it("provides Thai history messages with parameter interpolation", () => {
    expect(t("th", "feedback.historyCleared")).toBe("ลบประวัติการเล่นเรียบร้อยแล้ว");
    expect(t("th", "feedback.historyExported")).toBe("ส่งออกประวัติการเล่นทั้งหมดแล้ว");
    const thMatchExported = t("th", "feedback.matchExported", { matchId: "match-123" });
    expect(thMatchExported).toContain("match-123");
  });

  it("provides English history messages with parameter interpolation", () => {
    expect(en["feedback.historyCleared"]).toBe("Play history cleared");
    expect(en["feedback.historyExported"]).toBe("Play history exported");
    const enMatchExported = t("en", "feedback.matchExported", { matchId: "match-123" });
    expect(enMatchExported).toContain("match-123");
  });

  it("provides recovery messages in both locales", () => {
    expect(t("th", "feedback.recoverySuccess")).toBe("กู้คืนผลการแข่งขันและลบเซฟเรียบร้อย");
    expect(t("en", "feedback.recoverySuccess")).toBe("Match result recovered and save cleared");
    const thFail = t("th", "feedback.recoveryFailed", { reason: "timeout" });
    expect(thFail).toContain("timeout");
    const enFail = t("en", "feedback.recoveryFailed", { reason: "timeout" });
    expect(enFail).toContain("timeout");
  });

  /* ------------------------------------------------------------------ */
  /*  Playability reason labels (Phase 2D-C)                            */
  /* ------------------------------------------------------------------ */

  it("provides all playability reason keys in both locales", () => {
    const reasonKeys = [
      "playability.reason.notFound", "playability.reason.dogMaxLevel",
      "playability.reason.notActionPhase", "playability.reason.notInHand",
      "playability.reason.animalActionUsed", "playability.reason.animalZoneFull",
      "playability.reason.utilityLocked", "playability.reason.utilityUsed",
      "playability.reason.needsAnimalTarget", "playability.reason.needsOwnAnimal",
      "playability.reason.noEnemyTarget", "playability.reason.targetProtected",
      "playability.reason.animalMaxLevel", "playability.reason.needsLevel1",
      "playability.reason.weaknessOffTarget",
      "playability.reason.undoNotAvailable", "playability.reason.undoWrongActor",
      "playability.reason.undoWrongTurn", "playability.reason.undoMatchFinished",
      "playability.reason.undoWrongPhase", "playability.reason.recycleFirstTurn",
      "playability.reason.recycleEmptyDeck", "playability.reason.recycleNoCard",
      "playability.reason.slotOccupied", "playability.reason.matchFinished",
      "playability.reason.wrongPlayer", "playability.reason.behindOnly",
      "playability.reason.quickSwapRequires", "playability.reason.quickSwapNotAnimal",
      "playability.reason.fallback"
    ];
    for (const key of reasonKeys) {
      expect(th).toHaveProperty(key);
      expect(th[key as keyof typeof th].length).toBeGreaterThan(0);
      expect(en).toHaveProperty(key);
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Card detail labels (Phase 2D-C)                                   */
  /* ------------------------------------------------------------------ */

  it("provides card detail labels in both locales", () => {
    const labelKeys = [
      "card.type", "card.description", "card.ability", "card.validUse",
      "card.target", "card.effectSummary", "card.supportCompatibility",
      "card.levelUp", "card.additionalEffect", "card.weaknessTarget",
      "card.fullEffect", "card.offTargetEffect", "card.immediateEffect",
      "card.duration"
    ];
    for (const key of labelKeys) {
      expect(th).toHaveProperty(key);
      expect(th[key as keyof typeof th].length).toBeGreaterThan(0);
      expect(en).toHaveProperty(key);
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
    }
  });

  it("card detail labels are distinct between Thai and English", () => {
    const labelKeys = [
      "card.type", "card.description", "card.ability", "card.validUse",
      "card.target", "card.effectSummary", "card.supportCompatibility",
      "card.levelUp", "card.additionalEffect", "card.weaknessTarget",
      "card.fullEffect", "card.offTargetEffect", "card.immediateEffect",
      "card.duration"
    ];
    for (const key of labelKeys) {
      const thVal = t("th", key as never);
      const enVal = t("en", key as never);
      expect(thVal).not.toBe(enVal);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Weakness target names (Phase 2D-C)                                */
  /* ------------------------------------------------------------------ */

  it("weakness target names are localized in both locales", () => {
    const wIds = ["W001", "W002", "W003", "W004", "W005"] as const;
    for (const id of wIds) {
      const thTarget = getLocalizedCard(id, "th").weaknessTarget;
      const enTarget = getLocalizedCard(id, "en").weaknessTarget;
      expect(thTarget).toBeTruthy();
      expect(enTarget).toBeTruthy();
      expect(thTarget).not.toBe(enTarget);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Evolution keys (Phase 2D-C)                                       */
  /* ------------------------------------------------------------------ */

  it("provides evolution-related keys in both locales", () => {
    const evoKeys = ["log.evolutionPoint", "log.evolved"];
    for (const key of evoKeys) {
      expect(th).toHaveProperty(key);
      expect(th[key as keyof typeof th].length).toBeGreaterThan(0);
      expect(en).toHaveProperty(key);
      expect(en[key as keyof typeof en].length).toBeGreaterThan(0);
    }
  });

  it("evolution progress text differs between locales", () => {
    const thProgress = t("th", "log.evolutionPoint", { current: 1, required: 2 });
    const enProgress = t("en", "log.evolutionPoint", { current: 1, required: 2 });
    expect(thProgress).toContain("1");
    expect(thProgress).toContain("2");
    expect(enProgress).toContain("1");
    expect(enProgress).toContain("2");
    expect(thProgress).not.toBe(enProgress);
  });

  it("evolution completed text differs between locales", () => {
    const thCompleted = t("th", "log.evolved", { level: 3 });
    const enCompleted = t("en", "log.evolved", { level: 3 });
    expect(thCompleted).toContain("3");
    expect(enCompleted).toContain("3");
    expect(thCompleted).not.toBe(enCompleted);
  });

  /* ------------------------------------------------------------------ */
  /*  Playability no longer depends on Thai-string mapping (Phase 2D-C) */
  /* ------------------------------------------------------------------ */

  it("playability reason keys are stable and not derived from Thai strings", () => {
    const reasonKeys = [
      "playability.reason.dogMaxLevel",
      "playability.reason.notActionPhase",
      "playability.reason.notInHand",
      "playability.reason.animalActionUsed",
      "playability.reason.animalZoneFull",
      "playability.reason.utilityLocked",
      "playability.reason.utilityUsed",
      "playability.reason.needsAnimalTarget",
      "playability.reason.needsOwnAnimal",
      "playability.reason.noEnemyTarget",
      "playability.reason.targetProtected",
      "playability.reason.animalMaxLevel",
      "playability.reason.needsLevel1",
      "playability.reason.weaknessOffTarget",
      "playability.reason.undoNotAvailable",
      "playability.reason.undoWrongActor",
      "playability.reason.undoWrongTurn",
      "playability.reason.undoMatchFinished",
      "playability.reason.undoWrongPhase",
      "playability.reason.recycleFirstTurn",
      "playability.reason.recycleEmptyDeck",
      "playability.reason.slotOccupied",
      "playability.reason.matchFinished",
      "playability.reason.wrongPlayer",
      "playability.reason.behindOnly",
      "playability.reason.quickSwapRequires",
      "playability.reason.quickSwapNotAnimal",
      "playability.reason.fallback"
    ];
    // All keys exist and are non-empty strings - no raw Thai in keys
    for (const key of reasonKeys) {
      expect(typeof t("th", key as never)).toBe("string");
      expect(t("th", key as never).length).toBeGreaterThan(0);
      expect(typeof t("en", key as never)).toBe("string");
      expect(t("en", key as never).length).toBeGreaterThan(0);
    }
  });

  it("playability reason translations never contain undefined", () => {
    const reasonKeys = Object.keys(th).filter((k) => k.startsWith("playability."));
    for (const key of reasonKeys) {
      expect(t("th", key as never)).not.toContain("undefined");
      expect(t("en", key as never)).not.toContain("undefined");
    }
  });

  it("playability reason translations never contain TranslationKey name", () => {
    for (const value of Object.values(th)) {
      expect(value).not.toMatch(/^playability\./);
    }
    for (const value of Object.values(en)) {
      expect(value).not.toMatch(/^playability\./);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Locale-aware formatting (Phase 2D-C)                              */
  /* ------------------------------------------------------------------ */

  it("card type labels are distinct between locales", () => {
    expect(t("th", "card.type")).toBe("ประเภท");
    expect(t("en", "card.type")).toBe("Type");
  });

  /* ------------------------------------------------------------------ */
  /*  Export and persistence values remain unchanged (Phase 2D-C)       */
  /* ------------------------------------------------------------------ */

  it("dictionary keys are identical between Thai and English", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("no raw TranslationKey value or undefined in dictionary values", () => {
    for (const [key, value] of Object.entries(th)) {
      expect(value).toBeDefined();
      expect(typeof value).toBe("string");
      if (key !== "log.action.default") {
        expect(value.length).toBeGreaterThan(0);
      }
      expect(value).not.toContain("undefined");
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value).toBeDefined();
      expect(typeof value).toBe("string");
      if (key !== "log.action.default") {
        expect(value.length).toBeGreaterThan(0);
      }
      expect(value).not.toContain("undefined");
    }
  });
});
