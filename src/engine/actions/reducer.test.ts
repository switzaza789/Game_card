import { describe, expect, it } from "vitest";
import type { CardInstance, MatchState } from "../../types/game";
import { getCardDefinition } from "../cards/deck";
import { dispatchAction, evaluateWin, forcePhase } from "./reducer";
import { createMatch } from "../state/match";
import { validateAction } from "../validation/validation";

describe("core engine reducer", () => {
  it("moves through READY, DRAW, SCORE, ACTION, and END phases", () => {
    let state = createMatch({ seed: "phase-flow" });

    state = dispatchAction(state, advance()).state;
    expect(state.phase).toBe("DRAW");
    expect(state.players.P1.hand).toHaveLength(5);

    state = dispatchAction(state, advance()).state;
    expect(state.phase).toBe("SCORE");

    state = dispatchAction(state, advance()).state;
    expect(state.phase).toBe("ACTION");

    state = dispatchAction(state, advance()).state;
    expect(state.phase).toBe("END");

    state = dispatchAction(state, advance()).state;
    expect(state.phase).toBe("READY");
    expect(state.currentPlayerId).toBe("P2");
    expect(state.actionLog).toHaveLength(5);
  });

  it("rejects actions from the inactive player", () => {
    const state = forcePhase(createMatch({ seed: "invalid-player" }), "ACTION");
    const result = dispatchAction(state, {
      type: "END_TURN",
      playerId: "P2",
      payload: {}
    });

    expect(result.validation.valid).toBe(false);
    expect(result.state.currentPlayerId).toBe("P1");
    expect(result.state.actionLog[0]?.validation.valid).toBe(false);
  });

  it("rejects start match and end turn in invalid contexts", () => {
    const state = createMatch({ seed: "invalid-context" });

    expect(
      dispatchAction(state, {
        type: "START_MATCH",
        playerId: "P1",
        payload: { seed: "again" }
      }).validation.valid
    ).toBe(false);

    expect(
      dispatchAction(state, {
        type: "END_TURN",
        playerId: "P1",
        payload: {}
      }).validation.valid
    ).toBe(false);
  });

  it("rejects actions after the match is finished", () => {
    const state = {
      ...createMatch({ seed: "already-finished" }),
      status: "FINISHED" as const
    };

    expect(dispatchAction(state, advance()).validation.valid).toBe(false);
  });

  it("allows mulligan up to two starting cards and rejects the third", () => {
    let state = createMatch({ seed: "mulligan-seed" });
    const firstTwo = state.players.P1.hand.slice(0, 2);

    const accepted = dispatchAction(state, {
      type: "MULLIGAN",
      playerId: "P1",
      payload: { cardInstanceIds: firstTwo }
    });

    expect(accepted.validation.valid).toBe(true);
    state = accepted.state;
    expect(state.players.P1.hand).toHaveLength(5);
    expect(state.players.P1.mulligansUsed).toBe(2);

    const rejected = dispatchAction(state, {
      type: "MULLIGAN",
      playerId: "P1",
      payload: { cardInstanceIds: [state.players.P1.hand[0]] }
    });

    expect(rejected.validation.valid).toBe(false);
  });

  it("rejects duplicate and non-hand mulligan cards", () => {
    const state = createMatch({ seed: "bad-mulligan" });
    const first = state.players.P1.hand[0];
    const deckCard = state.players.P1.deck[0];

    expect(
      dispatchAction(state, {
        type: "MULLIGAN",
        playerId: "P1",
        payload: { cardInstanceIds: [first, first] }
      }).validation.valid
    ).toBe(false);

    expect(
      dispatchAction(state, {
        type: "MULLIGAN",
        playerId: "P1",
        payload: { cardInstanceIds: [deckCard] }
      }).validation.valid
    ).toBe(false);
  });

  it("plays an Animal into one of three slots and blocks a second Animal action", () => {
    let state = forcePhase(createMatch({ seed: "play-animal" }), "ACTION");
    const firstAnimal = ensureHandCard(state, "P1", "Animal");
    state = firstAnimal.state;
    const animalId = firstAnimal.instanceId;

    const accepted = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: animalId }
    });

    expect(accepted.validation.valid).toBe(true);
    state = accepted.state;
    expect(state.players.P1.board.filter(Boolean)).toHaveLength(1);
    expect(state.players.P1.animalActionUsed).toBe(true);
    expect(state.cardsByInstanceId[animalId].zone).toBe("BOARD");

    const nextAnimal = ensureHandCard(state, "P1", "Animal");
    const rejected = dispatchAction(nextAnimal.state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: nextAnimal.instanceId }
    });

    expect(rejected.validation.valid).toBe(false);
  });

  it("blocks playing an Animal when all three slots are full", () => {
    let state = forcePhase(createMatch({ seed: "full-board" }), "ACTION");

    for (let index = 0; index < 3; index += 1) {
      const animal = ensureHandCard(state, "P1", "Animal");
      state = animal.state;
      state = {
        ...state,
        players: {
          ...state.players,
          P1: { ...state.players.P1, animalActionUsed: false }
        }
      };
      state = dispatchAction(state, {
        type: "PLAY_CARD",
        playerId: "P1",
          payload: { cardInstanceId: animal.instanceId }
      }).state;
    }

    const fourthAnimal = ensureHandCard(state, "P1", "Animal");
    const rejected = dispatchAction(fourthAnimal.state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: fourthAnimal.instanceId }
    });

    expect(rejected.validation.valid).toBe(false);
    expect(rejected.state.players.P1.board.filter(Boolean)).toHaveLength(3);
  });

  it("plays Support cards through effect validation", () => {
    let state = forcePhase(createMatch({ seed: "utility" }), "ACTION");
    const animal = ensureHandCard(state, "P1", "Animal");
    state = dispatchAction(animal.state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: animal.instanceId }
    }).state;
    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, utilityActionUsed: false }
      }
    };
    const support = ensureHandCard(state, "P1", "Support");
    state = support.state;
    const supportId = support.instanceId;
    const result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: supportId,
        target: { playerId: "P1", zone: "BOARD", instanceId: animal.instanceId }
      }
    });

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P1.utilityActionUsed).toBe(true);
    expect(result.state.players.P1.hand).not.toContain(supportId);
  });

  it("blocks a second utility action in the same turn", () => {
    let state = forcePhase(createMatch({ seed: "utility-limit" }), "ACTION");
    const first = ensureHandCard(state, "P1", "Support");
    state = dispatchAction(first.state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: first.instanceId }
    }).state;

    const second = ensureHandCard(state, "P1", "Weakness");
    const rejected = dispatchAction(second.state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: second.instanceId }
    });

    expect(rejected.validation.valid).toBe(false);
  });

  it("rejects playing cards outside Action phase or outside hand", () => {
    const state = createMatch({ seed: "bad-play" });
    const handCard = state.players.P1.hand[0];
    const deckCard = state.players.P1.deck[0];

    expect(
      dispatchAction(state, {
        type: "PLAY_CARD",
        playerId: "P1",
        payload: { cardInstanceId: handCard }
      }).validation.valid
    ).toBe(false);

    expect(
      dispatchAction(forcePhase(state, "ACTION"), {
        type: "PLAY_CARD",
        playerId: "P1",
        payload: { cardInstanceId: deckCard }
      }).validation.valid
    ).toBe(false);
  });

  it("rejects recycle on the first turn and allows it later as a utility action", () => {
    const firstTurnState = forcePhase(createMatch({ seed: "recycle" }), "ACTION");
    const cardId = firstTurnState.players.P1.hand[0];

    expect(
      dispatchAction(firstTurnState, {
        type: "RECYCLE",
        playerId: "P1",
        payload: { cardInstanceId: cardId }
      }).validation.valid
    ).toBe(false);

    const laterState = {
      ...firstTurnState,
      turnNumber: 2
    };
    const accepted = dispatchAction(laterState, {
      type: "RECYCLE",
      playerId: "P1",
      payload: { cardInstanceId: cardId }
    });

    expect(accepted.validation.valid).toBe(true);
    expect(accepted.state.players.P1.hand).toHaveLength(5);
    expect(accepted.state.players.P1.graveyard).toContain(cardId);
    expect(accepted.state.players.P1.utilityActionUsed).toBe(true);
  });

  it("rejects recycle outside Action phase, after utility use, and with an empty deck", () => {
    const readyState = createMatch({ seed: "bad-recycle" });
    const cardId = readyState.players.P1.hand[0];

    expect(
      dispatchAction(readyState, {
        type: "RECYCLE",
        playerId: "P1",
        payload: { cardInstanceId: cardId }
      }).validation.valid
    ).toBe(false);

    const usedUtilityState = {
      ...forcePhase(readyState, "ACTION"),
      turnNumber: 2,
      players: {
        ...readyState.players,
        P1: {
          ...readyState.players.P1,
          utilityActionUsed: true
        }
      }
    };

    expect(
      dispatchAction(usedUtilityState, {
        type: "RECYCLE",
        playerId: "P1",
        payload: { cardInstanceId: cardId }
      }).validation.valid
    ).toBe(false);

    const emptyDeckState = {
      ...forcePhase(readyState, "ACTION"),
      turnNumber: 2,
      players: {
        ...readyState.players,
        P1: {
          ...readyState.players.P1,
          deck: []
        }
      }
    };

    expect(
      dispatchAction(emptyDeckState, {
        type: "RECYCLE",
        playerId: "P1",
        payload: { cardInstanceId: cardId }
      }).validation.valid
    ).toBe(false);
  });

  it("enforces hand limit when ending the turn", () => {
    let state = forcePhase(createMatch({ seed: "hand-limit" }), "ACTION");
    state = {
      ...state,
      turnNumber: 2
    };

    while (state.players.P1.hand.length < 8) {
      const [drawnId, ...remainingDeck] = state.players.P1.deck;
      state = {
        ...state,
        players: {
          ...state.players,
          P1: {
            ...state.players.P1,
            deck: remainingDeck,
            hand: [...state.players.P1.hand, drawnId]
          }
        },
        cardsByInstanceId: {
          ...state.cardsByInstanceId,
          [drawnId]: {
            ...state.cardsByInstanceId[drawnId],
            zone: "HAND"
          }
        }
      };
    }

    const ended = dispatchAction(state, {
      type: "END_TURN",
      playerId: "P1",
      payload: {}
    }).state;

    expect(ended.players.P1.hand).toHaveLength(7);
    expect(ended.players.P1.graveyard).toHaveLength(1);
  });

  it("does not score an Animal on the same turn it enters", () => {
    let state = forcePhase(createMatch({ seed: "new-animal-score" }), "ACTION");
    const animal = ensureHandCard(state, "P1", "Animal");
    state = animal.state;
    const animalId = animal.instanceId;

    state = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: animalId }
    }).state;

    state = forcePhase(state, "DRAW");
    state = dispatchAction(state, advance()).state;

    expect(state.players.P1.score).toBe(0);
  });

  it("adds Animal levels during Score phase after the entered turn", () => {
    let state = forcePhase(createMatch({ seed: "score" }), "ACTION");
    const animal = ensureHandCard(state, "P1", "Animal");
    state = animal.state;
    const animalId = animal.instanceId;

    state = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: animalId }
    }).state;
    state = {
      ...state,
      turnNumber: 2,
      phase: "DRAW"
    };

    state = dispatchAction(state, advance()).state;

    expect(state.players.P1.score).toBe(1);
  });

  it("lets the second player draw normally on their first turn", () => {
    let state = forcePhase(createMatch({ seed: "p2-draw" }), "ACTION");

    state = dispatchAction(state, {
      type: "END_TURN",
      playerId: "P1",
      payload: {}
    }).state;
    state = dispatchAction(state, {
      type: "ADVANCE_PHASE",
      playerId: "P2",
      payload: {}
    }).state;

    expect(state.currentPlayerId).toBe("P2");
    expect(state.phase).toBe("DRAW");
    expect(state.players.P2.hand).toHaveLength(6);
  });

  it("finishes when a player reaches 15 score", () => {
    const state = createMatch({ seed: "win" });
    const finished = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          score: 15
        }
      }
    });

    expect(finished.status).toBe("FINISHED");
    expect(finished.winner).toBe("P1");
    expect(finished.finishReason).toBe("TARGET_SCORE");
  });

  it("handles target-score winner branches", () => {
    const state = createMatch({ seed: "score-winner-branches" });

    expect(
      evaluateWin({
        ...state,
        players: {
          ...state.players,
          P2: { ...state.players.P2, score: 15 }
        }
      }).winner
    ).toBe("P2");

    expect(
      evaluateWin({
        ...state,
        players: {
          ...state.players,
          P1: { ...state.players.P1, score: 15 },
          P2: { ...state.players.P2, score: 16 }
        }
      }).winner
    ).toBe("P2");
  });

  it("uses tiebreakers when both players reach the turn limit", () => {
    const state = createMatch({ seed: "turn-limit" });
    const finished = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: 10, turnsTaken: 12 },
        P2: { ...state.players.P2, score: 9, turnsTaken: 12 }
      }
    });

    expect(finished.status).toBe("FINISHED");
    expect(finished.winner).toBe("P1");
    expect(finished.finishReason).toBe("TURN_LIMIT");
  });

  it("uses later tiebreakers and can end in a draw", () => {
    const state = createMatch({ seed: "tiebreak-branches" });

    const p2DeckWinner = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: 10, turnsTaken: 12, deck: [] },
        P2: { ...state.players.P2, score: 10, turnsTaken: 12 }
      }
    });
    expect(p2DeckWinner.winner).toBe("P2");

    const draw = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, turnsTaken: 12, deck: [] },
        P2: { ...state.players.P2, turnsTaken: 12, deck: [] }
      }
    });
    expect(draw.winner).toBe("DRAW");

    expect(evaluateWin(draw)).toBe(draw);
  });

  it("returns valid direct validation results for score helpers", () => {
    const state = createMatch({ seed: "validation-direct" });

    expect(validateAction(state, advance())).toEqual({ valid: true });
  });
});

function advance() {
  return {
    type: "ADVANCE_PHASE",
    playerId: "P1",
    payload: {}
  } as const;
}

function ensureHandCard(
  state: MatchState,
  playerId: "P1" | "P2",
  category: string
): { state: MatchState; instanceId: string } {
  const found = state.players[playerId].hand.find((instanceId) => {
    const card = state.cardsByInstanceId[instanceId];
    return getCardDefinition(card.definitionId).category === category;
  });

  if (!found) {
    const forced = forceCardIntoHand(state, playerId, category);
    return {
      state: stateWithForcedCard(state, playerId, forced.instanceId),
      instanceId: forced.instanceId
    };
  }

  return { state, instanceId: found };
}

function forceCardIntoHand(state: MatchState, playerId: "P1" | "P2", category: string): CardInstance {
  const foundId = state.players[playerId].deck.find((instanceId) => {
    const card = state.cardsByInstanceId[instanceId];
    return getCardDefinition(card.definitionId).category === category;
  });

  if (!foundId) {
    throw new Error(`No ${category} card available in deck`);
  }

  return state.cardsByInstanceId[foundId];
}

function stateWithForcedCard(state: MatchState, playerId: "P1" | "P2", instanceId: string): MatchState {
  if (state.players[playerId].hand.includes(instanceId)) {
    return state;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        deck: state.players[playerId].deck.filter((id) => id !== instanceId),
        hand: [...state.players[playerId].hand, instanceId]
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [instanceId]: {
        ...state.cardsByInstanceId[instanceId],
        zone: "HAND"
      }
    }
  };
}
