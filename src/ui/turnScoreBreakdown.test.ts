import { describe, expect, it } from "vitest";
import { createMatch } from "../engine/state/match";
import type { ActionLogEntry, MatchState } from "../types/game";
import { mapScoreResolutionToBreakdown } from "./turnScoreBreakdown";

function scoreEntry(state: MatchState, amount: number, fromScore = 2, toScore = fromScore + amount): ActionLogEntry {
  return {
    seq: 7,
    action: { type: "ADVANCE_PHASE", playerId: "P1", payload: {} },
    phase: "SCORE",
    turnNumber: 3,
    actor: "P1",
    validation: { valid: true },
    result: "score resolved",
    outcomes: [{ code: "SCORE_CHANGED", playerId: "P1", amount, fromScore, toScore }],
    rng: state.rng,
    timestamp: 1
  };
}

describe("turn score breakdown mapper", () => {
  it("returns null for entries without score outcomes", () => {
    const state = createMatch({ seed: "score-breakdown-null" });
    const entry: ActionLogEntry = {
      ...scoreEntry(state, 3),
      outcomes: [{ code: "CARD_DRAWN", playerId: "P1", count: 1 }]
    };
    expect(mapScoreResolutionToBreakdown({ after: state, entry })).toBeNull();
  });

  it("returns null for score changes outside SCORE phase", () => {
    const state = createMatch({ seed: "score-breakdown-action-score" });
    const entry = { ...scoreEntry(state, 2), phase: "ACTION" as const };
    expect(mapScoreResolutionToBreakdown({ after: state, entry })).toBeNull();
  });

  it("maps SCORE_CHANGED into a deterministic aggregate breakdown", () => {
    const before = createMatch({ seed: "score-breakdown" });
    const after = { ...before, players: { ...before.players, P1: { ...before.players.P1, score: 5 } } };
    const result = mapScoreResolutionToBreakdown({ before, after, entry: scoreEntry(before, 3, 2, 5) });
    expect(result).toMatchObject({
      id: "score:7:P1:3:2->5",
      playerId: "P1",
      turnNumber: 3,
      scoreBefore: 2,
      scoreAfter: 5,
      totalDelta: 3,
      unattributedDelta: 3,
      isFullyAttributed: false
    });
  });

  it("does not fabricate animal or team attribution when outcomes only provide totals", () => {
    const before = createMatch({ seed: "score-breakdown-no-attribution" });
    const after = { ...before, players: { ...before.players, P1: { ...before.players.P1, score: 4 } } };
    const result = mapScoreResolutionToBreakdown({ before, after, entry: scoreEntry(before, 4, 0, 4) });
    expect(result?.animalContributions).toEqual([]);
    expect(result?.teamAdjustments).toEqual([]);
    expect(result?.unattributedDelta).toBe(4);
  });

  it("supports zero and negative score deltas without mutating match state", () => {
    const before = createMatch({ seed: "score-breakdown-negative" });
    const snapshot = structuredClone(before);
    const zero = mapScoreResolutionToBreakdown({ before, after: before, entry: scoreEntry(before, 0, 2, 2) });
    const negative = mapScoreResolutionToBreakdown({ before, after: before, entry: scoreEntry(before, -1, 2, 1) });
    expect(zero?.isFullyAttributed).toBe(true);
    expect(negative?.totalDelta).toBe(-1);
    expect(before).toEqual(snapshot);
  });
});
