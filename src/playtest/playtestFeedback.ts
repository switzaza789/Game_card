import type { MatchState, PlayerId } from "../types/game";
import type { MatchStats } from "../persistence/types";
import { getHighestScoringCard } from "../persistence/statsTracker";

export const PLAYTEST_FEEDBACK_SCHEMA_VERSION = "1";
export const APPLICATION_VERSION = "v0.3.0-prototype";

export type FeedbackRatingKey = "rulesClarity" | "gameFun" | "gameLength" | "balance" | "uiClarity";
export type FeedbackTextKey = "confusingMoments" | "strongestCard" | "weakestCard" | "additionalComments";

export interface PlaytestFeedbackInput {
  rulesClarity?: number;
  gameFun?: number;
  gameLength?: number;
  balance?: number;
  uiClarity?: number;
  confusingMoments?: string;
  strongestCard?: string;
  weakestCard?: string;
  additionalComments?: string;
}

export interface PlaytestFeedbackPayload {
  schemaVersion: string;
  applicationVersion: string;
  matchId: string;
  playedAt: string;
  winner: PlayerId | "DRAW";
  finalScores: Record<PlayerId, number>;
  turnCount: number;
  duration: number;
  finishReason: "TARGET_SCORE" | "TURN_LIMIT";
  recycleCount: number;
  boardExitCount: {
    sentToGraveyard: number;
    returnedToHand: number;
    voluntarySwap: number;
  };
  highestScoringCard: {
    cardId: string;
    nameTh: string;
    score: number;
    ownerId: PlayerId;
  } | null;
  feedback: PlaytestFeedbackInput;
}

export type PlaytestValidationResult =
  | { ok: true; value: PlaytestFeedbackInput }
  | { ok: false; errors: string[] };

const ratingKeys: FeedbackRatingKey[] = ["rulesClarity", "gameFun", "gameLength", "balance", "uiClarity"];
const textKeys: FeedbackTextKey[] = ["confusingMoments", "strongestCard", "weakestCard", "additionalComments"];

export function validatePlaytestFeedbackInput(input: PlaytestFeedbackInput): PlaytestValidationResult {
  const errors: string[] = [];
  const sanitized: PlaytestFeedbackInput = {};

  for (const key of ratingKeys) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`${key} ต้องเป็นจำนวนเต็ม 1 ถึง 5`);
      continue;
    }
    sanitized[key] = value;
  }

  for (const key of textKeys) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    sanitized[key] = String(value).trim();
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: sanitized };
}

export function buildPlaytestFeedbackPayload(
  match: MatchState,
  stats: MatchStats,
  input: PlaytestFeedbackInput
): { ok: true; value: PlaytestFeedbackPayload } | { ok: false; errors: string[] } {
  const validation = validatePlaytestFeedbackInput(input);
  if (!validation.ok) {
    return validation;
  }

  const startAction = match.actionLog.find((entry) => entry.action.type === "START_MATCH");
  const startedAt = startAction ? startAction.timestamp : match.actionLog[0]?.timestamp ?? 0;
  const endedAt = match.actionLog[match.actionLog.length - 1]?.timestamp ?? startedAt;

  return {
    ok: true,
    value: {
      schemaVersion: PLAYTEST_FEEDBACK_SCHEMA_VERSION,
      applicationVersion: APPLICATION_VERSION,
      matchId: match.matchId,
      playedAt: new Date(endedAt).toISOString(),
      winner: match.winner ?? "DRAW",
      finalScores: {
        P1: match.players.P1.score,
        P2: match.players.P2.score
      },
      turnCount: match.turnNumber,
      duration: Math.max(0, endedAt - startedAt),
      finishReason: match.finishReason ?? "TURN_LIMIT",
      recycleCount: (stats.recycleCount.P1 || 0) + (stats.recycleCount.P2 || 0),
      boardExitCount: {
        sentToGraveyard: sumStats(stats.sentToGraveyard),
        returnedToHand: sumStats(stats.returnedToHand),
        voluntarySwap: sumStats(stats.voluntarySwap)
      },
      highestScoringCard: getHighestScoringCard(stats, match.actionLog),
      feedback: validation.value
    }
  };
}

export function serializePlaytestFeedback(
  match: MatchState,
  stats: MatchStats,
  input: PlaytestFeedbackInput
): { ok: true; value: string } | { ok: false; errors: string[] } {
  const payload = buildPlaytestFeedbackPayload(match, stats, input);
  if (!payload.ok) {
    return payload;
  }
  return { ok: true, value: JSON.stringify(payload.value, null, 2) };
}

export function validatePlaytestFeedbackPayload(data: unknown): { ok: true; value: PlaytestFeedbackPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") {
    return { ok: false, errors: ["ข้อมูลฟีดแบ็กไม่ใช่ object"] };
  }

  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== PLAYTEST_FEEDBACK_SCHEMA_VERSION) errors.push("schemaVersion ไม่ถูกต้อง");
  if (obj.applicationVersion !== APPLICATION_VERSION) errors.push("applicationVersion ไม่ถูกต้อง");
  if (typeof obj.matchId !== "string") errors.push("matchId ต้องเป็นข้อความ");
  if (typeof obj.playedAt !== "string") errors.push("playedAt ต้องเป็นข้อความ");
  if (!["P1", "P2", "DRAW"].includes(String(obj.winner))) errors.push("winner ไม่ถูกต้อง");
  if (!obj.finalScores || typeof obj.finalScores !== "object") errors.push("finalScores ไม่ถูกต้อง");
  if (typeof obj.turnCount !== "number") errors.push("turnCount ต้องเป็นตัวเลข");
  if (typeof obj.duration !== "number") errors.push("duration ต้องเป็นตัวเลข");
  if (!["TARGET_SCORE", "TURN_LIMIT"].includes(String(obj.finishReason))) errors.push("finishReason ไม่ถูกต้อง");
  if (typeof obj.recycleCount !== "number") errors.push("recycleCount ต้องเป็นตัวเลข");
  if (!obj.boardExitCount || typeof obj.boardExitCount !== "object") errors.push("boardExitCount ไม่ถูกต้อง");

  const feedbackResult = validatePlaytestFeedbackInput(obj.feedback ?? {});
  if (!feedbackResult.ok) {
    errors.push(...feedbackResult.errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: obj as unknown as PlaytestFeedbackPayload };
}

function sumStats(source: Record<PlayerId, Record<string, number>>): number {
  let total = 0;
  for (const playerId of ["P1", "P2"] as PlayerId[]) {
    for (const cardId in source[playerId]) {
      total += source[playerId][cardId];
    }
  }
  return total;
}
