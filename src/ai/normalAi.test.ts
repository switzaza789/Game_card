import { describe, expect, it } from "vitest";
import type { MatchState, PlayerId } from "../types/game";
import { dispatchAction } from "../engine/actions/reducer";
import { forcePhase } from "../engine/actions/reducer";
import { getCardDefinition } from "../engine/cards/deck";
import { createMatch } from "../engine/state/match";
import { validateAction } from "../engine/validation/validation";
import { chooseNormalAiAction } from "./normalAi";

describe("Normal PvE AI", () => {
  it("plays an Animal into an empty slot", () => {
    const state = p2ActionState("ai-animal");
    const decision = chooseNormalAiAction({ state, playerId: "P2" });
    expect(decision?.action.type).toBe("PLAY_CARD");
    if (decision?.action.type !== "PLAY_CARD") throw new Error("expected play");
    expect(definition(state, decision.action.payload.cardInstanceId).category).toBe("Animal");
    expect(validateAction(state, decision.action).valid).toBe(true);
  });

  it("uses matching Support on the correct Animal", () => {
    let state = p2ActionState("ai-support");
    state = forceToHand(state, "P2", "A001");
    state = dispatch(state, { type: "PLAY_CARD", playerId: "P2", payload: { cardInstanceId: "P2-A001-1" } });
    state = { ...state, players: { ...state.players, P2: { ...state.players.P2, utilityActionUsed: false } } };
    state = forceToHand(state, "P2", "S001");
    const decision = chooseNormalAiAction({ state, playerId: "P2" });
    expect(decision?.action.type).toBe("PLAY_CARD");
    if (decision?.action.type !== "PLAY_CARD") throw new Error("expected play");
    expect(decision.action.payload.cardInstanceId).toBe("P2-S001-1");
    expect(decision.action.payload.target?.instanceId).toBe("P2-A001-1");
  });

  it("uses matching Weakness and prefers the highest-value enemy target", () => {
    let state = p2ActionState("ai-weakness");
    state = forceToHand(state, "P1", "A001");
    state = { ...state, currentPlayerId: "P1" };
    state = dispatch(state, { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: "P1-A001-1" } });
    state = {
      ...state,
      currentPlayerId: "P2",
      players: { ...state.players, P2: { ...state.players.P2, animalActionUsed: true, utilityActionUsed: false } },
      cardsByInstanceId: {
        ...state.cardsByInstanceId,
        "P1-A001-1": { ...state.cardsByInstanceId["P1-A001-1"], level: 3 }
      }
    };
    state = forceToHand(state, "P2", "W001");
    const decision = chooseNormalAiAction({ state, playerId: "P2" });
    expect(decision?.action.type).toBe("PLAY_CARD");
    if (decision?.action.type !== "PLAY_CARD") throw new Error("expected play");
    expect(decision.action.payload.cardInstanceId).toBe("P2-W001-1");
    expect(decision.action.payload.target?.instanceId).toBe("P1-A001-1");
    expect(validateAction(state, decision.action).valid).toBe(true);
  });

  it("recycles when no useful legal action exists and ends when no legal action exists", () => {
    let state = p2ActionState("ai-recycle");
    state = {
      ...state,
      turnNumber: 2,
      players: { ...state.players, P2: { ...state.players.P2, hand: ["P2-X002-1"], deck: state.players.P2.deck.filter((id) => id !== "P2-X002-1") } },
      cardsByInstanceId: { ...state.cardsByInstanceId, "P2-X002-1": { ...state.cardsByInstanceId["P2-X002-1"], zone: "HAND" } }
    };
    expect(chooseNormalAiAction({ state, playerId: "P2" })?.action.type).toBe("RECYCLE");
    state = { ...state, players: { ...state.players, P2: { ...state.players.P2, deck: [] } } };
    expect(chooseNormalAiAction({ state, playerId: "P2" })).toBeNull();
  });

  it("is deterministic and ignores P1 hidden hand identity and deck order", () => {
    const state = p2ActionState("ai-hidden");
    const a = chooseNormalAiAction({ state, playerId: "P2" });
    const changedHidden = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, hand: [...state.players.P1.hand].reverse(), deck: [...state.players.P1.deck].reverse() }
      }
    };
    expect(chooseNormalAiAction({ state, playerId: "P2" })).toEqual(a);
    expect(chooseNormalAiAction({ state: changedHidden, playerId: "P2" })).toEqual(a);
  });
});

function p2ActionState(seed: string): MatchState {
  return { ...forcePhase(createMatch({ seed, gameMode: "PVE_NORMAL" }), "ACTION"), currentPlayerId: "P2" };
}

function dispatch(state: MatchState, action: Parameters<typeof dispatchAction>[1]["action"]): MatchState {
  return dispatchAction(state, { action, timestamp: 1 }).state;
}

function definition(state: MatchState, instanceId: string) {
  return getCardDefinition(state.cardsByInstanceId[instanceId].definitionId);
}

function forceToHand(state: MatchState, playerId: PlayerId, definitionId: string): MatchState {
  const instanceId = `${playerId}-${definitionId}-1`;
  const card = state.cardsByInstanceId[instanceId];
  const player = state.players[playerId];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        hand: player.hand.includes(instanceId) ? player.hand : [...player.hand, instanceId],
        deck: player.deck.filter((id) => id !== instanceId),
        graveyard: player.graveyard.filter((id) => id !== instanceId),
        board: player.board.map((id) => id === instanceId ? null : id)
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [instanceId]: { ...card, zone: "HAND" }
    }
  };
}
