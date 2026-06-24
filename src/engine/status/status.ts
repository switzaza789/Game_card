import type { AnimalInstance, MatchState, PlayerId, StatusEffect, StatusEffectCode } from "../../types/game";
import { isAnimalInstance } from "../cards/deck";

export function hasStatus(animal: AnimalInstance, code: StatusEffectCode): boolean {
  return animal.statuses.some((status) => status.code === code);
}

export function addStatus(
  state: MatchState,
  animalId: string,
  status: StatusEffect
): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  if (!isAnimalInstance(animal)) {
    return state;
  }

  return {
    ...state,
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: {
        ...animal,
        statuses: [...animal.statuses.filter((item) => item.code !== status.code), status]
      }
    }
  };
}

export function removeStatus(
  state: MatchState,
  animalId: string,
  code: StatusEffectCode
): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  if (!isAnimalInstance(animal)) {
    return state;
  }

  return {
    ...state,
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: {
        ...animal,
        statuses: animal.statuses.filter((status) => status.code !== code)
      }
    }
  };
}

export function removeExpiredStatus(state: MatchState, playerId: PlayerId): MatchState {
  let nextState = state;
  const player = state.players[playerId];

  for (const animalId of player.board) {
    if (!animalId) {
      continue;
    }

    const animal = nextState.cardsByInstanceId[animalId];

    /* v8 ignore next -- player boards should only reference Animal instances. */
    if (!isAnimalInstance(animal)) {
      continue;
    }

    nextState = {
      ...nextState,
      cardsByInstanceId: {
        ...nextState.cardsByInstanceId,
        [animalId]: {
          ...animal,
          statuses: animal.statuses.filter((status) => status.expiresAt !== "NEXT_SCORE")
        }
      }
    };
  }

  return nextState;
}

export function clearOpponentTurnEndStatuses(state: MatchState, playerId: PlayerId): MatchState {
  let nextState = state;
  const player = state.players[playerId];

  for (const animalId of player.board) {
    if (!animalId) {
      continue;
    }

    const animal = nextState.cardsByInstanceId[animalId];

    /* v8 ignore next -- player boards should only reference Animal instances. */
    if (!isAnimalInstance(animal)) {
      continue;
    }

    nextState = {
      ...nextState,
      cardsByInstanceId: {
        ...nextState.cardsByInstanceId,
        [animalId]: {
          ...animal,
          statuses: animal.statuses.filter((status) => status.expiresAt !== "OPPONENT_NEXT_TURN_END")
        }
      }
    };
  }

  return nextState;
}

export function consumePlayerUtilityLock(state: MatchState, playerId: PlayerId): MatchState {
  const player = state.players[playerId];

  if (!player.utilityLocked) {
    return state;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        utilityLocked: false,
        utilityActionUsed: true
      }
    }
  };
}
