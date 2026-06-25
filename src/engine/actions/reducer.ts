import type {
  Action,
  ActionEnvelope,
  ActionLogEntry,
  MatchState,
  Phase,
  PlayerId,
  PlayerState,
  ValidationResult
} from "../../types/game";
import { engineConfig } from "../config/config";
import { getCardDefinition } from "../cards/deck";
import { drawCards } from "../state/match";
import {
  getBoardAnimalCount,
  getTotalAnimalLevel,
  otherPlayerId
} from "../state/selectors";
import { calculateScorePhase, resolveEffect } from "../effects/effectEngine";
import { validateAction } from "../validation/validation";

export type DispatchResult = {
  state: MatchState;
  validation: ValidationResult;
};

export function dispatchAction(state: MatchState, envelope: ActionEnvelope): DispatchResult {
  const { action, timestamp } = envelope;
  const validation = validateAction(state, action);

  if (!validation.valid) {
    return {
      state: appendLog(state, action, validation, "Action rejected", timestamp),
      validation
    };
  }

  const resolved = resolveValidAction(state, action);
  return {
    state: appendLog(resolved, action, validation, resultText(action, state, resolved), timestamp),
    validation
  };
}

function resolveValidAction(state: MatchState, action: Action): MatchState {
  switch (action.type) {
    case "START_MATCH":
      return state;
    case "ADVANCE_PHASE":
      return advancePhase(state);
    case "MULLIGAN":
      return mulligan(state, action.playerId, action.payload.cardInstanceIds);
    case "PLAY_CARD":
      return playCard(state, action);
    case "RECYCLE":
      return recycle(state, action.playerId, action.payload.cardInstanceId);
    case "END_TURN":
      return endTurn(state);
  }
}

export function advancePhase(state: MatchState): MatchState {
  const currentIndex = engineConfig.turn_phases.indexOf(state.phase);
  const nextPhase = engineConfig.turn_phases[currentIndex + 1];

  if (!nextPhase) {
    return endTurn(state);
  }

  let nextState = {
    ...state,
    phase: nextPhase
  };

  if (nextPhase === "DRAW") {
    nextState = drawForTurn(nextState);
  }

  if (nextPhase === "SCORE") {
    nextState = scoreCurrentPlayer(nextState);
  }

  if (nextPhase === "END") {
    nextState = enforceHandLimit(nextState, state.currentPlayerId);
    nextState = evaluateWin(nextState);
  }

  return nextState;
}

function drawForTurn(state: MatchState): MatchState {
  if (state.currentPlayerId === "P1" && state.turnNumber === 1 && !engineConfig.first_player_draws_on_turn_1) {
    return state;
  }

  return drawCards(state, state.currentPlayerId, 1);
}

function scoreCurrentPlayer(state: MatchState): MatchState {
  const playerId = state.currentPlayerId;
  return evaluateWin(calculateScorePhase(state, playerId));
}

function mulligan(state: MatchState, playerId: PlayerId, cardInstanceIds: string[]): MatchState {
  const player = state.players[playerId];
  const keptHand = player.hand.filter((instanceId) => !cardInstanceIds.includes(instanceId));
  const returnedDeck = [...player.deck, ...cardInstanceIds];
  const nextPlayer: PlayerState = {
    ...player,
    deck: returnedDeck,
    hand: keptHand,
    mulligansUsed: player.mulligansUsed + cardInstanceIds.length
  };
  const nextCards = { ...state.cardsByInstanceId };

  for (const instanceId of cardInstanceIds) {
    nextCards[instanceId] = {
      ...nextCards[instanceId],
      zone: "DECK"
    };
  }

  return drawCards(
    {
      ...state,
      players: {
        ...state.players,
        [playerId]: nextPlayer
      },
      cardsByInstanceId: nextCards
    },
    playerId,
    cardInstanceIds.length
  );
}

function playCard(state: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): MatchState {
  return resolveEffect(state, action);
}

function recycle(state: MatchState, playerId: PlayerId, cardInstanceId: string): MatchState {
  const player = state.players[playerId];
  const [drawnId, ...remainingDeck] = player.deck;

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: remainingDeck,
        hand: [...player.hand.filter((id) => id !== cardInstanceId), drawnId],
        graveyard: [...player.graveyard, cardInstanceId],
        utilityActionUsed: true,
        recycleUsed: true
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [cardInstanceId]: {
        ...state.cardsByInstanceId[cardInstanceId],
        zone: "GRAVEYARD"
      },
      [drawnId]: {
        ...state.cardsByInstanceId[drawnId],
        zone: "HAND"
      }
    }
  };
}

function enforceHandLimit(state: MatchState, playerId: PlayerId): MatchState {
  const player = state.players[playerId];

  if (player.hand.length <= engineConfig.hand_limit) {
    return state;
  }

  const keptHand = player.hand.slice(0, engineConfig.hand_limit);
  const discarded = player.hand.slice(engineConfig.hand_limit);
  const nextCards = { ...state.cardsByInstanceId };

  for (const instanceId of discarded) {
    nextCards[instanceId] = {
      ...nextCards[instanceId],
      zone: "GRAVEYARD"
    };
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        hand: keptHand,
        graveyard: [...player.graveyard, ...discarded]
      }
    },
    cardsByInstanceId: nextCards
  };
}

function endTurn(state: MatchState): MatchState {
  const limitedState = enforceHandLimit(state, state.currentPlayerId);
  const current = limitedState.players[limitedState.currentPlayerId];
  const nextCurrentPlayerId = otherPlayerId(limitedState.currentPlayerId);
  const nextTurnNumber = nextCurrentPlayerId === "P1" ? limitedState.turnNumber + 1 : limitedState.turnNumber;
  const withCurrentTurnCount: MatchState = {
    ...limitedState,
    players: {
      ...limitedState.players,
      [limitedState.currentPlayerId]: {
        ...current,
        animalActionUsed: false,
        utilityActionUsed: false,
        utilityLocked: false,
        recycleUsed: false,
        turnsTaken: current.turnsTaken + 1
      },
      [nextCurrentPlayerId]: {
        ...limitedState.players[nextCurrentPlayerId],
        animalActionUsed: false,
        utilityActionUsed: false,
        recycleUsed: false
      }
    },
    currentPlayerId: nextCurrentPlayerId,
    phase: "READY",
    turnNumber: nextTurnNumber
  };

  return evaluateWin(withCurrentTurnCount);
}

export function evaluateWin(state: MatchState): MatchState {
  const scoreWinner = findScoreWinner(state);

  if (scoreWinner) {
    return finishMatch(state, scoreWinner, "TARGET_SCORE");
  }

  const turnLimitReached = state.players.P1.turnsTaken >= engineConfig.max_turns_per_player
    && state.players.P2.turnsTaken >= engineConfig.max_turns_per_player;

  if (!turnLimitReached) {
    return state;
  }

  return finishMatch(state, resolveTiebreaker(state), "TURN_LIMIT");
}

function findScoreWinner(state: MatchState): PlayerId | undefined {
  const p1Reached = state.players.P1.score >= engineConfig.target_score;
  const p2Reached = state.players.P2.score >= engineConfig.target_score;

  if (p1Reached && p2Reached) {
    return state.players.P1.score >= state.players.P2.score ? "P1" : "P2";
  }

  if (p1Reached) {
    return "P1";
  }

  if (p2Reached) {
    return "P2";
  }

  return undefined;
}

function resolveTiebreaker(state: MatchState): PlayerId | "DRAW" {
  const comparisons: Array<[number, number]> = [
    [state.players.P1.score, state.players.P2.score],
    [getTotalAnimalLevel(state, "P1"), getTotalAnimalLevel(state, "P2")],
    [getBoardAnimalCount(state, "P1"), getBoardAnimalCount(state, "P2")],
    [state.players.P1.deck.length, state.players.P2.deck.length]
  ];

  for (const [p1Value, p2Value] of comparisons) {
    if (p1Value > p2Value) {
      return "P1";
    }

    if (p2Value > p1Value) {
      return "P2";
    }
  }

  return "DRAW";
}

function finishMatch(
  state: MatchState,
  winner: PlayerId | "DRAW",
  finishReason: NonNullable<MatchState["finishReason"]>
): MatchState {
  if (state.status === "FINISHED") {
    return state;
  }

  return {
    ...state,
    status: "FINISHED",
    winner,
    finishReason
  };
}

function appendLog(
  state: MatchState,
  action: Action,
  validation: ValidationResult,
  result: string,
  timestamp: number
): MatchState {
  const entry: ActionLogEntry = {
    seq: state.actionLog.length + 1,
    action,
    phase: state.phase,
    turnNumber: state.turnNumber,
    actor: action.playerId,
    validation,
    result,
    rng: state.rng,
    timestamp
  };

  return {
    ...state,
    actionLog: [...state.actionLog, entry]
  };
}

function resultText(action: Action, before: MatchState, after: MatchState): string {
  const evolutionMessages = action.type === "ADVANCE_PHASE" ? evolutionResultText(before, after) : [];
  return [`${action.type} resolved`, ...evolutionMessages].join(" | ");
}

function evolutionResultText(before: MatchState, after: MatchState): string[] {
  const messages: string[] = [];
  for (const [instanceId, afterCard] of Object.entries(after.cardsByInstanceId)) {
    const beforeCard = before.cardsByInstanceId[instanceId];
    if (!beforeCard || beforeCard.zone !== "BOARD" || afterCard.zone !== "BOARD" || !("evolutionPoints" in afterCard)) {
      continue;
    }
    const beforePoints = "evolutionPoints" in beforeCard ? beforeCard.evolutionPoints ?? 0 : 0;
    const cardName = getCardDefinition(afterCard.definitionId).name_th;
    if (afterCard.evolutionPoints > beforePoints) {
      messages.push(`${cardName} ได้แต้มวิวัฒนาการ ${afterCard.evolutionPoints}/2`);
    }
    if ("level" in beforeCard && beforeCard.level < 3 && afterCard.level === 3) {
      messages.push(`${cardName} (${afterCard.definitionId}) วิวัฒนาการเป็น Level 3`);
    }
  }
  return messages;
}

export function forcePhase(state: MatchState, phase: Phase): MatchState {
  return { ...state, phase };
}
