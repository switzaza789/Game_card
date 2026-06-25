import type {
  Action,
  AnimalInstance,
  CardDefinition,
  CardInstance,
  MatchState,
  PlayerId,
  Target,
  ValidationResult
} from "../../types/game";
import { getCardDefinition, isAnimalInstance } from "../cards/deck";
import { drawCards } from "../state/match";
import { getAnimalInstances, otherPlayerId } from "../state/selectors";
import { addStatus, hasStatus, removeExpiredStatus, removeStatus } from "../status/status";
import { invalid, valid } from "../validation/validation";

export type EffectResolver = (state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>) => MatchState;

export const effectRegistry: Record<string, EffectResolver> = {
  prevent_first_weakness_removal_then_skip_score: resolveAnimalOnPlay,
  first_matching_support_draw1_bottom1: resolveAnimalOnPlay,
  prevent_first_level_down: resolveAnimalOnPlay,
  prevent_first_support_destroy_then_skip_score: resolveAnimalOnPlay,
  peek_top_keep_or_bottom: resolveBirdPeek,
  first_score_bonus_1: resolveAnimalOnPlay,
  prevent_first_skip_score: resolveAnimalOnPlay,
  return_own_attached_support_to_hand: resolveMonkeyReturnSupport,
  match_level_up_and_bounce_removal_shield: resolveSupport,
  match_level_up_peek_or_bottom: resolveSupport,
  match_level_up_temp_level_down_immunity: resolveSupport,
  match_level_up_minimum_next_score_1: resolveSupport,
  match_level_up_draw1_bottom1: resolveSupport,
  match_level_up_temp_weakness_immunity: resolveSupport,
  dog_level_down_or_remove_else_next_score_minus1: resolveWeakness,
  cat_level_down_or_remove_else_next_score_minus1: resolveWeakness,
  rabbit_bear_level_down_or_remove_else_next_score_minus1: resolveWeakness,
  bird_level_down_or_remove_else_next_score_minus1: resolveWeakness,
  fish_level_down_or_remove_else_next_score_minus1: resolveWeakness,
  skip_next_score: resolveSkipNextScore,
  counter_weakness_lock_next_utility: resolveDirectWeaknessShield,
  return_own_animal_and_play_replacement: resolveQuickSwap,
  bounce_enemy_level1: resolveStrongWind,
  if_behind_transfer_1_score: resolveFoodThief
};

const supportMatches: Record<string, string> = {
  S001: "Dog",
  S002: "Cat",
  S003: "Rabbit",
  S004: "Bear",
  S005: "Bird",
  S006: "Fish"
};

const weaknessTargets: Record<string, string[]> = {
  W001: ["Dog"],
  W002: ["Cat"],
  W003: ["Rabbit", "Bear"],
  W004: ["Bird"],
  W005: ["Fish"]
};

export function validateEffect(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): ValidationResult {
  const card = state.cardsByInstanceId[action.payload.cardInstanceId];
  const definition = getCardDefinition(card.definitionId);

  /* v8 ignore next -- card seed validation and registry coverage protect this path. */
  if (!effectRegistry[definition.logic_key]) {
    return invalid([`Unknown logic_key: ${definition.logic_key}`]);
  }

  if (definition.category === "Animal") {
    return valid();
  }

  if (definition.category === "Support") {
    return validateBoardTarget(state, action.playerId, action.payload.target, "own");
  }

  if (definition.category === "Weakness") {
    const targetValidation = validateBoardTarget(state, action.playerId, action.payload.target, "enemy");

    if (!targetValidation.valid) {
      return targetValidation;
    }

    const target = getTargetAnimal(state, action.payload.target);

    if (hasStatus(target, "TEMP_WEAKNESS_IMMUNITY")) {
      return invalid(["Target is protected from Weakness"]);
    }

    const reactionId = action.payload.reactionCardInstanceId;

    if (reactionId) {
      const owner = state.players[target.ownerId];
      const reactionCard = state.cardsByInstanceId[reactionId];

      if (!reactionCard || !owner.hand.includes(reactionId) || reactionCard.definitionId !== "X002") {
        return invalid(["Invalid Weakness Shield reaction"]);
      }
    }

    return valid();
  }

  return validateSpecial(state, action, definition);
}

export function resolveEffect(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const definition = getCardDefinition(state.cardsByInstanceId[action.payload.cardInstanceId].definitionId);
  return effectRegistry[definition.logic_key](state, action);
}

export function calculateScorePhase(state: MatchState, playerId: PlayerId): MatchState {
  let nextState = state;
  let scoreGain = 0;

  for (const animal of getAnimalInstances(state, playerId)) {
    if (animal.enteredTurn >= state.turnNumber) {
      continue;
    }

    const freshAnimal = nextState.cardsByInstanceId[animal.instanceId];

    /* v8 ignore next -- board selectors only return Animal instances. */
    if (!isAnimalInstance(freshAnimal)) {
      continue;
    }

    let animalScore: number = freshAnimal.level;
    const scoreLevel = freshAnimal.level;

    if (hasStatus(freshAnimal, "SKIP_NEXT_SCORE")) {
      animalScore = 0;
      if (freshAnimal.definitionId === "A007" && !freshAnimal.onceFlags.includes("prevent_first_skip_score")) {
        animalScore = freshAnimal.level;
        nextState = updateAnimal(nextState, freshAnimal.instanceId, {
          statuses: freshAnimal.statuses.filter((status) => status.code !== "SKIP_NEXT_SCORE"),
          onceFlags: [...freshAnimal.onceFlags, "prevent_first_skip_score"]
        });
      }
    }

    if (hasStatus(freshAnimal, "NEXT_SCORE_MINUS_1")) {
      animalScore = Math.max(0, animalScore - 1);
    }

    if (hasStatus(freshAnimal, "REMOVAL_SHIELD") && freshAnimal.statuses.some((status) => status.sourceInstanceId === "S004")) {
      animalScore = Math.max(1, animalScore);
    }

    if (freshAnimal.definitionId === "A006" && !freshAnimal.onceFlags.includes("first_score_bonus_1")) {
      animalScore += 1;
      nextState = updateAnimal(nextState, freshAnimal.instanceId, {
        onceFlags: [...freshAnimal.onceFlags, "first_score_bonus_1"]
      });
    }

    scoreGain += animalScore;

    if (scoreLevel === 2 && animalScore > 0) {
      const nextPoints = Math.min(2, (freshAnimal.evolutionPoints ?? 0) + 1) as 0 | 1 | 2;
      nextState = updateAnimal(nextState, freshAnimal.instanceId, {
        evolutionPoints: nextPoints,
        level: nextPoints >= 2 ? 3 : freshAnimal.level
      });
    }
  }

  nextState = {
    ...nextState,
    players: {
      ...nextState.players,
      [playerId]: {
        ...nextState.players[playerId],
        score: nextState.players[playerId].score + scoreGain
      }
    }
  };

  return removeExpiredStatus(nextState, playerId);
}

function resolveAnimalOnPlay(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  return playAnimalToBoard(state, action.playerId, action.payload.cardInstanceId);
}

function resolveBirdPeek(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const withBird = playAnimalToBoard(state, action.playerId, action.payload.cardInstanceId);
  return maybeMoveDeckTopToBottom(withBird, action.playerId, Boolean(action.payload.moveTopCardToBottom));
}

function resolveMonkeyReturnSupport(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  let nextState = playAnimalToBoard(state, action.playerId, action.payload.cardInstanceId);
  const selectedSupportId = action.payload.selectedSupportInstanceId;

  /* v8 ignore next -- optional Monkey choice is validated by UI in later phases. */
  if (!selectedSupportId) {
    return nextState;
  }

  const support = nextState.cardsByInstanceId[selectedSupportId];

  /* v8 ignore next -- defensive guard for stale selected support ids. */
  if (!support?.attachedToId) {
    return nextState;
  }

  const animal = nextState.cardsByInstanceId[support.attachedToId];

  /* v8 ignore next -- defensive guard for corrupted attachment ownership. */
  if (!isAnimalInstance(animal) || animal.ownerId !== action.playerId) {
    return nextState;
  }

  nextState = detachSupportToHand(nextState, animal.instanceId, selectedSupportId);

  if (support.increasedLevel) {
    nextState = updateAnimal(nextState, animal.instanceId, {
      level: clampLevel(animal.level - 1)
    });
  }

  return nextState;
}

function resolveSupport(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const supportId = action.payload.cardInstanceId;
  const support = state.cardsByInstanceId[supportId];
  const target = getTargetAnimal(state, action.payload.target);
  const matchingSubtype = supportMatches[support.definitionId];
  const isMatch = target.definitionId !== "A007"
    && target.definitionId !== "A008"
    && getCardDefinition(target.definitionId).subtype === matchingSubtype;
  let nextState = state;

  if (isMatch) {
    nextState = attachSupport(nextState, target.instanceId, supportId, true);
    nextState = updateAnimal(nextState, target.instanceId, {
      level: clampLevel(target.level + 1)
    });
  } else {
    nextState = discardFromHand(nextState, action.playerId, supportId);
  }

  if (support.definitionId === "S001") {
    nextState = addStatus(nextState, target.instanceId, {
      code: "REMOVAL_SHIELD",
      sourceInstanceId: supportId,
      expiresAt: "UNTIL_USED"
    });
  }

  if (support.definitionId === "S002") {
    nextState = maybeMoveDeckTopToBottom(nextState, action.playerId, Boolean(action.payload.moveTopCardToBottom));
  }

  if (support.definitionId === "S003") {
    nextState = addStatus(nextState, target.instanceId, {
      code: "TEMP_LEVEL_DOWN_IMMUNITY",
      sourceInstanceId: supportId,
      expiresAt: "OPPONENT_NEXT_TURN_END"
    });
  }

  if (support.definitionId === "S004") {
    nextState = addStatus(nextState, target.instanceId, {
      code: "REMOVAL_SHIELD",
      sourceInstanceId: supportId,
      expiresAt: "NEXT_SCORE"
    });
  }

  if (support.definitionId === "S005") {
    nextState = drawAndBottom(nextState, action.playerId, action.payload.bottomCardInstanceId);
  }

  if (support.definitionId === "S006") {
    nextState = addStatus(nextState, target.instanceId, {
      code: "TEMP_WEAKNESS_IMMUNITY",
      sourceInstanceId: supportId,
      expiresAt: "OPPONENT_NEXT_TURN_END"
    });
  }

  if (isMatch && target.definitionId === "A002" && !target.onceFlags.includes("first_matching_support_draw1_bottom1")) {
    nextState = drawAndBottom(nextState, action.playerId, action.payload.bottomCardInstanceId);
    nextState = updateAnimal(nextState, target.instanceId, {
      onceFlags: [...target.onceFlags, "first_matching_support_draw1_bottom1"]
    });
  }

  return nextState;
}

function resolveWeakness(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  if (action.payload.reactionCardInstanceId) {
    return resolveWeaknessShieldReaction(state, action);
  }

  const weaknessId = action.payload.cardInstanceId;
  const weakness = state.cardsByInstanceId[weaknessId];
  const target = getTargetAnimal(state, action.payload.target);
  const targetDefinition = getCardDefinition(target.definitionId);
  const directTypes = weaknessTargets[weakness.definitionId] ?? [];
  let nextState = discardFromHand(state, action.playerId, weaknessId);

  if (!directTypes.includes(targetDefinition.subtype)) {
    return addStatus(nextState, target.instanceId, {
      code: "NEXT_SCORE_MINUS_1",
      sourceInstanceId: weaknessId,
      expiresAt: "NEXT_SCORE"
    });
  }

  nextState = applyLevelDownOrRemoval(nextState, target.instanceId, true);
  return nextState;
}

function resolveWeaknessShieldReaction(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const target = getTargetAnimal(state, action.payload.target);
  const weaknessId = action.payload.cardInstanceId;
  const reactionId = action.payload.reactionCardInstanceId;

  /* v8 ignore next -- resolver is only called when reaction id exists. */
  if (!reactionId) {
    return state;
  }

  let nextState = discardFromHand(state, action.playerId, weaknessId);
  nextState = discardFromHand(nextState, target.ownerId, reactionId);
  nextState = {
    ...nextState,
    players: {
      ...nextState.players,
      [target.ownerId]: {
        ...nextState.players[target.ownerId],
        utilityLocked: true
      }
    }
  };

  return nextState;
}

function resolveSkipNextScore(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const target = getTargetAnimal(state, action.payload.target);
  let nextState = discardFromHand(state, action.playerId, action.payload.cardInstanceId);
  nextState = addStatus(nextState, target.instanceId, {
    code: "SKIP_NEXT_SCORE",
    sourceInstanceId: action.payload.cardInstanceId,
    expiresAt: "NEXT_SCORE"
  });
  return nextState;
}

function resolveDirectWeaknessShield(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  return discardFromHand(state, action.playerId, action.payload.cardInstanceId);
}

function resolveQuickSwap(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const target = getTargetAnimal(state, action.payload.target);
  const replacementId = action.payload.replacementCardInstanceId;

  /* v8 ignore next -- validation requires replacement id before resolve. */
  if (!replacementId) {
    return state;
  }

  let nextState = discardFromHand(state, action.playerId, action.payload.cardInstanceId);
  nextState = discardAttachedSupports(nextState, target.instanceId);
  nextState = returnAnimalToHand(nextState, target.instanceId);
  nextState = playAnimalToSpecificSlot(nextState, action.playerId, replacementId, target.slotNo, false);
  return nextState;
}

function resolveStrongWind(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const target = getTargetAnimal(state, action.payload.target);
  let nextState = discardFromHand(state, action.playerId, action.payload.cardInstanceId);

  if (hasStatus(target, "REMOVAL_SHIELD")) {
    return consumeRemovalShield(nextState, target.instanceId);
  }

  nextState = discardAttachedSupports(nextState, target.instanceId);
  nextState = returnAnimalToHand(nextState, target.instanceId);
  return nextState;
}

function resolveFoodThief(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  const opponentId = otherPlayerId(action.playerId);
  const player = state.players[action.playerId];
  const opponent = state.players[opponentId];
  const nextState = discardFromHand(state, action.playerId, action.payload.cardInstanceId);

  return {
    ...nextState,
    players: {
      ...nextState.players,
      [action.playerId]: {
        ...nextState.players[action.playerId],
        score: player.score + 1
      },
      [opponentId]: {
        ...nextState.players[opponentId],
        score: Math.max(0, opponent.score - 1)
      }
    }
  };
}

function validateSpecial(
  state: MatchState,
  action: Extract<Action, { type: "PLAY_CARD" }>,
  definition: CardDefinition
): ValidationResult {
  if (definition.logic_key === "skip_next_score") {
    return validateBoardTarget(state, action.playerId, action.payload.target, "enemy");
  }

  if (definition.logic_key === "counter_weakness_lock_next_utility") {
    return invalid(["Weakness Shield is only valid as a reaction to Weakness"]);
  }

  if (definition.logic_key === "return_own_animal_and_play_replacement") {
    const targetValidation = validateBoardTarget(state, action.playerId, action.payload.target, "own");

    if (!targetValidation.valid) {
      return targetValidation;
    }

    const replacementId = action.payload.replacementCardInstanceId;
    const replacement = replacementId ? state.cardsByInstanceId[replacementId] : undefined;

    if (!replacement || !state.players[action.playerId].hand.includes(replacementId ?? "")) {
      return invalid(["Quick Swap requires a replacement Animal from hand"]);
    }

    if (getCardDefinition(replacement.definitionId).category !== "Animal") {
      return invalid(["Quick Swap replacement must be an Animal"]);
    }

    return valid();
  }

  if (definition.logic_key === "bounce_enemy_level1") {
    const targetValidation = validateBoardTarget(state, action.playerId, action.payload.target, "enemy");

    if (!targetValidation.valid) {
      return targetValidation;
    }

    const target = getTargetAnimal(state, action.payload.target);
    return target.level === 1 ? valid() : invalid(["Strong Wind can only target Level 1 Animals"]);
  }

  if (definition.logic_key === "if_behind_transfer_1_score") {
    const opponentId = otherPlayerId(action.playerId);
    return state.players[action.playerId].score < state.players[opponentId].score
      ? valid()
      : invalid(["Food Thief can only be used while behind on score"]);
  }

  /* v8 ignore next -- all current Special cards are handled above. */
  return valid();
}

function validateBoardTarget(
  state: MatchState,
  actorId: PlayerId,
  target: Target | undefined,
  ownership: "own" | "enemy"
): ValidationResult {
  if (!target?.instanceId || target.zone !== "BOARD") {
    return invalid(["A board Animal target is required"]);
  }

  const animal = state.cardsByInstanceId[target.instanceId];

  if (!isAnimalInstance(animal)) {
    return invalid(["Target must be an Animal on board"]);
  }

  if (ownership === "own" && animal.ownerId !== actorId) {
    return invalid(["Target must be your own Animal"]);
  }

  if (ownership === "enemy" && animal.ownerId === actorId) {
    return invalid(["Target must be an opponent Animal"]);
  }

  return valid();
}

function getTargetAnimal(state: MatchState, target: Target | undefined): AnimalInstance {
  /* v8 ignore next -- effect validation requires target ids before resolve. */
  if (!target?.instanceId) {
    throw new Error("Missing target Animal");
  }

  const animal = state.cardsByInstanceId[target.instanceId];

  /* v8 ignore next -- effect validation requires Animal targets before resolve. */
  if (!isAnimalInstance(animal)) {
    throw new Error("Target is not an Animal");
  }

  return animal;
}

function playAnimalToBoard(state: MatchState, playerId: PlayerId, cardInstanceId: string): MatchState {
  const player = state.players[playerId];
  const slotIndex = player.board.findIndex((slot) => slot === null);
  return playAnimalToSpecificSlot(state, playerId, cardInstanceId, (slotIndex + 1) as 1 | 2 | 3);
}

function playAnimalToSpecificSlot(
  state: MatchState,
  playerId: PlayerId,
  cardInstanceId: string,
  slotNo: 1 | 2 | 3,
  consumesAnimalAction = true
): MatchState {
  const player = state.players[playerId];
  const board = [...player.board];
  board[slotNo - 1] = cardInstanceId;
  const card = state.cardsByInstanceId[cardInstanceId];
  const animal: AnimalInstance = {
    ...card,
    zone: "BOARD",
    level: 1,
    evolutionPoints: 0,
    slotNo,
    enteredTurn: state.turnNumber,
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
        hand: player.hand.filter((id) => id !== cardInstanceId),
        board,
        animalActionUsed: consumesAnimalAction ? true : player.animalActionUsed
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [cardInstanceId]: animal
    }
  };
}

function discardFromHand(state: MatchState, playerId: PlayerId, cardInstanceId: string): MatchState {
  const player = state.players[playerId];

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        hand: player.hand.filter((id) => id !== cardInstanceId),
        graveyard: player.graveyard.includes(cardInstanceId)
          ? player.graveyard
          : [...player.graveyard, cardInstanceId],
        utilityActionUsed: true
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [cardInstanceId]: {
        ...state.cardsByInstanceId[cardInstanceId],
        zone: "GRAVEYARD"
      }
    }
  };
}

function attachSupport(
  state: MatchState,
  animalId: string,
  supportId: string,
  increasedLevel: boolean
): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- support attachment only targets board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  const player = state.players[animal.ownerId];

  return {
    ...state,
    players: {
      ...state.players,
      [animal.ownerId]: {
        ...player,
        hand: player.hand.filter((id) => id !== supportId),
        utilityActionUsed: true
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: {
        ...animal,
        attachedSupportIds: [...animal.attachedSupportIds, supportId]
      },
      [supportId]: {
        ...state.cardsByInstanceId[supportId],
        zone: "BOARD",
        attachedToId: animalId,
        increasedLevel
      }
    }
  };
}

function detachSupportToHand(state: MatchState, animalId: string, supportId: string): MatchState {
  const animal = state.cardsByInstanceId[animalId];
  const support = state.cardsByInstanceId[supportId];

  /* v8 ignore next -- detach is only called for attached support owners. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  const player = state.players[animal.ownerId];
  const detachedSupport: CardInstance = {
    instanceId: support.instanceId,
    definitionId: support.definitionId,
    ownerId: support.ownerId,
    zone: "HAND"
  };

  return {
    ...state,
    players: {
      ...state.players,
      [animal.ownerId]: {
        ...player,
        hand: [...player.hand, supportId]
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: {
        ...animal,
        attachedSupportIds: animal.attachedSupportIds.filter((id) => id !== supportId)
      },
      [supportId]: detachedSupport
    }
  };
}

function discardAttachedSupports(state: MatchState, animalId: string): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- discard supports is only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  let nextState = state;

  for (const supportId of animal.attachedSupportIds) {
    nextState = moveAttachedSupportToGraveyard(nextState, animalId, supportId);
  }

  return nextState;
}

function moveAttachedSupportToGraveyard(state: MatchState, animalId: string, supportId: string): MatchState {
  const animal = state.cardsByInstanceId[animalId];
  const support = state.cardsByInstanceId[supportId];

  /* v8 ignore next -- attached support discard is only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  const player = state.players[animal.ownerId];
  const discardedSupport: CardInstance = {
    instanceId: support.instanceId,
    definitionId: support.definitionId,
    ownerId: support.ownerId,
    zone: "GRAVEYARD"
  };

  return {
    ...state,
    players: {
      ...state.players,
      [animal.ownerId]: {
        ...player,
        graveyard: [...player.graveyard, supportId]
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: {
        ...animal,
        attachedSupportIds: animal.attachedSupportIds.filter((id) => id !== supportId)
      },
      [supportId]: discardedSupport
    }
  };
}

function applyLevelDownOrRemoval(state: MatchState, animalId: string, fromWeakness: boolean): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- level changes are only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  if (hasStatus(animal, "TEMP_LEVEL_DOWN_IMMUNITY")) {
    return state;
  }

  if (animal.definitionId === "A003" && animal.level > 1 && !animal.onceFlags.includes("prevent_first_level_down")) {
    return updateAnimal(state, animalId, {
      onceFlags: [...animal.onceFlags, "prevent_first_level_down"]
    });
  }

  if (animal.level === 1) {
    if (fromWeakness && animal.definitionId === "A001" && !animal.onceFlags.includes("prevent_first_weakness_removal_then_skip_score")) {
      let nextState = updateAnimal(state, animalId, {
        onceFlags: [...animal.onceFlags, "prevent_first_weakness_removal_then_skip_score"]
      });
      nextState = addStatus(nextState, animalId, {
        code: "SKIP_NEXT_SCORE",
        expiresAt: "NEXT_SCORE"
      });
      return nextState;
    }

    if (hasStatus(animal, "REMOVAL_SHIELD")) {
      return consumeRemovalShield(state, animalId);
    }

    return removeAnimalToGraveyard(state, animalId);
  }

  const supportToDiscard = animal.attachedSupportIds.find((supportId) => state.cardsByInstanceId[supportId].increasedLevel);

  if (supportToDiscard) {
    if (animal.definitionId === "A004" && !animal.onceFlags.includes("prevent_first_support_destroy_then_skip_score")) {
      let nextState = updateAnimal(state, animalId, {
        level: clampLevel(animal.level - 1),
        onceFlags: [...animal.onceFlags, "prevent_first_support_destroy_then_skip_score"]
      });
      nextState = addStatus(nextState, animalId, {
        code: "SKIP_NEXT_SCORE",
        expiresAt: "NEXT_SCORE"
      });
      return nextState;
    }

    return updateAnimal(moveAttachedSupportToGraveyard(state, animalId, supportToDiscard), animalId, {
      level: clampLevel(animal.level - 1)
    });
  }

  return updateAnimal(state, animalId, {
    level: clampLevel(animal.level - 1)
  });
}

function removeAnimalToGraveyard(state: MatchState, animalId: string): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- removal is only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  let nextState = discardAttachedSupports(state, animalId);
  const player = nextState.players[animal.ownerId];
  const graveyardCard: CardInstance = {
    instanceId: animal.instanceId,
    definitionId: animal.definitionId,
    ownerId: animal.ownerId,
    zone: "GRAVEYARD"
  };

  nextState = {
    ...nextState,
    players: {
      ...nextState.players,
      [animal.ownerId]: {
        ...player,
        board: player.board.map((slot) => (slot === animalId ? null : slot)),
        graveyard: [...player.graveyard, animalId]
      }
    },
    cardsByInstanceId: {
      ...nextState.cardsByInstanceId,
      [animalId]: {
        ...graveyardCard
      }
    }
  };

  return nextState;
}

function consumeRemovalShield(state: MatchState, animalId: string): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- shield consumption is only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  const shield = animal.statuses.find((status) => status.code === "REMOVAL_SHIELD");
  let nextState = removeStatus(state, animalId, "REMOVAL_SHIELD");

  if (shield?.sourceInstanceId && animal.attachedSupportIds.includes(shield.sourceInstanceId)) {
    const support = state.cardsByInstanceId[shield.sourceInstanceId];
    nextState = moveAttachedSupportToGraveyard(nextState, animalId, shield.sourceInstanceId);

    if (support.increasedLevel) {
      const freshAnimal = nextState.cardsByInstanceId[animalId];

      /* v8 ignore next -- fresh animal remains on board while consuming shield. */
      if (isAnimalInstance(freshAnimal)) {
        nextState = updateAnimal(nextState, animalId, {
          level: clampLevel(freshAnimal.level - 1)
        });
      }
    }
  }

  return nextState;
}

function returnAnimalToHand(state: MatchState, animalId: string): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- return to hand is only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  const player = state.players[animal.ownerId];
  const handCard: CardInstance = {
    instanceId: animal.instanceId,
    definitionId: animal.definitionId,
    ownerId: animal.ownerId,
    zone: "HAND"
  };

  return {
    ...state,
    players: {
      ...state.players,
      [animal.ownerId]: {
        ...player,
        board: player.board.map((slot) => (slot === animalId ? null : slot)),
        hand: [...player.hand, animalId]
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: handCard
    }
  };
}

function maybeMoveDeckTopToBottom(state: MatchState, playerId: PlayerId, moveTopCardToBottom: boolean): MatchState {
  const player = state.players[playerId];

  if (!moveTopCardToBottom || player.deck.length < 1) {
    return state;
  }

  const [topCard, ...rest] = player.deck;

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: [...rest, topCard]
      }
    }
  };
}

function drawAndBottom(state: MatchState, playerId: PlayerId, bottomCardInstanceId?: string): MatchState {
  let nextState = drawCards(state, playerId, 1);
  const player = nextState.players[playerId];
  const cardToBottom = bottomCardInstanceId && player.hand.includes(bottomCardInstanceId)
    ? bottomCardInstanceId
    : undefined;

  if (!cardToBottom) {
    return nextState;
  }

  nextState = {
    ...nextState,
    players: {
      ...nextState.players,
      [playerId]: {
        ...player,
        hand: player.hand.filter((id) => id !== cardToBottom),
        deck: [...player.deck, cardToBottom]
      }
    },
    cardsByInstanceId: {
      ...nextState.cardsByInstanceId,
      [cardToBottom]: {
        ...nextState.cardsByInstanceId[cardToBottom],
        zone: "DECK"
      }
    }
  };

  return nextState;
}

export function updateAnimal(
  state: MatchState,
  animalId: string,
  patch: Partial<Pick<AnimalInstance, "level" | "evolutionPoints" | "statuses" | "onceFlags" | "attachedSupportIds">>
): MatchState {
  const animal = state.cardsByInstanceId[animalId];

  /* v8 ignore next -- updateAnimal is only called for board Animals. */
  if (!isAnimalInstance(animal)) {
    return state;
  }

  return {
    ...state,
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [animalId]: {
        ...animal,
        ...patch
      }
    }
  };
}

function clampLevel(value: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, value)) as 1 | 2 | 3;
}
