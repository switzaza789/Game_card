import type { AnimalInstance, MatchState, PlayerId } from "../../types/game";
import { getCardDefinition, isAnimalInstance } from "../cards/deck";

export function otherPlayerId(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

export function getAnimalInstances(state: MatchState, playerId: PlayerId): AnimalInstance[] {
  const animals: AnimalInstance[] = [];

  for (const instanceId of state.players[playerId].board) {
    if (!instanceId) {
      continue;
    }

    const card = state.cardsByInstanceId[instanceId];

    /* v8 ignore else -- player boards should only reference Animal instances. */
    if (isAnimalInstance(card)) {
      animals.push(card);
    }
  }

  return animals;
}

export function getTotalAnimalLevel(state: MatchState, playerId: PlayerId): number {
  return getAnimalInstances(state, playerId).reduce((total, animal) => total + animal.level, 0);
}

export function getBoardAnimalCount(state: MatchState, playerId: PlayerId): number {
  return getAnimalInstances(state, playerId).length;
}

export function getPlayableAnimalCardIds(state: MatchState, playerId: PlayerId): string[] {
  return state.players[playerId].hand.filter((instanceId) => {
    const card = state.cardsByInstanceId[instanceId];
    return getCardDefinition(card.definitionId).category === "Animal";
  });
}
