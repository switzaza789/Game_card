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
    expect(summarizeOutcomes(state, outcomes)).toContain("Level 1 → Level 2");
  });

  it("provides readable status labels and old-log fallback text", () => {
    expect(statusDisplayMeta.REMOVAL_SHIELD.tone).toBe("beneficial");
    expect(statusLabel("TEMP_LEVEL_DOWN_IMMUNITY")).toContain("ป้องกันการลด Level");
    expect(summarizeOutcomes(createMatch({ seed: "legacy-log" }), undefined)).toContain("ผลลัพธ์เก่า");
  });

  it("formats opponent-target, score-change, prevention, and legacy action log entries", () => {
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
    const lines = renderCombatOutcomeLines(state, entry);
    expect(lines.join("\n")).toContain("Bot ใช้");
    expect(lines.join("\n")).toContain("ผลอ่อน");
    expect(lines.join("\n")).toContain("คุณ คะแนน 7 → 5 (-2)");
    expect(lines.join("\n")).toContain("โล่ป้องกัน");
    expect(formatActionLogEntry(state, { ...entry, outcomes: undefined, result: "old result" })).toContain("ผลลัพธ์เก่า");
  });
});
