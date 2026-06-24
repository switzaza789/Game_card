import { describe, expect, it } from "vitest";
import { cardsSeed } from "../../data/cardsSeed";
import type { AnimalInstance, CardInstance, MatchState, PlayerId } from "../../types/game";
import { dispatchAction, forcePhase } from "../actions/reducer";
import { getCardDefinition } from "../cards/deck";
import { createMatch } from "../state/match";
import { addStatus } from "../status/status";
import { effectRegistry } from "./effectEngine";

describe("card effect registry", () => {
  it("maps every card logic_key from cards_seed.json", () => {
    const logicKeys = cardsSeed.map((card) => card.logic_key).sort();

    expect(Object.keys(effectRegistry).sort()).toEqual(logicKeys);
  });
});

describe("card effects", () => {
  it("resolves matching Support with level up and attachment", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A002", 1);
    state = forceCardToHand(state, "P1", "S002");

    const result = play(state, "P1", "S002", targetOf(state, "P1", "A002"));
    const cat = getBoardAnimal(result.state, "P1", "A002");
    const support = result.state.cardsByInstanceId["P1-S002-1"];

    expect(result.validation.valid).toBe(true);
    expect(cat.level).toBe(2);
    expect(cat.attachedSupportIds).toContain("P1-S002-1");
    expect(support.zone).toBe("BOARD");
  });

  it("resolves off-target Support without level up", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A001", 1);
    state = forceCardToHand(state, "P1", "S002");

    const result = play(state, "P1", "S002", targetOf(state, "P1", "A001"));
    const dog = getBoardAnimal(result.state, "P1", "A001");

    expect(result.validation.valid).toBe(true);
    expect(dog.level).toBe(1);
    expect(result.state.players.P1.graveyard).toContain("P1-S002-1");
  });

  it("applies Support status variants and draw-bottom effects", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A003", 1);
    state = forceCardToHand(state, "P1", "S003");

    let result = play(state, "P1", "S003", targetOf(state, "P1", "A003"));
    expect(getBoardAnimal(result.state, "P1", "A003").statuses.some((status) => status.code === "TEMP_LEVEL_DOWN_IMMUNITY")).toBe(true);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A004", 1);
    state = forceCardToHand(state, "P1", "S004");
    result = play(state, "P1", "S004", targetOf(state, "P1", "A004"));
    expect(getBoardAnimal(result.state, "P1", "A004").statuses.some((status) => status.code === "REMOVAL_SHIELD")).toBe(true);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A005", 1);
    state = forceCardToHand(state, "P1", "S005");
    const bottomCard = state.players.P1.hand.find((id) => id !== "P1-S005-1");
    result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-S005-1",
        target: targetOf(state, "P1", "A005"),
        bottomCardInstanceId: bottomCard
      }
    });
    expect(result.validation.valid).toBe(true);
    expect(bottomCard ? result.state.players.P1.deck[result.state.players.P1.deck.length - 1] : undefined).toBe(bottomCard);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A006", 1);
    state = forceCardToHand(state, "P1", "S006");
    result = play(state, "P1", "S006", targetOf(state, "P1", "A006"));
    expect(getBoardAnimal(result.state, "P1", "A006").statuses.some((status) => status.code === "TEMP_WEAKNESS_IMMUNITY")).toBe(true);
  });

  it("moves deck top to bottom with Bird and Yarn effects", () => {
    let state = setupActionState();
    state = forceCardToHand(state, "P1", "A005");
    const initialSecond = state.players.P1.deck[1];

    let result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: { cardInstanceId: "P1-A005-1", moveTopCardToBottom: true }
    });

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P1.deck[0]).toBe(initialSecond);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A002", 1);
    state = forceCardToHand(state, "P1", "S002");
    const beforeHand = state.players.P1.hand.length;
    result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-S002-1",
        target: targetOf(state, "P1", "A002"),
        moveTopCardToBottom: true,
        bottomCardInstanceId: state.players.P1.hand.find((id) => id !== "P1-S002-1")
      }
    });

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P1.hand.length).toBe(beforeHand - 1);
    expect(getBoardAnimal(result.state, "P1", "A002").onceFlags).toContain("first_matching_support_draw1_bottom1");
  });

  it("keeps Support level boundary at level 3", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A002", 3);
    state = forceCardToHand(state, "P1", "S002");

    const result = play(state, "P1", "S002", targetOf(state, "P1", "A002"));

    expect(getBoardAnimal(result.state, "P1", "A002").level).toBe(3);
  });

  it("applies Weakness direct target removal", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A002", 1);
    state = forceCardToHand(state, "P1", "W002");

    const result = play(state, "P1", "W002", targetOf(state, "P2", "A002"));

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P2.board.filter(Boolean)).toHaveLength(0);
    expect(result.state.players.P2.graveyard).toContain("P2-A002-1");
  });

  it("resolves direct Weakness level down with Support discard and Bear protection", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A002", 1);
    state = forceCardToHand(state, "P2", "S002");
    state = {
      ...state,
      currentPlayerId: "P2",
      phase: "ACTION"
    };
    state = play(state, "P2", "S002", targetOf(state, "P2", "A002")).state;
    state = { ...state, currentPlayerId: "P1", phase: "ACTION" };
    state = forceCardToHand(state, "P1", "W002");

    let result = play(state, "P1", "W002", targetOf(state, "P2", "A002"));
    expect(getBoardAnimal(result.state, "P2", "A002").level).toBe(1);
    expect(result.state.players.P2.graveyard).toContain("P2-S002-1");

    state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A004", 2);
    state = forceCardToHand(state, "P2", "S004");
    state = {
      ...state,
      currentPlayerId: "P2",
      phase: "ACTION"
    };
    state = play(state, "P2", "S004", targetOf(state, "P2", "A004")).state;
    state = { ...state, currentPlayerId: "P1", phase: "ACTION" };
    state = forceCardToHand(state, "P1", "W003");
    result = play(state, "P1", "W003", targetOf(state, "P2", "A004"));
    expect(getBoardAnimal(result.state, "P2", "A004").onceFlags).toContain("prevent_first_support_destroy_then_skip_score");
  });

  it("applies Weakness off-target next score minus one", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A002", 1);
    state = forceCardToHand(state, "P1", "W001");

    const result = play(state, "P1", "W001", targetOf(state, "P2", "A002"));
    const cat = getBoardAnimal(result.state, "P2", "A002");

    expect(result.validation.valid).toBe(true);
    expect(cat.statuses.some((status) => status.code === "NEXT_SCORE_MINUS_1")).toBe(true);
  });

  it("rejects invalid and protected Weakness targets", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A006", 1);
    state = forceCardToHand(state, "P1", "W005");
    state = addStatus(state, "P2-A006-1", {
      code: "TEMP_WEAKNESS_IMMUNITY",
      expiresAt: "OPPONENT_NEXT_TURN_END"
    });

    const protectedResult = play(state, "P1", "W005", targetOf(state, "P2", "A006"));
    const ownTargetResult = play(state, "P1", "W005", targetOf(state, "P1", "W005"));

    expect(protectedResult.validation.valid).toBe(false);
    expect(ownTargetResult.validation.valid).toBe(false);
  });

  it("resolves Weakness Shield reaction and locks next utility action", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A001", 1);
    state = forceCardToHand(state, "P1", "W001");
    state = forceCardToHand(state, "P2", "X002");

    const result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-W001-1",
        target: targetOf(state, "P2", "A001"),
        reactionCardInstanceId: "P2-X002-1"
      }
    });

    expect(result.validation.valid).toBe(true);
    expect(getBoardAnimal(result.state, "P2", "A001").zone).toBe("BOARD");
    expect(result.state.players.P2.utilityLocked).toBe(true);
    expect(result.state.players.P1.graveyard).toContain("P1-W001-1");
    expect(result.state.players.P2.graveyard).toContain("P2-X002-1");
  });

  it("rejects invalid Weakness Shield reaction and direct Weakness Shield play", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A001", 1);
    state = forceCardToHand(state, "P1", "W001");

    const invalidReaction = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-W001-1",
        target: targetOf(state, "P2", "A001"),
        reactionCardInstanceId: "P2-X002-1"
      }
    });

    expect(invalidReaction.validation.valid).toBe(false);

    state = forceCardToHand(state, "P1", "X002");
    const directShield = play(state, "P1", "X002");
    expect(directShield.validation.valid).toBe(false);
  });

  it("resolves Quick Swap with a replacement Animal in the same slot", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A001", 1);
    state = forceCardToHand(state, "P1", "X003");
    state = forceCardToHand(state, "P1", "A002");

    const result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-X003-1",
        target: targetOf(state, "P1", "A001"),
        replacementCardInstanceId: "P1-A002-1"
      }
    });

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P1.hand).toContain("P1-A001-1");
    expect(result.state.players.P1.board[0]).toBe("P1-A002-1");
  });

  it("rejects invalid Quick Swap and Strong Wind targets", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A001", 1);
    state = forceCardToHand(state, "P1", "X003");
    state = forceCardToHand(state, "P1", "S001");

    const badSwap = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-X003-1",
        target: targetOf(state, "P1", "A001"),
        replacementCardInstanceId: "P1-S001-1"
      }
    });
    expect(badSwap.validation.valid).toBe(false);

    state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A005", 2);
    state = forceCardToHand(state, "P1", "X004");
    const strongWind = play(state, "P1", "X004", targetOf(state, "P2", "A005"));
    expect(strongWind.validation.valid).toBe(false);
  });

  it("prevents first skip score with Turtle protection", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A007", 1);
    state = addStatus(state, "P1-A007-1", { code: "SKIP_NEXT_SCORE", expiresAt: "NEXT_SCORE" });
    state = { ...state, turnNumber: 2, phase: "DRAW" };

    const scored = dispatchAction(state, { type: "ADVANCE_PHASE", playerId: "P1", payload: {} }).state;

    expect(scored.players.P1.score).toBe(1);
    expect(getBoardAnimal(scored, "P1", "A007").onceFlags).toContain("prevent_first_skip_score");
  });

  it("prevents Rabbit first level down", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A003", 2);
    state = forceCardToHand(state, "P1", "W003");

    const result = play(state, "P1", "W003", targetOf(state, "P2", "A003"));

    expect(result.validation.valid).toBe(true);
    expect(getBoardAnimal(result.state, "P2", "A003").level).toBe(2);
    expect(getBoardAnimal(result.state, "P2", "A003").onceFlags).toContain("prevent_first_level_down");
  });

  it("prevents Dog first Weakness removal and applies skip score", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A001", 1);
    state = forceCardToHand(state, "P1", "W001");

    const result = play(state, "P1", "W001", targetOf(state, "P2", "A001"));
    const dog = getBoardAnimal(result.state, "P2", "A001");

    expect(result.validation.valid).toBe(true);
    expect(dog.zone).toBe("BOARD");
    expect(dog.statuses.some((status) => status.code === "SKIP_NEXT_SCORE")).toBe(true);
  });

  it("applies Fish first-score bonus", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A006", 1);
    state = { ...state, turnNumber: 2, phase: "DRAW" };

    const scored = dispatchAction(state, { type: "ADVANCE_PHASE", playerId: "P1", payload: {} }).state;

    expect(scored.players.P1.score).toBe(2);
  });

  it("returns attached Support with Monkey and lowers the supported Animal level", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P1", "A001", 1);
    state = forceCardToHand(state, "P1", "S001");
    state = play(state, "P1", "S001", targetOf(state, "P1", "A001")).state;
    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, animalActionUsed: false, utilityActionUsed: false }
      }
    };
    state = forceCardToHand(state, "P1", "A008");

    const result = dispatchAction(state, {
      type: "PLAY_CARD",
      playerId: "P1",
      payload: {
        cardInstanceId: "P1-A008-1",
        selectedSupportInstanceId: "P1-S001-1"
      }
    });

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P1.hand).toContain("P1-S001-1");
    expect(getBoardAnimal(result.state, "P1", "A001").level).toBe(1);
  });

  it("uses Strong Wind to bounce enemy Level 1 unless protected", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A005", 1);
    state = forceCardToHand(state, "P1", "X004");

    const result = play(state, "P1", "X004", targetOf(state, "P2", "A005"));

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P2.hand).toContain("P2-A005-1");

    state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A001", 1);
    state = forceCardToHand(state, "P2", "S001");
    state = forceCardToHand(state, "P1", "X004");
    state = {
      ...state,
      currentPlayerId: "P2",
      phase: "ACTION"
    };
    state = {
      ...play(state, "P2", "S001", targetOf(state, "P2", "A001")).state,
      currentPlayerId: "P1",
      phase: "ACTION"
    };

    const protectedResult = play(state, "P1", "X004", targetOf(state, "P2", "A001"));
    expect(getBoardAnimal(protectedResult.state, "P2", "A001").zone).toBe("BOARD");
  });

  it("uses Food Thief only while behind", () => {
    let state = setupActionState();
    state = forceCardToHand(state, "P1", "X005");
    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players.P1, score: 3 },
        P2: { ...state.players.P2, score: 5 }
      }
    };

    const result = play(state, "P1", "X005");

    expect(result.validation.valid).toBe(true);
    expect(result.state.players.P1.score).toBe(4);
    expect(result.state.players.P2.score).toBe(4);

    const rejected = play(result.state, "P1", "X005");
    expect(rejected.validation.valid).toBe(false);
  });

  it("applies Lullaby skip score and expires the status after scoring", () => {
    let state = setupActionState();
    state = forceAnimalToBoard(state, "P2", "A005", 1);
    state = forceCardToHand(state, "P1", "X001");

    const applied = play(state, "P1", "X001", targetOf(state, "P2", "A005"));
    expect(applied.validation.valid).toBe(true);
    expect(getBoardAnimal(applied.state, "P2", "A005").statuses.some((status) => status.code === "SKIP_NEXT_SCORE")).toBe(true);

    const p2ScoreState = {
      ...applied.state,
      currentPlayerId: "P2" as const,
      phase: "DRAW" as const,
      turnNumber: 2
    };
    const scored = dispatchAction(p2ScoreState, { type: "ADVANCE_PHASE", playerId: "P2", payload: {} }).state;
    expect(scored.players.P2.score).toBe(0);
    expect(getBoardAnimal(scored, "P2", "A005").statuses.some((status) => status.code === "SKIP_NEXT_SCORE")).toBe(false);
  });
});

function setupActionState(): MatchState {
  return forcePhase(createMatch({ seed: "phase-3-effects" }), "ACTION");
}

function play(state: MatchState, playerId: PlayerId, definitionId: string, target?: ReturnType<typeof targetOf>) {
  return dispatchAction(state, {
    type: "PLAY_CARD",
    playerId,
    payload: {
      cardInstanceId: `${playerId}-${definitionId}-1`,
      target
    }
  });
}

function forceCardToHand(state: MatchState, playerId: PlayerId, definitionId: string): MatchState {
  const instanceId = `${playerId}-${definitionId}-1`;
  const player = state.players[playerId];
  const current = state.cardsByInstanceId[instanceId];
  const nextPlayer = {
    ...player,
    deck: player.deck.filter((id) => id !== instanceId),
    hand: player.hand.includes(instanceId) ? player.hand : [...player.hand, instanceId],
    graveyard: player.graveyard.filter((id) => id !== instanceId),
    board: player.board.map((slot) => (slot === instanceId ? null : slot))
  };

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: nextPlayer
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [instanceId]: {
        instanceId,
        definitionId,
        ownerId: playerId,
        zone: "HAND",
        attachedToId: current?.attachedToId,
        increasedLevel: current?.increasedLevel
      } satisfies CardInstance
    }
  };
}

function forceAnimalToBoard(
  state: MatchState,
  playerId: PlayerId,
  definitionId: string,
  level: 1 | 2 | 3
): MatchState {
  const instanceId = `${playerId}-${definitionId}-1`;
  const player = state.players[playerId];
  const slotIndex = player.board.findIndex((slot) => slot === null || slot === instanceId);
  const board = [...player.board];
  board[slotIndex] = instanceId;
  const animal: AnimalInstance = {
    instanceId,
    definitionId,
    ownerId: playerId,
    zone: "BOARD",
    level,
    slotNo: (slotIndex + 1) as 1 | 2 | 3,
    enteredTurn: 0,
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
        graveyard: player.graveyard.filter((id) => id !== instanceId),
        board
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [instanceId]: animal
    }
  };
}

function targetOf(state: MatchState, playerId: PlayerId, definitionId: string) {
  const instanceId = `${playerId}-${definitionId}-1`;
  const animal = state.cardsByInstanceId[instanceId];

  if (!animal || getCardDefinition(definitionId).category !== "Animal") {
    return { playerId, zone: "BOARD" as const, instanceId };
  }

  return { playerId, zone: "BOARD" as const, instanceId };
}

function getBoardAnimal(state: MatchState, playerId: PlayerId, definitionId: string): AnimalInstance {
  const animal = state.cardsByInstanceId[`${playerId}-${definitionId}-1`];

  if (!animal || animal.zone !== "BOARD" || !("level" in animal)) {
    throw new Error(`Expected board Animal ${playerId}-${definitionId}-1`);
  }

  return animal;
}
