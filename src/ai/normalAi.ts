import type { Action, AnimalInstance, CardDefinition, MatchState, PlayerId, Target } from "../types/game";
import { getCardDefinition, isAnimalInstance } from "../engine/cards/deck";
import { engineConfig } from "../engine/config/config";
import { otherPlayerId } from "../engine/state/selectors";
import { validateAction } from "../engine/validation/validation";
import type { AiDecision, AiDecisionContext } from "./aiTypes";

export const MAX_AI_ACTIONS_PER_TURN = 10;

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

type Candidate = AiDecision & { sortKey: string };

export function chooseNormalAiAction(context: AiDecisionContext): AiDecision | null {
  const { state, playerId } = context;
  if (state.status === "FINISHED" || state.currentPlayerId !== playerId || state.phase !== "ACTION") {
    return null;
  }

  const candidates = generateCandidates(state, playerId)
    .filter((candidate) => validateAction(state, candidate.action).valid)
    .map((candidate) => ({ ...candidate, score: scoreAction(state, candidate.action) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.sortKey.localeCompare(b.sortKey));

  return candidates[0] ? { action: candidates[0].action, reason: candidates[0].reason, score: candidates[0].score } : null;
}

export function generateNormalAiCandidates(state: MatchState, playerId: "P2" = "P2"): Action[] {
  return generateCandidates(state, playerId).map((candidate) => candidate.action);
}

function generateCandidates(state: MatchState, playerId: "P2"): Candidate[] {
  const actions: Candidate[] = [];
  const player = state.players[playerId];
  const ownAnimals = boardAnimals(state, playerId);
  const enemyAnimals = boardAnimals(state, otherPlayerId(playerId));

  for (const cardInstanceId of player.hand) {
    const card = state.cardsByInstanceId[cardInstanceId];
    const definition = getCardDefinition(card.definitionId);
    if (definition.category === "Animal") {
      actions.push(candidate(state, { type: "PLAY_CARD", playerId, payload: { cardInstanceId } }, "fill empty Animal slot"));
    } else if (definition.category === "Support") {
      for (const target of ownAnimals) {
        actions.push(candidate(state, {
          type: "PLAY_CARD",
          playerId,
          payload: {
            cardInstanceId,
            target: boardTarget(target),
            bottomCardInstanceId: chooseBottomCard(state, playerId, cardInstanceId),
            moveTopCardToBottom: false
          }
        }, "support own Animal"));
      }
    } else if (definition.category === "Weakness") {
      for (const target of enemyAnimals) {
        actions.push(candidate(state, { type: "PLAY_CARD", playerId, payload: { cardInstanceId, target: boardTarget(target) } }, "target enemy weakness"));
      }
    } else {
      actions.push(...specialCandidates(state, playerId, cardInstanceId, definition, ownAnimals, enemyAnimals));
    }
  }

  for (const cardInstanceId of player.hand) {
    actions.push(candidate(state, { type: "RECYCLE", playerId, payload: { cardInstanceId } }, "recycle unusable card"));
  }

  return actions;
}

function specialCandidates(
  state: MatchState,
  playerId: "P2",
  cardInstanceId: string,
  definition: CardDefinition,
  ownAnimals: AnimalInstance[],
  enemyAnimals: AnimalInstance[]
): Candidate[] {
  if (definition.card_id === "X001") {
    return enemyAnimals.map((target) => candidate(state, { type: "PLAY_CARD", playerId, payload: { cardInstanceId, target: boardTarget(target) } }, "skip enemy score"));
  }
  if (definition.card_id === "X002") {
    return [candidate(state, { type: "PLAY_CARD", playerId, payload: { cardInstanceId } }, "hold shield")];
  }
  if (definition.card_id === "X003") {
    const replacementCardInstanceId = bestAnimalInHand(state, playerId, cardInstanceId);
    if (!replacementCardInstanceId) return [];
    return ownAnimals.map((target) => candidate(state, {
      type: "PLAY_CARD",
      playerId,
      payload: { cardInstanceId, target: boardTarget(target), replacementCardInstanceId }
    }, "quick swap stronger Animal"));
  }
  if (definition.card_id === "X004") {
    return enemyAnimals
      .filter((target) => target.level === 1)
      .map((target) => candidate(state, { type: "PLAY_CARD", playerId, payload: { cardInstanceId, target: boardTarget(target) } }, "return enemy level 1"));
  }
  if (definition.card_id === "X005") {
    return [candidate(state, { type: "PLAY_CARD", playerId, payload: { cardInstanceId } }, "transfer score while behind")];
  }
  return [];
}

function scoreAction(state: MatchState, action: Action): number {
  if (action.type === "RECYCLE") return recycleScore(state, action);
  if (action.type !== "PLAY_CARD") return 0;
  const card = state.cardsByInstanceId[action.payload.cardInstanceId];
  const def = getCardDefinition(card.definitionId);
  const opponentId = otherPlayerId(action.playerId);
  const target = action.payload.target?.instanceId ? state.cardsByInstanceId[action.payload.target.instanceId] : undefined;
  const canWinSoon = state.players[action.playerId].score + boardScore(state, action.playerId) >= engineConfig.target_score;
  const opponentThreat = state.players[opponentId].score + boardScore(state, opponentId) >= engineConfig.target_score;
  let score = 0;

  if (def.category === "Animal") {
    score = 100;
    if (canWinSoon) score += 1000;
  } else if (def.category === "Support" && target && isAnimalInstance(target)) {
    const match = getCardDefinition(target.definitionId).subtype === supportMatches[def.card_id];
    score = match ? (target.level === 2 ? 95 : 75) : 0;
    if (target.level === 2 && (target.evolutionPoints ?? 0) === 1 && ["S001", "S003", "S004", "S006"].includes(def.card_id)) {
      score += 35;
    }
    if (match && canWinSoon) score += 1000;
  } else if (def.category === "Weakness" && target && isAnimalInstance(target)) {
    const direct = weaknessTargets[def.card_id]?.includes(getCardDefinition(target.definitionId).subtype) ?? false;
    const evolutionThreat = target.level === 2 && (target.evolutionPoints ?? 0) === 1 ? 35 : 0;
    score = (direct ? 90 + target.level * 25 : 20 + target.level * 10) + evolutionThreat;
    if (opponentThreat) score += 800;
  } else if (def.card_id === "X001" && target && isAnimalInstance(target)) {
    score = 35 + target.level * 20 + (target.level === 2 && (target.evolutionPoints ?? 0) === 1 ? 35 : 0) + (opponentThreat ? 800 : 0);
  } else if (def.card_id === "X003" && target && isAnimalInstance(target)) {
    score = target.level === 1 ? 55 : (target.level === 2 && (target.evolutionPoints ?? 0) === 1 ? -20 : 0);
  } else if (def.card_id === "X004" && target && isAnimalInstance(target)) {
    score = 45 + target.level * 10 + (opponentThreat ? 800 : 0);
  } else if (def.card_id === "X005") {
    score = state.players[action.playerId].score < state.players[opponentId].score ? 85 : 0;
  }

  return score;
}

function recycleScore(state: MatchState, action: Extract<Action, { type: "RECYCLE" }>): number {
  const useful = generateCandidates(state, action.playerId as "P2")
    .filter((candidate) => candidate.action.type === "PLAY_CARD")
    .filter((candidate) => validateAction(state, candidate.action).valid)
    .some((candidate) => scoreAction(state, candidate.action) > 0);
  return useful ? 0 : 25;
}

function boardScore(state: MatchState, playerId: PlayerId): number {
  return boardAnimals(state, playerId).reduce((sum, animal) => sum + animal.level, 0);
}

function candidate(state: MatchState, action: Action, reason: string): Candidate {
  return { action, reason, score: 0, sortKey: actionSortKey(state, action) };
}

function actionSortKey(state: MatchState, action: Action): string {
  const payload = action.type === "PLAY_CARD" || action.type === "RECYCLE" ? action.payload : undefined;
  const cardInstanceId = payload && "cardInstanceId" in payload ? payload.cardInstanceId : "";
  const definitionId = cardInstanceId ? state.cardsByInstanceId[cardInstanceId]?.definitionId ?? "" : "";
  const slot = action.type === "PLAY_CARD" ? action.payload.target?.slotNo ?? 0 : 0;
  return `${definitionId}:${cardInstanceId}:${slot}`;
}

function boardAnimals(state: MatchState, playerId: PlayerId): AnimalInstance[] {
  return state.players[playerId].board
    .map((id) => id ? state.cardsByInstanceId[id] : null)
    .filter((card): card is AnimalInstance => Boolean(card && isAnimalInstance(card)));
}

function boardTarget(animal: AnimalInstance): Target {
  return { playerId: animal.ownerId, zone: "BOARD", instanceId: animal.instanceId, slotNo: animal.slotNo };
}

function chooseBottomCard(state: MatchState, playerId: PlayerId, excludeId: string): string | undefined {
  return [...state.players[playerId].hand]
    .filter((id) => id !== excludeId)
    .sort((a, b) => cardKeepValue(state, a) - cardKeepValue(state, b) || a.localeCompare(b))[0];
}

function bestAnimalInHand(state: MatchState, playerId: PlayerId, excludeId: string): string | undefined {
  return state.players[playerId].hand
    .filter((id) => id !== excludeId && getCardDefinition(state.cardsByInstanceId[id].definitionId).category === "Animal")
    .sort((a, b) => getCardDefinition(state.cardsByInstanceId[a].definitionId).card_id.localeCompare(getCardDefinition(state.cardsByInstanceId[b].definitionId).card_id))[0];
}

function cardKeepValue(state: MatchState, instanceId: string): number {
  const def = getCardDefinition(state.cardsByInstanceId[instanceId].definitionId);
  if (def.category === "Animal") return 4;
  if (def.category === "Support") return 3;
  if (def.category === "Weakness") return 2;
  return 1;
}
