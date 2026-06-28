import { describe, expect, it } from "vitest";
import type { Action, AnimalInstance, MatchState, PlayerId } from "../../types/game";
import { dispatchAction as originalDispatchAction, forcePhase } from "../actions/reducer";
import { createMatch } from "../state/match";
import { addStatus } from "../status/status";

function dispatchAction(state: MatchState, action: Action): ReturnType<typeof originalDispatchAction> {
  return originalDispatchAction(state, { action, timestamp: Date.now() });
}

describe("structured effect outcomes", () => {
  it("records support attachment, level change, status, and readable non-generic summary", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A001", 1);
    state = forceCardToHand(state, "P1", "S001");

    const result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "P1-S001-1", target: targetOf("P1", "A001") }
    });

    const log = result.state.actionLog[result.state.actionLog.length - 1];
    expect(log?.outcomes?.map((outcome) => outcome.code)).toEqual(expect.arrayContaining([
      "CARD_PLAYED",
      "CARD_MOVED",
      "CARD_ATTACHED",
      "LEVEL_CHANGED",
      "STATUS_APPLIED"
    ]));
    expect(log?.result).not.toBe("PLAY_CARD resolved");
  });

  it("records weakness full effect, weaker off-target effect, and removal shield prevention", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A001", 2);
    state = forceCardToHand(state, "P1", "W001");
    let result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "P1-W001-1", target: targetOf("P2", "A001") }
    });
    expect(result.state.actionLog[result.state.actionLog.length - 1]?.outcomes?.some((outcome) => outcome.code === "LEVEL_CHANGED")).toBe(true);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A002", 1);
    state = forceCardToHand(state, "P1", "W001");
    result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "P1-W001-1", target: targetOf("P2", "A002") }
    });
    expect(result.state.actionLog[result.state.actionLog.length - 1]?.outcomes?.some((outcome) => outcome.code === "STATUS_APPLIED")).toBe(true);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A002", 1);
    state = addStatus(state, "P2-A002-1", { code: "REMOVAL_SHIELD", expiresAt: "UNTIL_USED" });
    state = forceCardToHand(state, "P1", "W002");
    result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "P1-W002-1", target: targetOf("P2", "A002") }
    });
    expect(result.state.actionLog[result.state.actionLog.length - 1]?.outcomes?.some((outcome) => outcome.code === "REMOVAL_PREVENTED")).toBe(true);
  });

  it("records Special outcomes and Evolution feedback", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A002", 1);
    state = forceCardToHand(state, "P1", "X001");
    let result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "P1-X001-1", target: targetOf("P2", "A002") }
    });
    expect(result.state.actionLog[result.state.actionLog.length - 1]?.outcomes?.some((outcome) => outcome.code === "STATUS_APPLIED")).toBe(true);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A001", 2, 1);
    state = { ...state, phase: "DRAW", turnNumber: 2 };
    result = dispatchAction(state, { type: "ADVANCE_PHASE", playerId: "P1", payload: {} });
    const codes = result.state.actionLog[result.state.actionLog.length - 1]?.outcomes?.map((outcome) => outcome.code);
    expect(codes).toEqual(expect.arrayContaining(["SCORE_CHANGED", "EVOLUTION_POINT_GAINED", "EVOLVED"]));
  });
});

function setupActionState(): MatchState {
  return forcePhase(createMatch({ startingPlayerId: "P1",  seed: "effect-outcomes" }), "ACTION");
}

function forceCardToHand(state: MatchState, playerId: PlayerId, definitionId: string): MatchState {
  const instanceId = `${playerId}-${definitionId}-1`;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        deck: state.players[playerId].deck.filter((id) => id !== instanceId),
        hand: state.players[playerId].hand.includes(instanceId) ? state.players[playerId].hand : [...state.players[playerId].hand, instanceId],
        graveyard: state.players[playerId].graveyard.filter((id) => id !== instanceId)
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [instanceId]: { ...state.cardsByInstanceId[instanceId], zone: "HAND" }
    }
  };
}

function forceAnimalToBoard(
  state: MatchState,
  playerId: PlayerId,
  definitionId: string,
  level: 1 | 2 | 3,
  evolutionPoints: 0 | 1 | 2 = 0
): MatchState {
  const instanceId = `${playerId}-${definitionId}-1`;
  const player = state.players[playerId];
  const animal: AnimalInstance = {
    ...state.cardsByInstanceId[instanceId],
    zone: "BOARD",
    level,
    evolutionPoints,
    slotNo: 1,
    enteredTurn: 1,
    attachedSupportIds: [],
    statuses: [],
    onceFlags: []
  };
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: player.deck.filter((id) => id !== instanceId),
        hand: player.hand.filter((id) => id !== instanceId),
        board: [instanceId, ...player.board.slice(1)]
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [instanceId]: animal
    }
  };
}

function targetOf(playerId: PlayerId, definitionId: string) {
  return { playerId, zone: "BOARD" as const, instanceId: `${playerId}-${definitionId}-1`, slotNo: 1 as const };
}
