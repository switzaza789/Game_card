import { describe, expect, it } from "vitest";
import type { AnimalInstance, MatchState } from "../../types/game";
import { createMatch } from "../state/match";
import {
  addStatus,
  clearOpponentTurnEndStatuses,
  consumePlayerUtilityLock,
  removeExpiredStatus,
  removeStatus
} from "./status";

describe("status helpers", () => {
  it("adds, removes, and expires Animal statuses", () => {
    let state = withAnimal(createMatch({ seed: "status" }));

    state = addStatus(state, "P1-A001-1", { code: "SKIP_NEXT_SCORE", expiresAt: "NEXT_SCORE" });
    expect(animal(state).statuses).toHaveLength(1);

    state = removeStatus(state, "P1-A001-1", "SKIP_NEXT_SCORE");
    expect(animal(state).statuses).toHaveLength(0);

    state = addStatus(state, "P1-A001-1", { code: "NEXT_SCORE_MINUS_1", expiresAt: "NEXT_SCORE" });
    state = removeExpiredStatus(state, "P1");
    expect(animal(state).statuses).toHaveLength(0);
  });

  it("clears opponent-turn-end statuses and consumes utility lock", () => {
    let state = withAnimal(createMatch({ seed: "status-turn-end" }));

    state = addStatus(state, "P1-A001-1", {
      code: "TEMP_WEAKNESS_IMMUNITY",
      expiresAt: "OPPONENT_NEXT_TURN_END"
    });
    state = clearOpponentTurnEndStatuses(state, "P1");
    expect(animal(state).statuses).toHaveLength(0);

    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, utilityLocked: true }
      }
    };

    const consumed = consumePlayerUtilityLock(state, "P1");
    expect(consumed.players.P1.utilityLocked).toBe(false);
    expect(consumed.players.P1.utilityActionUsed).toBe(true);
  });

  it("ignores non-Animal ids defensively", () => {
    const state = createMatch({ seed: "status-non-animal" });
    const handCard = state.players.P1.deck[0];

    expect(addStatus(state, handCard, { code: "SKIP_NEXT_SCORE", expiresAt: "NEXT_SCORE" })).toBe(state);
    expect(removeStatus(state, handCard, "SKIP_NEXT_SCORE")).toBe(state);
    expect(consumePlayerUtilityLock(state, "P1")).toBe(state);
  });
});

function withAnimal(state: MatchState): MatchState {
  const animal: AnimalInstance = {
    instanceId: "P1-A001-1",
    definitionId: "A001",
    ownerId: "P1",
    zone: "BOARD",
    level: 1,
    evolutionPoints: 0,
    slotNo: 1,
    enteredTurn: 0,
    attachedSupportIds: [],
    statuses: [],
    onceFlags: []
  };

  return {
    ...state,
    players: {
      ...state.players,
      P1: {
        ...state.players.P1,
        deck: state.players.P1.deck.filter((id) => id !== animal.instanceId),
        hand: state.players.P1.hand.filter((id) => id !== animal.instanceId),
        board: [animal.instanceId, null, null]
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animal.instanceId]: animal
    }
  };
}

function animal(state: MatchState): AnimalInstance {
  return state.cardsByInstanceId["P1-A001-1"] as AnimalInstance;
}
