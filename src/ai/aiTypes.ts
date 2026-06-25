import type { Action, MatchState } from "../types/game";

export interface AiDecisionContext {
  state: MatchState;
  playerId: "P2";
}

export interface AiDecision {
  action: Action;
  reason: string;
  score: number;
}

