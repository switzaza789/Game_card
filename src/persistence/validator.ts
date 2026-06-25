/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions */
import type { PersistedActiveMatch, StorageResult } from "./types";
import { getCardDefinition, isAnimalInstance } from "../engine/cards/deck";
import type { PlayerId } from "../types/game";

export function validateStoredMatch(data: unknown): StorageResult<PersistedActiveMatch> {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { ok: false, error: { type: "ValidationFailed", errors: ["Data is not an object"] } };
  }

  const obj = data as Record<string, any>;

  // 1. Schema Version Check
  if (obj.schemaVersion !== "1") {
    return { ok: false, error: { type: "UnsupportedVersion", message: `Unsupported schema version: ${obj.schemaVersion}` } };
  }

  // 2. Structural Checks
  if (typeof obj.savedAt !== "number") {
    errors.push("savedAt is not a number");
  }

  const validScreens = ["menu", "howToPlay", "library", "battle", "handoff", "result"];
  if (!validScreens.includes(obj.screen)) {
    errors.push(`Invalid screen type: ${obj.screen}`);
  }

  const state = obj.state;
  if (!state || typeof state !== "object") {
    errors.push("MatchState is missing or invalid");
    return { ok: false, error: { type: "ValidationFailed", errors } };
  }

  if (typeof state.matchId !== "string") errors.push("state.matchId is not a string");
  if (state.gameMode === undefined) {
    state.gameMode = "LOCAL_PVP";
  } else if (!["LOCAL_PVP", "PVE_NORMAL"].includes(state.gameMode)) {
    errors.push(`Invalid gameMode: ${state.gameMode}`);
  }
  if (!["READY", "ACTIVE", "FINISHED"].includes(state.status)) {
    errors.push(`Invalid match status: ${state.status}`);
  }
  if (!["P1", "P2"].includes(state.currentPlayerId)) {
    errors.push(`Invalid currentPlayerId: ${state.currentPlayerId}`);
  }
  if (!["READY", "DRAW", "SCORE", "ACTION", "END"].includes(state.phase)) {
    errors.push(`Invalid phase: ${state.phase}`);
  }
  if (typeof state.turnNumber !== "number" || state.turnNumber < 1) {
    errors.push("state.turnNumber must be a positive number");
  }

  const players = state.players;
  if (!players || typeof players !== "object" || !players.P1 || !players.P2) {
    errors.push("Players P1 or P2 state is missing");
    return { ok: false, error: { type: "ValidationFailed", errors } };
  }

  const cardsByInstanceId = state.cardsByInstanceId;
  if (!cardsByInstanceId || typeof cardsByInstanceId !== "object") {
    errors.push("cardsByInstanceId is missing or invalid");
    return { ok: false, error: { type: "ValidationFailed", errors } };
  }

  const allInstanceIds = Object.keys(cardsByInstanceId);
  const uniqueInstanceIds = new Set(allInstanceIds);
  if (uniqueInstanceIds.size !== allInstanceIds.length) {
    errors.push("Duplicate card instance IDs in cardsByInstanceId");
  }

  const cardZones = new Map<string, string[]>(); // instanceId -> zones it is found in

  function registerCardZone(id: string, zoneName: string) {
    if (!cardZones.has(id)) {
      cardZones.set(id, []);
    }
    cardZones.get(id)!.push(zoneName);
  }

  // Validate Player States
  const playerIds: PlayerId[] = ["P1", "P2"];
  for (const pid of playerIds) {
    const player = players[pid] as Record<string, any>;
    if (player.id !== pid) {
      errors.push(`Player id mismatch: ${player.id} !== ${pid}`);
    }
    if (typeof player.score !== "number" || player.score < 0) {
      errors.push(`Player ${pid} score cannot be negative: ${player.score}`);
    }
    if (!Array.isArray(player.deck)) errors.push(`Player ${pid} deck is not an array`);
    if (!Array.isArray(player.hand)) errors.push(`Player ${pid} hand is not an array`);
    if (!Array.isArray(player.board)) errors.push(`Player ${pid} board is not an array`);
    if (!Array.isArray(player.graveyard)) errors.push(`Player ${pid} graveyard is not an array`);

    if (player.board && player.board.length !== 3) {
      errors.push(`Player ${pid} board must have exactly 3 slots`);
    }

    // Register card locations
    if (Array.isArray(player.deck)) {
      player.deck.forEach((id: string) => registerCardZone(id, `${pid}_DECK`));
    }
    if (Array.isArray(player.hand)) {
      player.hand.forEach((id: string) => registerCardZone(id, `${pid}_HAND`));
    }
    if (Array.isArray(player.graveyard)) {
      player.graveyard.forEach((id: string) => registerCardZone(id, `${pid}_GRAVEYARD`));
    }

    if (Array.isArray(player.board)) {
      player.board.forEach((id: string | null, index: number) => {
        if (id) {
          registerCardZone(id, `${pid}_BOARD_SLOT_${index + 1}`);

          // Validate Board Animal
          const animal = cardsByInstanceId[id];
          if (!animal) {
            errors.push(`Animal ${id} on board is missing from cardsByInstanceId`);
            return;
          }
          if (!isAnimalInstance(animal)) {
            errors.push(`Card ${id} on board is not an AnimalInstance`);
            return;
          }
          if (animal.zone !== "BOARD") {
            errors.push(`Animal ${id} on board has incorrect zone: ${animal.zone}`);
          }
          if (![1, 2, 3].includes(animal.level)) {
            errors.push(`Animal ${id} has invalid level: ${animal.level}`);
          }
          if (animal.slotNo !== index + 1) {
            errors.push(`Animal ${id} slotNo mismatch: ${animal.slotNo} !== ${index + 1}`);
          }

          // Register attached supports
          if (Array.isArray(animal.attachedSupportIds)) {
            animal.attachedSupportIds.forEach((supId: string) => {
              registerCardZone(supId, `${pid}_ATTACHED_TO_${id}`);
              const support = cardsByInstanceId[supId] as Record<string, string> | undefined;
              if (!support) {
                errors.push(`Attached support ${supId} is missing from cardsByInstanceId`);
                return;
              }
              if (support?.zone !== "BOARD") {
                errors.push(`Attached support ${supId} has incorrect zone: ${support.zone}`);
              }
            });
          } else {
            errors.push(`Animal ${id} attachedSupportIds is not an array`);
          }

          // Validate status effects
          if (Array.isArray(animal.statuses)) {
            const validStatusCodes = [
              "SKIP_NEXT_SCORE",
              "NEXT_SCORE_MINUS_1",
              "TEMP_WEAKNESS_IMMUNITY",
              "TEMP_LEVEL_DOWN_IMMUNITY",
              "REMOVAL_SHIELD",
              "UTILITY_LOCK"
            ];
            const validExpiresAt = [
              "NEXT_SCORE",
              "OPPONENT_NEXT_TURN_END",
              "NEXT_UTILITY",
              "UNTIL_USED",
              "IMMEDIATE"
            ];
            animal.statuses.forEach((status: Record<string, any>, sIdx: number) => {
              if (!validStatusCodes.includes(status.code as string)) {
                errors.push(`Animal ${id} status ${sIdx} has invalid code: ${status.code}`);
              }
              if (!validExpiresAt.includes(status.expiresAt as string)) {
                errors.push(`Animal ${id} status ${sIdx} has invalid expiresAt: ${status.expiresAt}`);
              }
            });
          } else {
            errors.push(`Animal ${id} statuses is not an array`);
          }
        }
      });
    }
  }

  // Validate Card Counts and Placement
  const expectedTotalCards = 48;
  const cardsP1 = allInstanceIds.filter((id) => cardsByInstanceId[id].ownerId === "P1");
  const cardsP2 = allInstanceIds.filter((id) => cardsByInstanceId[id].ownerId === "P2");

  if (cardsP1.length !== expectedTotalCards / 2) {
    errors.push(`Player 1 has incorrect card total: ${cardsP1.length} !== 24`);
  }
  if (cardsP2.length !== expectedTotalCards / 2) {
    errors.push(`Player 2 has incorrect card total: ${cardsP2.length} !== 24`);
  }

  // Check card zone uniqueness
  for (const id of allInstanceIds) {
    const card = cardsByInstanceId[id] as Record<string, any>;
    try {
      getCardDefinition(card["definitionId"] as string);
    } catch {
      errors.push(`Card ${id} has invalid definitionId: ${card["definitionId"] as string}`);
    }

    const zones = cardZones.get(id) || [];
    if (zones.length === 0) {
      errors.push(`Card ${id} exists in cardsByInstanceId but is not referenced in any player zone`);
    } else if (zones.length > 1) {
      errors.push(`Card ${id} exists in multiple zones: ${zones.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: { type: "ValidationFailed", errors } };
  }

  return { ok: true, value: obj as PersistedActiveMatch };
}
