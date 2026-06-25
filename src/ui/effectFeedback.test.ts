import { describe, expect, it } from "vitest";
import { createMatch } from "../engine/state/match";
import type { EffectOutcome } from "../types/game";
import { statusDisplayMeta, statusLabel, summarizeOutcomes } from "./effectFeedback";

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
});
