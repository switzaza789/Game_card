import { describe, expect, it } from "vitest";
import { createMatch } from "../engine/state/match";
import type { ActionLogEntry, EffectOutcome } from "../types/game";
import { formatActionLogEntry, renderCombatOutcomeLines, statusDisplayMeta, statusLabel, summarizeOutcomes } from "./effectFeedback";

describe("effect feedback display", () => {
  it("keeps raw outcome codes language-independent while rendering Thai summaries", () => {
    const state = createMatch({ seed: "feedback-display" });
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
    expect(summarizeOutcomes(createMatch({ seed: "legacy-log" }), undefined, "th")).toContain("ผลลัพธ์เก่า");
  });

  it("formats opponent-target, score-change, prevention, and legacy action log entries in Thai", () => {
    const state = createMatch({ seed: "combat-display", gameMode: "PVE_NORMAL" });
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
    expect(formatActionLogEntry(state, { ...entry, outcomes: undefined, result: "old result" }, "th")).toContain("ผลลัพธ์เก่า");
  });

  it("formats action log entries in English", () => {
    const state = createMatch({ seed: "combat-display-en", gameMode: "PVE_NORMAL" });
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
    expect(formatActionLogEntry(state, { ...entry, outcomes: undefined, result: "old result" }, "en")).toContain("Old result");
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
    expect(thai).toContain("ผู้เล่นย้อนกลับการกระทำ");
    const eng = formatActionLogEntry(state, undoEntry, "en");
    expect(eng).toContain("Player undid action");
    expect(eng).toContain("เล่นการ์ด Playful Dog");
  });

  it("shows localized card names in log entries", () => {
    const state = createMatch({ seed: "card-name-test" });
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
    expect(thai).toContain("START_MATCH");
    expect(thai).not.toContain("undefined");
    const eng = formatActionLogEntry(state, unknownEntry, "en");
    expect(eng).toContain("START_MATCH");
    expect(eng).not.toContain("undefined");
  });
});
