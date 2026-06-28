import { describe, expect, it } from "vitest";
import { validateStoredMatch } from "./validator";
import { createMatch } from "../engine/state/match";
import { initStats } from "./statsTracker";
import { getCardDefinition } from "../engine/cards/deck";
import type { PersistedActiveMatch } from "./types";
import type { MatchState } from "../types/game";

function makeValidPayload(): PersistedActiveMatch {
  return {
    schemaVersion: "1",
    state: createMatch({ seed: "validator-test" }),
    screen: "battle",
    stats: initStats(),
    savedAt: Date.now()
  };
}

describe("validator — validateStoredMatch", () => {
  it("accepts a valid persisted match", () => {
    const result = validateStoredMatch(makeValidPayload());
    expect(result.ok).toBe(true);
  });

  it("rejects null input", () => {
    const result = validateStoredMatch(null);
    expect(result.ok).toBe(false);
  });

  it("rejects wrong schema version", () => {
    const payload = { ...makeValidPayload(), schemaVersion: "2" };
    const result = validateStoredMatch(payload);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("UnsupportedVersion");
  });

  it("rejects missing savedAt", () => {
    const payload = { ...makeValidPayload(), savedAt: "not-a-number" } as unknown as PersistedActiveMatch;
    const result = validateStoredMatch(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid screen type", () => {
    const payload = { ...makeValidPayload(), screen: "unknown" } as unknown as PersistedActiveMatch;
    const result = validateStoredMatch(payload);
    expect(result.ok).toBe(false);
  });

  it("accepts all valid screen types", () => {
    const screens = ["menu", "howToPlay", "library", "battle", "handoff", "result"] as const;
    for (const screen of screens) {
      const payload = { ...makeValidPayload(), screen };
      expect(validateStoredMatch(payload).ok).toBe(true);
    }
  });

  it("rejects negative player score", () => {
    const payload = makeValidPayload();
    const badState = {
      ...payload.state,
      players: {
        ...payload.state.players,
        P1: { ...payload.state.players.P1, score: -1 }
      }
    };
    const result = validateStoredMatch({ ...payload, state: badState });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("ValidationFailed");
  });

  it("rejects invalid match status", () => {
    const payload = makeValidPayload();
    const badState = { ...payload.state, status: "UNKNOWN" } as unknown as MatchState;
    const result = validateStoredMatch({ ...payload, state: badState });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid phase", () => {
    const payload = makeValidPayload();
    const badState = { ...payload.state, phase: "NOPE" } as unknown as MatchState;
    const result = validateStoredMatch({ ...payload, state: badState });
    expect(result.ok).toBe(false);
  });

  it("rejects when a card has an invalid definitionId", () => {
    const payload = makeValidPayload();
    const instanceIds = Object.keys(payload.state.cardsByInstanceId);
    const firstId = instanceIds[0];
    const badCards = {
      ...payload.state.cardsByInstanceId,
      [firstId]: { ...payload.state.cardsByInstanceId[firstId], definitionId: "XXXX_INVALID" }
    };
    const badState = { ...payload.state, cardsByInstanceId: badCards };
    const result = validateStoredMatch({ ...payload, state: badState });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("ValidationFailed");
  });

  it("accepts attached Support cards as a valid counted card location", () => {
    const payload = makeValidPayload();
    const p1Cards = Object.values(payload.state.cardsByInstanceId).filter((card) => card.ownerId === "P1");
    const animal = p1Cards.find((card) => getCardDefinition(card.definitionId).category === "Animal");
    const support = p1Cards.find((card) => getCardDefinition(card.definitionId).category === "Support");

    if (!animal || !support) {
      throw new Error("Fixture needs P1 Animal and Support cards");
    }

    const p1 = payload.state.players.P1;
    const cleanedZones = {
      deck: p1.deck.filter((id) => id !== animal.instanceId && id !== support.instanceId),
      hand: p1.hand.filter((id) => id !== animal.instanceId && id !== support.instanceId),
      graveyard: p1.graveyard.filter((id) => id !== animal.instanceId && id !== support.instanceId)
    };
    const state: MatchState = {
      ...payload.state,
      players: {
        ...payload.state.players,
        P1: {
          ...p1,
          ...cleanedZones,
          board: [animal.instanceId, null, null]
        }
      },
      cardsByInstanceId: {
        ...payload.state.cardsByInstanceId,
        [animal.instanceId]: {
          ...animal,
          zone: "BOARD",
          level: 1,
          evolutionPoints: 0,
          slotNo: 1,
          enteredTurn: 1,
          attachedSupportIds: [support.instanceId],
          statuses: [],
          onceFlags: []
        },
        [support.instanceId]: {
          ...support,
          zone: "BOARD",
          attachedToId: animal.instanceId
        }
      }
    };

    const result = validateStoredMatch({ ...payload, state });

    expect(result.ok).toBe(true);
  });

  it("adds legacy default targetScore of 15 when missing", () => {
    const payload = makeValidPayload();
    const state = { ...payload.state };
    // @ts-expect-error simulate legacy data without targetScore
    delete state.targetScore;
    const result = validateStoredMatch({ ...payload, state });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.targetScore).toBe(15);
    }
  });

  it("preserves explicit targetScore when present", () => {
    const payload = makeValidPayload();
    const state = { ...payload.state, targetScore: 10 };
    const result = validateStoredMatch({ ...payload, state });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state.targetScore).toBe(10);
    }
  });

  it("defaults old saved board Animals without evolutionPoints to zero", () => {
    const payload = makeValidPayload();
    const animalId = payload.state.players.P1.hand.find((id) => getCardDefinition(payload.state.cardsByInstanceId[id].definitionId).category === "Animal");
    if (!animalId) throw new Error("Fixture needs P1 Animal");
    const animal = payload.state.cardsByInstanceId[animalId];
    const oldAnimal = {
      ...animal,
      zone: "BOARD" as const,
      level: 2 as const,
      slotNo: 1 as const,
      enteredTurn: 1,
      attachedSupportIds: [],
      statuses: [],
      onceFlags: []
    };
    const state = {
      ...payload.state,
      players: {
        ...payload.state.players,
        P1: {
          ...payload.state.players.P1,
          hand: payload.state.players.P1.hand.filter((id) => id !== animalId),
          board: [animalId, null, null]
        }
      },
      cardsByInstanceId: {
        ...payload.state.cardsByInstanceId,
        [animalId]: oldAnimal
      }
    };

    const result = validateStoredMatch({ ...payload, state });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const restored = result.value.state.cardsByInstanceId[animalId];
      expect("evolutionPoints" in restored ? restored.evolutionPoints : undefined).toBe(0);
    }
  });
});
