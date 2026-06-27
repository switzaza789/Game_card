import type {
  ActionLogEntry,
  AnimalScoreContribution,
  MatchState,
  PlayerId,
  ScoreComponent,
  StructuredScoreResolution,
  TeamScoreAdjustment
} from "../types/game";

export type { AnimalScoreContribution, ScoreComponent, TeamScoreAdjustment };

export type TurnScoreBreakdown = {
  id: string;
  playerId: PlayerId;
  turnNumber: number;
  scoreBefore: number;
  scoreAfter: number;
  totalDelta: number;
  animalContributions: readonly AnimalScoreContribution[];
  teamAdjustments: readonly TeamScoreAdjustment[];
  unattributedDelta: number;
  isFullyAttributed: boolean;
};

export function mapScoreResolutionToBreakdown(input: {
  before?: MatchState;
  after: MatchState;
  entry: ActionLogEntry | undefined;
}): TurnScoreBreakdown | null {
  const scoreOutcome = input.entry?.outcomes?.find((outcome) => outcome.code === "SCORE_CHANGED");
  if (!input.entry || !scoreOutcome || input.entry.phase !== "SCORE") {
    return null;
  }

  if (scoreOutcome.resolution) {
    return structuredResolutionToBreakdown(scoreOutcome.resolution);
  }

  const scoreBefore = scoreOutcome.fromScore;
  const scoreAfter = scoreOutcome.toScore;
  const totalDelta = scoreAfter - scoreBefore;

  return {
    id: `score:${input.entry.seq}:${scoreOutcome.playerId}:${input.entry.turnNumber}:${scoreBefore}->${scoreAfter}`,
    playerId: scoreOutcome.playerId,
    turnNumber: input.entry.turnNumber,
    scoreBefore,
    scoreAfter,
    totalDelta,
    animalContributions: [],
    teamAdjustments: [],
    unattributedDelta: totalDelta,
    isFullyAttributed: totalDelta === 0
  };
}

function structuredResolutionToBreakdown(resolution: StructuredScoreResolution): TurnScoreBreakdown {
  const totalDelta = resolution.scoreAfter - resolution.scoreBefore;
  const attributedTotal = resolution.animalContributions.reduce((sum, item) => sum + item.finalContribution, 0)
    + resolution.teamAdjustments.reduce((sum, item) => sum + item.amount, 0);
  const componentSumsValid = resolution.animalContributions.every((animal) =>
    animal.components.reduce((sum, component) => sum + component.amount, 0) === animal.finalContribution
  );
  const unattributedDelta = totalDelta - attributedTotal;

  return {
    id: resolution.resolutionId,
    playerId: resolution.scoringPlayerId,
    turnNumber: resolution.turnNumber,
    scoreBefore: resolution.scoreBefore,
    scoreAfter: resolution.scoreAfter,
    totalDelta,
    animalContributions: resolution.animalContributions,
    teamAdjustments: resolution.teamAdjustments,
    unattributedDelta,
    isFullyAttributed: unattributedDelta === 0 && componentSumsValid && resolution.totalGained === totalDelta
  };
}
