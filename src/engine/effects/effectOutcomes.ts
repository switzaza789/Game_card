import type { Action, AnimalInstance, EffectOutcome, MatchState, PlayerId, StatusEffect } from "../../types/game";
import { getCardDefinition, isAnimalInstance } from "../cards/deck";

export function buildEffectOutcomes(before: MatchState, after: MatchState, action: Action): EffectOutcome[] {
  if (!actionLogCanHaveOutcomes(action)) {
    return [];
  }

  const outcomes: EffectOutcome[] = [];

  if (action.type === "PLAY_CARD") {
    const played = before.cardsByInstanceId[action.payload.cardInstanceId];
    const definition = getCardDefinition(played.definitionId);
    const target = action.payload.target?.instanceId ? before.cardsByInstanceId[action.payload.target.instanceId] : undefined;
    const playedOutcome: EffectOutcome = {
      code: "CARD_PLAYED",
      cardInstanceId: action.payload.cardInstanceId,
      definitionId: played.definitionId,
      playerId: action.playerId,
      actionKind: actionKindForCard(definition.card_id, definition.category),
      effectResult: effectResultForPlay(before, action)
    };
    const reasonCode = reasonCodeForPlay(before, action);
    if (reasonCode) {
      playedOutcome.reasonCode = reasonCode;
    }
    if (action.payload.target?.instanceId) {
      playedOutcome.targetInstanceId = action.payload.target.instanceId;
    }
    if (target?.ownerId) {
      playedOutcome.targetPlayerId = target.ownerId;
    }
    outcomes.push(playedOutcome);
  }

  outcomes.push(...cardMovementOutcomes(before, after));
  outcomes.push(...boardChangeOutcomes(before, after));
  outcomes.push(...scoreOutcomes(before, after));
  outcomes.push(...drawOutcomes(before, after, action.playerId));

  return dedupeOutcomes(outcomes);
}

function actionKindForCard(cardId: string, category: string): Extract<EffectOutcome, { code: "CARD_PLAYED" }>["actionKind"] {
  if (category === "Animal") return "PLAY_ANIMAL";
  if (category === "Support") return "SUPPORT";
  if (category === "Weakness") return "WEAKNESS";
  if (cardId === "X002" || cardId === "X004") return "PROTECT";
  if (cardId === "X005") return "STEAL_SCORE";
  if (cardId === "X003") return "RETURN_TO_HAND";
  if (cardId === "X001") return "STATUS_CHANGE";
  return "SPECIAL";
}

function effectResultForPlay(before: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): Extract<EffectOutcome, { code: "CARD_PLAYED" }>["effectResult"] {
  const played = before.cardsByInstanceId[action.payload.cardInstanceId];
  const definition = getCardDefinition(played.definitionId);
  if (definition.category !== "Weakness") {
    return "FULL_EFFECT";
  }
  const target = action.payload.target?.instanceId ? before.cardsByInstanceId[action.payload.target.instanceId] : undefined;
  if (!target || !isAnimalInstance(target)) {
    return "NO_EFFECT";
  }
  if (target.statuses.some((status) => status.code === "TEMP_WEAKNESS_IMMUNITY")) {
    return "PREVENTED";
  }
  return weaknessMatches(definition.card_id, getCardDefinition(target.definitionId).subtype) ? "FULL_EFFECT" : "PARTIAL_EFFECT";
}

function reasonCodeForPlay(before: MatchState, action: Extract<Action, { type: "PLAY_CARD" }>): Extract<EffectOutcome, { code: "CARD_PLAYED" }>["reasonCode"] {
  const played = before.cardsByInstanceId[action.payload.cardInstanceId];
  const definition = getCardDefinition(played.definitionId);
  if (definition.category !== "Weakness") {
    return undefined;
  }
  const target = action.payload.target?.instanceId ? before.cardsByInstanceId[action.payload.target.instanceId] : undefined;
  if (!target || !isAnimalInstance(target)) {
    return "NO_VALID_TARGET";
  }
  if (target.statuses.some((status) => status.code === "TEMP_WEAKNESS_IMMUNITY")) {
    return "TARGET_PROTECTED";
  }
  return weaknessMatches(definition.card_id, getCardDefinition(target.definitionId).subtype) ? "MATCHING_WEAKNESS" : "NON_MATCHING_WEAKNESS";
}

function weaknessMatches(cardId: string, subtype: string): boolean {
  return (
    (cardId === "W001" && subtype === "Dog")
    || (cardId === "W002" && subtype === "Cat")
    || (cardId === "W003" && (subtype === "Rabbit" || subtype === "Bear"))
    || (cardId === "W004" && subtype === "Bird")
    || (cardId === "W005" && subtype === "Fish")
  );
}

function actionLogCanHaveOutcomes(action: Action): boolean {
  return action.type === "PLAY_CARD" || action.type === "RECYCLE" || action.type === "ADVANCE_PHASE";
}

function cardMovementOutcomes(before: MatchState, after: MatchState): EffectOutcome[] {
  const outcomes: EffectOutcome[] = [];
  for (const [instanceId, beforeCard] of Object.entries(before.cardsByInstanceId)) {
    const afterCard = after.cardsByInstanceId[instanceId];
    if (!afterCard || beforeCard.zone === afterCard.zone) {
      continue;
    }
    outcomes.push({
      code: "CARD_MOVED",
      cardInstanceId: instanceId,
      definitionId: afterCard.definitionId,
      fromZone: beforeCard.zone,
      toZone: afterCard.zone
    });
    if (afterCard.zone === "BOARD" && isAnimalInstance(afterCard)) {
      outcomes.push({ code: "ANIMAL_ENTERED_BOARD", cardInstanceId: instanceId, slotNo: afterCard.slotNo });
    }
  }
  return outcomes;
}

function boardChangeOutcomes(before: MatchState, after: MatchState): EffectOutcome[] {
  const outcomes: EffectOutcome[] = [];
  for (const [instanceId, afterCard] of Object.entries(after.cardsByInstanceId)) {
    const beforeCard = before.cardsByInstanceId[instanceId];
    if (!beforeCard || !isAnimalInstance(afterCard)) {
      continue;
    }
    const beforeAnimal = isAnimalInstance(beforeCard) ? beforeCard : undefined;
    const beforeLevel = beforeAnimal?.level;
    const beforePoints = beforeAnimal?.evolutionPoints ?? 0;

    if (beforeLevel && beforeLevel !== afterCard.level) {
      outcomes.push({ code: "LEVEL_CHANGED", targetInstanceId: instanceId, fromLevel: beforeLevel, toLevel: afterCard.level });
    }
    if ((beforeLevel === 1 || beforeLevel === 2) && afterCard.level === 3) {
      outcomes.push({ code: "EVOLVED", targetInstanceId: instanceId, fromLevel: beforeLevel, toLevel: 3 });
    }
    if (afterCard.evolutionPoints > beforePoints) {
      outcomes.push({ code: "EVOLUTION_POINT_GAINED", targetInstanceId: instanceId, current: afterCard.evolutionPoints as 1 | 2, required: 2 });
    }
    outcomes.push(...attachmentOutcomes(before, after, afterCard, beforeAnimal));
    outcomes.push(...statusOutcomes(instanceId, beforeAnimal?.statuses ?? [], afterCard.statuses));
    if (
      beforeAnimal
      && beforeAnimal.statuses.some((status) => status.code === "REMOVAL_SHIELD")
      && !afterCard.statuses.some((status) => status.code === "REMOVAL_SHIELD")
    ) {
      outcomes.push({ code: "REMOVAL_PREVENTED", targetInstanceId: instanceId, statusCode: "REMOVAL_SHIELD" });
    }
  }
  return outcomes;
}

function attachmentOutcomes(
  before: MatchState,
  after: MatchState,
  afterAnimal: AnimalInstance,
  beforeAnimal: AnimalInstance | undefined
): EffectOutcome[] {
  const beforeAttached = new Set(beforeAnimal?.attachedSupportIds ?? []);
  return afterAnimal.attachedSupportIds
    .filter((supportId) => !beforeAttached.has(supportId))
    .map((supportId) => ({
      code: "CARD_ATTACHED" as const,
      sourceCardInstanceId: supportId,
      targetInstanceId: afterAnimal.instanceId
    }))
    .filter((outcome) => Boolean(before.cardsByInstanceId[outcome.sourceCardInstanceId] && after.cardsByInstanceId[outcome.sourceCardInstanceId]));
}

function statusOutcomes(instanceId: string, beforeStatuses: StatusEffect[], afterStatuses: StatusEffect[]): EffectOutcome[] {
  const beforeKeys = new Set(beforeStatuses.map(statusKey));
  const afterKeys = new Set(afterStatuses.map(statusKey));
  const outcomes: EffectOutcome[] = [];
  for (const status of afterStatuses) {
    if (!beforeKeys.has(statusKey(status))) {
      outcomes.push({ code: "STATUS_APPLIED", targetInstanceId: instanceId, statusCode: status.code, expiresAt: status.expiresAt });
    }
  }
  for (const status of beforeStatuses) {
    if (!afterKeys.has(statusKey(status))) {
      outcomes.push({ code: "STATUS_REMOVED", targetInstanceId: instanceId, statusCode: status.code });
    }
  }
  return outcomes;
}

function scoreOutcomes(before: MatchState, after: MatchState): EffectOutcome[] {
  return (["P1", "P2"] as PlayerId[]).flatMap((playerId) => {
    const fromScore = before.players[playerId].score;
    const toScore = after.players[playerId].score;
    return fromScore === toScore ? [] : [{ code: "SCORE_CHANGED", playerId, amount: toScore - fromScore, fromScore, toScore } satisfies EffectOutcome];
  });
}

function drawOutcomes(before: MatchState, after: MatchState, actorId: PlayerId): EffectOutcome[] {
  const beforeHand = before.players[actorId].hand.length;
  const afterHand = after.players[actorId].hand.length;
  if (afterHand <= beforeHand) {
    return [];
  }
  return [{ code: "CARD_DRAWN", playerId: actorId, count: afterHand - beforeHand }];
}

function statusKey(status: StatusEffect): string {
  return `${status.code}:${status.expiresAt}:${status.sourceInstanceId ?? ""}`;
}

function dedupeOutcomes(outcomes: EffectOutcome[]): EffectOutcome[] {
  const seen = new Set<string>();
  return outcomes.filter((outcome) => {
    const key = JSON.stringify(outcome);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
