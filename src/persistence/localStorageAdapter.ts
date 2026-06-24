import type { MatchState } from "../types/game";
import type { PersistedActiveMatch, MatchResult, MatchStats, ScreenType, StorageResult, StorageError } from "./types";
import { validateStoredMatch } from "./validator";

const ACTIVE_MATCH_KEY = "animal_score_saved_match";
const MATCH_HISTORY_KEY = "animal_score_match_history";

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function mapError(e: unknown): StorageError {
  const err = e as { name?: string; code?: number; message?: string };
  if (err.name === "QuotaExceededError" || err.code === 22 || err.name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return { type: "QuotaExceededError", message: err.message ?? "Local Storage quota exceeded" };
  }
  if (err.name === "SecurityError" || err.message?.includes("security") || err.message?.includes("insecure") || err.message?.includes("SecurityError")) {
    return { type: "SecurityError", message: err.message ?? "Local Storage is insecure or blocked" };
  }
  return { type: "UnknownError", message: err.message ?? "Unknown storage error" };
}

export function saveActiveMatch(
  state: MatchState,
  screen: ScreenType,
  stats: MatchStats,
  timestamp: number
): StorageResult<void> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    const payload: PersistedActiveMatch = {
      schemaVersion: "1",
      state,
      screen,
      stats,
      savedAt: timestamp
    };
    window.localStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(payload));
    return { ok: true, value: undefined };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function loadActiveMatch(): StorageResult<PersistedActiveMatch | null> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    const data = window.localStorage.getItem(ACTIVE_MATCH_KEY);
    if (!data) {
      return { ok: true, value: null };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (parseErr: unknown) {
      deleteActiveMatch();
      return { ok: false, error: { type: "CorruptedJson", message: errorMessage(parseErr, "Corrupted JSON save") } };
    }

    const validation = validateStoredMatch(parsed);
    if (!validation.ok) {
      deleteActiveMatch();
      return validation;
    }

    return { ok: true, value: validation.value };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function hasActiveMatch(): StorageResult<boolean> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    const data = window.localStorage.getItem(ACTIVE_MATCH_KEY);
    return { ok: true, value: !!data };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function deleteActiveMatch(): StorageResult<void> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    window.localStorage.removeItem(ACTIVE_MATCH_KEY);
    return { ok: true, value: undefined };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function saveMatchResult(result: MatchResult): StorageResult<void> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    const historyData = window.localStorage.getItem(MATCH_HISTORY_KEY);
    let history: MatchResult[] = [];

    if (historyData) {
      try {
        const parsedHistory = JSON.parse(historyData) as unknown;
        history = Array.isArray(parsedHistory) ? (parsedHistory as MatchResult[]) : [];
      } catch {
        history = [];
      }
    }

    // Idempotency Check
    const existing = history.find((h) => h.matchId === result.matchId);
    if (existing) {
      const identical = JSON.stringify(existing) === JSON.stringify(result);
      if (identical) {
        return { ok: true, value: undefined };
      } else {
        return { ok: false, error: { type: "ConflictError", message: `Match Result ${result.matchId} already exists with different data` } };
      }
    }

    // Append new result
    history.push(result);

    // FIFO limit: keep last 100 entries
    if (history.length > 100) {
      history = history.slice(-100);
    }

    window.localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(history));
    return { ok: true, value: undefined };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function listMatchHistory(): StorageResult<MatchResult[]> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    const historyData = window.localStorage.getItem(MATCH_HISTORY_KEY);
    if (!historyData) {
      return { ok: true, value: [] };
    }

    let history: MatchResult[] = [];
    try {
      const parsedHistory = JSON.parse(historyData) as unknown;
      history = Array.isArray(parsedHistory) ? (parsedHistory as MatchResult[]) : [];
    } catch {
      return { ok: true, value: [] };
    }

    return { ok: true, value: history };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function clearMatchHistory(): StorageResult<void> {
  if (!isStorageAvailable()) {
    return { ok: false, error: { type: "StorageUnavailable", message: "Local Storage is not available" } };
  }

  try {
    window.localStorage.removeItem(MATCH_HISTORY_KEY);
    return { ok: true, value: undefined };
  } catch (e: unknown) {
    return { ok: false, error: mapError(e) };
  }
}

export function exportMatchLog(state: MatchState, screen: ScreenType, stats: MatchStats): StorageResult<string> {
  try {
    const timestamp = Date.now();
    const payload = {
      schemaVersion: "1",
      state,
      screen,
      stats,
      savedAt: timestamp,
      exportedAt: timestamp
    };
    return { ok: true, value: JSON.stringify(payload, null, 2) };
  } catch (e: unknown) {
    return { ok: false, error: { type: "UnknownError", message: errorMessage(e, "Failed to export log") } };
  }
}

export function importMatchLog(jsonStr: string): StorageResult<PersistedActiveMatch> {
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    const validation = validateStoredMatch(parsed);
    if (!validation.ok) {
      return validation;
    }
    return { ok: true, value: validation.value };
  } catch (e: unknown) {
    return { ok: false, error: { type: "CorruptedJson", message: errorMessage(e, "Invalid JSON log format") } };
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
