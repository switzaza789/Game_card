import type { MatchState } from "../types/game";

export const PLAYTEST_FEEDBACK_SCHEMA_VERSION = "1";
export const APPLICATION_VERSION = "v0.3.0-prototype";

export type FeedbackRatingKey = "rulesClarity" | "gameFun" | "gameLength" | "balance" | "uiClarity";
export type FeedbackTextKey = "confusingMoments" | "strongestCard" | "weakestCard" | "bugDescription" | "additionalComments";
export type PlayerSeat = "P1" | "P2" | "BOTH" | "OBSERVER";

export interface PlaytestFeedbackInput {
  testerCode?: string;
  playerSeat: PlayerSeat;
  rulesClarity: number;
  gameFun: number;
  gameLength: number;
  balance: number;
  uiClarity: number;
  confusingMoments?: string;
  strongestCard?: string;
  weakestCard?: string;
  bugDescription?: string;
  additionalComments?: string;
}

export interface PlaytestFeedbackPayload {
  schemaVersion: string;
  feedbackId: string;
  matchId: string;
  submittedAt: string;
  testerCode?: string;
  playerSeat: PlayerSeat;
  rulesClarity: number;
  gameFun: number;
  gameLength: number;
  balance: number;
  uiClarity: number;
  confusingMoments?: string;
  strongestCard?: string;
  weakestCard?: string;
  bugDescription?: string;
  additionalComments?: string;
}

export type PlaytestValidationResult =
  | { ok: true; value: PlaytestFeedbackInput }
  | { ok: false; errors: string[] };

const ratingKeys: FeedbackRatingKey[] = ["rulesClarity", "gameFun", "gameLength", "balance", "uiClarity"];
const textKeys: FeedbackTextKey[] = ["confusingMoments", "strongestCard", "weakestCard", "bugDescription", "additionalComments"];
const playerSeats: PlayerSeat[] = ["P1", "P2", "BOTH", "OBSERVER"];
const forbiddenFeedbackKeys = [
  "name",
  "fullName",
  "email",
  "phone",
  "phoneNumber",
  "wallet",
  "walletAddress",
  "ip",
  "ipAddress",
  "streetAddress",
  "socialAccount",
  "socialHandle",
  "token",
  "credential"
];

export function validatePlaytestFeedbackInput(input: PlaytestFeedbackInput): PlaytestValidationResult {
  const errors: string[] = [];
  const sanitized: Partial<PlaytestFeedbackInput> = {};

  if (!playerSeats.includes(input.playerSeat)) {
    errors.push("playerSeat ต้องเป็น P1, P2, BOTH หรือ OBSERVER");
  } else {
    sanitized.playerSeat = input.playerSeat;
  }

  for (const key of ratingKeys) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`${key} ต้องเป็นจำนวนเต็ม 1 ถึง 5`);
      continue;
    }
    sanitized[key] = value;
  }

  const testerCode = input.testerCode?.trim();
  if (testerCode) {
    sanitized.testerCode = testerCode;
  }

  for (const key of textKeys) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    const trimmed = String(value).trim();
    if (trimmed) {
      sanitized[key] = trimmed;
    }
  }

  for (const key of Object.keys(input)) {
    if (forbiddenFeedbackKeys.includes(key)) {
      errors.push(`ไม่อนุญาตให้เก็บข้อมูลส่วนตัว: ${key}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: sanitized as PlaytestFeedbackInput };
}

export function buildPlaytestFeedbackPayload(
  match: MatchState,
  input: PlaytestFeedbackInput,
  timestamp = Date.now()
): { ok: true; value: PlaytestFeedbackPayload } | { ok: false; errors: string[] } {
  const validation = validatePlaytestFeedbackInput(input);
  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    value: {
      schemaVersion: PLAYTEST_FEEDBACK_SCHEMA_VERSION,
      feedbackId: buildFeedbackId(match.matchId, timestamp),
      matchId: match.matchId,
      submittedAt: new Date(timestamp).toISOString(),
      ...validation.value
    }
  };
}

export function serializePlaytestFeedback(
  match: MatchState,
  input: PlaytestFeedbackInput,
  timestamp = Date.now()
): { ok: true; value: string } | { ok: false; errors: string[] } {
  const payload = buildPlaytestFeedbackPayload(match, input, timestamp);
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
  if (typeof obj.feedbackId !== "string") errors.push("feedbackId ต้องเป็นข้อความ");
  if (typeof obj.matchId !== "string") errors.push("matchId ต้องเป็นข้อความ");
  if (typeof obj.submittedAt !== "string") errors.push("submittedAt ต้องเป็นข้อความ");

  const feedbackResult = validatePlaytestFeedbackInput(obj as unknown as PlaytestFeedbackInput);
  if (!feedbackResult.ok) {
    errors.push(...feedbackResult.errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: obj as unknown as PlaytestFeedbackPayload };
}

export function humanFeedbackFilename(matchId: string, timestamp = Date.now()): string {
  return `human-feedback-${safeFilenamePart(matchId)}-${timestamp}.json`;
}

function buildFeedbackId(matchId: string, timestamp: number): string {
  return `feedback-${matchId}-${timestamp}`;
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
