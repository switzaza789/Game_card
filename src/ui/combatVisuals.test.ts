import { describe, expect, it, beforeEach } from "vitest";
import { mapEntryToCombatVisuals, resetSequenceId } from "./combatVisuals";
import type { ActionLogEntry, EffectOutcome, MatchState, PlayerId } from "../types/game";

function makeEntry(overrides: Partial<ActionLogEntry> & { outcomes: EffectOutcome[] }): ActionLogEntry {
  return {
    seq: 1,
    action: { type: "PLAY_CARD" as const, playerId: "P1" as PlayerId, payload: { cardInstanceId: "c1" } },
    phase: "ACTION",
    turnNumber: 1,
    actor: "P1",
    validation: { valid: true },
    result: "",
    rng: { seed: "test", step: 0 },
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAnimalInstance(id: string, owner: PlayerId, overrides?: Partial<import("../types/game").AnimalInstance>): import("../types/game").AnimalInstance {
  return {
    instanceId: id,
    definitionId: "A001",
    ownerId: owner,
    zone: "BOARD" as const,
    level: 1,
    evolutionPoints: 0,
    slotNo: 1,
    enteredTurn: 1,
    attachedSupportIds: [],
    statuses: [],
    onceFlags: [],
    ...overrides,
  };
}

function makeCardInstance(id: string, owner: PlayerId, overrides?: Partial<import("../types/game").CardInstance>): import("../types/game").CardInstance {
  return {
    instanceId: id,
    definitionId: "W001",
    ownerId: owner,
    zone: "HAND" as const,
    ...overrides,
  };
}

function makeMatch(overrides?: Partial<MatchState>): MatchState {
  return {
    matchId: "m1",
    status: "ACTIVE" as const,
    gameMode: "LOCAL_PVP" as const,
    turnNumber: 1,
    currentPlayerId: "P1",
    startingPlayerId: "P1",
    pregameStep: "COMPLETE",
    phase: "ACTION",
    targetScore: 10,
    players: {
      P1: { id: "P1", score: 0, deck: [], hand: ["c1"], board: [null, null, null], graveyard: [], animalActionUsed: false, utilityActionUsed: false, utilityLocked: false, recycleUsed: false, mulligansUsed: 0, turnsTaken: 0 },
      P2: { id: "P2", score: 0, deck: [], hand: [], board: [null, null, null], graveyard: [], animalActionUsed: false, utilityActionUsed: false, utilityLocked: false, recycleUsed: false, mulligansUsed: 0, turnsTaken: 0 },
    },
    cardsByInstanceId: {
      c1: makeCardInstance("c1", "P1", { definitionId: "A001" }),
      c2: makeAnimalInstance("c2", "P2", { definitionId: "A002" }),
      c3: makeCardInstance("c3", "P1", { definitionId: "S001" }),
      s1: makeCardInstance("s1", "P1", { definitionId: "W001" }),
    },
    actionLog: [],
    rng: { seed: "test", step: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  resetSequenceId();
});

describe("mapEntryToCombatVisuals", () => {
  it("returns empty array for entry without outcomes", () => {
    const entry = makeEntry({ outcomes: [] });
    expect(mapEntryToCombatVisuals(makeMatch(), entry)).toEqual([]);
  });

  it("maps weakness full effect to weakness-full", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "W001",
      playerId: "P1",
      targetInstanceId: "c2",
      targetPlayerId: "P2",
      actionKind: "WEAKNESS",
      effectResult: "FULL_EFFECT",
      reasonCode: "MATCHING_WEAKNESS",
    };
    const entry = makeEntry({ outcomes: [outcome] });
    const result = mapEntryToCombatVisuals(makeMatch(), entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("weakness-full");
    expect(result[0].source?.instanceId).toBe("c1");
    expect(result[0].target?.instanceId).toBe("c2");
    expect(result[0].isOpponentAction).toBe(false);
  });

  it("maps weakness reduced effect to weakness-reduced", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "W001",
      playerId: "P1",
      targetInstanceId: "c2",
      targetPlayerId: "P2",
      actionKind: "WEAKNESS",
      effectResult: "PARTIAL_EFFECT",
      reasonCode: "NON_MATCHING_WEAKNESS",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const result = mapEntryToCombatVisuals(makeMatch({ currentPlayerId: "P1" }), entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("weakness-reduced");
  });

  it("maps shield-blocked when TARGET_PROTECTED", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "W001",
      playerId: "P1",
      targetInstanceId: "c2",
      targetPlayerId: "P2",
      actionKind: "WEAKNESS",
      effectResult: "PREVENTED",
      reasonCode: "TARGET_PROTECTED",
    };
    const entry = makeEntry({ outcomes: [outcome] });
    const result = mapEntryToCombatVisuals(makeMatch(), entry);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("shield-blocked");
    expect(result[1].kind).toBe("shield-blocked");
  });

  it("maps support-applied from CARD_PLAYED", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "S001",
      playerId: "P1",
      targetInstanceId: "c2",
      targetPlayerId: "P2",
      actionKind: "SUPPORT",
    };
    const entry = makeEntry({ outcomes: [outcome] });
    const result = mapEntryToCombatVisuals(makeMatch(), entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("support-applied");
  });

  it("maps support-applied from CARD_ATTACHED", () => {
    const outcome: EffectOutcome = {
      code: "CARD_ATTACHED",
      sourceCardInstanceId: "c3",
      targetInstanceId: "c2",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const match = makeMatch();
    match.cardsByInstanceId = {
      ...match.cardsByInstanceId,
      c2: { instanceId: "c2", definitionId: "A002", ownerId: "P2" as PlayerId, zone: "BOARD" as const, slotNo: 1 as const, level: 1, evolutionPoints: 0, attachedSupportIds: ["c3"], statuses: [], onceFlags: [] },
      c3: { instanceId: "c3", definitionId: "S001", ownerId: "P1" as PlayerId, zone: "BOARD" as const, attachedSupportIds: [] },
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("support-applied");
    expect(result[0].source?.instanceId).toBe("c3");
    expect(result[0].target?.instanceId).toBe("c2");
  });

  it("maps level-up from LEVEL_CHANGED", () => {
    const outcome: EffectOutcome = {
      code: "LEVEL_CHANGED",
      targetInstanceId: "c2",
      fromLevel: 1,
      toLevel: 2,
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P1" as PlayerId,
      level: 2,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("level-up");
    expect(result[0].value).toBe(2);
  });

  it("maps level-down from LEVEL_CHANGED", () => {
    const outcome: EffectOutcome = {
      code: "LEVEL_CHANGED",
      targetInstanceId: "c2",
      fromLevel: 2,
      toLevel: 1,
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P2" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P1" as PlayerId,
      level: 1,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("level-down");
    expect(result[0].value).toBe(1);
  });

  it("maps beneficial status as buff-applied", () => {
    const outcome: EffectOutcome = {
      code: "STATUS_APPLIED",
      targetInstanceId: "c2",
      statusCode: "TEMP_WEAKNESS_IMMUNITY",
      expiresAt: "NEXT_SCORE",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P1" as PlayerId,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("buff-applied");
    expect(result[0].statusId).toBe("TEMP_WEAKNESS_IMMUNITY");
  });

  it("maps harmful status as debuff-applied", () => {
    const outcome: EffectOutcome = {
      code: "STATUS_APPLIED",
      targetInstanceId: "c2",
      statusCode: "SKIP_NEXT_SCORE",
      expiresAt: "NEXT_SCORE",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P2" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P2" as PlayerId,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("debuff-applied");
  });

  it("maps status-removed correctly", () => {
    const outcome: EffectOutcome = {
      code: "STATUS_REMOVED",
      targetInstanceId: "c2",
      statusCode: "SKIP_NEXT_SCORE",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P2" as PlayerId,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("status-removed");
    expect(result[0].statusId).toBe("SKIP_NEXT_SCORE");
  });

  it("maps shield-consumed from REMOVAL_PREVENTED", () => {
    const outcome: EffectOutcome = {
      code: "REMOVAL_PREVENTED",
      targetInstanceId: "c2",
      statusCode: "REMOVAL_SHIELD",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P1" as PlayerId,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("shield-consumed");
  });

  it("maps opponent action correctly (isOpponentAction)", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "W001",
      playerId: "P2",
      targetInstanceId: "c2",
      targetPlayerId: "P1",
      actionKind: "WEAKNESS",
      effectResult: "FULL_EFFECT",
      reasonCode: "MATCHING_WEAKNESS",
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P2" });
    const match = makeMatch({ currentPlayerId: "P1" });
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].isOpponentAction).toBe(true);
    expect(result[0].actorPlayerId).toBe("P2");
  });

  it("preserves outcome order for multiple outcomes", () => {
    const outcome1: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "W001",
      playerId: "P1",
      targetInstanceId: "c2",
      targetPlayerId: "P2",
      actionKind: "WEAKNESS",
      effectResult: "FULL_EFFECT",
      reasonCode: "MATCHING_WEAKNESS",
    };
    const outcome2: EffectOutcome = {
      code: "LEVEL_CHANGED",
      targetInstanceId: "c2",
      fromLevel: 1,
      toLevel: 2,
    };
    const entry = makeEntry({ outcomes: [outcome1, outcome2], actor: "P1" });
    const match = makeMatch();
    match.cardsByInstanceId["c2"] = {
      ...match.cardsByInstanceId["c2"] as NonNullable<typeof match.cardsByInstanceId[string]>,
      ownerId: "P1" as PlayerId,
      level: 2,
    };
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("weakness-full");
    expect(result[1].kind).toBe("level-up");
  });

  it("does not fabricate target when none exists", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "A001",
      playerId: "P1",
      actionKind: "PLAY_ANIMAL",
    };
    const entry = makeEntry({ outcomes: [outcome] });
    const result = mapEntryToCombatVisuals(makeMatch(), entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("support-applied");
    expect(result[0].target).toBeUndefined();
  });

  it("does not create events for internal phase entries", () => {
    const entry: ActionLogEntry = {
      seq: 2,
      action: { type: "ADVANCE_PHASE" as const, playerId: "P1" as PlayerId, payload: {} },
      phase: "ACTION",
      turnNumber: 1,
      actor: "P1",
      validation: { valid: true },
      result: "",
      outcomes: [],
      rng: { seed: "test", step: 0 },
      timestamp: Date.now(),
    };
    const result = mapEntryToCombatVisuals(makeMatch(), entry);
    expect(result).toEqual([]);
  });

  it("draws events from CARD_DRAWN", () => {
    const outcome: EffectOutcome = {
      code: "CARD_DRAWN",
      playerId: "P1",
      count: 2,
    };
    const entry = makeEntry({ outcomes: [outcome], actor: "P1" });
    const match = makeMatch({ currentPlayerId: "P1" });
    const result = mapEntryToCombatVisuals(match, entry);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("draw");
    expect(result[0].value).toBe(2);
    expect(result[0].isOpponentAction).toBe(false);
  });

  it("does not use string parsing for locale-dependent values", () => {
    const outcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: "c1",
      definitionId: "W001",
      playerId: "P1",
      targetInstanceId: "c2",
      targetPlayerId: "P2",
      actionKind: "WEAKNESS",
      effectResult: "FULL_EFFECT",
      reasonCode: "MATCHING_WEAKNESS",
    };
    const entry = makeEntry({ outcomes: [outcome] });
    const result = mapEntryToCombatVisuals(makeMatch(), entry);
    expect(result[0].kind).toBe("weakness-full");
    expect(result[0].id).not.toContain("โดนจุดอ่อน");
    expect(result[0].id).not.toContain("Weakness");
  });
});
