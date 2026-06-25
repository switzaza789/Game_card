import type { Action, MatchState, ValidationResult } from "../types/game";
import { chooseNormalAiAction, MAX_AI_ACTIONS_PER_TURN } from "./normalAi";

export type AiDispatchResult = {
  state: MatchState;
  validation: ValidationResult;
};

export type AiTurnControllerOptions = {
  getState: () => MatchState;
  dispatch: (action: Action) => AiDispatchResult;
  maxActions?: number;
};

export type AiTurnControllerResult = {
  state: MatchState;
  endedTurn: boolean;
  actionsTaken: number;
  invalidActions: number;
  actionLimitFallback: boolean;
};

export function runPveNormalAiTurn(options: AiTurnControllerOptions): AiTurnControllerResult {
  const maxActions = options.maxActions ?? MAX_AI_ACTIONS_PER_TURN;
  let actionsTaken = 0;
  let invalidActions = 0;
  let actionLimitFallback = false;

  while (isActiveAiTurn(options.getState()) && options.getState().phase !== "ACTION") {
    const latest = options.getState();
    if (latest.phase === "END") {
      const ended = endAiTurnOnce(options);
      return { state: ended.state, endedTurn: ended.endedTurn, actionsTaken, invalidActions, actionLimitFallback };
    }
    const result = options.dispatch({ type: "ADVANCE_PHASE", playerId: "P2", payload: {} });
    if (!result.validation.valid) {
      return { state: result.state, endedTurn: false, actionsTaken, invalidActions: invalidActions + 1, actionLimitFallback };
    }
  }

  while (isActiveAiTurn(options.getState()) && options.getState().phase === "ACTION") {
    if (actionsTaken >= maxActions) {
      actionLimitFallback = true;
      const ended = endAiTurnOnce(options);
      return { state: ended.state, endedTurn: ended.endedTurn, actionsTaken, invalidActions, actionLimitFallback };
    }

    const decision = chooseNormalAiAction({ state: options.getState(), playerId: "P2" });
    if (!decision) {
      const ended = endAiTurnOnce(options);
      return { state: ended.state, endedTurn: ended.endedTurn, actionsTaken, invalidActions, actionLimitFallback };
    }

    const result = options.dispatch(decision.action);
    if (!result.validation.valid) {
      invalidActions += 1;
      if (!isActiveAiTurn(options.getState())) {
        return { state: options.getState(), endedTurn: false, actionsTaken, invalidActions, actionLimitFallback };
      }
      continue;
    }
    actionsTaken += 1;
  }

  return { state: options.getState(), endedTurn: false, actionsTaken, invalidActions, actionLimitFallback };
}

function endAiTurnOnce(options: AiTurnControllerOptions): { state: MatchState; endedTurn: boolean } {
  const latest = options.getState();
  if (!canEndAiTurn(latest)) {
    return { state: latest, endedTurn: false };
  }
  const result = options.dispatch({ type: "END_TURN", playerId: "P2", payload: {} });
  return { state: result.state, endedTurn: result.validation.valid };
}

function isActiveAiTurn(state: MatchState): boolean {
  return state.status !== "FINISHED" && state.gameMode === "PVE_NORMAL" && state.currentPlayerId === "P2";
}

function canEndAiTurn(state: MatchState): boolean {
  return isActiveAiTurn(state) && (state.phase === "ACTION" || state.phase === "END");
}
