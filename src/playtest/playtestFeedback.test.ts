import { describe, expect, it } from "vitest";
import { createMatch } from "../engine/state/match";
import type { MatchState } from "../types/game";
import {
  buildPlaytestFeedbackPayload,
  humanFeedbackFilename,
  serializePlaytestFeedback,
  validatePlaytestFeedbackInput,
  validatePlaytestFeedbackPayload
} from "./playtestFeedback";

describe("playtest feedback export", () => {
  const validInput = {
    testerCode: "T-01",
    playerSeat: "P1" as const,
    rulesClarity: 1,
    gameFun: 2,
    gameLength: 3,
    balance: 4,
    uiClarity: 5,
    confusingMoments: "ต้องถามเรื่องจังหวะคะแนน",
    strongestCard: "A001",
    weakestCard: "A008",
    bugDescription: "ไม่มี",
    additionalComments: "เล่นจบได้"
  };

  it("builds human feedback with required match and submission fields", () => {
    const match = createFinishedMatch();
    const result = buildPlaytestFeedbackPayload(match, validInput, 123456);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.schemaVersion).toBe("1");
    expect(result.value.feedbackId).toBe(`feedback-${match.matchId}-123456`);
    expect(result.value.matchId).toBe(match.matchId);
    expect(result.value.submittedAt).toBe(new Date(123456).toISOString());
    expect(result.value.playerSeat).toBe("P1");
    expect(result.value.rulesClarity).toBe(1);
  });

  it("accepts rating values from 1 to 5", () => {
    const result = validatePlaytestFeedbackInput(validInput);
    expect(result.ok).toBe(true);
  });

  it("rejects rating values outside 1 to 5", () => {
    const result = validatePlaytestFeedbackInput({
      playerSeat: "P1",
      rulesClarity: 0,
      gameFun: 6,
      gameLength: 3.5,
      balance: 4,
      uiClarity: 5
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
    }
  });

  it("rejects invalid player seats", () => {
    const result = validatePlaytestFeedbackInput({
      ...validInput,
      playerSeat: "PLAYER"
    } as unknown as typeof validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("playerSeat");
    }
  });

  it("rejects disallowed personal-data fields", () => {
    const result = validatePlaytestFeedbackInput({
      ...validInput,
      email: "person@example.com",
      fullName: "Person Name",
      phoneNumber: "123",
      wallet: "0x123",
      ip: "127.0.0.1",
      streetAddress: "123 Road",
      socialHandle: "@person"
    } as unknown as typeof validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("email");
      expect(result.errors.join(" ")).toContain("fullName");
      expect(result.errors.join(" ")).toContain("phoneNumber");
      expect(result.errors.join(" ")).toContain("wallet");
      expect(result.errors.join(" ")).toContain("ip");
      expect(result.errors.join(" ")).toContain("streetAddress");
      expect(result.errors.join(" ")).toContain("socialHandle");
    }
  });

  it("accepts harmless free text without content filtering", () => {
    const result = validatePlaytestFeedbackInput({
      ...validInput,
      bugDescription: "ผู้เล่นพูดถึงคำว่า email ในบทสนทนา แต่ไม่ได้กรอกข้อมูลติดต่อ"
    });
    expect(result.ok).toBe(true);
  });

  it("exports runtime-valid JSON without prohibited personal data fields", () => {
    const result = serializePlaytestFeedback(createFinishedMatch(), validInput, 123456);

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

  it("builds the requested human feedback filename", () => {
    expect(humanFeedbackFilename("match-123", 999)).toBe("human-feedback-match-123-999.json");
    expect(humanFeedbackFilename("match:/unsafe", 999)).toBe("human-feedback-match--unsafe-999.json");
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
