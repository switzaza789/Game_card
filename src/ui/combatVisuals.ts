import type { ActionLogEntry, EffectOutcome, MatchState, PlayerId, StatusEffectCode } from "../types/game";

export type CombatVisualKind =
  | "weakness-full"
  | "weakness-reduced"
  | "support-applied"
  | "buff-applied"
  | "debuff-applied"
  | "shield-blocked"
  | "shield-consumed"
  | "level-up"
  | "level-down"
  | "status-applied"
  | "status-removed"
  | "draw"
  | "discard"
  | "recycle";

export interface CombatVisualTarget {
  playerId: PlayerId;
  instanceId?: string;
  slotIndex?: number;
}

export interface CombatVisualEvent {
  id: string;
  kind: CombatVisualKind;
  actorPlayerId: PlayerId;
  source?: CombatVisualTarget;
  target?: CombatVisualTarget;
  value?: number;
  statusId?: StatusEffectCode;
  isOpponentAction: boolean;
}

let sequenceId = 0;
function nextId(): string {
  return `cv-${++sequenceId}`;
}

export function resetSequenceId(): void {
  sequenceId = 0;
}

function ownerOf(match: MatchState, instanceId: string): PlayerId | undefined {
  const card = match.cardsByInstanceId[instanceId];
  return card?.ownerId;
}

function slotOf(match: MatchState, instanceId: string): number | undefined {
  const card = match.cardsByInstanceId[instanceId];
  if (card && "slotNo" in card) {
    return (card as { slotNo?: number }).slotNo;
  }
  return undefined;
}

export function mapEntryToCombatVisuals(match: MatchState, entry: ActionLogEntry): CombatVisualEvent[] {
  if (!entry.outcomes || entry.outcomes.length === 0) {
    return [];
  }
  const events: CombatVisualEvent[] = [];
  const actor = entry.actor;
  const viewerId = match.currentPlayerId;
  for (const outcome of entry.outcomes) {
    const isOpponent = actor !== viewerId;
    switch (outcome.code) {
      case "CARD_PLAYED": {
        const kind = resolveCardPlayedKind(outcome);
        const target = outcome.targetInstanceId
          ? { playerId: outcome.targetPlayerId ?? ownerOf(match, outcome.targetInstanceId) ?? actor, instanceId: outcome.targetInstanceId, slotIndex: slotOf(match, outcome.targetInstanceId) }
          : undefined;
        events.push({
          id: nextId(),
          kind,
          actorPlayerId: outcome.playerId,
          source: { playerId: outcome.playerId, instanceId: outcome.cardInstanceId },
          target,
          isOpponentAction: isOpponent
        });
        if (outcome.reasonCode === "TARGET_PROTECTED") {
          events.push({
            id: nextId(),
            kind: "shield-blocked",
            actorPlayerId: outcome.playerId,
            target,
            isOpponentAction: isOpponent
          });
        }
        break;
      }
      case "CARD_ATTACHED": {
        events.push({
          id: nextId(),
          kind: "support-applied",
          actorPlayerId: actor,
          source: { playerId: ownerOf(match, outcome.sourceCardInstanceId) ?? actor, instanceId: outcome.sourceCardInstanceId },
          target: { playerId: ownerOf(match, outcome.targetInstanceId) ?? actor, instanceId: outcome.targetInstanceId, slotIndex: slotOf(match, outcome.targetInstanceId) },
          isOpponentAction: isOpponent
        });
        break;
      }
      case "LEVEL_CHANGED": {
        const kind = outcome.toLevel > outcome.fromLevel ? "level-up" : "level-down";
        events.push({
          id: nextId(),
          kind,
          actorPlayerId: actor,
          target: { playerId: ownerOf(match, outcome.targetInstanceId) ?? actor, instanceId: outcome.targetInstanceId, slotIndex: slotOf(match, outcome.targetInstanceId) },
          value: outcome.toLevel,
          isOpponentAction: isOpponent
        });
        break;
      }
      case "STATUS_APPLIED": {
        const beneficial = isStatusBeneficial(outcome.statusCode);
        events.push({
          id: nextId(),
          kind: beneficial ? "buff-applied" : "debuff-applied",
          actorPlayerId: actor,
          target: { playerId: ownerOf(match, outcome.targetInstanceId) ?? actor, instanceId: outcome.targetInstanceId, slotIndex: slotOf(match, outcome.targetInstanceId) },
          statusId: outcome.statusCode,
          isOpponentAction: isOpponent
        });
        break;
      }
      case "STATUS_REMOVED": {
        events.push({
          id: nextId(),
          kind: "status-removed",
          actorPlayerId: actor,
          target: { playerId: ownerOf(match, outcome.targetInstanceId) ?? actor, instanceId: outcome.targetInstanceId, slotIndex: slotOf(match, outcome.targetInstanceId) },
          statusId: outcome.statusCode,
          isOpponentAction: isOpponent
        });
        break;
      }
      case "REMOVAL_PREVENTED": {
        events.push({
          id: nextId(),
          kind: "shield-consumed",
          actorPlayerId: actor,
          target: { playerId: ownerOf(match, outcome.targetInstanceId) ?? actor, instanceId: outcome.targetInstanceId, slotIndex: slotOf(match, outcome.targetInstanceId) },
          statusId: outcome.statusCode,
          isOpponentAction: isOpponent
        });
        break;
      }
      case "CARD_DRAWN": {
        events.push({
          id: nextId(),
          kind: "draw",
          actorPlayerId: outcome.playerId,
          source: { playerId: outcome.playerId },
          value: outcome.count,
          isOpponentAction: outcome.playerId !== viewerId
        });
        break;
      }
      case "SCORE_CHANGED": {
        if (outcome.amount > 0) {
          events.push({
            id: nextId(),
            kind: "buff-applied",
            actorPlayerId: outcome.playerId,
            target: { playerId: outcome.playerId },
            value: outcome.amount,
            isOpponentAction: outcome.playerId !== viewerId
          });
        }
        break;
      }
      case "CARD_MOVED": {
        const kind = outcome.toZone === "GRAVEYARD" ? "discard" : "recycle";
        events.push({
          id: nextId(),
          kind,
          actorPlayerId: actor,
          source: { playerId: ownerOf(match, outcome.cardInstanceId) ?? actor, instanceId: outcome.cardInstanceId },
          isOpponentAction: isOpponent
        });
        break;
      }
    }
  }
  return events;
}

function resolveCardPlayedKind(outcome: Extract<EffectOutcome, { code: "CARD_PLAYED" }>): CombatVisualKind {
  if (outcome.actionKind === "SUPPORT") {
    return "support-applied";
  }
  if (outcome.actionKind === "WEAKNESS") {
    if (outcome.effectResult === "FULL_EFFECT" && outcome.reasonCode === "MATCHING_WEAKNESS") {
      return "weakness-full";
    }
    if (outcome.effectResult === "PARTIAL_EFFECT" || outcome.reasonCode === "NON_MATCHING_WEAKNESS") {
      return "weakness-reduced";
    }
    if (outcome.effectResult === "PREVENTED" || outcome.reasonCode === "TARGET_PROTECTED") {
      return "shield-blocked";
    }
    return "debuff-applied";
  }
  if (outcome.actionKind === "PROTECT") {
    return "shield-consumed";
  }
  if (outcome.actionKind === "STATUS_CHANGE") {
    return outcome.effectResult === "NO_EFFECT" ? "shield-blocked" : "debuff-applied";
  }
  if (outcome.actionKind === "REMOVE_FROM_BOARD" || outcome.actionKind === "RETURN_TO_HAND" || outcome.actionKind === "STEAL_SCORE") {
    return "debuff-applied";
  }
  return "support-applied";
}

function isStatusBeneficial(code: StatusEffectCode): boolean {
  return code === "TEMP_WEAKNESS_IMMUNITY" || code === "TEMP_LEVEL_DOWN_IMMUNITY" || code === "REMOVAL_SHIELD";
}

export function computeActiveEventsFromLastEntry(match: MatchState, lastEntry: ActionLogEntry | undefined): CombatVisualEvent[] {
  if (!lastEntry) return [];
  return mapEntryToCombatVisuals(match, lastEntry);
}
