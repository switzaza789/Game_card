import type { GameMode, MatchState, PlayerId } from "../types/game";
import type { PlaytestFeedbackPayload } from "../playtest/playtestFeedback";

export type ScreenType = "menu" | "howToPlay" | "library" | "battle" | "handoff" | "result";

export type StorageError =
  | { type: "QuotaExceededError"; message: string }
  | { type: "SecurityError"; message: string }
  | { type: "StorageUnavailable"; message: string }
  | { type: "CorruptedJson"; message: string }
  | { type: "UnsupportedVersion"; message: string }
  | { type: "ValidationFailed"; errors: string[] }
  | { type: "ConflictError"; message: string }
  | { type: "UnknownError"; message: string };

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StorageError };

export interface MatchStats {
  recycleCount: Record<PlayerId, number>;
  sentToGraveyard: Record<PlayerId, Record<string, number>>; // cardDefinitionId -> count
  returnedToHand: Record<PlayerId, Record<string, number>>; // cardDefinitionId -> count
  voluntarySwap: Record<PlayerId, Record<string, number>>; // cardDefinitionId -> count
  scoreContribution: Record<PlayerId, Record<string, number>>; // cardDefinitionId -> points
}

export interface PersistedActiveMatch {
  schemaVersion: string;
  state: MatchState;
  screen: ScreenType;
  stats: MatchStats;
  savedAt: number;
}

export interface MatchResult {
  matchId: string;
  gameMode?: GameMode;
  winner: PlayerId | "DRAW";
  finalScores: Record<PlayerId, number>;
  targetScore?: number;
  turnCount: number;
  startedAt: number;
  endedAt: number;
  duration: number; // in milliseconds
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
  finishReason: "TARGET_SCORE" | "TURN_LIMIT";
}

export interface HumanFeedbackStore {
  schemaVersion: string;
  entries: PlaytestFeedbackPayload[];
}

export interface HistoryExportPayload {
  schemaVersion: string;
  exportType: "MATCH_HISTORY_SUMMARY";
  exportedAt: string;
  recordCount: number;
  records: MatchResult[];
  note: string;
}

export interface SingleHistoryExportPayload {
  schemaVersion: string;
  exportType: "MATCH_HISTORY_RECORD";
  exportedAt: string;
  record: MatchResult;
  note: string;
}
