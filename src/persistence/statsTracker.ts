import type { ActionEnvelope, ActionLogEntry, MatchState, PlayerId } from "../types/game";
import type { MatchStats } from "./types";
import { getCardDefinition } from "../engine/cards/deck";
import { getAnimalInstances } from "../engine/state/selectors";
import { hasStatus } from "../engine/status/status";
import { createMatch } from "../engine/state/match";
import { dispatchAction } from "../engine/actions/reducer";

export function initStats(): MatchStats {
  return {
    recycleCount: { P1: 0, P2: 0 },
    sentToGraveyard: { P1: {}, P2: {} },
    returnedToHand: { P1: {}, P2: {} },
    voluntarySwap: { P1: {}, P2: {} },
    scoreContribution: { P1: {}, P2: {} }
  };
}

export function updateStats(
  prevStats: MatchStats,
  actionEnvelope: ActionEnvelope,
  prevState: MatchState,
  nextState: MatchState
): MatchStats {
  const stats: MatchStats = {
    recycleCount: { ...prevStats.recycleCount },
    sentToGraveyard: {
      P1: { ...prevStats.sentToGraveyard.P1 },
      P2: { ...prevStats.sentToGraveyard.P2 }
    },
    returnedToHand: {
      P1: { ...prevStats.returnedToHand.P1 },
      P2: { ...prevStats.returnedToHand.P2 }
    },
    voluntarySwap: {
      P1: { ...prevStats.voluntarySwap.P1 },
      P2: { ...prevStats.voluntarySwap.P2 }
    },
    scoreContribution: {
      P1: { ...prevStats.scoreContribution.P1 },
      P2: { ...prevStats.scoreContribution.P2 }
    }
  };

  const { action } = actionEnvelope;
  const playerId = action.playerId;

  // 1. Recycle Count
  if (action.type === "RECYCLE") {
    stats.recycleCount[playerId] = (stats.recycleCount[playerId] || 0) + 1;
  }

  // 2. Food Thief X005 Play (Direct Score Contribution)
  if (action.type === "PLAY_CARD") {
    const card = prevState.cardsByInstanceId[action.payload.cardInstanceId];
    if (card && card.definitionId === "X005") {
      stats.scoreContribution[playerId]["X005"] = (stats.scoreContribution[playerId]["X005"] || 0) + 1;
    }
  }

  // 3. Voluntarily Swap (Quick Swap X003)
  let swappedInstanceId: string | undefined;
  if (action.type === "PLAY_CARD") {
    const card = prevState.cardsByInstanceId[action.payload.cardInstanceId];
    if (card && card.definitionId === "X003" && action.payload.target?.instanceId) {
      swappedInstanceId = action.payload.target.instanceId;
      const targetCard = prevState.cardsByInstanceId[swappedInstanceId];
      if (targetCard) {
        const owner = targetCard.ownerId;
        const defId = targetCard.definitionId;
        stats.voluntarySwap[owner][defId] = (stats.voluntarySwap[owner][defId] || 0) + 1;
      }
    }
  }

  // 4. Returned to Hand and Sent to Graveyard
  const prevCards = prevState.cardsByInstanceId;
  const nextCards = nextState.cardsByInstanceId;

  for (const id in nextCards) {
    const prevCard = prevCards[id];
    const nextCard = nextCards[id];

    if (prevCard && nextCard) {
      if ((prevCard.zone === "BOARD" || prevCard.zone === "HAND") && nextCard.zone === "GRAVEYARD") {
        const owner = prevCard.ownerId;
        const defId = prevCard.definitionId;
        stats.sentToGraveyard[owner][defId] = (stats.sentToGraveyard[owner][defId] || 0) + 1;
      }

      if (prevCard.zone === "BOARD" && nextCard.zone === "HAND") {
        if (id !== swappedInstanceId) {
          const owner = prevCard.ownerId;
          const defId = prevCard.definitionId;
          stats.returnedToHand[owner][defId] = (stats.returnedToHand[owner][defId] || 0) + 1;
        }
      }
    }
  }

  // 5. Score Contribution
  if (prevState.phase !== "SCORE" && nextState.phase === "SCORE") {
    const activePlayer = nextState.currentPlayerId;
    
    for (const animal of getAnimalInstances(prevState, activePlayer)) {
      if (animal.enteredTurn >= prevState.turnNumber) {
        continue;
      }

      let animalScore: number = animal.level;

      if (hasStatus(animal, "SKIP_NEXT_SCORE")) {
        animalScore = 0;
        if (animal.definitionId === "A007" && !animal.onceFlags.includes("prevent_first_skip_score")) {
          animalScore = animal.level;
        }
      }

      if (hasStatus(animal, "NEXT_SCORE_MINUS_1")) {
        animalScore = Math.max(0, animalScore - 1);
      }

      if (hasStatus(animal, "REMOVAL_SHIELD") && animal.statuses.some((status) => status.sourceInstanceId === "S004")) {
        animalScore = Math.max(1, animalScore);
      }

      if (animalScore > 0) {
        const defId = animal.definitionId;
        stats.scoreContribution[activePlayer][defId] = (stats.scoreContribution[activePlayer][defId] || 0) + animalScore;
      }
    }
  }

  return stats;
}

export function getHighestScoringCard(
  stats: MatchStats,
  actionLog: ActionLogEntry[]
): { cardId: string; nameTh: string; score: number; ownerId: PlayerId } | null {
  let highestScore = 0;
  const tiedCards: Array<{ cardId: string; ownerId: PlayerId }> = [];

  const playerIds: PlayerId[] = ["P1", "P2"];
  for (const pid of playerIds) {
    const playerContributions = stats.scoreContribution[pid];
    for (const cardId in playerContributions) {
      const score = playerContributions[cardId];
      if (score > highestScore) {
        highestScore = score;
        tiedCards.length = 0;
        tiedCards.push({ cardId, ownerId: pid });
      } else if (score === highestScore && score > 0) {
        tiedCards.push({ cardId, ownerId: pid });
      }
    }
  }

  if (highestScore === 0 || tiedCards.length === 0) {
    return null;
  }

  if (tiedCards.length === 1) {
    const winner = tiedCards[0];
    const def = getCardDefinition(winner.cardId);
    return {
      cardId: winner.cardId,
      nameTh: def.name_th,
      score: highestScore,
      ownerId: winner.ownerId
    };
  }

  // Replay to find who reached first
  const seed = findStartSeed(actionLog);
  
  let currentState = createMatch({ seed });
  const cumulativeMap = {
    P1: {} as Record<string, number>,
    P2: {} as Record<string, number>
  };

  const firstReachSeqMap = new Map<string, number>();

  for (const entry of actionLog) {
    if (!entry.validation.valid) {
      continue;
    }

    const { action, seq } = entry;
    const actor = entry.actor;

    if (currentState.phase !== "SCORE" && action.type === "ADVANCE_PHASE") {
      const nextIndex = ["READY", "DRAW", "SCORE", "ACTION", "END"].indexOf(currentState.phase) + 1;
      const nextPhase = ["READY", "DRAW", "SCORE", "ACTION", "END"][nextIndex];

      if (nextPhase === "SCORE") {
        const activePlayer = currentState.currentPlayerId;
        for (const animal of getAnimalInstances(currentState, activePlayer)) {
          if (animal.enteredTurn >= currentState.turnNumber) {
            continue;
          }

          let animalScore: number = animal.level;

          if (hasStatus(animal, "SKIP_NEXT_SCORE")) {
            animalScore = 0;
            if (animal.definitionId === "A007" && !animal.onceFlags.includes("prevent_first_skip_score")) {
              animalScore = animal.level;
            }
          }

          if (hasStatus(animal, "NEXT_SCORE_MINUS_1")) {
            animalScore = Math.max(0, animalScore - 1);
          }

          if (hasStatus(animal, "REMOVAL_SHIELD") && animal.statuses.some((status) => status.sourceInstanceId === "S004")) {
            animalScore = Math.max(1, animalScore);
          }

          if (animalScore > 0) {
            const defId = animal.definitionId;
            const current = (cumulativeMap[activePlayer][defId] || 0) + animalScore;
            cumulativeMap[activePlayer][defId] = current;

            if (current === highestScore && !firstReachSeqMap.has(`${activePlayer}_${defId}`)) {
              firstReachSeqMap.set(`${activePlayer}_${defId}`, seq);
            }
          }
        }
      }
    }

    if (action.type === "PLAY_CARD") {
      const card = currentState.cardsByInstanceId[action.payload.cardInstanceId];
      if (card && card.definitionId === "X005") {
        const current = (cumulativeMap[actor]["X005"] || 0) + 1;
        cumulativeMap[actor]["X005"] = current;

        if (current === highestScore && !firstReachSeqMap.has(`${actor}_X005`)) {
          firstReachSeqMap.set(`${actor}_X005`, seq);
        }
      }
    }

    const result = dispatchAction(currentState, entry);
    currentState = result.state;
  }

  tiedCards.sort((a, b) => {
    const seqA = firstReachSeqMap.get(`${a.ownerId}_${a.cardId}`) ?? Infinity;
    const seqB = firstReachSeqMap.get(`${b.ownerId}_${b.cardId}`) ?? Infinity;

    if (seqA !== seqB) {
      return seqA - seqB;
    }

    if (a.ownerId !== b.ownerId) {
      return a.ownerId === "P1" ? -1 : 1;
    }

    return a.cardId.localeCompare(b.cardId);
  });

  const winner = tiedCards[0];
  const def = getCardDefinition(winner.cardId);
  return {
    cardId: winner.cardId,
    nameTh: def.name_th,
    score: highestScore,
    ownerId: winner.ownerId
  };
}

function findStartSeed(actionLog: ActionLogEntry[]): string {
  for (const entry of actionLog) {
    if (entry.action.type === "START_MATCH") {
      return entry.action.payload.seed;
    }
  }

  return "default";
}
