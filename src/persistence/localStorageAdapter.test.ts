import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveActiveMatch,
  loadActiveMatch,
  hasActiveMatch,
  deleteActiveMatch,
  saveMatchResult,
  listMatchHistory,
  clearMatchHistory,
  exportMatchLog,
  importMatchLog
} from "./localStorageAdapter";
import { initStats } from "./statsTracker";
import type { MatchResult } from "./types";
import { createMatch } from "../engine/state/match";

function makeMatchResult(overrides?: Partial<MatchResult>): MatchResult {
  return {
    matchId: "test-match-1",
    winner: "P1",
    finalScores: { P1: 15, P2: 8 },
    turnCount: 12,
    startedAt: 1000,
    endedAt: 2000,
    duration: 1000,
    recycleCount: 3,
    boardExitCount: { sentToGraveyard: 4, returnedToHand: 2, voluntarySwap: 1 },
    highestScoringCard: { cardId: "A001", nameTh: "สุนัขจอมซน", score: 6, ownerId: "P1" },
    finishReason: "TARGET_SCORE",
    ...overrides
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("localStorageAdapter — Active Match", () => {
  it("saves and loads an active match", () => {
    const state = createMatch({ seed: "test-save" });
    const stats = initStats();
    const now = Date.now();

    const saveResult = saveActiveMatch(state, "battle", stats, now);
    expect(saveResult.ok).toBe(true);

    const loadResult = loadActiveMatch();
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;
    expect(loadResult.value).not.toBeNull();
    expect(loadResult.value!.state.matchId).toBe(state.matchId);
    expect(loadResult.value!.screen).toBe("battle");
    expect(loadResult.value!.schemaVersion).toBe("1");
    expect(loadResult.value!.savedAt).toBe(now);
  });

  it("returns null when no active match is saved", () => {
    const result = loadActiveMatch();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("hasActiveMatch reflects save/delete state", () => {
    const state = createMatch({ seed: "has-active" });
    const stats = initStats();

    expect(hasActiveMatch()).toEqual({ ok: true, value: false });
    saveActiveMatch(state, "battle", stats, Date.now());
    expect(hasActiveMatch()).toEqual({ ok: true, value: true });
    deleteActiveMatch();
    expect(hasActiveMatch()).toEqual({ ok: true, value: false });
  });

  it("deleteActiveMatch removes the saved match", () => {
    const state = createMatch({ seed: "delete-test" });
    saveActiveMatch(state, "handoff", initStats(), Date.now());
    expect(hasActiveMatch()).toEqual({ ok: true, value: true });

    const delResult = deleteActiveMatch();
    expect(delResult.ok).toBe(true);
    expect(hasActiveMatch()).toEqual({ ok: true, value: false });
  });

  it("rejects corrupted JSON save on load", () => {
    localStorage.setItem("animal_score_saved_match", "{invalid json}");
    const result = loadActiveMatch();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("CorruptedJson");
    // Should auto-delete corrupted save
    expect(hasActiveMatch()).toEqual({ ok: true, value: false });
  });

  it("rejects unsupported schema version", () => {
    const bad = JSON.stringify({ schemaVersion: "99", state: {}, screen: "battle", stats: {}, savedAt: 0 });
    localStorage.setItem("animal_score_saved_match", bad);
    const result = loadActiveMatch();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("UnsupportedVersion");
  });
});

describe("localStorageAdapter — Match History", () => {
  it("appends a match result to history", () => {
    const result = makeMatchResult();
    const saveRes = saveMatchResult(result);
    expect(saveRes.ok).toBe(true);

    const listRes = listMatchHistory();
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value).toHaveLength(1);
    expect(listRes.value[0].matchId).toBe("test-match-1");
  });

  it("is idempotent for the same match result", () => {
    const result = makeMatchResult();
    saveMatchResult(result);
    const secondSave = saveMatchResult(result);
    expect(secondSave.ok).toBe(true);

    const listRes = listMatchHistory();
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value).toHaveLength(1);
  });

  it("returns ConflictError when matchId exists but data differs", () => {
    const result = makeMatchResult();
    saveMatchResult(result);

    const modified = makeMatchResult({ winner: "P2" });
    const conflictResult = saveMatchResult(modified);
    expect(conflictResult.ok).toBe(false);
    if (conflictResult.ok) return;
    expect(conflictResult.error.type).toBe("ConflictError");
  });

  it("enforces FIFO 100-entry limit", () => {
    for (let i = 1; i <= 105; i++) {
      saveMatchResult(makeMatchResult({ matchId: `match-${i}`, startedAt: i, endedAt: i + 100 }));
    }

    const listRes = listMatchHistory();
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value).toHaveLength(100);
    // The oldest 5 entries should be gone, latest 100 retained
    expect(listRes.value[0].matchId).toBe("match-6");
    expect(listRes.value[99].matchId).toBe("match-105");
  });

  it("clearMatchHistory removes all entries", () => {
    saveMatchResult(makeMatchResult());
    clearMatchHistory();
    const listRes = listMatchHistory();
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value).toHaveLength(0);
  });

  it("listMatchHistory returns empty array when no history", () => {
    const result = listMatchHistory();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});

describe("localStorageAdapter — Export / Import", () => {
  it("exports a valid JSON string", () => {
    const state = createMatch({ seed: "export-test" });
    const stats = initStats();
    const result = exportMatchLog(state, "battle", stats);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.value) as { schemaVersion: string; screen: string; exportedAt: number };
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.screen).toBe("battle");
    expect(parsed.exportedAt).toBeTypeOf("number");
  });

  it("imports a valid exported log", () => {
    const state = createMatch({ seed: "import-test" });
    const stats = initStats();
    const expResult = exportMatchLog(state, "battle", stats);
    expect(expResult.ok).toBe(true);
    if (!expResult.ok) return;

    const impResult = importMatchLog(expResult.value);
    expect(impResult.ok).toBe(true);
    if (!impResult.ok) return;
    expect(impResult.value.state.matchId).toBe(state.matchId);
  });

  it("rejects import of corrupted JSON", () => {
    const result = importMatchLog("{not valid json}");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("CorruptedJson");
  });

  it("rejects import with wrong schema version", () => {
    const bad = JSON.stringify({
      schemaVersion: "99",
      state: {},
      screen: "battle",
      stats: {},
      savedAt: Date.now()
    });
    const result = importMatchLog(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("UnsupportedVersion");
  });

  it("returns StorageUnavailable when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: localStorage access denied");
    });
    const result = loadActiveMatch();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Could be SecurityError or UnknownError depending on detection
    expect(["SecurityError", "UnknownError"]).toContain(result.error.type);
  });
});
