import { describe, expect, it } from "vitest";
import { getCardDefinition, getCardDefinition as lookupCardDefinition } from "../cards/deck";
import {
  getBoardAnimalCount,
  getPlayableAnimalCardIds,
  getTotalAnimalLevel,
  otherPlayerId
} from "./selectors";
import { createCardDefinitionMap, cloneRng, createMatch, drawCards } from "./match";

describe("match initialization", () => {
  it("creates two players with deterministic decks and starting hands", () => {
    const first = createMatch({ seed: "phase-2-seed" });
    const second = createMatch({ seed: "phase-2-seed" });

    expect(first.players.P1.deck).toEqual(second.players.P1.deck);
    expect(first.players.P2.deck).toEqual(second.players.P2.deck);
    expect(first.players.P1.hand).toHaveLength(5);
    expect(first.players.P2.hand).toHaveLength(5);
    expect(first.players.P1.deck).toHaveLength(19);
    expect(first.players.P2.deck).toHaveLength(19);
    expect(Object.keys(first.cardsByInstanceId)).toHaveLength(48);
  });

  it("guarantees at least one Animal in each starting hand", () => {
    const state = createMatch({ seed: "animal-guarantee" });

    for (const playerId of ["P1", "P2"] as const) {
      const hasAnimal = state.players[playerId].hand.some((instanceId) => {
        const card = state.cardsByInstanceId[instanceId];
        return getCardDefinition(card.definitionId).category === "Animal";
      });

      expect(hasAnimal).toBe(true);
    }
  });

  it("can exercise the no-animal starting hand correction path", () => {
    const correctedState = createMatch({ seed: "find-189" });
    const firstHandCard = correctedState.cardsByInstanceId[correctedState.players.P1.hand[0]];

    expect(
      correctedState.players.P1.hand.some((instanceId) => {
        const card = correctedState.cardsByInstanceId[instanceId];
        return getCardDefinition(card.definitionId).category === "Animal";
      })
    ).toBe(true);
    expect(getCardDefinition(firstHandCard.definitionId).category).toBe("Animal");
  });

  it("draws cards immutably", () => {
    const state = createMatch({ seed: "draw-seed" });
    const nextState = drawCards(state, "P1", 1);

    expect(nextState).not.toBe(state);
    expect(nextState.players.P1.hand).toHaveLength(6);
    expect(nextState.players.P1.deck).toHaveLength(18);
    expect(state.players.P1.hand).toHaveLength(5);
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
    expect(getPlayableAnimalCardIds(state, "P1").length).toBeGreaterThan(0);
    expect(getBoardAnimalCount(state, "P1")).toBe(0);
    expect(getTotalAnimalLevel(state, "P1")).toBe(0);
  });
});
