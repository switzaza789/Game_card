import type { Action, MatchState, PlayerId, ValidationResult } from "../../types/game";
import { getCardDefinition, isAnimalDefinition } from "../cards/deck";
import { engineConfig } from "../config/config";
import { validateEffect } from "../effects/effectEngine";

export function validateAction(state: MatchState, action: Action): ValidationResult {
  const baseErrors = validateBaseAction(state, action.playerId);

  if (baseErrors.length > 0) {
    return invalid(baseErrors);
  }

  switch (action.type) {
    case "START_MATCH":
      return state.actionLog.length === 0 && action.payload.seed === state.rng.seed
        ? valid()
        : invalid(["START_MATCH is only valid before a MatchState exists"]);
    case "ADVANCE_PHASE":
      return valid();
    case "END_TURN":
      return state.phase === "END" || state.phase === "ACTION"
        ? valid()
        : invalid(["END_TURN is only valid during ACTION or END phase"]);
    case "MULLIGAN":
      return validateMulligan(state, action.playerId, action.payload.cardInstanceIds);
    case "PLAY_CARD":
      return validatePlayCard(state, action);
    case "RECYCLE":
      return validateRecycle(state, action.playerId, action.payload.cardInstanceId);
  }
}

export function valid(): ValidationResult {
  return { valid: true };
}

export function invalid(errors: string[]): ValidationResult {
  return { valid: false, errors };
}

function validateBaseAction(state: MatchState, playerId: PlayerId): string[] {
  const errors: string[] = [];

  if (state.status === "FINISHED") {
    errors.push("Match is already finished");
  }

  if (state.currentPlayerId !== playerId) {
    errors.push("Action player is not the current player");
  }

  return errors;
}

function validateMulligan(state: MatchState, playerId: PlayerId, cardInstanceIds: string[]): ValidationResult {
  const player = state.players[playerId];
  const uniqueIds = new Set(cardInstanceIds);
  const errors: string[] = [];

  if (state.phase !== "READY") {
    errors.push("MULLIGAN is only valid during READY phase");
  }

  if (player.mulligansUsed + cardInstanceIds.length > engineConfig.starting_mulligan_max) {
    errors.push("Mulligan limit exceeded");
  }

  if (uniqueIds.size !== cardInstanceIds.length) {
    errors.push("Mulligan card ids must be unique");
  }

  for (const instanceId of cardInstanceIds) {
    if (!player.hand.includes(instanceId)) {
      errors.push(`Card is not in hand: ${instanceId}`);
    }
  }

  return errors.length > 0 ? invalid(errors) : valid();
}

function validatePlayCard(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): ValidationResult {
  const { playerId } = action;
  const { cardInstanceId } = action.payload;
  const player = state.players[playerId];
  const card = state.cardsByInstanceId[cardInstanceId];
  const errors: string[] = [];

  if (state.phase !== "ACTION") {
    errors.push("PLAY_CARD is only valid during ACTION phase");
  }

  if (!card || !player.hand.includes(cardInstanceId)) {
    errors.push("Card is not in current player's hand");
    return invalid(errors);
  }

  const definition = getCardDefinition(card.definitionId);

  if (definition.category === "Animal") {
    if (player.animalActionUsed) {
      errors.push("Animal action already used this turn");
    }

    if (!player.board.some((slot) => slot === null)) {
      errors.push("Animal zone is full");
    }
  } else {
    if (player.utilityLocked) {
      errors.push("Utility action is locked this turn");
    }

    if (player.utilityActionUsed) {
      errors.push("Utility action already used this turn");
    }
  }

  if (errors.length > 0) {
    return invalid(errors);
  }

  return validateEffect(state, action);
}

function validateRecycle(state: MatchState, playerId: PlayerId, cardInstanceId: string): ValidationResult {
  const player = state.players[playerId];
  const errors: string[] = [];

  if (state.phase !== "ACTION") {
    errors.push("RECYCLE is only valid during ACTION phase");
  }

  if (!engineConfig.recycle_allowed_on_first_turn && state.turnNumber === 1) {
    errors.push("Recycle is not allowed on the first turn");
  }

  if (player.recycleUsed || player.utilityActionUsed) {
    errors.push("Utility action already used this turn");
  }

  if (player.utilityLocked) {
    errors.push("Utility action is locked this turn");
  }

  if (!player.hand.includes(cardInstanceId)) {
    errors.push("Recycle card is not in current player's hand");
  }

  if (player.deck.length === 0) {
    errors.push("Cannot recycle with an empty deck");
  }

  return errors.length > 0 ? invalid(errors) : valid();
}

export function canScoreNewAnimal(state: MatchState, enteredTurn: number): boolean {
  return engineConfig.new_animal_scores_same_turn || enteredTurn < state.turnNumber;
}

export function assertAnimalCard(definitionId: string): boolean {
  return isAnimalDefinition(definitionId);
}
