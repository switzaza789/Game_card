import { describe, expect, it } from "vitest";
import { getCardDefinition as lookupCardDefinition } from "../cards/deck";
import {
  getBoardAnimalCount,
  getPlayableAnimalCardIds,
  getTotalAnimalLevel,
  otherPlayerId
} from "./selectors";
import { createCardDefinitionMap, cloneRng, createMatch, drawCards } from "./match";
import { dispatchAction as originalDispatchAction } from "../actions/reducer";
import { engineConfig } from "../config/config";


describe("match initialization", () => {
  it("creates two players with deterministic decks and starting hands", () => {
    const first = createMatch({ seed: "phase-2-seed" });
    const second = createMatch({ seed: "phase-2-seed" });

    expect(first.players.P1.deck).toEqual(second.players.P1.deck);
    expect(first.players.P2.deck).toEqual(second.players.P2.deck);
    expect(first.players.P1.hand).toHaveLength(0);
    expect(first.players.P2.hand).toHaveLength(0);
    expect(first.players.P1.deck).toHaveLength(24);
    expect(first.players.P2.deck).toHaveLength(24);
    expect(Object.keys(first.cardsByInstanceId)).toHaveLength(48);
    expect(first.openingDrawPlayerId).toBe(first.startingPlayerId);
    expect(first.openingDrawRemaining).toEqual({ P1: engineConfig.starting_hand, P2: engineConfig.starting_hand });
  });

  it("chooses and preserves the starting player deterministically during setup", () => {
    const first = createMatch({ seed: "starter-seed" });
    const second = createMatch({ seed: "starter-seed" });

    expect(first.startingPlayerId).toBe(second.startingPlayerId);
    expect(first.currentPlayerId).toBe(first.startingPlayerId);
    expect(first.pregameStep).toBe("STARTER_REVEAL");
    expect(first.targetScore).toBe(10);
    expect(first.rng).toEqual(second.rng);
    expect(first.openingDrawPlayerId).toBe(first.startingPlayerId);
    expect(first.openingDrawRemaining).toEqual({ P1: engineConfig.starting_hand, P2: engineConfig.starting_hand });
  });

  it("can produce either player as deterministic starter across seeds", () => {
    const starters = new Set(
      Array.from({ length: 20 }, (_, index) => createMatch({ seed: `starter-${index}` }).startingPlayerId)
    );

    expect(starters).toEqual(new Set(["P1", "P2"]));
  });

  it("starts with empty hands awaiting opening draw", () => {
    const state = createMatch({ seed: "animal-guarantee" });

    expect(state.players.P1.hand).toHaveLength(0);
    expect(state.players.P2.hand).toHaveLength(0);
    expect(state.openingDrawRemaining.P1).toBe(engineConfig.starting_hand);
    expect(state.openingDrawRemaining.P2).toBe(engineConfig.starting_hand);
  });

  it("can exercise the opening draw flow via DRAW_OPENING_CARD action", () => {
    const state = createMatch({ seed: "find-189" });
    const starter = state.currentPlayerId;
    const ack = originalDispatchAction(state, {
      action: { type: "ACKNOWLEDGE_STARTER", playerId: starter, payload: {} },
      timestamp: Date.now()
    });

    expect(ack.validation.valid).toBe(true);
    expect(ack.state.pregameStep).toBe("OPENING_DRAW");

    const draw = originalDispatchAction(ack.state, {
      action: { type: "DRAW_OPENING_CARD", playerId: starter, payload: {} },
      timestamp: Date.now()
    });

    expect(draw.validation.valid).toBe(true);
    expect(draw.state.players[starter].hand).toHaveLength(1);

    const drawnCard = draw.state.cardsByInstanceId[draw.state.players[starter].hand[0]];
    expect(drawnCard.zone).toBe("HAND");
  });

  it("draws cards immutably", () => {
    const state = createMatch({ seed: "draw-seed" });
    const nextState = drawCards(state, "P1", 1);

    expect(nextState).not.toBe(state);
    expect(nextState.players.P1.hand).toHaveLength(1);
    expect(nextState.players.P1.deck).toHaveLength(23);
    expect(state.players.P1.hand).toHaveLength(0);
  });

  it("does not change state when drawing from an empty deck", () => {
    const state = createMatch({ seed: "empty-deck" });
    const emptyDeckState = {
      ...state,
      players: {
        ...state.players,
        P1: {
          ...state.players.P1,
          deck: []
        }
      }
    };

    expect(drawCards(emptyDeckState, "P1", 1)).toBe(emptyDeckState);
  });

  it("exposes card definition utilities for engine setup", () => {
    const map = createCardDefinitionMap();
    const rng = { seed: "clone", step: 2 };

    expect(map.A001?.name_en).toBe("Playful Dog");
    expect(cloneRng(rng)).toEqual(rng);
    expect(cloneRng(rng)).not.toBe(rng);
    expect(() => lookupCardDefinition("NOPE")).toThrow(/Unknown card definition/);
  });

  it("reads board and hand selectors", () => {
    const state = createMatch({ seed: "selector-seed" });

    expect(otherPlayerId("P1")).toBe("P2");
    expect(otherPlayerId("P2")).toBe("P1");
    expect(getPlayableAnimalCardIds(state, "P1").length).toBe(0);
    expect(getBoardAnimalCount(state, "P1")).toBe(0);
    expect(getTotalAnimalLevel(state, "P1")).toBe(0);
  });
});
