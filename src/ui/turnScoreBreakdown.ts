import type { ActionLogEntry, MatchState, PlayerId } from "../types/game";

export type ScoreComponentKind = "unattributed";

export type ScoreComponent = {
  kind: ScoreComponentKind;
  amount: number;
};

export type AnimalScoreContribution = {
  ownerId: PlayerId;
  animalInstanceId: string;
  slotNo: number;
  baseAmount: number;
  components: ScoreComponent[];
  total: number;
};

export type TeamScoreAdjustment = {
  playerId: PlayerId;
  amount: number;
  reason: "structured-team-adjustment";
};

export type TurnScoreBreakdown = {
  id: string;
  playerId: PlayerId;
  turnNumber: number;
  scoreBefore: number;
  scoreAfter: number;
  totalDelta: number;
  animalContributions: AnimalScoreContribution[];
  teamAdjustments: TeamScoreAdjustment[];
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
