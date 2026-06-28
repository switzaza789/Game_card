import { describe, expect, it } from "vitest";
import type { CardInstance, MatchState, Action } from "../../types/game";
import { getCardDefinition } from "../cards/deck";
import { dispatchAction as originalDispatchAction, evaluateWin, forcePhase } from "./reducer";
import { createMatch, drawCards } from "../state/match";
import { engineConfig } from "../config/config";
import { validateAction } from "../validation/validation";

function dispatchAction(state: MatchState, action: Action): ReturnType<typeof originalDispatchAction> {
  return originalDispatchAction(state, { action, timestamp: Date.now() });
}

describe("opening draw", () => {
  it("rejects DRAW_OPENING_CARD before starter acknowledgment", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-reject-1" });
    const result = dispatchAction(state, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    });
    expect(result.validation.valid).toBe(false);
  });

  it("rejects DRAW_OPENING_CARD for the wrong player", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-reject-2" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    const result = dispatchAction(ackState, {
      type: "DRAW_OPENING_CARD", playerId: "P2", payload: {}
    });
    expect(result.validation.valid).toBe(false);
  });

  it("rejects DRAW_OPENING_CARD when player has zero remaining", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-reject-3" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    const zeroState = { ...ackState, openingDrawRemaining: { P1: 0, P2: 5 } };
    const result = dispatchAction(zeroState, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    });
    expect(result.validation.valid).toBe(false);
  });

  it("rejects DRAW_OPENING_CARD when pregameStep is COMPLETE", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-reject-4" });
    const completeState = { ...state, pregameStep: "COMPLETE" as const };
    const result = dispatchAction(completeState, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    });
    expect(result.validation.valid).toBe(false);
  });

  it("rejects normal actions during OPENING_DRAW", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-reject-5" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    expect(dispatchAction(ackState, { type: "ADVANCE_PHASE", playerId: "P1", payload: {} }).validation.valid).toBe(false);
    expect(dispatchAction(ackState, { type: "END_TURN", playerId: "P1", payload: {} }).validation.valid).toBe(false);
    const cardId = ackState.players.P1.deck[0];
    expect(dispatchAction(ackState, { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: cardId } }).validation.valid).toBe(false);
    expect(dispatchAction(ackState, { type: "RECYCLE", playerId: "P1", payload: { cardInstanceId: cardId } }).validation.valid).toBe(false);
  });

  it("rejects duplicate draw from the same player", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-dup" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    const first = dispatchAction(ackState, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    });
    expect(first.validation.valid).toBe(true);
    expect(first.state.players.P1.hand).toHaveLength(1);
    expect(first.state.players.P1.deck).toHaveLength(23);
    const dup = dispatchAction(first.state, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    }).state;
    expect(dup.players.P1.hand).toHaveLength(2);
    expect(dup.players.P1.deck).toHaveLength(22);
  });

  it("preserves turn counter and active player during opening draw", () => {
    const state = createMatch({ startingPlayerId: "P2", seed: "od-turn" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P2", payload: {}
    }).state;
    expect(ackState.turnNumber).toBe(1);
    expect(ackState.currentPlayerId).toBe("P2");
    let s = ackState;
    for (let i = 0; i < 5; i += 1) {
      const r = dispatchAction(s, { type: "DRAW_OPENING_CARD", playerId: "P2", payload: {} });
      expect(r.validation.valid).toBe(true);
      expect(r.state.turnNumber).toBe(1);
      expect(r.state.currentPlayerId).toBe("P2");
      s = r.state;
    }
    expect(s.players.P2.hand).toHaveLength(5);
    expect(s.openingDrawPlayerId).toBe("P1");
    for (let i = 0; i < 5; i += 1) {
      const r = dispatchAction(s, { type: "DRAW_OPENING_CARD", playerId: "P1", payload: {} });
      expect(r.validation.valid).toBe(true);
      expect(r.state.turnNumber).toBe(1);
      expect(r.state.currentPlayerId).toBe("P2");
      s = r.state;
    }
    expect(s.pregameStep).toBe("COMPLETE");
    expect(s.phase).toBe("ACTION");
    expect(s.currentPlayerId).toBe("P2");
    expect(s.startingPlayerId).toBe("P2");
    expect(s.turnNumber).toBe(1);
    expect(s.players.P1.hand).toHaveLength(5);
    expect(s.players.P2.hand).toHaveLength(5);
  });

  it("does not create an undo snapshot during opening draw", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-undo" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    const drawResult = dispatchAction(ackState, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    });
    expect(drawResult.state.undoSnapshot).toBeUndefined();
  });

  it("undo is rejected during OPENING_DRAW and across the boundary", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-undo-2" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    const undoResult = dispatchAction(ackState, {
      type: "UNDO_LAST_REVERSIBLE_ACTION", playerId: "P1", payload: {}
    });
    expect(undoResult.validation.valid).toBe(false);
    let s = ackState;
    for (let i = 0; i < 5; i += 1) {
      s = dispatchAction(s, { type: "DRAW_OPENING_CARD", playerId: "P1", payload: {} }).state;
    }
    for (let i = 0; i < 5; i += 1) {
      s = dispatchAction(s, { type: "DRAW_OPENING_CARD", playerId: "P2", payload: {} }).state;
    }
    expect(s.pregameStep).toBe("COMPLETE");
    const postUndo = dispatchAction(s, {
      type: "UNDO_LAST_REVERSIBLE_ACTION", playerId: "P1", payload: {}
    });
    expect(postUndo.validation.valid).toBe(false);
    expect(postUndo.state.players.P1.hand).toHaveLength(5);
    expect(postUndo.state.players.P2.hand).toHaveLength(5);
  });

  it("does not modify score, board, graveyard, or recycle state", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "od-sidefx" });
    const ackState = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER", playerId: "P1", payload: {}
    }).state;
    const drawResult = dispatchAction(ackState, {
      type: "DRAW_OPENING_CARD", playerId: "P1", payload: {}
    });
    expect(drawResult.state.players.P1.score).toBe(0);
    expect(drawResult.state.players.P2.score).toBe(0);
    expect(drawResult.state.players.P1.board).toEqual([null, null, null]);
    expect(drawResult.state.players.P2.board).toEqual([null, null, null]);
    expect(drawResult.state.players.P1.graveyard).toEqual([]);
    expect(drawResult.state.players.P2.graveyard).toEqual([]);
  });
});

describe("core engine reducer", () => {
  it("moves through READY, DRAW, SCORE, ACTION, and END phases", () => {
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "phase-flow" }), "READY");

    state = dispatchAction(state, advance()).state;
    expect(state.phase).toBe("DRAW");
    expect(state.players.P1.hand).toHaveLength(0);

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

  it("blocks normal gameplay until the starter reveal is acknowledged without mutating state", () => {
    const state = createMatch({ startingPlayerId: "P1", seed: "pregame-block" });
    const before = structuredClone(state);
    const result = dispatchAction(state, {
      type: "ADVANCE_PHASE",
      playerId: "P1",
      payload: {}
    });

    expect(result.validation.valid).toBe(false);
    expect(result.state).toEqual(before);
  });

  it("acknowledges the starter reveal once without changing turn resources or RNG", () => {
    const state = createMatch({ startingPlayerId: "P2", seed: "pregame-ack" });
    const result = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER",
      playerId: "P2",
      payload: {}
    });

    expect(result.validation.valid).toBe(true);
    expect(result.state.pregameStep).toBe("OPENING_DRAW");
    expect(result.state.phase).toBe("READY");
    expect(result.state.currentPlayerId).toBe("P2");
    expect(result.state.startingPlayerId).toBe("P2");
    expect(result.state.turnNumber).toBe(1);
    expect(result.state.rng).toEqual(state.rng);
    expect(result.state.players).toEqual(state.players);
  });

  it("rejects repeated starter acknowledgement after the reveal is complete", () => {
    const state = dispatchAction(createMatch({ startingPlayerId: "P1", seed: "pregame-repeat" }), {
      type: "ACKNOWLEDGE_STARTER",
      playerId: "P1",
      payload: {}
    }).state;

    const result = dispatchAction(state, {
      type: "ACKNOWLEDGE_STARTER",
      playerId: "P1",
      payload: {}
    });

    expect(result.validation.valid).toBe(false);
    expect(result.state.pregameStep).toBe("OPENING_DRAW");
    expect(result.state.phase).toBe("READY");
  });

  it("rejects actions from the inactive player", () => {
    const state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "invalid-player" }), "ACTION");
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
    const state = createMatch({ startingPlayerId: "P1",  seed: "invalid-context" });

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
      ...createMatch({ startingPlayerId: "P1",  seed: "already-finished" }),
      status: "FINISHED" as const
    };

    expect(dispatchAction(state, advance()).validation.valid).toBe(false);
  });

  it("allows mulligan up to two starting cards and rejects the third", () => {
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "mulligan-seed" }), "READY");
    state = drawCards(state, "P1", engineConfig.starting_hand);
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
    const state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "bad-mulligan" }), "READY");
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "play-animal" }), "ACTION");
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "full-board" }), "ACTION");

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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "utility" }), "ACTION");
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "utility-limit" }), "ACTION");
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
    const state = createMatch({ startingPlayerId: "P1",  seed: "bad-play" });
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
    let firstTurnState = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "recycle" }), "ACTION");
    firstTurnState = drawCards(firstTurnState, "P1", 1);
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
    expect(accepted.state.players.P1.hand).toHaveLength(1);
    expect(accepted.state.players.P1.graveyard).toContain(cardId);
    expect(accepted.state.players.P1.utilityActionUsed).toBe(true);
  });

  it("rejects recycle outside Action phase, after utility use, and with an empty deck", () => {
    const readyState = createMatch({ startingPlayerId: "P1",  seed: "bad-recycle" });
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "hand-limit" }), "ACTION");
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "new-animal-score" }), "ACTION");
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "score" }), "ACTION");
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
    let state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "p2-draw" }), "ACTION");

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
    expect(state.players.P2.hand).toHaveLength(1);
  });

  it("finishes when a player reaches the target score", () => {
    const state = createMatch({ startingPlayerId: "P1",  seed: "win" });
    const target = state.targetScore;
    const finished = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          score: target
        }
      }
    });

    expect(finished.status).toBe("FINISHED");
    expect(finished.winner).toBe("P1");
    expect(finished.finishReason).toBe("TARGET_SCORE");
  });

  it("handles target-score winner branches", () => {
    const state = createMatch({ startingPlayerId: "P1",  seed: "score-winner-branches" });
    const target = state.targetScore;

    expect(
      evaluateWin({
        ...state,
        players: {
          ...state.players,
          P2: { ...state.players.P2, score: target }
        }
      }).winner
    ).toBe("P2");

    expect(
      evaluateWin({
        ...state,
        players: {
          ...state.players,
          P1: { ...state.players.P1, score: target },
          P2: { ...state.players.P2, score: target + 1 }
        }
      }).winner
    ).toBe("P2");
  });

  it("does not finish at one below target score", () => {
    const state = createMatch({ startingPlayerId: "P1",  seed: "below-target" });
    const belowResult = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: state.targetScore - 1 }
      }
    });
    expect(belowResult.status).toBe("ACTIVE");
  });

  it("finishes with overshoot from a multi-point action", () => {
    const state = createMatch({ startingPlayerId: "P1",  seed: "overshoot" });
    const overshoot = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: state.targetScore + 3 }
      }
    });
    expect(overshoot.status).toBe("FINISHED");
    expect(overshoot.winner).toBe("P1");
    expect(overshoot.finishReason).toBe("TARGET_SCORE");
  });

  it("rejects actions after the match is finished via target score", () => {
    const state = {
      ...createMatch({ startingPlayerId: "P1",  seed: "post-win" }),
      status: "FINISHED" as const,
      finishReason: "TARGET_SCORE" as const,
      winner: "P1" as const
    };
    expect(dispatchAction(state, advance()).validation.valid).toBe(false);
  });

  it("preserves targetScore through Undo", () => {
    let state = createMatch({ startingPlayerId: "P1",  seed: "undo-target" });
    const originalTarget = state.targetScore;
    const snapshotState = { ...state };
    delete snapshotState.undoSnapshot;
    const snapshot: MatchState["undoSnapshot"] = {
      state: snapshotState,
      actor: "P1",
      summary: "test"
    };
    state = { ...state, undoSnapshot: snapshot };
    const undone = dispatchAction(state, {
      type: "UNDO_LAST_REVERSIBLE_ACTION",
      playerId: "P1",
      payload: {}
    }).state;
    expect(undone.targetScore).toBe(originalTarget);
  });

  it("uses tiebreakers when both players reach the turn limit", () => {
    const state = createMatch({ startingPlayerId: "P1",  seed: "turn-limit" });
    const finished = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: 5, turnsTaken: 12 },
        P2: { ...state.players.P2, score: 4, turnsTaken: 12 }
      }
    });

    expect(finished.status).toBe("FINISHED");
    expect(finished.winner).toBe("P1");
    expect(finished.finishReason).toBe("TURN_LIMIT");
  });

  it("uses later tiebreakers and can end in a draw", () => {
    const state = createMatch({ startingPlayerId: "P1",  seed: "tiebreak-branches" });

    const p2DeckWinner = evaluateWin({
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: 5, turnsTaken: 12, deck: [] },
        P2: { ...state.players.P2, score: 5, turnsTaken: 12 }
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
    const state = forcePhase(createMatch({ startingPlayerId: "P1",  seed: "validation-direct" }), "READY");

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
