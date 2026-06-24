import { describe, expect, it } from "vitest";
import { createMatch } from "../engine/state/match";
import { initStats } from "../persistence/statsTracker";
import type { MatchState } from "../types/game";
import {
  APPLICATION_VERSION,
  buildPlaytestFeedbackPayload,
  serializePlaytestFeedback,
  validatePlaytestFeedbackInput,
  validatePlaytestFeedbackPayload
} from "./playtestFeedback";

describe("playtest feedback export", () => {
  it("accepts optional blank feedback and includes required match fields", () => {
    const match = createFinishedMatch();
    const result = buildPlaytestFeedbackPayload(match, initStats(), {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.schemaVersion).toBe("1");
    expect(result.value.applicationVersion).toBe(APPLICATION_VERSION);
    expect(result.value.matchId).toBe(match.matchId);
    expect(result.value.winner).toBe("P1");
    expect(result.value.finalScores).toEqual({ P1: 15, P2: 8 });
    expect(result.value.turnCount).toBe(match.turnNumber);
    expect(result.value.finishReason).toBe("TARGET_SCORE");
    expect(result.value.feedback).toEqual({});
  });

  it("accepts rating values from 1 to 5", () => {
    const result = validatePlaytestFeedbackInput({
      rulesClarity: 1,
      gameFun: 2,
      gameLength: 3,
      balance: 4,
      uiClarity: 5
    });

    expect(result.ok).toBe(true);
  });

  it("rejects rating values outside 1 to 5", () => {
    const result = validatePlaytestFeedbackInput({
      rulesClarity: 0,
      gameFun: 6,
      gameLength: 3.5
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
    }
  });

  it("exports runtime-valid JSON without prohibited personal data fields", () => {
    const result = serializePlaytestFeedback(createFinishedMatch(), initStats(), {
      confusingMoments: "",
      strongestCard: "A001",
      additionalComments: "เล่นได้จนจบ"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = JSON.parse(result.value) as Record<string, unknown>;
    expect(validatePlaytestFeedbackPayload(parsed).ok).toBe(true);
    expect(parsed).not.toHaveProperty("name");
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("walletAddress");
    expect(parsed).not.toHaveProperty("ipAddress");
    expect(parsed).not.toHaveProperty("deviceFingerprint");
  });
});

function createFinishedMatch(): MatchState {
  const base = createMatch({ seed: "playtest-feedback" });
  return {
    ...base,
    status: "FINISHED" as const,
    winner: "P1" as const,
    finishReason: "TARGET_SCORE" as const,
    turnNumber: 7,
    players: {
      ...base.players,
      P1: { ...base.players.P1, score: 15 },
      P2: { ...base.players.P2, score: 8 }
    },
    actionLog: [
      {
        seq: 1,
        action: { type: "START_MATCH" as const, playerId: "P1" as const, payload: { seed: "playtest-feedback" } },
        phase: "READY" as const,
        turnNumber: 1,
        actor: "P1" as const,
        validation: { valid: true as const },
        result: "start",
        rng: base.rng,
        timestamp: 1000
      },
      {
        seq: 2,
        action: { type: "END_TURN" as const, playerId: "P1" as const, payload: {} },
        phase: "END" as const,
        turnNumber: 7,
        actor: "P1" as const,
        validation: { valid: true as const },
        result: "finish",
        rng: base.rng,
        timestamp: 61000
      }
    ]
  };
}
