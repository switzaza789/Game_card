import { describe, expect, it } from "vitest";
import { createMatch, drawCards } from "../engine/state/match";
import type { ActionLogEntry, EffectOutcome } from "../types/game";
import { formatActionLogEntry, localizedStatusLabel, renderActionFeedback, renderCombatOutcomeLines, statusDisplayMeta, statusLabel, summarizeOutcomes, type FeedbackSeverity, type ToastFeedback } from "./effectFeedback";

describe("effect feedback display", () => {
  it("keeps raw outcome codes language-independent while rendering Thai summaries", () => {
    const state = createMatch({ seed: "feedback-display" });
    drawCards(state, "P1", 1);
    const outcomes: EffectOutcome[] = [
      { code: "CARD_PLAYED", cardInstanceId: state.players.P1.hand[0], definitionId: state.cardsByInstanceId[state.players.P1.hand[0]].definitionId, playerId: "P1" },
      { code: "LEVEL_CHANGED", targetInstanceId: "P1-A001-1", fromLevel: 1, toLevel: 2 }
    ];
    expect(outcomes[0].code).toBe("CARD_PLAYED");
    expect(summarizeOutcomes(state, outcomes, "th")).toContain("Level 1 → Level 2");
  });

  it("provides readable status labels and old-log fallback text", () => {
    expect(statusDisplayMeta.REMOVAL_SHIELD.tone).toBe("beneficial");
    expect(statusLabel("TEMP_LEVEL_DOWN_IMMUNITY")).toContain("ป้องกันการลด Level");
    expect(summarizeOutcomes(createMatch({ seed: "legacy-log" }), undefined, "th")).toContain("ไม่มีรายละเอียดเพิ่มเติม");
  });

  it("localizedStatusLabel renders Thai status through TranslationKey", () => {
    expect(localizedStatusLabel("TEMP_LEVEL_DOWN_IMMUNITY", "th")).toContain("ป้องกันการลด Level");
    expect(localizedStatusLabel("REMOVAL_SHIELD", "th")).toContain("โล่ป้องกันการนำออก");
  });

  it("localizedStatusLabel renders English status through TranslationKey", () => {
    expect(localizedStatusLabel("TEMP_LEVEL_DOWN_IMMUNITY", "en")).toContain("Level-down immunity");
    expect(localizedStatusLabel("REMOVAL_SHIELD", "en")).toContain("Removal shield");
  });

  it("localizedStatusLabel switches locale", () => {
    const thai = localizedStatusLabel("SKIP_NEXT_SCORE", "th");
    const eng = localizedStatusLabel("SKIP_NEXT_SCORE", "en");
    expect(thai).not.toBe(eng);
    expect(thai).toContain("ข้าม");
    expect(eng).toContain("Skip");
  });

  it("localizedStatusLabel includes duration by default", () => {
    const thai = localizedStatusLabel("SKIP_NEXT_SCORE", "th");
    expect(thai).toContain("⏭");
    expect(thai).toContain("SCORE phase");
  });

  it("localizedStatusLabel omits duration when includeDuration is false", () => {
    const thai = localizedStatusLabel("SKIP_NEXT_SCORE", "th", false);
    expect(thai).toContain("⏭");
    expect(thai).not.toContain("(");
  });

  it("every supported status renders through localizedStatusLabel without undefined", () => {
    for (const code of ["SKIP_NEXT_SCORE", "NEXT_SCORE_MINUS_1", "TEMP_WEAKNESS_IMMUNITY", "TEMP_LEVEL_DOWN_IMMUNITY", "REMOVAL_SHIELD", "UTILITY_LOCK"] as const) {
      const thai = localizedStatusLabel(code, "th");
      const eng = localizedStatusLabel(code, "en");
      expect(thai).not.toContain("undefined");
      expect(eng).not.toContain("undefined");
      expect(thai.length).toBeGreaterThan(0);
      expect(eng.length).toBeGreaterThan(0);
    }
  });

  it("status rendering does not depend on hardcoded bilingual metadata", () => {
    const { labelKey, descriptionKey, durationKey } = statusDisplayMeta.REMOVAL_SHIELD;
    expect(labelKey).toBe("status.removalShield.label");
    expect(descriptionKey).toBe("status.removalShield.description");
    expect(durationKey).toBe("status.removalShield.duration");
  });

  it("formats opponent-target, score-change, prevention, and legacy action log entries in Thai", () => {
    const state = createMatch({ seed: "combat-display", gameMode: "PVE_NORMAL" });
    drawCards(state, "P1", 1);
    drawCards(state, "P2", 1);
    const source = state.players.P2.hand[0];
    const target = state.players.P1.hand[0];
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P2", payload: { cardInstanceId: source, target: { playerId: "P1", zone: "BOARD", instanceId: target } } },
      phase: "ACTION",
      turnNumber: 4,
      actor: "P2",
      validation: { valid: true },
      result: "PLAY_CARD resolved",
      outcomes: [
        { code: "CARD_PLAYED", cardInstanceId: source, definitionId: state.cardsByInstanceId[source].definitionId, playerId: "P2", targetInstanceId: target, targetPlayerId: "P1", actionKind: "WEAKNESS", effectResult: "PARTIAL_EFFECT", reasonCode: "NON_MATCHING_WEAKNESS" },
        { code: "SCORE_CHANGED", playerId: "P1", fromScore: 7, toScore: 5, amount: -2 },
        { code: "REMOVAL_PREVENTED", targetInstanceId: target, statusCode: "REMOVAL_SHIELD" }
      ],
      rng: state.rng,
      timestamp: 1
    };
    const thaiLines = renderCombatOutcomeLines(state, entry, "th");
    expect(thaiLines.join("\n")).toContain("คุณ");
    expect(thaiLines.join("\n")).toContain("ผลอ่อน");
    expect(thaiLines.join("\n")).toContain("คะแนน 7 → 5 (-2)");
    expect(thaiLines.join("\n")).toContain("โล่ป้องกัน");
    const thaiLog = formatActionLogEntry(state, { ...entry, outcomes: undefined, result: "old result" }, "th");
    expect(thaiLog).not.toBeNull();
    expect(thaiLog!).toContain("ผลลัพธ์เก่า");
  });

  it("formats action log entries in English", () => {
    const state = createMatch({ seed: "combat-display-en", gameMode: "PVE_NORMAL" });
    drawCards(state, "P1", 1);
    drawCards(state, "P2", 1);
    const source = state.players.P2.hand[0];
    const target = state.players.P1.hand[0];
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P2", payload: { cardInstanceId: source, target: { playerId: "P1", zone: "BOARD", instanceId: target } } },
      phase: "ACTION",
      turnNumber: 4,
      actor: "P2",
      validation: { valid: true },
      result: "PLAY_CARD resolved",
      outcomes: [
        { code: "CARD_PLAYED", cardInstanceId: source, definitionId: state.cardsByInstanceId[source].definitionId, playerId: "P2", targetInstanceId: target, targetPlayerId: "P1", actionKind: "WEAKNESS", effectResult: "PARTIAL_EFFECT", reasonCode: "NON_MATCHING_WEAKNESS" },
        { code: "SCORE_CHANGED", playerId: "P1", fromScore: 7, toScore: 5, amount: -2 },
        { code: "REMOVAL_PREVENTED", targetInstanceId: target, statusCode: "REMOVAL_SHIELD" }
      ],
      rng: state.rng,
      timestamp: 1
    };
    const enLines = renderCombatOutcomeLines(state, entry, "en");
    expect(enLines.join("\n")).toContain("You");
    expect(enLines.join("\n")).toContain("Partial");
    expect(enLines.join("\n")).toContain("score 7 → 5 (-2)");
    expect(enLines.join("\n")).toContain("shield prevented");
    const enLog = formatActionLogEntry(state, { ...entry, outcomes: undefined, result: "old result" }, "en");
    expect(enLog).not.toBeNull();
    expect(enLog!).toContain("Old result");
  });

  it("renders Undo event in both locales", () => {
    const state = createMatch({ seed: "undo-test" });
    const undoEntry: ActionLogEntry = {
      seq: 1,
      action: { type: "UNDO_LAST_REVERSIBLE_ACTION", playerId: "P1", payload: {} },
      phase: "ACTION",
      turnNumber: 2,
      actor: "P1",
      validation: { valid: true },
      result: "ผู้เล่นย้อนกลับการกระทำ: เล่นการ์ด Playful Dog",
      rng: state.rng,
      timestamp: 1
    };
    const thai = formatActionLogEntry(state, undoEntry, "th");
    expect(thai).not.toBeNull();
    expect(thai!).toContain("ผู้เล่นย้อนกลับการกระทำ");
    const eng = formatActionLogEntry(state, undoEntry, "en");
    expect(eng).not.toBeNull();
    expect(eng!).toContain("Player undid action");
    expect(eng!).toContain("เล่นการ์ด Playful Dog");
  });

  it("shows localized card names in log entries", () => {
    const state = createMatch({ seed: "card-name-test" });
    drawCards(state, "P1", 1);
    const cardId = state.players.P1.hand[0];
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: cardId } },
      phase: "ACTION",
      turnNumber: 1,
      actor: "P1",
      validation: { valid: true },
      result: "PLAY_CARD resolved",
      outcomes: [
        { code: "CARD_PLAYED", cardInstanceId: cardId, definitionId: state.cardsByInstanceId[cardId].definitionId, playerId: "P1", actionKind: "PLAY_ANIMAL", effectResult: "FULL_EFFECT" }
      ],
      rng: state.rng,
      timestamp: 1
    };
    const thai = renderCombatOutcomeLines(state, entry, "th").join("");
    const eng = renderCombatOutcomeLines(state, entry, "en").join("");
    expect(thai).not.toBe(eng);
    expect(thai.length).toBeGreaterThan(0);
    expect(eng.length).toBeGreaterThan(0);
  });

  it("provides fallback for unknown event type", () => {
    const state = createMatch({ seed: "unknown-event" });
    const unknownEntry: ActionLogEntry = {
      seq: 1,
      action: { type: "START_MATCH", playerId: "P1", payload: { seed: "test" } },
      phase: "READY",
      turnNumber: 1,
      actor: "P1",
      validation: { valid: true },
      result: "START_MATCH resolved",
      rng: state.rng,
      timestamp: 1
    };
    const thai = formatActionLogEntry(state, unknownEntry, "th");
    expect(thai).not.toBeNull();
    expect(thai!).toContain("START_MATCH");
    expect(thai!).not.toContain("undefined");
    const eng = formatActionLogEntry(state, unknownEntry, "en");
    expect(eng).not.toBeNull();
    expect(eng!).toContain("START_MATCH");
    expect(eng).not.toContain("undefined");
  });
});

describe("renderActionFeedback — centered action feedback", () => {
  it("renders Thai recycle success feedback with card names", () => {
    const state = createMatch({ seed: "recycle-th" });
    drawCards(state, "P1", 1);
    const cardId = state.players.P1.hand[0];
    const feedback = renderActionFeedback(state, {
      type: "recycle",
      success: true,
      selectedCardInstanceId: cardId,
      drawnCardInstanceId: cardId,
      deckCount: 10
    }, "th");
    expect(feedback[0]).toBe("รีไซเคิลสำเร็จ");
    expect(feedback.some(l => l.includes("สุสาน"))).toBe(true);
    expect(feedback.some(l => l.includes("ขึ้นมือ"))).toBe(true);
    expect(feedback.some(l => l.includes("10"))).toBe(true);
    expect(feedback).toContain("ใช้ Recycle ของเทิร์นนี้แล้ว");
    feedback.forEach(line => expect(line).not.toContain("undefined"));
  });

  it("renders English recycle success feedback with card names", () => {
    const state = createMatch({ seed: "recycle-en" });
    drawCards(state, "P1", 1);
    const cardId = state.players.P1.hand[0];
    const feedback = renderActionFeedback(state, {
      type: "recycle",
      success: true,
      selectedCardInstanceId: cardId,
      drawnCardInstanceId: cardId,
      deckCount: 10
    }, "en");
    expect(feedback[0]).toBe("Recycle successful");
    expect(feedback.some(l => l.includes("graveyard"))).toBe(true);
    expect(feedback.some(l => l.includes("hand"))).toBe(true);
    expect(feedback.some(l => l.includes("10"))).toBe(true);
    expect(feedback).toContain("Recycle used this turn");
    feedback.forEach(line => expect(line).not.toContain("undefined"));
  });

  it("renders recycle failure feedback in both locales", () => {
    const state = createMatch({ seed: "recycle-fail" });
    const thai = renderActionFeedback(state, { type: "recycle", success: false, reason: "test fail" }, "th");
    expect(thai[0]).toBe("รีไซเคิลไม่สำเร็จ");
    expect(thai[1]).toBe("test fail");
    const eng = renderActionFeedback(state, { type: "recycle", success: false, reason: "test fail" }, "en");
    expect(eng[0]).toBe("Recycle failed");
    expect(eng[1]).toBe("test fail");
  });

  it("renders undo success feedback in both locales", () => {
    const state = createMatch({ seed: "undo-success" });
    const thai = renderActionFeedback(state, { type: "undo", success: true, lastLogResult: "เล่นการ์ด Playful Dog" }, "th");
    expect(thai[0]).toBe("ย้อนกลับสำเร็จ");
    expect(thai[1]).toBe("เล่นการ์ด Playful Dog");
    const eng = renderActionFeedback(state, { type: "undo", success: true, lastLogResult: "played Playful Dog" }, "en");
    expect(eng[0]).toBe("Undo successful");
    expect(eng[1]).toBe("played Playful Dog");
  });

  it("renders undo failure feedback in both locales", () => {
    const state = createMatch({ seed: "undo-fail" });
    const thai = renderActionFeedback(state, { type: "undo", success: false, reason: "ไม่มีอะไรให้ย้อนกลับ", lastLogResult: "" }, "th");
    expect(thai[0]).toBe("ย้อนกลับไม่สำเร็จ");
    expect(thai[1]).toBe("ไม่มีอะไรให้ย้อนกลับ");
    const eng = renderActionFeedback(state, { type: "undo", success: false, reason: "Nothing to undo", lastLogResult: "" }, "en");
    expect(eng[0]).toBe("Undo failed");
    expect(eng[1]).toBe("Nothing to undo");
  });

  it("renders play failed feedback in both locales", () => {
    const state = createMatch({ seed: "play-fail" });
    drawCards(state, "P1", 1);
    const cardId = state.players.P1.hand[0];
    const thai = renderActionFeedback(state, { type: "playFailed", cardInstanceId: cardId, reason: "ไม่สามารถใช้ได้" }, "th");
    expect(thai[0]).toContain("ไม่สำเร็จ");
    expect(thai[1]).toBe("ไม่สามารถใช้ได้");
    const eng = renderActionFeedback(state, { type: "playFailed", cardInstanceId: cardId, reason: "Cannot play" }, "en");
    expect(eng[0]).toContain("Failed to use");
    expect(eng[1]).toBe("Cannot play");
  });

  it("renders unknown fallback in both locales", () => {
    const state = createMatch({ seed: "unknown-fb" });
    const thai = renderActionFeedback(state, { type: "unknown" }, "th");
    expect(thai).toEqual(["ดำเนินการเสร็จสิ้น"]);
    const eng = renderActionFeedback(state, { type: "unknown" }, "en");
    expect(eng).toEqual(["Action completed"]);
  });

  it("renders combat feedback through ActionFeedback", () => {
    const state = createMatch({ seed: "combat-fb", gameMode: "PVE_NORMAL" });
    drawCards(state, "P1", 1);
    drawCards(state, "P2", 1);
    const source = state.players.P2.hand[0];
    const target = state.players.P1.hand[0];
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P2", payload: { cardInstanceId: source, target: { playerId: "P1", zone: "BOARD", instanceId: target } } },
      phase: "ACTION",
      turnNumber: 4,
      actor: "P2",
      validation: { valid: true },
      result: "PLAY_CARD resolved",
      outcomes: [
        { code: "CARD_PLAYED", cardInstanceId: source, definitionId: state.cardsByInstanceId[source].definitionId, playerId: "P2", targetInstanceId: target, targetPlayerId: "P1", actionKind: "WEAKNESS", effectResult: "FULL_EFFECT", reasonCode: "MATCHING_WEAKNESS" },
        { code: "SCORE_CHANGED", playerId: "P1", fromScore: 7, toScore: 5, amount: -2 }
      ],
      rng: state.rng,
      timestamp: 1
    };
    const thai = renderActionFeedback(state, { type: "combat", entry }, "th");
    expect(thai.join("\n")).toContain("ผลเต็ม");
    expect(thai.join("\n")).not.toContain("undefined");
    const eng = renderActionFeedback(state, { type: "combat", entry }, "en");
    expect(eng.join("\n")).toContain("Full effect");
    expect(eng.join("\n")).not.toContain("undefined");
  });

  it("renders recycle feedback without optional fields", () => {
    const state = createMatch({ seed: "recycle-minimal" });
    const feedback = renderActionFeedback(state, { type: "recycle", success: true }, "th");
    expect(feedback[0]).toBe("รีไซเคิลสำเร็จ");
    expect(feedback).toContain("ใช้ Recycle ของเทิร์นนี้แล้ว");
    expect(feedback.length).toBe(2);
  });

  it("does not mutate match state when rendering feedback", () => {
    const state = createMatch({ seed: "no-mutate" });
    drawCards(state, "P1", 1);
    const beforeScore = state.players.P1.score;
    const cardId = state.players.P1.hand[0];
    renderActionFeedback(state, { type: "recycle", success: true, selectedCardInstanceId: cardId }, "th");
    expect(state.players.P1.score).toBe(beforeScore);
  });

  it("displays localized card names matching the selected locale in recycle feedback", () => {
    const state = createMatch({ seed: "card-names-locale" });
    drawCards(state, "P1", 1);
    const cardId = state.players.P1.hand[0];
    const thDef = renderActionFeedback(state, { type: "recycle", success: true, selectedCardInstanceId: cardId }, "th");
    const enDef = renderActionFeedback(state, { type: "recycle", success: true, selectedCardInstanceId: cardId }, "en");
    expect(thDef.join(" ")).not.toBe(enDef.join(" "));
    thDef.forEach(line => expect(line).not.toContain("undefined"));
    enDef.forEach(line => expect(line).not.toContain("undefined"));
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 2D-C — Evolution, status, and locale-aware formatting        */
  /* ------------------------------------------------------------------ */

  it("renders evolution outcome in Thai", () => {
    const state = createMatch({ seed: "evo-th" });
    const outcomes: EffectOutcome[] = [
      { code: "EVOLUTION_POINT_GAINED", targetInstanceId: "A001", current: 1, required: 2 },
      { code: "EVOLVED", targetInstanceId: "A001", fromLevel: 2, toLevel: 3 }
    ];
    const thai = summarizeOutcomes(state, outcomes, "th");
    expect(thai).toContain("วิวัฒนาการ");
    expect(thai).toContain("1");
    expect(thai).toContain("2");
  });

  it("renders evolution outcome in English", () => {
    const state = createMatch({ seed: "evo-en" });
    const outcomes: EffectOutcome[] = [
      { code: "EVOLUTION_POINT_GAINED", targetInstanceId: "A001", current: 1, required: 2 },
      { code: "EVOLVED", targetInstanceId: "A001", fromLevel: 2, toLevel: 3 }
    ];
    const eng = summarizeOutcomes(state, outcomes, "en");
    expect(eng).toContain("Evolution");
    expect(eng).toContain("1");
    expect(eng).toContain("2");
  });

  it("renders evolution point text distinct per locale", () => {
    const state = createMatch({ seed: "evo-distinct" });
    const outcomes: EffectOutcome[] = [
      { code: "EVOLUTION_POINT_GAINED", targetInstanceId: "A001", current: 1, required: 2 }
    ];
    const thai = summarizeOutcomes(state, outcomes, "th");
    const eng = summarizeOutcomes(state, outcomes, "en");
    expect(thai).not.toBe(eng);
  });
});

describe("Phase 2 — FeedbackSeverity, ToastFeedback, ADVANCE_PHASE filtering", () => {
  it("defines FeedbackSeverity type with expected values", () => {
    const minor: FeedbackSeverity = "minor";
    const important: FeedbackSeverity = "important";
    const confirmation: FeedbackSeverity = "confirmation";
    expect(minor).toBe("minor");
    expect(important).toBe("important");
    expect(confirmation).toBe("confirmation");
  });

  it("defines ToastFeedback interface with required fields", () => {
    const toast: ToastFeedback = { key: "toast.playFailed", severity: "minor" };
    expect(toast.key).toBe("toast.playFailed");
    expect(toast.severity).toBe("minor");
  });

  it("ToastFeedback accepts optional params", () => {
    const toast: ToastFeedback = { key: "log.header", params: { turn: "1", player: "Player 1" }, severity: "minor" };
    expect(toast.params).toBeDefined();
    expect(toast.params!.turn).toBe("1");
  });

  it("formatActionLogEntry returns null for ADVANCE_PHASE entries", () => {
    const state = createMatch({ seed: "adv-phase-filter" });
    const advanceEntry: ActionLogEntry = {
      seq: 1,
      action: { type: "ADVANCE_PHASE", playerId: "P1", payload: {} },
      phase: "DRAW",
      turnNumber: 1,
      actor: "P1",
      validation: { valid: true },
      result: "ADVANCE_PHASE resolved",
      rng: state.rng,
      timestamp: 1
    };
    expect(formatActionLogEntry(state, advanceEntry, "th")).toBeNull();
    expect(formatActionLogEntry(state, advanceEntry, "en")).toBeNull();
  });

  it("formatActionLogEntry renders one score summary for ADVANCE_PHASE score entries", () => {
    const state = createMatch({ seed: "adv-score-summary", gameMode: "PVE_NORMAL" });
    const advanceEntry: ActionLogEntry = {
      seq: 1,
      action: { type: "ADVANCE_PHASE", playerId: "P1", payload: {} },
      phase: "SCORE",
      turnNumber: 2,
      actor: "P1",
      validation: { valid: true },
      result: "ADVANCE_PHASE SCORE done",
      outcomes: [{ code: "SCORE_CHANGED", playerId: "P1", amount: 3, fromScore: 2, toScore: 5 }],
      rng: state.rng,
      timestamp: 1
    };
    const thai = formatActionLogEntry(state, advanceEntry, "th");
    const english = formatActionLogEntry(state, advanceEntry, "en");
    expect(thai).toContain("สรุป SCORE");
    expect(thai).toContain("คุณ");
    expect(english).toContain("SCORE summary");
    expect(english).toContain("+3");
  });

  it("formatActionLogEntry returns string for non-ADVANCE_PHASE entries", () => {
    const state = createMatch({ seed: "non-adv-phase" });
    drawCards(state, "P1", 1);
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: state.players.P1.hand[0] } },
      phase: "ACTION",
      turnNumber: 1,
      actor: "P1",
      validation: { valid: true },
      result: "played card",
      rng: state.rng,
      timestamp: 1
    };
    const result = formatActionLogEntry(state, entry, "th");
    expect(result).not.toBeNull();
    expect(result!).toContain("เทิร์น");
  });

  it("formatActionLogEntry returns null for undefined entry", () => {
    const state = createMatch({ seed: "undefined-entry" });
    expect(formatActionLogEntry(state, undefined, "th")).toBeNull();
  });

  it("formatActionLogEntry returns null for ADVANCE_PHASE with empty result", () => {
    const state = createMatch({ seed: "adv-empty-result" });
    const advanceEntry: ActionLogEntry = {
      seq: 1,
      action: { type: "ADVANCE_PHASE", playerId: "P1", payload: {} },
      phase: "DRAW",
      turnNumber: 1,
      actor: "P1",
      validation: { valid: true },
      result: "",
      rng: state.rng,
      timestamp: 1
    };
    expect(formatActionLogEntry(state, advanceEntry, "th")).toBeNull();
  });
});
