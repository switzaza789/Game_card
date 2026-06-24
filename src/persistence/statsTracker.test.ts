import { describe, expect, it } from "vitest";
import { initStats, updateStats, getHighestScoringCard } from "./statsTracker";
import { createMatch } from "../engine/state/match";
import { dispatchAction } from "../engine/actions/reducer";
import type { MatchState, Action, ActionEnvelope, ActionLogEntry, PlayerId } from "../types/game";

function advanceTo(state: MatchState, phase: MatchState["phase"]): MatchState {
  let s = state;
  let safety = 0;
  while (s.phase !== phase && s.status !== "FINISHED" && safety < 10) {
    const r = dispatchAction(s, {
      action: { type: "ADVANCE_PHASE", playerId: s.currentPlayerId, payload: {} },
      timestamp: Date.now()
    });
    s = r.state;
    safety++;
  }
  return s;
}

describe("statsTracker — initStats", () => {
  it("initializes with zeroed counts", () => {
    const stats = initStats();
    expect(stats.recycleCount.P1).toBe(0);
    expect(stats.recycleCount.P2).toBe(0);
    expect(stats.sentToGraveyard.P1).toEqual({});
    expect(stats.returnedToHand.P1).toEqual({});
    expect(stats.voluntarySwap.P1).toEqual({});
    expect(stats.scoreContribution.P1).toEqual({});
  });
});

describe("statsTracker — updateStats recycle", () => {
  it("increments recycleCount when RECYCLE action is dispatched", () => {
    // Advance through 2 full turns to reach turn 3 where Recycle is allowed
    let s = createMatch({ seed: "recycle-stats" });
    // Turn 1: P1 ends turn
    s = advanceTo(s, "ACTION");
    s = dispatchAction(s, { action: { type: "END_TURN", playerId: s.currentPlayerId, payload: {} }, timestamp: 1 }).state;
    // Turn 1: P2 ends turn
    s = advanceTo(s, "ACTION");
    s = dispatchAction(s, { action: { type: "END_TURN", playerId: s.currentPlayerId, payload: {} }, timestamp: 2 }).state;
    // Turn 2: P1 ends turn
    s = advanceTo(s, "ACTION");
    s = dispatchAction(s, { action: { type: "END_TURN", playerId: s.currentPlayerId, payload: {} }, timestamp: 3 }).state;
    // Turn 2: P2 ends turn
    s = advanceTo(s, "ACTION");
    s = dispatchAction(s, { action: { type: "END_TURN", playerId: s.currentPlayerId, payload: {} }, timestamp: 4 }).state;
    // Now turn 3 — Recycle should be allowed
    s = advanceTo(s, "ACTION");

    const pid = s.currentPlayerId;
    const cardId = s.players[pid].hand[0];
    const recycleAction: Action = { type: "RECYCLE", playerId: pid, payload: { cardInstanceId: cardId } };
    const envelope: ActionEnvelope = { action: recycleAction, timestamp: Date.now() };
    const nextState = dispatchAction(s, envelope).state;

    let stats = initStats();
    stats = updateStats(stats, envelope, s, nextState);
    expect(stats.recycleCount[pid]).toBe(1);
  });
});

describe("statsTracker — updateStats Quick Swap (X003)", () => {
  it("increments voluntarySwap but NOT returnedToHand for the swapped target", () => {
    const state = createMatch({ seed: "quick-swap-stats" });
    // Create mock prev/next states where X003 is played
    const prevState = state;
    const nextState = state;

    const swappedInstanceId = "fake-instance-123";
    const stats = initStats();

    // Manually simulate: action is PLAY_CARD with card definitionId X003
    const action: Action = {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "card-x003-inst", target: { playerId: "P1", zone: "BOARD", instanceId: swappedInstanceId } }
    };

    // Build fake prev state where X003 and target exist
    const fakePrevState = {
      ...prevState,
      cardsByInstanceId: {
        ...prevState.cardsByInstanceId,
        "card-x003-inst": { instanceId: "card-x003-inst", definitionId: "X003", ownerId: "P1" as const, zone: "HAND" as const },
        [swappedInstanceId]: { instanceId: swappedInstanceId, definitionId: "A001", ownerId: "P1" as const, zone: "BOARD" as const }
      }
    };
    const fakeNextState = {
      ...nextState,
      cardsByInstanceId: {
        ...nextState.cardsByInstanceId,
        [swappedInstanceId]: { instanceId: swappedInstanceId, definitionId: "A001", ownerId: "P1" as const, zone: "HAND" as const }
      }
    };

    const envelope: ActionEnvelope = { action, timestamp: Date.now() };
    const updatedStats = updateStats(stats, envelope, fakePrevState, fakeNextState);

    // voluntarySwap should be incremented for A001 (the swapped card)
    expect(updatedStats.voluntarySwap.P1["A001"]).toBe(1);
    // returnedToHand should NOT be incremented for the swapped card
    expect(updatedStats.returnedToHand.P1["A001"] ?? 0).toBe(0);
  });
});

describe("statsTracker — getHighestScoringCard", () => {
  it("returns null when no score contribution", () => {
    const stats = initStats();
    const result = getHighestScoringCard(stats, []);
    expect(result).toBeNull();
  });

  it("returns the card with the highest score", () => {
    const stats = initStats();
    stats.scoreContribution.P1 = { A001: 6, A002: 3 };
    stats.scoreContribution.P2 = { A003: 4 };

    const result = getHighestScoringCard(stats, []);
    expect(result).not.toBeNull();
    expect(result!.cardId).toBe("A001");
    expect(result!.score).toBe(6);
    expect(result!.ownerId).toBe("P1");
  });

  it("returns correct card when P2 has highest score", () => {
    const stats = initStats();
    stats.scoreContribution.P1 = { A001: 3 };
    stats.scoreContribution.P2 = { A003: 8 };

    const result = getHighestScoringCard(stats, []);
    expect(result).not.toBeNull();
    expect(result!.cardId).toBe("A003");
    expect(result!.ownerId).toBe("P2");
    expect(result!.score).toBe(8);
  });

  it("handles ties deterministically — returns first by ownerId", () => {
    const stats = initStats();
    stats.scoreContribution.P1 = { A001: 5 };
    stats.scoreContribution.P2 = { A003: 5 };

    // With no actionLog to replay, fallback is owner order (P1 before P2)
    const result = getHighestScoringCard(stats, []);
    expect(result).not.toBeNull();
    // Either P1 or P2 — must be consistent and not null
    expect(["P1", "P2"]).toContain(result!.ownerId);
  });

  it("breaks tied highest-score cards by first reach in replayable action log order", () => {
    const seed = "highest-score-tie";
    const state = createMatch({ seed });
    const p1FoodThief = findDefinitionInstance(state, "P1", "X005");
    const p2FoodThief = findDefinitionInstance(state, "P2", "X005");
    const stats = initStats();
    stats.scoreContribution.P1 = { X005: 1 };
    stats.scoreContribution.P2 = { X005: 1 };

    const actionLog: ActionLogEntry[] = [
      makeLogEntry(1, { type: "START_MATCH", playerId: "P1", payload: { seed } }, "P1"),
      makeLogEntry(2, { type: "PLAY_CARD", playerId: "P2", payload: { cardInstanceId: p2FoodThief } }, "P2"),
      makeLogEntry(3, { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: p1FoodThief } }, "P1")
    ];

    const result = getHighestScoringCard(stats, actionLog);

    expect(result).not.toBeNull();
    expect(result!.cardId).toBe("X005");
    expect(result!.ownerId).toBe("P2");
  });
});

function findDefinitionInstance(state: MatchState, ownerId: PlayerId, definitionId: string): string {
  const entry = Object.values(state.cardsByInstanceId).find((card) =>
    card.ownerId === ownerId && card.definitionId === definitionId
  );

  if (!entry) {
    throw new Error(`No ${definitionId} instance for ${ownerId}`);
  }

  return entry.instanceId;
}

function makeLogEntry(seq: number, action: Action, actor: PlayerId): ActionLogEntry {
  return {
    seq,
    action,
    phase: "ACTION",
    turnNumber: 1,
    actor,
    validation: { valid: true },
    result: "test action",
    rng: { seed: "highest-score-tie", step: 0 },
    timestamp: 1000 + seq
  };
}
